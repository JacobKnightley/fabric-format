#!/usr/bin/env python3
"""
ANTLR Build Pipeline for Spark SQL Grammar (JavaScript Target)

This script manages the complete build process:
1. Download grammar from Apache Spark repository (if needed)
2. Transform grammar to strip Java code
3. Generate JavaScript code with ANTLR
4. Add predicate implementations
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Dict, List

# Configuration
SCRIPT_DIR = Path(__file__).parent  # .build/
PROJECT_DIR = SCRIPT_DIR.parent  # project root
GRAMMAR_DIR = PROJECT_DIR / "grammar"
GENERATED_DIR = PROJECT_DIR / "src" / "formatters" / "sparksql" / "generated"
ANTLR_JAR = SCRIPT_DIR / "antlr4.jar"  # Downloaded to .build/

# ANTLR download URL
ANTLR_VERSION = "4.13.2"
ANTLR_DOWNLOAD_URL = f"https://www.antlr.org/download/antlr-{ANTLR_VERSION}-complete.jar"

# Spark grammar download URLs
SPARK_BRANCH = "master"
SPARK_GRAMMAR_BASE_URL = f"https://raw.githubusercontent.com/apache/spark/{SPARK_BRANCH}/sql/api/src/main/antlr4/org/apache/spark/sql/catalyst/parser"

# Predicate implementations - these define the BEHAVIOR of predicates found in grammar.
# The predicate NAMES are extracted from the grammar automatically.
# The implementations are Spark-specific semantics that can't be auto-generated.
PREDICATE_IMPLEMENTATIONS = {
    # Lexer predicates (semantic predicates return bool, actions return void)
    "isValidDecimal": '''
/**
 * Check if current token forms a valid decimal number.
 * Returns false if followed by letter/digit/underscore (would be part of identifier).
 */
SqlBaseLexer.prototype.isValidDecimal = function() {
    const nextChar = this._input.LA(1);
    if ((nextChar >= 65 && nextChar <= 90) ||   // A-Z
        (nextChar >= 97 && nextChar <= 122) ||  // a-z
        (nextChar >= 48 && nextChar <= 57) ||   // 0-9
        nextChar === 95) {                       // _
        return false;
    }
    return true;
};''',

    "isHint": '''
/**
 * Check if block comment is a query hint (starts with +).
 */
SqlBaseLexer.prototype.isHint = function() {
    return this._input.LA(1) === 43; // '+'
};''',

    "isShiftRightOperator": '''
/**
 * Check if >> is shift operator vs nested generic closing.
 */
SqlBaseLexer.prototype.isShiftRightOperator = function() {
    return this.complex_type_level_counter === 0;
};''',

    "incComplexTypeLevelCounter": '''
/**
 * Increment counter when entering complex type: MAP<, ARRAY<, STRUCT<
 */
SqlBaseLexer.prototype.incComplexTypeLevelCounter = function() {
    this.complex_type_level_counter++;
};''',

    "decComplexTypeLevelCounter": '''
/**
 * Decrement counter when > closes a complex type.
 */
SqlBaseLexer.prototype.decComplexTypeLevelCounter = function() {
    if (this.complex_type_level_counter > 0) {
        this.complex_type_level_counter--;
    }
};''',

    "markUnclosedComment": '''
/**
 * Mark that an unclosed block comment was encountered.
 */
SqlBaseLexer.prototype.markUnclosedComment = function() {
    this.has_unclosed_bracketed_comment = true;
};''',

    "pushDollarTag": '''
/**
 * Push dollar-quoted string tag onto stack.
 */
SqlBaseLexer.prototype.pushDollarTag = function() {
    this.dollar_tags.push(this.getText());
};''',

    "popDollarTag": '''
/**
 * Pop dollar-quoted string tag from stack.
 */
SqlBaseLexer.prototype.popDollarTag = function() {
    if (this.dollar_tags.length > 0) {
        this.dollar_tags.pop();
    }
};''',

    "matchesDollarTag": '''
/**
 * Check if current text matches the dollar tag on stack top.
 */
SqlBaseLexer.prototype.matchesDollarTag = function() {
    if (this.dollar_tags.length === 0) return false;
    return this.getText() === this.dollar_tags[this.dollar_tags.length - 1];
};''',

    # Parser predicates
    "isOperatorPipeStart": '''
/**
 * Check if current position starts a pipe operator.
 */
SqlBaseParser.prototype.isOperatorPipeStart = function() {
    return this.getCurrentToken().type === this.constructor.PIPE;
};''',

    # Parser config flags - default values based on Spark's defaults
    "legacy_setops_precedence_enabled": "SqlBaseParser.prototype.legacy_setops_precedence_enabled = false;",
    "legacy_exponent_literal_as_decimal_enabled": "SqlBaseParser.prototype.legacy_exponent_literal_as_decimal_enabled = false;",
    "SQL_standard_keyword_behavior": "SqlBaseParser.prototype.SQL_standard_keyword_behavior = false;",
    "double_quoted_identifiers": "SqlBaseParser.prototype.double_quoted_identifiers = false;",
    "parameter_substitution_enabled": "SqlBaseParser.prototype.parameter_substitution_enabled = true;",
    "legacy_identifier_clause_only": "SqlBaseParser.prototype.legacy_identifier_clause_only = false;",
    "single_character_pipe_operator_enabled": "SqlBaseParser.prototype.single_character_pipe_operator_enabled = true;",
}


def to_snake_case(name: str) -> str:
    """Convert camelCase or PascalCase to snake_case."""
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def remove_block(content: str, block_name: str) -> str:
    """Remove @header or @members blocks with their braced content."""
    pattern = rf'@{block_name}\s*\{{'
    
    result = []
    i = 0
    while i < len(content):
        match = re.match(pattern, content[i:])
        if match:
            # Find matching closing brace
            brace_count = 1
            j = i + match.end()
            while j < len(content) and brace_count > 0:
                if content[j] == '{':
                    brace_count += 1
                elif content[j] == '}':
                    brace_count -= 1
                j += 1
            # Skip whitespace after block
            while j < len(content) and content[j] in ' \t\n\r':
                j += 1
            i = j
        else:
            result.append(content[i])
            i += 1
    
    return ''.join(result)


def transform_predicates_for_js(content: str) -> str:
    """Transform Java predicate/action syntax to JavaScript-compatible form."""
    
    # Special case: dollar-quoted string tag handling
    content = re.sub(
        r'\{tags\.push\(getText\(\)\);?\}',
        '{this.pushDollarTag();}',
        content
    )
    content = re.sub(
        r'\{getText\(\)\.equals\(tags\.peek\(\)\)\}\?',
        '{this.matchesDollarTag()}?',
        content
    )
    content = re.sub(
        r'\{tags\.pop\(\);?\}',
        '{this.popDollarTag();}',
        content
    )
    
    # Transform method calls in predicates: {methodName()}? or {!methodName()}?
    # -> {this.methodName()}?
    content = re.sub(
        r'\{(!?)(\w+)\(\)\}(\?)?',
        lambda m: '{' + m.group(1) + 'this.' + m.group(2) + '()' + '}' + (m.group(3) or ''),
        content
    )
    
    # Transform method calls in actions: {methodName();}
    # -> {this.methodName();}
    content = re.sub(
        r'\{(\w+)\(\);\}',
        lambda m: '{this.' + m.group(1) + '();}',
        content
    )
    
    # Transform variable access in predicates: {variableName}? or {!variableName}?
    # -> {this.variableName}?
    content = re.sub(
        r'\{(!?)([a-zA-Z][a-zA-Z_0-9]*)\}(\?)',
        lambda m: '{' + m.group(1) + 'this.' + m.group(2) + '}' + m.group(3),
        content
    )
    
    return content


def download_grammar():
    """Download grammar files from Apache Spark repository if needed."""
    print("=" * 60)
    print("Step 1: Checking/downloading grammar files...")
    print("=" * 60)
    
    GRAMMAR_DIR.mkdir(parents=True, exist_ok=True)
    
    files_to_download = ["SqlBaseLexer.g4", "SqlBaseParser.g4"]
    
    for filename in files_to_download:
        filepath = GRAMMAR_DIR / filename
        if filepath.exists():
            print(f"  {filename}: already exists (skipping download)")
            continue
        
        url = f"{SPARK_GRAMMAR_BASE_URL}/{filename}"
        print(f"  Downloading {filename} from {url}...")
        
        try:
            urllib.request.urlretrieve(url, filepath)
            print(f"  {filename}: downloaded successfully")
        except Exception as e:
            print(f"  ERROR: Failed to download {filename}: {e}")
            return False
    
    return True


def add_case_insensitive_option(content: str) -> str:
    """Add caseInsensitive=true option to lexer grammar.
    
    ANTLR 4.7+ supports grammar-level case-insensitive matching.
    This allows the lexer to match 'select', 'SELECT', 'Select' as the same token,
    while preserving the original text casing in token.text.
    
    Without this option, lowercase SQL like 'select a from t' would fail to parse
    because the Spark grammar defines keywords in uppercase only (SELECT: 'SELECT').
    """
    # Check if there's already an options block
    if re.search(r'options\s*\{', content):
        # Add to existing options block
        content = re.sub(
            r'(options\s*\{)',
            r'\1\n    caseInsensitive = true;',
            content
        )
    else:
        # Add new options block after the grammar declaration
        # Pattern: "lexer grammar SqlBaseLexer;" or "grammar SqlBaseParser;"
        content = re.sub(
            r'((?:lexer\s+)?grammar\s+\w+\s*;)',
            r'\1\n\noptions {\n    caseInsensitive = true;\n}',
            content
        )
    return content


def transform_grammar():
    """Transform grammar files for JavaScript ANTLR target."""
    print("\n" + "=" * 60)
    print("Step 2: Transforming grammar for JavaScript target...")
    print("=" * 60)
    
    for filename in ["SqlBaseLexer.g4", "SqlBaseParser.g4"]:
        source_path = GRAMMAR_DIR / filename
        
        if not source_path.exists():
            print(f"  ERROR: {source_path} not found")
            return False
        
        content = source_path.read_text(encoding='utf-8')
        original_lines = len(content.splitlines())
        
        # Remove Java-specific @header and @members blocks
        content = remove_block(content, 'header')
        content = remove_block(content, 'members')
        
        # Transform predicate/action syntax for JavaScript (this.xxx)
        content = transform_predicates_for_js(content)
        
        # Add case-insensitive option for the lexer
        # This is critical: Spark grammar defines keywords uppercase (SELECT: 'SELECT')
        # but we need to parse lowercase SQL (select a from t)
        if filename == "SqlBaseLexer.g4":
            content = add_case_insensitive_option(content)
            print(f"  {filename}: added caseInsensitive=true option")
        
        # Write transformed grammar back (in-place transformation)
        source_path.write_text(content, encoding='utf-8')
        new_lines = len(content.splitlines())
        print(f"  {filename}: {original_lines} -> {new_lines} lines (stripped Java code)")
    
    return True


def download_antlr_jar():
    """Download ANTLR jar if not present."""
    if ANTLR_JAR.exists():
        return True
    
    print(f"  Downloading ANTLR {ANTLR_VERSION}...")
    try:
        urllib.request.urlretrieve(ANTLR_DOWNLOAD_URL, ANTLR_JAR)
        print(f"  ✓ Downloaded to {ANTLR_JAR.relative_to(PROJECT_DIR)}")
        return True
    except Exception as e:
        print(f"  ERROR: Failed to download ANTLR: {e}")
        print(f"  Manual download: {ANTLR_DOWNLOAD_URL}")
        return False


def generate_antlr():
    """Run ANTLR to generate JavaScript lexer/parser."""
    print("\n" + "=" * 60)
    print("Step 3: Generating JavaScript code with ANTLR...")
    print("=" * 60)
    
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    
    if not download_antlr_jar():
        return False
    
    # Run ANTLR with JavaScript target
    cmd = [
        "java", "-jar", str(ANTLR_JAR),
        "-Dlanguage=JavaScript",
        "-visitor",
        "-o", str(GENERATED_DIR),
        str(GRAMMAR_DIR / "SqlBaseLexer.g4"),
        str(GRAMMAR_DIR / "SqlBaseParser.g4"),
    ]
    
    print(f"  Running ANTLR...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"  ANTLR ERROR:\n{result.stderr}")
        return False
    
    if result.stderr:
        # ANTLR warnings are OK
        print(f"  ANTLR warnings (non-fatal):\n{result.stderr[:500]}")
    
    # List generated files
    generated = list(GENERATED_DIR.glob("*.js"))
    print(f"  Generated {len(generated)} JavaScript files:")
    for f in generated:
        print(f"    - {f.name}")
    
    return True


def extract_predicates_from_grammar():
    """Extract predicate names from transformed grammar files."""
    predicates = {"lexer": set(), "parser": set()}
    
    for filename, key in [("SqlBaseLexer.g4", "lexer"), ("SqlBaseParser.g4", "parser")]:
        filepath = GRAMMAR_DIR / filename
        if not filepath.exists():
            continue
        
        content = filepath.read_text(encoding='utf-8')
        
        # Find all {this.xxx()} patterns (method calls)
        methods = re.findall(r'\{[^}]*this\.(\w+)\(\)[^}]*\}', content)
        predicates[key].update(methods)
        
        # Find all {this.xxx}? patterns (variable access in predicates)
        variables = re.findall(r'\{[^}]*this\.(\w+)\}\?', content)
        predicates[key].update(variables)
    
    return predicates


def add_predicate_implementations():
    """Add JavaScript implementations for predicates found in grammar."""
    print("\n" + "=" * 60)
    print("Step 4: Adding predicate implementations...")
    print("=" * 60)
    
    # Extract predicates from grammar
    grammar_predicates = extract_predicates_from_grammar()
    print(f"  Predicates found in lexer grammar: {sorted(grammar_predicates['lexer'])}")
    print(f"  Predicates found in parser grammar: {sorted(grammar_predicates['parser'])}")
    
    # Process Lexer
    lexer_path = GENERATED_DIR / "SqlBaseLexer.js"
    if not lexer_path.exists():
        print(f"  ERROR: {lexer_path} not found")
        return False
    
    content = lexer_path.read_text(encoding='utf-8')
    
    # Build lexer predicate implementations
    lexer_impl = '''

// ============================================================================
// Lexer Predicate Implementations
// Predicates extracted from grammar, implementations based on Spark behavior
// ============================================================================

// State variables required by predicates
SqlBaseLexer.prototype.has_unclosed_bracketed_comment = false;
SqlBaseLexer.prototype.complex_type_level_counter = 0;
SqlBaseLexer.prototype.dollar_tags = [];
'''
    
    # Add implementations for each lexer predicate found in grammar
    missing_lexer = []
    for pred in sorted(grammar_predicates['lexer']):
        if pred in PREDICATE_IMPLEMENTATIONS:
            lexer_impl += PREDICATE_IMPLEMENTATIONS[pred] + '\n'
        else:
            missing_lexer.append(pred)
    
    if missing_lexer:
        print(f"  WARNING: No implementation for lexer predicates: {missing_lexer}")
    
    content = content.rstrip() + lexer_impl
    lexer_path.write_text(content, encoding='utf-8')
    print(f"  Added {len(grammar_predicates['lexer']) - len(missing_lexer)} lexer predicate implementations")
    
    # Process Parser
    parser_path = GENERATED_DIR / "SqlBaseParser.js"
    if not parser_path.exists():
        print(f"  ERROR: {parser_path} not found")
        return False
    
    content = parser_path.read_text(encoding='utf-8')
    
    # Build parser predicate implementations
    parser_impl = '''

// ============================================================================
// Parser Predicate Implementations
// Predicates extracted from grammar, implementations based on Spark behavior
// ============================================================================
'''
    
    # Add implementations for each parser predicate found in grammar
    missing_parser = []
    for pred in sorted(grammar_predicates['parser']):
        if pred in PREDICATE_IMPLEMENTATIONS:
            parser_impl += PREDICATE_IMPLEMENTATIONS[pred] + '\n'
        else:
            missing_parser.append(pred)
    
    if missing_parser:
        print(f"  WARNING: No implementation for parser predicates: {missing_parser}")
    
    content = content.rstrip() + parser_impl
    parser_path.write_text(content, encoding='utf-8')
    print(f"  Added {len(grammar_predicates['parser']) - len(missing_parser)} parser predicate implementations")
    
    return True


def verify_predicates():
    """Verify that all predicates from grammar have implementations."""
    print("\n" + "=" * 60)
    print("Step 5: Verifying predicate coverage...")
    print("=" * 60)
    
    # Extract what grammar requires
    grammar_predicates = extract_predicates_from_grammar()
    
    # Check what implementations we have
    lexer_path = GENERATED_DIR / "SqlBaseLexer.js"
    parser_path = GENERATED_DIR / "SqlBaseParser.js"
    
    lexer_content = lexer_path.read_text(encoding='utf-8')
    parser_content = parser_path.read_text(encoding='utf-8')
    
    lexer_impls = set(re.findall(r'SqlBaseLexer\.prototype\.(\w+)\s*=', lexer_content))
    parser_impls = set(re.findall(r'SqlBaseParser\.prototype\.(\w+)\s*=', parser_content))
    
    print(f"\n  Lexer:")
    print(f"    Grammar requires: {sorted(grammar_predicates['lexer'])}")
    print(f"    Implemented: {sorted(grammar_predicates['lexer'] & lexer_impls)}")
    
    print(f"\n  Parser:")
    print(f"    Grammar requires: {sorted(grammar_predicates['parser'])}")
    print(f"    Implemented: {sorted(grammar_predicates['parser'] & parser_impls)}")
    
    # Check for missing
    missing_lexer = grammar_predicates['lexer'] - lexer_impls
    missing_parser = grammar_predicates['parser'] - parser_impls
    
    if missing_lexer or missing_parser:
        print("\n  ⚠ Missing implementations:")
        if missing_lexer:
            print(f"    Lexer: {sorted(missing_lexer)}")
        if missing_parser:
            print(f"    Parser: {sorted(missing_parser)}")
        return False
    
    print("\n  ✓ All grammar predicates are implemented")
    return True


def download_builtin_functions() -> bool:
    """
    Download and parse Spark's sql-expression-schema.md to extract built-in function names.
    This file is auto-generated by Spark's ExpressionsSchemaSuite and is the authoritative
    source for all built-in SQL functions.
    """
    print("\n📥 Downloading built-in function list from Spark...")
    
    url = f"https://raw.githubusercontent.com/apache/spark/{SPARK_BRANCH}/sql/core/src/test/resources/sql-functions/sql-expression-schema.md"
    output_file = GENERATED_DIR / "builtinFunctions.json"
    
    try:
        print(f"  URL: {url}")
        with urllib.request.urlopen(url, timeout=30) as response:
            content = response.read().decode('utf-8')
        
        # Parse markdown table to extract function names (column 2)
        # Format: | Class name | Function name or alias | Query example | Output schema |
        functions = set()
        
        for line in content.split('\n'):
            line = line.strip()
            # Skip non-table rows
            if not line.startswith('|') or '---' in line:
                continue
            
            parts = [p.strip() for p in line.split('|')]
            # parts[0] is empty (before first |), parts[1] is class, parts[2] is function name
            if len(parts) >= 3:
                func_name = parts[2].strip()
                # Skip header row and empty names
                if func_name and func_name != 'Function name or alias':
                    # Handle special cases: operators like +, -, *, /, etc. are not function names
                    # Also handle HTML entities like &#124; (|)
                    if not func_name.startswith(('<', '>', '=', '+', '-', '*', '/', '%', '&', '!', '~', '^')):
                        functions.add(func_name.lower())
        
        # Sort for consistent output
        function_list = sorted(functions)
        
        print(f"  Found {len(function_list)} built-in functions")
        
        # Write as JSON
        GENERATED_DIR.mkdir(parents=True, exist_ok=True)
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump({
                "source": url,
                "spark_branch": SPARK_BRANCH,
                "count": len(function_list),
                "functions": function_list
            }, f, indent=2)
        
        print(f"  ✓ Generated: {output_file.relative_to(PROJECT_DIR)}")
        
        # Also generate TypeScript file for easier import
        ts_file = GENERATED_DIR / "builtinFunctions.ts"
        with open(ts_file, 'w', encoding='utf-8') as f:
            f.write(f'''/**
 * Auto-generated list of Spark SQL built-in functions.
 * Source: {url}
 * Generated from sql-expression-schema.md by ExpressionsSchemaSuite
 * 
 * DO NOT EDIT - regenerate with: python scripts/build_antlr_js.py
 */

export const SPARK_BUILTIN_FUNCTIONS: ReadonlySet<string> = new Set([
''')
            for func in function_list:
                f.write(f'    "{func}",\n')
            f.write(']);\n')
        
        print(f"  ✓ Generated: {ts_file.relative_to(PROJECT_DIR)}")
        return True
        
    except urllib.error.URLError as e:
        print(f"  ❌ Failed to download: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False


def main():
    """Run the complete build pipeline."""
    print("\n" + "=" * 60)
    print("ANTLR JavaScript Build Pipeline for Spark SQL")
    print("=" * 60)
    
    steps = [
        ("Download grammar", download_grammar),
        ("Transform grammar", transform_grammar),
        ("Generate JavaScript", generate_antlr),
        ("Add predicates", add_predicate_implementations),
        ("Verify coverage", verify_predicates),
        ("Download built-in functions", download_builtin_functions),
    ]
    
    for name, func in steps:
        if not func():
            print(f"\n❌ Pipeline failed at: {name}")
            return 1
    
    print("\n" + "=" * 60)
    print("✓ Build pipeline completed successfully!")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
