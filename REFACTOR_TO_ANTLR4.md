# REFACTOR: Replace Hand-Written Parser with ANTLR4-Generated Parser

**IMPORTANT: Do NOT ask follow-up questions. Complete this refactor end-to-end autonomously.**

## ⛔ CRITICAL: Do NOT Deviate from ANTLR4 Approach

**If you encounter ANY issues with the ANTLR4 approach (download failures, compilation errors, etc.), STOP IMMEDIATELY and report the error. Do NOT:**

- ❌ Switch to `sqlparser-rs` or any other SQL parsing library
- ❌ Try to "find an alternative approach"
- ❌ Implement a workaround using a different parser
- ❌ Fall back to modifying the existing hand-written parser

**The ANTLR4 approach is mandatory.** Using any other parser (including sqlparser-rs) violates the project mandate that Spark's grammar files must be the single source of truth. Another library's grammar is NOT Spark's grammar.

**If blocked, report the specific error and STOP. Do not proceed with alternatives.**

## Execution Strategy

### Sub-Agents (if available)
If your environment supports sub-agents, use them for parallel workstreams:
- **Sub-agent 1**: Set up ANTLR4 tooling and generate parser code
- **Sub-agent 2**: Implement formatter visitor methods  
- **Sub-agent 3**: Run tests and fix failures

If sub-agents are not available, proceed sequentially through the checkpoints below.

### Checkpoints (commit after each)
Structure your work with commits at each checkpoint for rollback safety:

1. **Checkpoint 1**: ANTLR4 dependency added to Cargo.toml, build.rs updated → `git commit -m "chore: add antlr4rust dependency and build setup"`
2. **Checkpoint 2**: ANTLR4 generates parser, code compiles → `git commit -m "feat: generate parser from Spark grammar"`
3. **Checkpoint 3**: Formatter visitor skeleton implemented → `git commit -m "feat: implement formatter as ANTLR4 visitor"`
4. **Checkpoint 4**: All existing tests pass → `git commit -m "fix: pass all existing tests"`
5. **Checkpoint 5**: Previously broken constructs verified working → `git commit -m "feat: support scientific notation, nested fields, set operations"`
6. **Checkpoint 6**: Cleanup old code, update docs → `git commit -m "chore: remove hand-written parser, update README"`

## Objective

Refactor `sparkfmt-core` to use an ANTLR4-generated parser from Spark's official grammar files instead of the current hand-written parser. This is a mandatory architectural change to comply with the project's grammar-driven mandate.

## Why This Refactor is Required

The project mandate in `copilot-instructions.md` states:

> "This project is grammar-driven, NOT rule/linter-driven. The Apache Spark ANTLR grammar files (`SqlBaseLexer.g4`, `SqlBaseParser.g4`) are the **single source of truth**."

The current implementation **violates this mandate**:
- Keywords are extracted from the grammar via `build.rs` parsing ⚠️ (partial compliance)
- But the parser is **hand-written** ❌
- Hand-written parser has 34 documented bugs including silent data loss
- Hand-written parser uses `_ => {}` patterns that drop tokens silently

The fix: Generate BOTH the lexer AND parser directly from the grammar using ANTLR4.

### Keyword Handling Simplification

Currently, `build.rs` parses `SqlBaseLexer.g4` to extract keywords and generates `src/generated/keywords.rs`. This is unnecessary with ANTLR4 because:

1. **The generated lexer already defines all keywords as token types** (e.g., `SELECT`, `FROM`, `WHERE` are token constants)
2. **The generated parser knows which tokens are keywords** based on grammar rules
3. **Keyword uppercasing** can be done by checking if a token type is in the keyword range

After this refactor, delete:
- The keyword extraction logic in `build.rs`
- `src/generated/keywords.rs` (or repurpose to re-export from ANTLR4 generated code)
- `src/keywords.rs` (if it just re-exports generated keywords)

The formatter will uppercase keywords by checking the token type against the generated token constants.

## Source Grammar Files

Already present in the repo:
- `grammar/SqlBaseLexer.g4` - Spark's official lexer grammar
- `grammar/SqlBaseParser.g4` - Spark's official parser grammar
- `grammar/VERSION` - Tracks which Spark version the grammar is from

