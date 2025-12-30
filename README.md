# sparkfmt

A fast, opinionated Apache Spark SQL formatter with **zero configuration**.

## Why?

There's no shortage of SQL formatters, but none are purpose-built for Spark. Generic formatters don't prioritize spark-specific syntax like `LATERAL VIEW`, `DISTRIBUTE BY`, or Delta Lake's `MERGE`. We wanted a formatter that speaks Spark natively.

Formatting is personal. This tool reflects our team's preferences — comma-first, uppercase keywords, specific indentation rules. It won't be for everyone, and that's fine. The goal isn't to please everyone; it's to do *one thing well*: format Spark SQL consistently, with zero decisions required.

Built on [Apache Spark's official ANTLR grammar](https://github.com/apache/spark/tree/master/sql/api/src/main/antlr4/org/apache/spark/sql/catalyst/parser) — if Spark supports it, the formatter supports it.

## Features

- **Uppercase keywords**: `SELECT`, `FROM`, `WHERE`, `JOIN`, etc.
- **Uppercase built-in functions**: `COUNT()`, `SUM()`, `COALESCE()`, `ROW_NUMBER()`, etc.
- **Preserve identifier casing**: Table names, column names, UDFs stay as written
- **Comma-first style**: Leading commas for easy column management
- **Smart line breaks**: Expands multi-item clauses, keeps simple queries compact
- **Context-aware**: Distinguishes `a.order` (column) from `ORDER BY` (keyword)
- **Fabric notebook support**: Format SQL cells in Python, Scala, R, and SQL notebook files

## Installation

```bash
npm install -g @jacobknightley/sparkfmt
```

## Usage

```bash
# Format a file in-place
sparkfmt query.sql                 # Generic SQL file
sparkfmt notebook-content.py       # Python notebook
sparkfmt notebook-content.scala    # Scala notebook
sparkfmt notebook-content.r        # R notebook
sparkfmt notebook-content.sql      # SQL notebook

# Format an entire directory (recursively finds .sql, .py, .scala, .r files)
sparkfmt ./src
sparkfmt C:\dev\my-project

# Check if formatting needed (exit code 1 if changes needed)
sparkfmt -c query.sql
sparkfmt -c ./src
```

```bash
# Format inline SQL
sparkfmt -i "select * from t"

# Format from stdin
echo "select * from t" | sparkfmt

# Print to stdout instead of in-place
sparkfmt --stdout query.sql
```

## Formatting Control

### Skip Formatting with `noqa`

```sql
-- noqa
select   x,y,z   from   t   -- Preserved exactly as-is
```

### Suppress Line Expansion with `noqa:expansion`

```sql
SELECT COALESCE(a, b, c, d, e, f, g, h, i, j) -- noqa:expansion
FROM t
```

## Style Guide

See [STYLE_GUIDE.md](STYLE_GUIDE.md) for complete formatting rules and examples.

Key conventions:
- 4-space indentation
- 140-character line width threshold
- Leading commas (comma-first)
- `AS` for column aliases, no `AS` for table aliases
- Keywords and built-in functions uppercase
- User-defined functions preserve original casing

---

# Contributing

## Development Setup

### Prerequisites

- Node.js 18+
- Python 3.8+ (for ANTLR build script)
- Java 11+ (for ANTLR code generation)

### Build

```bash
# Install dependencies
npm install

# Build everything (downloads grammar, generates parser, compiles TypeScript)
npm run build

# Or build steps individually:
npm run build:antlr   # Download grammar & generate JS parser
npm run build:ts      # Compile TypeScript
```

### Test

```bash
# Run all tests
npm test

# Run with failure details
npm run test:verbose
```

## Architecture

The formatter is **100% grammar-driven** — the Apache Spark ANTLR grammar files are the single source of truth. No hardcoded keyword or function lists.

```
Input SQL
    ↓
Dual Lexing (uppercase for token types, original for text)
    ↓
ANTLR Parser (SqlBaseParser)
    ↓
Parse Tree
    ↓
ParseTreeAnalyzer
    - Marks identifier positions
    - Marks function call positions
    - Marks clause boundary positions
    - Detects simple vs complex queries
    ↓
Token Formatter
    - Grammar-driven keyword detection
    - Context-aware casing
    - Smart expansion decisions
    ↓
Formatted SQL
```

### Key Design Decisions

1. **Grammar-Driven Keywords**: A token is a keyword if `symbolicNames[tokenType] === text.toUpperCase()`
2. **Parse Tree Context**: Visitor pattern identifies where tokens appear (identifier vs keyword position)
3. **Dual Lexing**: Parse uppercase SQL for correct token types, but preserve original text
4. **Modular Design**: ~200-400 line modules for maintainability

### Module Overview

| Module | Purpose |
|--------|---------|
| `formatter.ts` | Main orchestration & public API |
| `parse-tree-analyzer.ts` | AST visitor collecting formatting context |
| `token-utils.ts` | Grammar-derived token detection |
| `formatting-context.ts` | State management during formatting |
| `output-builder.ts` | Output construction with column tracking |
| `types.ts` | TypeScript interfaces |
| `noqa-detector.ts` | Formatting suppression directives |
| `magic-sql-extractor.ts` | Fabric notebook SQL cell handling |

### Project Structure

```
src/
├── formatter.ts           # Main formatting logic
├── parse-tree-analyzer.ts # Parse tree visitor
├── types.ts               # TypeScript interfaces
├── cli.ts                 # Command-line interface
├── index.ts               # Public exports
├── tests/                 # Test suites (332 tests)
│   ├── framework.ts       # Test runner
│   ├── index.ts           # Test entry point
│   └── *.test.ts          # Test files by feature
└── generated/             # ANTLR-generated parser

grammar/                   # Apache Spark grammar (downloaded)
├── SqlBaseLexer.g4
└── SqlBaseParser.g4

.build/
└── build_antlr_js.py      # Grammar download & parser generation
```

## Adding Tests

Tests are organized by feature in `src/tests/`:

```typescript
// src/tests/my-feature.test.ts
import { TestSuite } from './framework.js';

export const myFeatureTests: TestSuite = {
    name: 'My Feature',
    tests: [
        {
            name: 'Description of test case',
            input: 'select ...',
            expected: 'SELECT ...',
        },
    ],
};
```

Then import and add to `src/tests/index.ts`.