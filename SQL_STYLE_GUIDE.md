# Spark SQL Style Guide

The Spark SQL implementation of **fabric-format** is a custom Grammar based formatter. Meaning the formatter understands the SQL, and formats it in a way consistent with how you think about the code. This guide explains *what* the formatter does so you know what to expect.

---

## The Basics

| What | How it's formatted |
|------|-------------------|
| Keywords | `UPPERCASE` |
| Built-in functions | `UPPERCASE()` |
| User-defined functions | `preserveCase()` |
| Identifiers (tables, columns) | `preserveCase` |
| Indentation | 4 spaces |
| Line width threshold | 140 characters |

---

## Quick Reference

```
SELECT
     first_column              -- 5 spaces
    ,second_column             -- 4 spaces + comma
    ,COUNT(*) AS total         -- AS for column aliases
FROM table_name t              -- no AS for table aliases
INNER JOIN other_table o
    ON t.id = o.id             -- ON indented under JOIN
WHERE
    condition_one = 1
    AND condition_two = 2      -- AND/OR at line start
GROUP BY
     column_one
    ,column_two
ORDER BY
     column_one DESC
    ,column_two ASC
```


## Commas Go First

**Leading commas** (comma-first style) make it easy to add, remove, or reorder columns without touching other lines:

```sql
SELECT
     id
    ,name
    ,email
FROM users
```

The first item gets 5 spaces of indent. Subsequent items get 4 spaces + comma.

---

## Aliases

**Column aliases** use `AS`:
```sql
SELECT COUNT(*) AS total
```

**Table aliases** omit `AS`:
```sql
FROM users u
JOIN orders o ON u.id = o.user_id
```

---

## When Lines Expand

Simple queries stay compact:
```sql
SELECT id FROM users WHERE active = TRUE
```

The formatter expands to multiple lines when:
- **Multiple columns** in SELECT
- **Multiple conditions** in WHERE
- **Multiple items** in GROUP BY / ORDER BY
- **Line exceeds 140 characters**

```sql
-- Multiple columns → expanded
SELECT
     id
    ,name
    ,email
FROM users

-- Multiple conditions → expanded  
WHERE
    status = 'active'
    AND created_date > '2024-01-01'
```

---

## JOINs

Each JOIN starts on a new line. The ON clause indents below:

```sql
SELECT
     a.id
    ,b.name
FROM orders a
INNER JOIN customers b
    ON a.customer_id = b.id
LEFT JOIN products p
    ON a.product_id = p.id
```

Multiple join conditions:
```sql
JOIN table_b b
    ON a.id = b.id
    AND a.type = b.type
```

---

## Subqueries

Subquery content indents 4 spaces:

```sql
SELECT *
FROM (
    SELECT
         id
        ,name
    FROM users
    WHERE active = TRUE
) sub
WHERE sub.id > 100
```

---

## CTEs (WITH)

Multiple CTEs use comma-first:

```sql
WITH active_users AS (
    SELECT id, name
    FROM users
    WHERE active = TRUE
)
,recent_orders AS (
    SELECT user_id, amount
    FROM orders
    WHERE date > '2024-01-01'
)
SELECT *
FROM active_users a
JOIN recent_orders r
    ON a.id = r.user_id
```

---

## Functions

No space before the opening paren:

```sql
SELECT
     COUNT(*)
    ,SUM(amount)
    ,COALESCE(name, 'Unknown')
FROM orders
```

Long function calls expand when they'd exceed 140 characters:

```sql
-- Short → stays inline
SELECT COALESCE(a, b, c)

-- Long → expands
SELECT COALESCE(
     very_long_column_name_one
    ,very_long_column_name_two
    ,another_very_long_column_name
)
```

---

## Escape Hatches

### Skip formatting entirely: `fmt: off`

```sql
-- fmt: off
select   x,y,z   from   t   -- Preserved exactly as written
```

### Keep long lines from expanding: `fmt: inline`

```sql
SELECT COALESCE(a, b, c, d, e, f, g, h, i, j) -- fmt: inline
FROM t
```

---

