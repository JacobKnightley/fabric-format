# sparkfmt

TypeScript/JavaScript Spark SQL Formatter using ANTLR4 parse tree.

## Overview

A 100% **grammar-driven** SQL formatter for Apache Spark SQL. The ANTLR grammar files (`SqlBaseLexer.g4`, `SqlBaseParser.g4`) are the **single source of truth** — no hardcoded keyword or function lists.

This implementation uses the JavaScript ANTLR4 runtime, which can successfully parse the full Apache Spark SQL grammar **without stack overflow**, making it viable for use in browser extensions.

## Key Features

- **100% Grammar-Driven**: Keywords detected via `symbolicNames[tokenType] === text.toUpperCase()` — no hardcoded lists
- **Uppercases SQL keywords**: `SELECT`, `FROM`, `WHERE`, etc.
- **Uppercases built-in functions**: `COUNT()`, `SUM()`, `ROW_NUMBER()`, etc.
- **Preserves identifier casing**: Table names, column names, aliases stay as-is
- **Context-sensitive keyword handling**: `a.key`, `a.order` preserve lowercase (identifiers after dot), while `ORDER BY` is uppercase (keyword position)
- **Adds newlines before major clauses**: `SELECT`, `FROM`, `WHERE`, `JOIN`, etc.

## Context-Sensitive Keywords

The critical capability this formatter demonstrates is **context-sensitive keyword handling**:

```sql
-- Input:
select a.key, a.order, a.value from t order by a.order

-- Output:
SELECT a.key, a.order, a.value
FROM t
ORDER BY a.order
```

Note how:
- `a.key`, `a.order`, `a.value` preserve lowercase - these are **identifiers** (field access after dot)
- `ORDER BY` is uppercase - this is a **keyword** position

This is impossible with a simple tokenizer because you need the **parse tree context** to know whether `order` is an identifier or keyword.

## Build

```bash
# Install dependencies
npm install

# Build ANTLR parser (requires Java and python)
npm run build:antlr

# Build TypeScript
npm run build:ts

# Or both
npm run build
```

## Usage

```bash
# Format inline SQL
node dist/cli.js -i "select * from t where x = 1"

# Format file
node dist/cli.js query.sql

# Check if file needs formatting
node dist/cli.js -c query.sql

# Pipe from stdin
echo "select * from t" | node dist/cli.js
```

## Test

```bash
npm test
```

## Architecture

```
Input SQL
    ↓
ANTLR Lexer (SqlBaseLexer.js)
    ↓
ANTLR Parser (SqlBaseParser.js) 
    ↓
Parse Tree
    ↓
IdentifierContextVisitor
    - Walks tree to mark identifier positions
    - Marks function call positions
    ↓
Token Formatting
    - Uppercase keywords (unless identifier position)
    - Uppercase built-in functions
    - Preserve identifiers
    - Add newlines before clauses
    ↓
Formatted SQL
```

## Files

```
src/
├── formatter.ts    # Main formatting logic (100% grammar-driven)
├── cli.ts          # Command-line interface
├── test.ts         # E2E tests (16 tests)
├── index.ts        # Public exports
└── generated/      # ANTLR-generated parser (gitignored)

scripts/
└── build_antlr_js.py  # Build script for ANTLR parser

grammar/
├── SqlBaseLexer.g4    # Source of truth for keywords
├── SqlBaseParser.g4   # Source of truth for grammar rules
└── VERSION            # Spark version
```

## Grammar-Driven Architecture

The formatter uses **no hardcoded keyword or function lists**. Instead:

1. **Keyword Detection**: A token is a keyword if `symbolicNames[tokenType] === text.toUpperCase()`
2. **Identifier Context**: Parse tree visitor marks positions within `identifier`, `qualifiedName`, `functionCall` contexts
3. **Clause Boundaries**: Parse tree visitor methods determine where clauses start for newline insertion

This ensures if Spark's grammar supports it, the formatter supports it automatically.

## Why JavaScript/TypeScript?

The Rust ANTLR runtime (`antlr4rust`) causes **stack overflow** when parsing Spark SQL grammar, even for simple queries like `SELECT a FROM t`. This is due to:

1. Deep grammar recursion in Spark SQL
2. Rust's stack-based recursion in the ANTLR runtime
3. WASM's fixed ~1MB stack limit in browsers

The JavaScript ANTLR4 runtime handles deep recursion through the JS engine's optimization, making it suitable for browser extensions.
