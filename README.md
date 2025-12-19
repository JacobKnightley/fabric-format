# sparkfmt — Spark SQL Formatter

A deterministic, opinionated Spark SQL formatter compiled to WASM.

## Features

- **Deterministic formatting**: Same input always produces the same output
- **Token-normalized printing**: Discards original whitespace, reprints from scratch
- **Opinionated style**: Follows Databricks/Spark-style structural formatting
- **WASM-ready**: Compiled to WebAssembly for browser and Node.js use
- **Grammar-driven**: Based on Spark SQL's syntax
- **Comment handling**: Foundation for comment preservation (full anchoring system in progress)

## Formatting Rules

### Comma-First Style

The formatter uses comma-first style for SELECT, GROUP BY, and ORDER BY clauses:

```sql
SELECT
     col1
    ,col2
    ,col3
FROM table
```

### Token Normalization

The formatter reprints from scratch, normalizing all spacing:
- **No spaces after commas** in function calls: `func(a,b,c)`
- **No spaces around operators**: `x=1`, `a+b`
- **Single space** between other tokens where needed
- Original whitespace and line breaks are completely discarded

### Keywords

- All SQL keywords are UPPERCASE
- Identifiers preserve their original casing
- Built-in functions remain lowercase

### Aliases

- Column aliases always use `AS`
- Table aliases never use `AS`

### Clauses

- **SELECT**: Comma-first with 5-space indent for first item, 4-space for others
- **FROM**: Inline with table name
- **JOINs**: Each JOIN starts on a new line at column 0
- **WHERE/HAVING**: Inline for single condition, multi-line with operator-leading AND/OR for multiple
- **GROUP BY**: Comma-first on separate lines
- **ORDER BY**: Comma-first, preserves ASC/DESC
- **LIMIT**: Always inline

## Example

**Input:**
```sql
select a,b,count(*) c from t where x=1 and y=2 group by a,b having count(*)>1 order by a limit 10
```

**Output:**
```sql
SELECT
     a
    ,b
    ,count(*) AS c
FROM t
WHERE
    x=1
    AND y=2
GROUP BY
     a
    ,b
HAVING count(*)>1
ORDER BY
     a
LIMIT 10
```

## Usage

### Rust

```rust
use sparkfmt_core::format_sql;

let input = "select a, b from t";
let formatted = format_sql(input).unwrap();
println!("{}", formatted);
```

### WASM (JavaScript/TypeScript)

```javascript
import { format_sql } from './sparkfmt_wasm';

const formatted = format_sql("select a, b from t");
console.log(formatted);
```

## Building

### Build Rust library

```bash
cargo build --release
```

### Build WASM

First, install wasm-pack:

```bash
cargo install wasm-pack
```

Then build the WASM module:

```bash
cd crates/sparkfmt-wasm
wasm-pack build --target web
```

## Testing

```bash
cargo test
```

## Project Structure

```
sparkfmt/
  crates/
    sparkfmt-core/       # Core formatting library
      src/
        lib.rs           # Public API
        parser.rs        # SQL parser
        formatter.rs     # Formatting logic
        ir.rs            # Internal representation
        error.rs         # Error types
      tests/
        acceptance.rs    # Acceptance tests
    sparkfmt-wasm/       # WASM bindings
      src/
        lib.rs           # WASM exports
  Cargo.toml             # Workspace configuration
  README.md
```

## Supported SQL Features

- SELECT queries with DISTINCT
- CTEs (WITH clause)
- JOINs (INNER, LEFT, RIGHT, FULL, CROSS)
- WHERE and HAVING clauses
- GROUP BY
- ORDER BY with ASC/DESC
- LIMIT
- UNION and UNION ALL
- Comments (preserved)

## Error Handling

If parsing fails, the formatter returns the original input unchanged.

## License

MIT
