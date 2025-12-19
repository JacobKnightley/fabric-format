# SQL Formatting Script

This directory contains a command-line tool for formatting Spark SQL files using the sparkfmt formatter.

## Quick Start

### Using the Shell Script (Recommended)

The `format-sql.sh` script is the easiest way to format SQL files. It will automatically build the formatter if needed.

```bash
# Make the script executable (first time only)
chmod +x format-sql.sh

# Format a SQL file and print to stdout
./format-sql.sh example.sql

# Format a SQL file and save to a new file
./format-sql.sh input.sql output.sql

# Format SQL from stdin
cat query.sql | ./format-sql.sh -
```

### Using the Rust Binary Directly

If you prefer to use the Rust binary directly:

```bash
# Build the formatter
cargo build --release -p sparkfmt-core --bin sparkfmt

# Use the binary
./target/release/sparkfmt input.sql
./target/release/sparkfmt input.sql output.sql
```

## Usage

```
./format-sql.sh <input.sql> [output.sql]
```

**Arguments:**
- `input.sql` - Path to the SQL file to format (use `-` to read from stdin)
- `output.sql` - (Optional) Path where the formatted SQL will be saved. If omitted, output goes to stdout.

## Examples

### Example 1: Format and view in terminal

```bash
./format-sql.sh query.sql
```

This will format `query.sql` and display the result in your terminal.

### Example 2: Format and save to a new file

```bash
./format-sql.sh query.sql query_formatted.sql
```

This will format `query.sql` and save the result to `query_formatted.sql`.

### Example 3: Format from stdin

```bash
cat query.sql | ./format-sql.sh -
# or
./format-sql.sh - < query.sql
```

### Example 4: Format multiple files

```bash
# Format all SQL files in a directory
for file in *.sql; do
    ./format-sql.sh "$file" "${file%.sql}_formatted.sql"
done
```

### Example 5: In-place formatting (overwrites original)

```bash
# Format and overwrite the original file
./format-sql.sh query.sql query.sql.tmp && mv query.sql.tmp query.sql
```

## Sample Input and Output

**Input (`example.sql`):**
```sql
select  a ,  b  , count(*) as c
from   orders   o
inner join customers cust on o.customer_id = cust.id
where  o.status  = 'active'
  and  o.amount > 100
group by a, b
having count(*) > 5
order by a desc, b asc
limit 50
```

**Output:**
```sql
SELECT
     a
    ,b
    ,count(*) AS c
FROM orders o
INNER JOIN customers cust
    ON o.customer_id=cust.id
WHERE
    o.status='active'
    AND o.amount>100
GROUP BY
     a
    ,b
HAVING count(*)>5
ORDER BY
     a DESC
    ,b ASC
LIMIT 50
```

## Formatting Rules

The formatter applies these rules:
- **Token normalization**: Discards all original whitespace and reprints from scratch
- **Comma-first style** for SELECT, GROUP BY, and ORDER BY
- **No spaces after commas** in function calls: `func(a,b,c)`
- **No spaces around operators**: `x=1`, `a+b`
- **Keywords in UPPERCASE**, identifiers preserve their casing
- **Column aliases always use AS**, table aliases never use AS
- **JOINs start on new line** at column 0, ON conditions indented 4 spaces
- **WHERE/HAVING**: Single condition inline, multiple conditions on separate lines with operator-leading AND/OR

## Building from Source

If you want to build the formatter yourself:

```bash
# Build in release mode (optimized, faster)
cargo build --release -p sparkfmt-core --bin sparkfmt

# Build in debug mode (faster compilation)
cargo build -p sparkfmt-core --bin sparkfmt

# Run tests
cargo test
```

The binary will be located at:
- Release: `./target/release/sparkfmt`
- Debug: `./target/debug/sparkfmt`

## Error Handling

If the formatter encounters a parsing error, it will:
1. Print an error message to stderr
2. Return the original input unchanged
3. Exit with the formatted (or original) output

This ensures you never lose your SQL, even if there's an issue with the formatter.

## Integration with Editors

### VS Code

You can configure VS Code to use this formatter:

1. Install the "SQL Formatter" extension or similar
2. Configure it to use an external command:
   ```json
   {
     "sqltools.format.command": "/path/to/format-sql.sh"
   }
   ```

### Vim/Neovim

Add to your `.vimrc` or `init.vim`:
```vim
autocmd FileType sql setlocal formatprg=/path/to/format-sql.sh\ -
```

Then use `gq` to format SQL blocks.

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:
```bash
#!/bin/bash
for file in $(git diff --cached --name-only --diff-filter=ACMR | grep '\.sql$'); do
    ./format-sql.sh "$file" "$file.tmp" && mv "$file.tmp" "$file"
    git add "$file"
done
```

## Troubleshooting

**"sparkfmt binary not found" error:**
- The script will try to build it automatically on first run
- Manually run: `cargo build --release -p sparkfmt-core --bin sparkfmt`

**Build errors:**
- Ensure you have Rust installed: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Update Rust: `rustup update`

**Formatting doesn't match expectations:**
- Check the input is valid Spark SQL
- See `.github/copilot-instructions.md` for detailed formatting rules
- The formatter is opinionated and may differ from other formatters

## More Information

- See `README.md` for overall project documentation
- See `.github/copilot-instructions.md` for detailed formatting rules
- See `IMPLEMENTATION.md` for technical details
