# Spark SQL Style Guide

A formatting standard for Apache Spark SQL, enforced by `sparkfmt`.

## General Principles

- **Keywords**: UPPERCASE
- **Identifiers**: Preserve original casing
- **Built-in functions**: UPPERCASE
- **User-defined functions**: Preserve original casing
- **Indentation**: 4 spaces
- **Commas**: Leading (comma-first style)

---

## SELECT Clause

Single column stays inline. Multiple columns use comma-first with 5-space first indent:

```sql
-- Single column
SELECT id
FROM users

-- Multiple columns
SELECT
     id
    ,name
    ,email
FROM users
```

Use `AS` for column aliases. Omit `AS` for table aliases:

```sql
SELECT
     COUNT(*) AS total
    ,u.name
FROM users u
```

---

## FROM and JOIN

Each JOIN starts on a new line. ON clause indented below:

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

Multiple join conditions use AND on new lines:

```sql
JOIN table_b b
    ON a.id = b.id
    AND a.type = b.type
```

---

## WHERE and HAVING

Single condition stays inline. Multiple conditions use leading operators:

```sql
-- Single condition
WHERE status = 'active'

-- Multiple conditions
WHERE
    status = 'active'
    AND created_date > '2024-01-01'
    AND amount > 100
```

---

## GROUP BY and ORDER BY

Single item stays inline. Multiple items use comma-first:

```sql
-- Single item
GROUP BY department

-- Multiple items
GROUP BY
     department
    ,region
    ,year
```

---

## Subqueries

Indent subquery content 4 spaces. Closing paren aligned with opening keyword:

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

## CTEs (WITH Clause)

Each CTE on its own block. Multiple CTEs use comma-first:

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

## Set Operations

UNION, EXCEPT, INTERSECT on their own line:

```sql
SELECT id FROM table_a
UNION ALL
SELECT id FROM table_b
EXCEPT
SELECT id FROM table_c
```

---

## Functions

No space between function name and opening paren. Space after commas in arguments:

```sql
SELECT
     COUNT(*)
    ,SUM(amount)
    ,COALESCE(name, 'Unknown')
    ,CONCAT(first, ' ', last)
FROM orders
```

Window functions stay inline:

```sql
SELECT
     ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC)
    ,SUM(amount) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING)
FROM employees
```

---

## CASE Expressions

CASE stays inline for simple expressions:

```sql
SELECT CASE WHEN status = 1 THEN 'Active' ELSE 'Inactive' END
FROM users
```

---

## DDL Statements

Single column stays inline. Multiple columns use comma-first:

```sql
-- Single column
CREATE TABLE simple (id INT)

-- Multiple columns
CREATE TABLE users (
     id INT
    ,name STRING
    ,email STRING
)
```

---

## DML Statements

INSERT with SELECT:

```sql
INSERT INTO target
SELECT
     id
    ,name
FROM source
WHERE active = TRUE
```

UPDATE with multiple assignments:

```sql
UPDATE users
SET
     status = 'inactive'
    ,updated_at = CURRENT_TIMESTAMP
WHERE last_login < '2024-01-01'
```

---

## Comments and Hints

Preserve comment position. Hints stay with SELECT:

```sql
-- Header comment
SELECT /*+ BROADCAST(t) */
     a
    ,b
FROM large_table t
WHERE x = 1  -- inline comment
```

---

## Spark-Specific

LATERAL VIEW, PIVOT, TABLESAMPLE stay on FROM line:

```sql
SELECT *
FROM events LATERAL VIEW EXPLODE(items) AS item

SELECT *
FROM sales PIVOT (SUM(amount) FOR quarter IN (1, 2, 3, 4))

SELECT *
FROM large_table TABLESAMPLE (10 PERCENT)
```

CLUSTER BY, DISTRIBUTE BY, SORT BY as clauses:

```sql
SELECT *
FROM events
DISTRIBUTE BY user_id
SORT BY timestamp
```

---

## Quick Reference

| Element | Style |
|---------|-------|
| Keywords | `UPPERCASE` |
| Functions | `UPPERCASE()` |
| UDFs | `preserveCase()` |
| Identifiers | `preserveCase` |
| Column alias | `expr AS alias` |
| Table alias | `table t` (no AS) |
| Indent | 4 spaces |
| Commas | Leading |
| First item indent | 5 spaces |
| Subsequent indent | 4 spaces + comma |

---

## Known Limitations

See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for current formatting bugs.
