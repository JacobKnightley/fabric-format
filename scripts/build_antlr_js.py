#!/usr/bin/env python3
"""
ANTLR Build Pipeline for Spark SQL Grammar (JavaScript Target)

This script manages the complete build process:
1. Transform grammar to strip Java code
2. Generate JavaScript code with ANTLR
3. Add predicate implementations

Based on the Rust pipeline in sparkfmt-core/build_antlr.py
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List

# Configuration
SCRIPT_DIR = Path(__file__).parent.parent  # poc-antlr4ts/
GRAMMAR_SOURCE_DIR = SCRIPT_DIR.parent / "grammar"
GRAMMAR_TRANSFORMED_DIR = SCRIPT_DIR / "grammar"
GENERATED_DIR = SCRIPT_DIR / "src" / "generated"
ANTLR_JAR = SCRIPT_DIR / "antlr4.jar"

# Known predicates from sparkfmt-core/KNOWN_PREDICATES.json
LEXER_PREDICATES = {
    "methods": [
        ("isValidDecimal", "is_valid_decimal"),
        ("isHint", "is_hint"),
        ("isShiftRightOperator", "is_shift_right_operator"),
    ],
    "actions": [
        ("incComplexTypeLevelCounter", "inc_complex_type_level_counter"),
        ("decComplexTypeLevelCounter", "dec_complex_type_level_counter"),
        ("markUnclosedComment", "mark_unclosed_comment"),
    ],
    "special": [
        ("tags.push(getText())", "push_dollar_tag"),
        ("getText().equals(tags.peek())", "matches_dollar_tag"),
        ("tags.pop()", "pop_dollar_tag"),
    ]
}

PARSER_PREDICATES = {
    "config_flags": [
        ("legacy_setops_precedence_enabled", False),
        ("legacy_exponent_literal_as_decimal_enabled", False),
        ("SQL_standard_keyword_behavior", False),
        ("double_quoted_identifiers", False),
        ("parameter_substitution_enabled", True),
        ("legacy_identifier_clause_only", False),
        ("single_character_pipe_operator_enabled", True),
    ],
    "methods": [
        ("isOperatorPipeStart", "is_operator_pipe_start"),
    ]
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


def transform_grammar():
    """Transform grammar files for JavaScript ANTLR target."""
    print("=" * 60)
    print("Step 1: Transforming grammar for JavaScript target...")
    print("=" * 60)
    
    GRAMMAR_TRANSFORMED_DIR.mkdir(parents=True, exist_ok=True)
    
    for filename in ["SqlBaseLexer.g4", "SqlBaseParser.g4"]:
        source_path = GRAMMAR_SOURCE_DIR / filename
        output_path = GRAMMAR_TRANSFORMED_DIR / filename
        
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
        
        output_path.write_text(content, encoding='utf-8')
        new_lines = len(content.splitlines())
        print(f"  {filename}: {original_lines} -> {new_lines} lines (stripped Java code)")
    
    return True


def generate_antlr():
    """Run ANTLR to generate JavaScript lexer/parser."""
    print("\n" + "=" * 60)
    print("Step 2: Generating JavaScript code with ANTLR...")
    print("=" * 60)
    
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    
    if not ANTLR_JAR.exists():
        print(f"  ERROR: {ANTLR_JAR} not found")
        return False
    
    # Run ANTLR with JavaScript target
    cmd = [
        "java", "-jar", str(ANTLR_JAR),
        "-Dlanguage=JavaScript",
        "-visitor",
        "-o", str(GENERATED_DIR),
        str(GRAMMAR_TRANSFORMED_DIR / "SqlBaseLexer.g4"),
        str(GRAMMAR_TRANSFORMED_DIR / "SqlBaseParser.g4"),
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


def add_predicate_implementations():
    """Add JavaScript implementations for all predicates."""
    print("\n" + "=" * 60)
    print("Step 3: Adding predicate implementations...")
    print("=" * 60)
    
    # Process Lexer
    lexer_path = GENERATED_DIR / "SqlBaseLexer.js"
    if not lexer_path.exists():
        print(f"  ERROR: {lexer_path} not found")
        return False
    
    content = lexer_path.read_text(encoding='utf-8')
    
    # The generated file has the predicates called as this.xxx()
    # We need to add the method implementations at the end
    
    lexer_predicates_js = '''

// ============================================================================
// Lexer Predicate Implementations (from Java @members)
// Based on sparkfmt-core/KNOWN_PREDICATES.json
// ============================================================================

// State
SqlBaseLexer.prototype.has_unclosed_bracketed_comment = false;
SqlBaseLexer.prototype.complex_type_level_counter = 0;
SqlBaseLexer.prototype.dollar_tags = [];

/**
 * Check if current token forms a valid decimal number.
 * Returns false if followed by letter/digit/underscore (would be part of identifier).
 */
SqlBaseLexer.prototype.isValidDecimal = function() {
    const nextChar = this._input.LA(1);
    // Check if next char is A-Z, a-z, 0-9, or _
    if ((nextChar >= 65 && nextChar <= 90) ||   // A-Z
        (nextChar >= 97 && nextChar <= 122) ||  // a-z
        (nextChar >= 48 && nextChar <= 57) ||   // 0-9
        nextChar === 95) {                       // _
        return false;
    }
    return true;
};

/**
 * Check if block comment is a query hint (starts with +).
 * Hints look like: /--+ BROADCAST(t) --/  (using /*+ in actual SQL)
 */
SqlBaseLexer.prototype.isHint = function() {
    return this._input.LA(1) === 43; // '+'
};

/**
 * Check if >> is shift operator vs nested generic closing.
 * Inside MAP<K, ARRAY<V>>, the >> should be two separate > tokens.
 */
SqlBaseLexer.prototype.isShiftRightOperator = function() {
    return this.complex_type_level_counter === 0;
};

/**
 * Increment counter when entering complex type: MAP<, ARRAY<, STRUCT<
 */
SqlBaseLexer.prototype.incComplexTypeLevelCounter = function() {
    this.complex_type_level_counter++;
};

/**
 * Decrement counter when > closes a complex type.
 */
SqlBaseLexer.prototype.decComplexTypeLevelCounter = function() {
    if (this.complex_type_level_counter > 0) {
        this.complex_type_level_counter--;
    }
};

/**
 * Mark that an unclosed block comment was encountered (for error reporting).
 */
SqlBaseLexer.prototype.markUnclosedComment = function() {
    this.has_unclosed_bracketed_comment = true;
};

/**
 * Push dollar-quoted string tag onto stack.
 * For $tag$content$tag$, pushes "tag".
 */
SqlBaseLexer.prototype.pushDollarTag = function() {
    this.dollar_tags.push(this.getText());
};

/**
 * Pop dollar-quoted string tag from stack.
 */
SqlBaseLexer.prototype.popDollarTag = function() {
    if (this.dollar_tags.length > 0) {
        this.dollar_tags.pop();
    }
};

/**
 * Check if current text matches tag on top of stack.
 */
SqlBaseLexer.prototype.matchesDollarTag = function() {
    if (this.dollar_tags.length === 0) return false;
    return this.getText() === this.dollar_tags[this.dollar_tags.length - 1];
};
'''
    
    # Append at end of file
    content = content.rstrip() + lexer_predicates_js
    
    lexer_path.write_text(content, encoding='utf-8')
    print(f"  Added lexer predicates to SqlBaseLexer.js")
    
    # Process Parser
    parser_path = GENERATED_DIR / "SqlBaseParser.js"
    if not parser_path.exists():
        print(f"  ERROR: {parser_path} not found")
        return False
    
    content = parser_path.read_text(encoding='utf-8')
    
    parser_predicates_js = '''

// ============================================================================
// Parser Predicate Implementations (from Java @members)
// Based on sparkfmt-core/KNOWN_PREDICATES.json
// ============================================================================

// Configuration flags (can be set before parsing to change behavior)
SqlBaseParser.prototype.legacy_setops_precedence_enabled = false;
SqlBaseParser.prototype.legacy_exponent_literal_as_decimal_enabled = false;
SqlBaseParser.prototype.SQL_standard_keyword_behavior = false;
SqlBaseParser.prototype.double_quoted_identifiers = false;
SqlBaseParser.prototype.parameter_substitution_enabled = true;
SqlBaseParser.prototype.legacy_identifier_clause_only = false;
SqlBaseParser.prototype.single_character_pipe_operator_enabled = true;

/**
 * Check if |> pipe operator is starting.
 * Looks ahead to see if PIPE is followed by GT.
 */
SqlBaseParser.prototype.isOperatorPipeStart = function() {
    // Check if next token after PIPE is GT (>)
    return this._input.LA(2) === SqlBaseParser.GT;
};
'''
    
    # Append at end of file
    content = content.rstrip() + parser_predicates_js
    
    parser_path.write_text(content, encoding='utf-8')
    print(f"  Added parser predicates to SqlBaseParser.js")
    
    return True


def verify_predicates():
    """Verify that all known predicates are properly implemented."""
    print("\n" + "=" * 60)
    print("Step 4: Verifying predicate coverage...")
    print("=" * 60)
    
    lexer_path = GENERATED_DIR / "SqlBaseLexer.js"
    parser_path = GENERATED_DIR / "SqlBaseParser.js"
    
    issues = []
    
    # Known predicates we must implement (from KNOWN_PREDICATES.json)
    required_lexer_predicates = [
        'isValidDecimal', 'isHint', 'isShiftRightOperator',
        'incComplexTypeLevelCounter', 'decComplexTypeLevelCounter', 
        'markUnclosedComment', 'pushDollarTag', 'popDollarTag', 'matchesDollarTag'
    ]
    
    required_parser_predicates = [
        'isOperatorPipeStart'
    ]
    
    required_parser_flags = [
        'legacy_setops_precedence_enabled', 'legacy_exponent_literal_as_decimal_enabled',
        'SQL_standard_keyword_behavior', 'double_quoted_identifiers',
        'parameter_substitution_enabled', 'legacy_identifier_clause_only',
        'single_character_pipe_operator_enabled'
    ]
    
    # Check lexer
    lexer_content = lexer_path.read_text(encoding='utf-8')
    lexer_impls = set(re.findall(r'SqlBaseLexer\.prototype\.(\w+)\s*=', lexer_content))
    
    print(f"\n  Lexer:")
    print(f"    Required predicates: {required_lexer_predicates}")
    print(f"    Implementations found: {sorted(lexer_impls)}")
    
    missing_lexer = set(required_lexer_predicates) - lexer_impls
    if missing_lexer:
        issues.append(f"Lexer missing implementations: {missing_lexer}")
    
    # Check parser
    parser_content = parser_path.read_text(encoding='utf-8')
    parser_impls = set(re.findall(r'SqlBaseParser\.prototype\.(\w+)\s*=', parser_content))
    
    print(f"\n  Parser:")
    print(f"    Required predicates: {required_parser_predicates}")
    print(f"    Required flags: {required_parser_flags}")
    print(f"    Implementations found: {sorted(parser_impls)}")
    
    missing_parser_predicates = set(required_parser_predicates) - parser_impls
    if missing_parser_predicates:
        issues.append(f"Parser missing method implementations: {missing_parser_predicates}")
    
    # Check parser flags are defined
    missing_parser_flags = [f for f in required_parser_flags if f'prototype.{f}' not in parser_content]
    if missing_parser_flags:
        issues.append(f"Parser missing flag definitions: {missing_parser_flags}")
    
    if issues:
        print("\n  ⚠ Issues found:")
        for issue in issues:
            print(f"    - {issue}")
        return False
    else:
        print("\n  ✓ All known predicates are implemented")
        return True


def main():
    """Run the complete build pipeline."""
    print("\n" + "=" * 60)
    print("ANTLR JavaScript Build Pipeline for Spark SQL")
    print("=" * 60)
    
    steps = [
        ("Transform grammar", transform_grammar),
        ("Generate JavaScript", generate_antlr),
        ("Add predicates", add_predicate_implementations),
        ("Verify coverage", verify_predicates),
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
