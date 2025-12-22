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
Dual Lexing (uppercase for types, original for text)
    ↓
ANTLR Parser (SqlBaseParser)
    ↓
Parse Tree
    ↓
ParseTreeAnalyzer (parse-tree-analyzer.ts)
    - Marks identifier positions
    - Marks function call positions  
    - Marks clause boundary positions
    ↓
Token Formatting (formatter.ts)
    - Uses token-utils.ts for grammar-driven detection
    - Uses formatting-context.ts for state management
    - Uses output-builder.ts for output construction
    ↓
Formatted SQL
```

## Module Structure

The formatter is organized into focused modules optimized for maintainability:

| Module | Lines | Purpose |
|--------|------:|---------|
| `types.ts` | ~180 | Central interfaces (`AnalyzerResult`, `FormattingState`, etc.) |
| `token-utils.ts` | ~120 | Grammar-derived token detection utilities |
| `parse-tree-analyzer.ts` | ~850 | AST visitor that collects formatting context |
| `formatting-context.ts` | ~230 | State management, indent calculator, expansion helpers |
| `output-builder.ts` | ~130 | Output construction with column tracking |
| `formatter.ts` | ~650 | Main orchestration & public API |
| `constants.ts` | ~10 | Configuration constants (MAX_LINE_WIDTH) |

## Files

```
src/
├── formatter.ts    # Main formatting logic (100% grammar-driven)
├── cli.ts          # Command-line interface
├── test.ts         # E2E tests (16 tests)
├── index.ts        # Public exports
└── generated/      # ANTLR-generated parser (gitignored)

scripts/
└── build_antlr_js.py  # Downloads grammar & generates parser

grammar/               # Downloaded from Apache Spark (gitignored)
├── SqlBaseLexer.g4    # Source of truth for keywords
└── SqlBaseParser.g4   # Source of truth for grammar rules
```

## Grammar-Driven Architecture

The formatter uses **no hardcoded keyword or function lists**. Instead:

1. **Keyword Detection**: A token is a keyword if `symbolicNames[tokenType] === text.toUpperCase()`
2. **Identifier Context**: Parse tree visitor marks positions within `identifier`, `qualifiedName`, `functionCall` contexts
3. **Clause Boundaries**: Parse tree visitor methods determine where clauses start for newline insertion

This ensures if Spark's grammar supports it, the formatter supports it automatically.

## Why JavaScript/TypeScript?

The JavaScript ANTLR4 runtime handles the deep grammar recursion in Spark SQL efficiently through the JS engine's optimization, making it suitable for both Node.js and browser environments.
