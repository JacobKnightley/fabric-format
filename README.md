# fabric-format

A zero-config formatter for **Microsoft Fabric notebooks**.

## Philosophy

**Opinionated by design.** This formatter has one style, enforced everywhere, with no configuration options—and no plans to add any.

Built this for teams who want consistent notebook formatting without endless debates over style guides. The decisions are made. Your code looks the same every time.

The focus is on clean, consistent output—not tailored experiences or nuanced edge cases.

## Browser Extension

Format Fabric notebooks directly in your browser with a single click.

### Usage

1. Open a notebook in Microsoft Fabric
2. Click the **Format** button in the notebook toolbar

   ![Format button in Fabric notebook toolbar](assets/extension-format-button.png)

3. All cells in the notebook are formatted instantly

### Edge Installation
1. Install the extension from [Edge Add-ons](https://github.com/jacobknightley/fabric-format/releases](https://microsoftedge.microsoft.com/addons/detail/fabric-format/pagkopelpfjaedelgckkbmcepekgheaj)

### Chrome Installation

1. Download `fabric-format-chromium.zip` from the [latest release](https://github.com/jacobknightley/fabric-format/releases)
2. Extract the zip file
3. Load the unpacked extension in your browser: [Install an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)

> **Note:** Plan to eventually publish to the Chrome Web Store.

## CLI

### Usage

```bash
# format
fabfmt format notebook.py                                # Format a single file
fabfmt format ./src                                      # Format all files in directory
fabfmt format query.sql --print                          # Print formatted output
fabfmt format --type sparksql -i "select * from t"       # Format inline string
echo "select * from t" | fabfmt format --type sparksql   # Format from stdin

# check (exit 1 if changes needed)
fabfmt check notebook.py                                # Check a single file
fabfmt check ./src                                      # Check all files in directory
fabfmt check --type sparksql -i "select * from t"       # Check inline string
echo "select * from t" | fabfmt check --type sparksql   # Check from stdin
```

### Installation

```bash
npm install -g @jacobknightley/fabric-format
```

## Supported File Types

- `.py` — Python notebooks
- `.scala` — Scala notebooks
- `.r` — R notebooks
- `.sql` — SQL notebooks

## Supported Languages

- Spark SQL
- Python

> **Note:** All other language cells are preserved as-is.

### Spark SQL

---

Custom formatter built on [Apache Spark's official ANTLR grammar](https://github.com/apache/spark/tree/master/sql/api/src/main/antlr4/org/apache/spark/sql/catalyst/parser). If Spark supports the syntax, fabric-format formats it correctly.

#### Style Overview

| Element                | Formatting                 |
| ---------------------- | -------------------------- |
| Keywords               | `UPPERCASE`                |
| Built-in functions     | `UPPERCASE()`              |
| User-defined functions | `preserveCase()`           |
| Identifiers            | `preserveCase`             |
| Indentation            | 4 spaces                   |
| Expression line width  | 140 characters (then wrap) |
| Commas                 | Leading (comma-first)      |

See [SQL_STYLE_GUIDE.md](./SQL_STYLE_GUIDE.md) for complete rules and examples.

#### Format Directives

##### `fmt: off`

Skip formatting entirely—preserves original whitespace and casing. Applicable only to the statement directly after it.

```sql
-- fmt: off
select  Col_A,Col_B B,Col_C   from   t;
select  Col_A,Col_B B,Col_C   from   t;
```

⬇️ Output

```sql
-- fmt: off
select  Col_A,Col_B B,Col_C   from   t;

SELECT
     Col_A
    ,Col_B AS B
    ,Col_C
FROM t;
```

##### `fmt: inline`

Suppress line wrapping for long expressions that are wrapped by default at 140 characters.

```sql
SELECT
     conv(right(md5(upper(concat(coalesce(VeryLongTable.VeryLongColumnName, AnotherLongAlias.AnotherLongColumn), SomeOtherReallyLongColumnName))), 16), 16, -10) AS A-- fmt: inline
    ,conv(right(md5(upper(concat(coalesce(VeryLongTable.VeryLongColumnName, AnotherLongAlias.AnotherLongColumn), SomeOtherReallyLongColumnName))), 16), 16, -10) AS B
FROM t
```

⬇️ Output

```sql
SELECT
     CONV(RIGHT(MD5(UPPER(CONCAT(COALESCE(VeryLongTable.VeryLongColumnName, AnotherLongAlias.AnotherLongColumn), SomeOtherReallyLongColumnName))), 16), 16, -10) AS A -- fmt: inline
    ,CONV(
         RIGHT(
             MD5(UPPER(CONCAT(
                 COALESCE(VeryLongTable.VeryLongColumnName, AnotherLongAlias.AnotherLongColumn)
                ,SomeOtherReallyLongColumnName
            )))
            ,16
        )
        ,16
        ,-10
    ) AS B
FROM t
```

### Python

---

Formatted via [Ruff](https://docs.astral.sh/ruff/) with sensible defaults:

- 140 character line width
- 4-space indentation
- Double quotes
- PEP 8 compliant

Magic commands (`%%sql`, `%run`, etc.) are preserved.

#### Format Directives

##### `fmt: off` / `fmt: on`

Disable formatting for a block of code:

```python
# fmt: off
matrix = [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
]
# fmt: on
```

##### `fmt: skip`

Skip formatting for a single statement:

```python
result = some_function(a, b,    c,d,  e)  # fmt: skip
```

See [Ruff's documentation](https://docs.astral.sh/ruff/formatter/#format-suppression) for more details.
