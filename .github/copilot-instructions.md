# Copilot Instructions for sparkfmt

## Core Principle (Authoritative)

> **This project is 100% grammar-driven.**
>
> The Apache Spark ANTLR grammar files (`SqlBaseLexer.g4`, `SqlBaseParser.g4`) are the **single source of truth**. All keywords, operators, tokens, and syntactic constructs are derived from these files—**never hardcoded**.
>
> **Non-negotiable requirement:** If Spark's grammar supports it, we support it. No exceptions.

## Grammar-Driven Architecture

### Source of Truth
- Grammar files: `grammar/SqlBaseLexer.g4`, `grammar/SqlBaseParser.g4`
- Downloaded from Apache Spark repository

### No Hardcoded Lists
- **NO `keywords.ts`** - keywords detected via grammar
- **NO `functions.ts`** - function context detected via parse tree
- **NO hardcoded token type arrays** - all derived from `symbolicNames`

### How Keywords Are Detected
```typescript
// A token is a keyword if its symbolic name matches its text (uppercase)
function isKeywordToken(tokenType: number, text: string): boolean {
  const symbolicName = SqlBaseLexer.symbolicNames[tokenType];
  return symbolicName !== null && symbolicName === text.toUpperCase();
}
```

### How Identifiers Are Detected
The `ParseTreeAnalyzer` visitor walks the parse tree and marks token positions that are:
1. Inside `identifier` rule contexts
2. Inside `functionName` rule contexts
3. Inside `qualifiedName` contexts (field access like `a.key`)

These positions are preserved (not uppercased) during formatting.

### How Clause Boundaries Are Detected
The parse tree visitor methods determine where major clauses start:
- `visitFromClause()` - marks FROM keyword position
- `visitWhereClause()` - marks WHERE keyword position
- `visitWindowDef()` - marks OVER keyword position
- etc.

These positions get newlines inserted before them.

## Critical Anti-Pattern: Hardcoding

```typescript
// FORBIDDEN - hardcoded keyword list
const SQL_KEYWORDS = ['SELECT', 'FROM', 'WHERE', ...];

// FORBIDDEN - hardcoded token type check
const NON_KEYWORD_TYPES = new Set([Token.IDENTIFIER, ...]);

// REQUIRED - derive from grammar
const symbolicName = SqlBaseLexer.symbolicNames[tokenType];
const isKeyword = symbolicName !== null && symbolicName === text.toUpperCase();
```

## Token Processing

### Casing Rules
- **Keywords**: UPPERCASE (detected via symbolicName)
- **Function names**: UPPERCASE (in function call context)
- **Identifiers**: Preserve original casing (marked by parse tree visitor)

### Layout Rules
- Single space between tokens (whitespace normalization)
- Newline before major clauses (FROM, WHERE, JOIN, GROUP BY, etc.)
- These are style choices, not grammar-driven

## ANTLR Case Sensitivity Workaround

The ANTLR lexer is case-sensitive: `select` becomes IDENTIFIER, `SELECT` becomes SELECT token.

**Solution: Dual-lexing**
1. Parse the **UPPERCASED** SQL to get correct token types
2. Use **original** SQL for token text
3. Combine: correct types + original text

```typescript
// Parse uppercase for correct token types
const upperStream = new CommonTokenStream(new SqlBaseLexer(CharStream.fromString(sql.toUpperCase())));
// Parse original for text
const origStream = new CommonTokenStream(new SqlBaseLexer(CharStream.fromString(sql)));
```

## Testing Requirements

All changes must:
- Pass existing E2E tests (`npm test`)
- Maintain 100% grammar-driven approach
- Not introduce any hardcoded lists
- Handle context-sensitive keywords correctly

## Test Structure

Tests are organized into modular suites under `src/tests/`:

```
src/tests/
├── framework.ts           # Test framework (TestCase, TestSuite, runner)
├── index.ts               # Main test runner
├── basic-select.test.ts   # Basic SELECT queries
├── casing.test.ts         # Casing rules & aliases
├── joins.test.ts          # JOIN variants
├── grouping.test.ts       # GROUP BY/ORDER BY/HAVING
├── where.test.ts          # WHERE conditions
├── subqueries.test.ts     # Subqueries, CTEs, set operations
├── expressions.test.ts    # CASE, CAST, literals, arrays
├── comments.test.ts       # Comments & hints
├── ddl.test.ts            # DDL statements
├── dml.test.ts            # DML statements
├── spark-features.test.ts # Spark-specific features
└── utility.test.ts        # Utility commands
```

**Running tests:**
- `npm test` - Run all tests (109 tests)
- `npm run test:verbose` - Run with failure details

## Key Files

| File | Purpose |
|------|---------|
| `grammar/SqlBaseLexer.g4` | Source of truth for keywords, operators |
| `grammar/SqlBaseParser.g4` | Source of truth for grammar rules |
| `src/formatter.ts` | Main formatting logic (grammar-driven) |
| `src/tests/` | Modular test suites |
| `scripts/build_antlr_js.py` | Generates JS parser from grammar |
| `STYLE_GUIDE.md` | Formatting style reference |
| `KNOWN_ISSUES.md` | Tracked bugs and limitations |

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
ParseTreeAnalyzer Visitor
    - Marks identifier positions
    - Marks function call positions
    - Marks clause boundary positions
    ↓
Token Formatting
    - isKeywordToken() via symbolicNames
    - Uppercase keywords (unless identifier position)
    - Preserve identifiers
    - Add newlines before clauses
    ↓
Formatted SQL
```

## When Making Changes

- Never add hardcoded keyword/function lists
- Always use parse tree context for detection
- Test with context-sensitive examples like `select a.order from t order by x`
- Run `npm test` to verify all 109 tests pass
- Add new tests to the appropriate test module