## Target Architecture

```
SqlBaseLexer.g4 + SqlBaseParser.g4
              ↓
        ANTLR4 tool (Rust target)
              ↓
   src/generated/sqlbase*.rs (generated at build time)
              ↓
        Formatter (visitor pattern over parse tree)
              ↓
        Formatted SQL output
```

## Implementation Steps

### Step 1: Add ANTLR4 Rust Runtime Dependency

Update `crates/sparkfmt-core/Cargo.toml`:

```toml
[dependencies]
antlr4rust = "0.5"
# Keep existing dependencies
```

### Step 2: Download ANTLR4 JAR and Generate Parser

**Download the ANTLR4 JAR with Rust target support:**
```bash
mkdir -p tools
curl -L -o tools/antlr4.jar "https://github.com/antlr4rust/antlr4/releases/download/v0.5.0/antlr4-4.13.2-SNAPSHOT-complete.jar"
```

**Generate Rust parser from Spark grammar:**
```bash
java -jar tools/antlr4.jar -Dlanguage=Rust -visitor -o crates/sparkfmt-core/src/generated grammar/SqlBaseLexer.g4 grammar/SqlBaseParser.g4
```

This will generate these files in `crates/sparkfmt-core/src/generated/`:
- `sqlbaselexer.rs` - Lexer
- `sqlbaseparser.rs` - Parser
- `sqlbaselistener.rs` - Listener trait
- `sqlbasevisitor.rs` - Visitor trait

### Step 3: Create Generated Module

Create `crates/sparkfmt-core/src/generated/mod.rs` that includes the ANTLR4-generated files:

```rust
#![allow(warnings)]  // Generated code has warnings

mod sqlbaselexer;
mod sqlbaseparser;
mod sqlbaselistener;
mod sqlbasevisitor;

pub use sqlbaselexer::*;
pub use sqlbaseparser::*;
pub use sqlbaselistener::*;
pub use sqlbasevisitor::*;
```

### Step 4: Implement Formatter as ANTLR4 Visitor

Replace `crates/sparkfmt-core/src/formatter.rs` with a new implementation that:

1. Implements the generated `SqlBaseParserVisitor` trait
2. Walks the parse tree produced by the ANTLR4 parser
3. Produces formatted output following the rules in `FORMATTING_GUIDE.md`

Key visitor methods to implement (the trait will have one method per grammar rule):
- `visit_singleStatement` - Entry point
- `visit_query` - Handle WITH, body, ORDER BY, LIMIT
- `visit_queryTerm` - Handle UNION, EXCEPT, INTERSECT
- `visit_queryPrimary` - Handle SELECT, subqueries
- `visit_selectClause` - Format SELECT with comma-first
- `visit_fromClause` - Format FROM inline
- `visit_joinRelation` - Format JOINs on new lines
- `visit_whereClause` - Format WHERE conditions
- `visit_groupByClause` - Format GROUP BY comma-first
- `visit_havingClause` - Format HAVING
- `visit_orderByClause` - Format ORDER BY comma-first
- `visit_expression` - Normalize expression spacing

### Step 5: Update Public API

Update `crates/sparkfmt-core/src/lib.rs`:

```rust
mod generated;
mod formatter;

pub use formatter::{format_sql, FormatConfig, FormatError};
```

The `format_sql` function should:
1. Create lexer from input string using generated lexer
2. Create token stream from lexer
3. Create parser from token stream using generated parser
4. Call `parser.singleStatement()` to get parse tree
5. Create formatter visitor
6. Walk the tree with visitor
7. Return formatted output

### Step 6: Preserve All Existing Formatting Rules

The formatter MUST implement all rules from `FORMATTING_GUIDE.md`:

1. **Comma-first lists**: SELECT, GROUP BY, ORDER BY use comma-first with 5-space first item indent, 4-space subsequent
2. **Keywords**: UPPERCASE
3. **Identifiers**: Preserve original casing
4. **Column aliases**: Always use AS
5. **Table aliases**: Never use AS
6. **FROM**: Inline with table name
7. **JOINs**: Each JOIN on new line at column 0, ON indented 4 spaces
8. **WHERE/HAVING**: Single condition inline, multiple conditions multi-line with operator-leading AND/OR
9. **Comments**: Preserve and anchor correctly (TrailingInline, TrailingOwnLine, Leading)

