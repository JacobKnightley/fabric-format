# Copilot Instructions for sparkfmt

## Core Principle (Authoritative)

> **Formatting is a full reprint from tokens and structure.**  
> **User whitespace is ignored entirely.**

The formatter must:
- Discard all original whitespace and line breaks
- Preserve only: syntactic structure, string literals, quoted identifiers, and comments
- Generate all formatting output exclusively via the printer

## Token Normalization Rules

When printing expressions or token sequences:
- Collapse all whitespace between tokens to a **single space**
- Never emit newlines except where explicitly required by clause/layout rules
- Do not insert or remove tokens
- Do not change token text (except keyword casing and required AS insertion)
- **Remove spaces after commas** inside function calls: `func(a, b)` → `func(a,b)`
- Examples:
  - `a   =    b` → `a = b`
  - `func( a , b )` → `func(a,b)`
  - Original line breaks inside expressions are ignored

## Comment Handling (Critical)

### Preservation
- Comment text must be preserved exactly
- Never modify content inside comments
- Never merge or split comments
- Never drop comments

### Anchoring Model
Each comment must be attached to a syntactic anchor with one of three attachment types:

1. **TrailingInline** (preferred for line comments)
   - If a line comment appears after a non-trivia token on the same original line
   - Attach to the nearest preceding non-trivia token
   - Print on the same line: `<code> -- comment`
   - Example: `a, b -- cols` attaches to `b`

2. **TrailingOwnLine**
   - Print on its own line **immediately above** the formatted line containing the attached node/token
   - Indentation matches the attached node/token indentation level

3. **Leading**
   - Print on its own line **immediately before** the formatted node/token
   - Indentation matches the attached node/token indentation level

### Block Comments
- Always printed on their own line
- Use Leading or TrailingOwnLine placement (never TrailingInline)

### Prohibited
- Never move comments across clause boundaries
- Never inline block comments into expressions

## Formatting Rules

### Comma-First Lists (SELECT, GROUP BY, ORDER BY)
- First item indent: **5 spaces**
- Subsequent items indent: **4 spaces** + leading comma (no space after comma)
- Example:
  ```sql
  SELECT
       col1
      ,col2
      ,col3
  ```

### Keywords and Casing
- SQL keywords: **UPPERCASE** (SELECT, FROM, WHERE, etc.)
- Identifiers: **preserved casing**
- Built-in functions: **UPPERCASE** (COUNT, SUM, etc.)
- **Context-sensitive casing** (aspirational):
  - Keywords only uppercase in keyword positions
  - Identifiers preserve casing even if they match keyword names
  - Examples: `SELECT order FROM t` (order is column), `ORDER BY x` (ORDER is keyword)
  - Current limitation: Keywords detected during lexing, context-sensitivity not yet implemented

### Query Hints
- Hint comments: `/*+ hint_name(args) */`
- Hint names: **UPPERCASE** (BROADCAST, REPARTITION, etc.)
- Arguments inside hints: **preserve casing** (table/column names)
- Example: `/*+ BROADCAST(my_table) */`

### Aliases
- Column aliases: **always use AS** (`col AS alias`)
- Table aliases: **never use AS** (`table t`)

### FROM and JOINs
- FROM: **inline** with table name (`FROM table t`)
- Each JOIN: **starts on new line at column 0**
- ON conditions: **indented 4 spaces**
- Multiple ON conditions: **operator-leading AND/OR**
- Example:
  ```sql
  FROM orders o
  INNER JOIN customers c
      ON o.cust_id=c.id
      AND o.key=c.key
  ```

### WHERE and HAVING
- Single condition: **inline** (`WHERE x=1`)
- Multiple conditions: **multi-line with operator-leading AND/OR**
- Each condition indented **4 spaces**
- Example:
  ```sql
  WHERE
      x=1
      AND y=2
  ```

### CTEs (WITH clause)
- First CTE appears immediately after WITH
- Subsequent CTEs use **comma-first style** (leading comma, no space)
- Each CTE body follows all formatting rules recursively

### UNION
- UNION/UNION ALL appears on its own line
- Each SELECT block follows all formatting rules

### Other Clauses
- GROUP BY: comma-first on separate lines
- ORDER BY: comma-first, preserves ASC/DESC
- LIMIT: always inline

## Error Handling

- If parsing fails: **return original input unchanged**
- No panics allowed
- Log errors only in WASM builds (to console)

## Guarantees

The formatter must guarantee:
1. **Deterministic output**: same input always produces same output
2. **Idempotence**: `format(format(input)) == format(input)`
3. **No dependency on original whitespace**
4. **No syntactic changes to valid input**

## Testing Requirements

All changes must:
- Pass existing snapshot tests (update snapshots if needed)
- Pass idempotence tests
- Maintain WASM build compatibility
- Not introduce panics or crashes
- Handle edge cases gracefully

## Architecture

```
Input SQL String
     ↓
Lexer (tokenization + comment extraction)
     ↓
Parser (AST with comment anchors)
     ↓
Formatting IR (tokens + structure + anchored comments)
     ↓
Printer (full reprint with normalized spacing)
     ↓
Output SQL String
```

### Key Components

1. **Lexer**
   - Extract tokens with position info (line, column)
   - Preserve comments as Comment tokens
   - Record enough info to determine TrailingInline vs Leading

2. **Parser**
   - Build AST from non-comment tokens
   - Attach comments to nodes/tokens using anchoring rules

3. **Formatting IR**
   - Store token sequences (not strings) for expressions
   - Store comment attachments with anchor IDs and attachment kinds

4. **Printer**
   - Only component that emits whitespace/newlines
   - Normalize token spacing (single space between tokens)
   - Print comments according to attachment rules
   - Follow all formatting rules precisely

## When Making Changes

- Always do full reprint from tokens
- Never preserve or reference original spacing
- Always test idempotence
- Always verify comment preservation
- Always check WASM build
