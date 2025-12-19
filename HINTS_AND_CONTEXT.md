# Query Hints and Context-Sensitive Identifiers - Implementation Notes

## Overview

This document describes the implementation status of two advanced features requested for sparkfmt:
1. **Query Hints** - Spark SQL optimizer hints like `/*+ BROADCAST(table) */`
2. **Context-Sensitive Identifiers** - Only uppercase keywords in keyword positions

## Current Status

### ✅ Implemented: Hints Module

**File:** `src/hints.rs`

A complete hints module has been created with:
- Recognition of all standard Spark SQL hints
- Join hints: BROADCAST, BROADCASTJOIN, MAPJOIN, MERGE, SHUFFLE_MERGE, MERGEJOIN, SHUFFLE_HASH, SHUFFLE_REPLICATE_NL
- Partition hints: COALESCE, REPARTITION, REPARTITION_BY_RANGE, REBALANCE
- Case-insensitive `is_hint()` helper function
- Comprehensive test coverage

**What's Missing:**
- Parser integration to detect and parse hint comments `/*+ ... */`
- IR structures to store hint information
- Formatter integration to output formatted hints

**Next Steps:**
1. Extend lexer to distinguish hint comments from regular block comments
2. Add hint parsing logic to extract hint names and arguments
3. Add hint nodes to the IR
4. Implement hint formatting in the printer

### 🚧 Planned: Context-Sensitive Identifier Handling

This feature requires significant architectural changes and is documented as aspirational.

**The Challenge:**

Currently, the formatter determines whether to uppercase a token during **lexing**:
- If token matches a keyword → store as `Keyword(uppercased)`
- If token doesn't match → store as `Identifier(preserved)`

This happens before we know the **context** where the token appears.

**What's Needed:**

To implement context-sensitive casing, we need to:

1. **Change Lexer:**
   - Keep all tokens in original case during lexing
   - Add position/line/column tracking

2. **Change Parser:**
   - Track whether each identifier appears in a "keyword position" or "identifier position"
   - Store this information in the AST/IR

3. **Change Formatter:**
   - Make casing decisions during formatting based on node type
   - `IdentifierNode` → preserve casing
   - `KeywordNode` → uppercase

**Examples of Context-Sensitive Casing:**

```sql
-- Current behavior (keywords always uppercase during lexing)
SELECT order, key FROM value  -- ERROR: 'order', 'key', 'value' treated as keywords

-- Desired behavior (context-aware)
SELECT order, key FROM value  -- OK: 'order', 'key' are columns, 'value' is table
WHERE x = 1 AND y = 2         -- OK: AND is keyword in operator position

SELECT * FROM t ORDER BY key  -- OK: ORDER BY are keywords, 'key' is column
```

**Implementation Complexity:**

This is a **major refactoring** that touches all layers:
- Lexer: ~100 lines changed
- Parser: ~500 lines changed  
- IR: ~50 lines changed
- Formatter: ~200 lines changed
- Tests: All tests need review and potential updates

Estimated effort: 1-2 days of development work.

### 🔍 Current Workaround

The current implementation works well for most SQL where:
- Column/table names don't collide with SQL keywords
- Users can quote identifiers that match keywords: `` `order` ``

For queries with identifier-keyword conflicts, users should:
1. Use quoted identifiers: `` `select`, `from`, `order` ``
2. Rename columns to avoid keyword names
3. Wait for context-sensitive implementation

## Testing

### Hint Tests

File: `tests/hints_and_context_tests.rs`

- 4 hint tests (currently ignored, awaiting parser integration)
- 4 context-sensitive identifier tests (currently ignored, awaiting implementation)
- 3 tests demonstrating current behavior (all passing)

### Running Tests

```bash
# Run all non-ignored tests
cargo test

# Run only current behavior tests
cargo test --test hints_and_context_tests test_current

# See all tests including ignored ones
cargo test --test hints_and_context_tests -- --ignored
```

## Documentation

### User-Facing Documentation

- **README.md** - Notes hints as planned feature
- **.github/copilot-instructions.md** - Detailed specification for future implementation
- **IMPLEMENTATION.md** - This file

### Developer Notes

When implementing hint parsing:

1. Distinguish hint comments from regular comments during lexing
2. Hint comments start with `/*+` (note the plus sign)
3. Parse hint content to extract hint names and comma-separated arguments
4. Hint names should be uppercased, arguments preserve casing
5. Handle multiple hints: `/*+ hint1(args), hint2(args) */`
6. Maintain deterministic formatting (no spaces after commas)

When implementing context-sensitive identifiers:

1. Start by adding `preserve_case` flag to Token variants
2. Update parser to set flag based on syntactic context
3. Modify formatter to respect the flag
4. Add comprehensive tests for edge cases
5. Update all existing test expectations

## References

- Spark SQL Hints: [ResolveHints.scala](https://github.com/apache/spark/blob/master/sql/catalyst/src/main/scala/org/apache/spark/sql/catalyst/analysis/ResolveHints.scala)
- Spark SQL Grammar: [SqlBaseLexer.g4](https://github.com/apache/spark/blob/master/sql/catalyst/src/main/antlr4/org/apache/spark/sql/catalyst/parser/SqlBaseLexer.g4)

## Summary

- ✅ **Hints module** is ready and tested
- 🚧 **Hint parsing** awaits parser/formatter integration
- 🚧 **Context-sensitive identifiers** is a major refactoring task

The foundation is in place. Future work will focus on integrating hints into the parser/formatter and optionally implementing context-sensitive identifier handling for improved SQL compatibility.