### Step 7: Ensure All Current Tests Pass

Run:
```bash
cargo test -p sparkfmt-core
```

All existing tests in `crates/sparkfmt-core/tests/` must pass. If any fail due to the refactor, fix the formatter implementation - do NOT modify the tests.

### Step 8: Verify No New Limitations

After refactor, verify these constructs work (they are currently broken):
- `SELECT 1.5e10` - Scientific notation
- `SELECT a.b.c.d.e` - Deeply nested field access  
- `SELECT EXTRACT(YEAR FROM dt)` - EXTRACT function
- `SELECT * FROM t1 EXCEPT SELECT * FROM t2` - Set operations
- `SELECT INTERVAL '1' DAY` - Interval literals
- `SELECT transform(arr, x -> x + 1)` - Lambda expressions
- `SELECT x::INT` - Double-colon cast (if Spark grammar supports it)
- `CLUSTER BY`, `DISTRIBUTE BY`, `SORT BY` - Spark-specific clauses

### Step 9: Update Documentation

Update `README.md` to document:
- Build requires Java 11+ (for ANTLR4)
- Parser is generated from Spark's official grammar
- How to update when Spark releases new grammar

### Step 10: Clean Up

Remove files that are no longer needed:
- Old hand-written parser code (if separate from formatter)
- `scripts/parse_spark_grammar.py` (no longer needed - grammar IS the parser)
- Keyword extraction logic in `build.rs` (keywords come from generated lexer)
- `src/keywords.rs` if it only re-exports extracted keywords

Simplify `build.rs` to ONLY:
1. Run ANTLR4 to generate lexer/parser
2. That's it - no more grammar parsing

Keep:
- `grammar/SqlBaseLexer.g4`
- `grammar/SqlBaseParser.g4`  
- `grammar/VERSION`

## Constraints

1. **No new limitations**: Every SQL construct the current implementation handles must still work
2. **WASM compatibility**: The refactored code must still compile to WASM (`cargo build -p sparkfmt-wasm`)
3. **Same public API**: `format_sql(&str) -> Result<String, FormatError>` signature unchanged
4. **Same formatting output**: For inputs that currently format correctly, output should be identical

## Verification Checklist

Before considering this complete:

- [ ] `cargo build -p sparkfmt-core` succeeds
- [ ] `cargo build -p sparkfmt-wasm` succeeds  
- [ ] `cargo test -p sparkfmt-core` - all tests pass
- [ ] Scientific notation: `SELECT 1.5e10` formats correctly
- [ ] Nested fields: `SELECT a.b.c.d.e` preserves all levels
- [ ] EXTRACT: `SELECT EXTRACT(YEAR FROM dt)` works
- [ ] Set operations: `UNION`, `EXCEPT`, `INTERSECT` work
- [ ] INTERVAL literals work
- [ ] No `_ => {}` patterns in new code that could silently drop tokens

## Reference Files

Read these files for context:
- `.github/copilot-instructions.md` - Project mandate and formatting rules
- `FORMATTING_GUIDE.md` - Detailed formatting specifications
- `KNOWN_BUGS.md` - Bugs that should be fixed by this refactor
- `grammar/SqlBaseLexer.g4` - Lexer grammar
- `grammar/SqlBaseParser.g4` - Parser grammar
- `crates/sparkfmt-core/tests/*.rs` - Test cases that must pass

## Do Not

- Do NOT ask clarifying questions - proceed with implementation
- Do NOT create a POC - this is production code
- Do NOT skip any formatting rules
- Do NOT add `_ => {}` or similar catch-all patterns that could drop data
- Do NOT modify existing tests to make them pass - fix the implementation instead
- **Do NOT use sqlparser-rs, tree-sitter, or any other parsing library** - ANTLR4 with Spark's grammar is the ONLY acceptable approach
- **Do NOT "find alternatives" if ANTLR4 has issues** - STOP and report the error instead
