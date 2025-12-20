# Known Issues - Spark SQL Formatter

This document tracks known formatting issues that still need to be fixed.

**Last Updated:** Session with 92/92 tests passing

---

## 1. GROUPING SETS / ROLLUP / CUBE - Comma Breaking

Inside GROUPING SETS, ROLLUP, and CUBE, commas incorrectly trigger multiline formatting.

### GROUPING SETS
```sql
-- INPUT
select a, b, sum(x) from t group by grouping sets ((a), (b), ())

-- CURRENT OUTPUT (WRONG)
SELECT
     a
    ,b
    ,SUM(x)
FROM t
GROUP BY
     GROUPING SETS ((a)
    ,(b)
    ,())

-- EXPECTED OUTPUT
SELECT
     a
    ,b
    ,SUM(x)
FROM t
GROUP BY GROUPING SETS ((a), (b), ())
```

### ROLLUP
```sql
-- INPUT
select a, b, sum(x) from t group by rollup(a, b)

-- CURRENT OUTPUT (WRONG)
SELECT
     a
    ,b
    ,SUM(x)
FROM t
GROUP BY
     ROLLUP (a
    ,b)

-- EXPECTED OUTPUT
SELECT
     a
    ,b
    ,SUM(x)
FROM t
GROUP BY ROLLUP(a, b)
```

### CUBE
Same issue as ROLLUP.

---

## 2. Unary Operators - Extra Space

Unary minus/plus get space before their operand.

```sql
-- INPUT
select -x, +y from t

-- CURRENT OUTPUT (WRONG)
SELECT
     - x
    ,+ y
FROM t

-- EXPECTED OUTPUT
SELECT
     -x
    ,+y
FROM t
```

---

## 3. Array Access - Extra Spaces

Array subscript brackets get spaces around them.

```sql
-- INPUT
select arr[0], arr[i+1] from t

-- CURRENT OUTPUT (WRONG)
SELECT
     arr [ 0 ]
    ,arr [ i + 1 ]
FROM t

-- EXPECTED OUTPUT
SELECT
     arr[0]
    ,arr[i + 1]
FROM t
```

---

## 4. Timestamp/Interval Literals - Not Parsed Correctly

Timestamp and interval literals are not being recognized as single tokens.

```sql
-- INPUT
select timestamp '2024-01-01 12:00:00' from t

-- CURRENT OUTPUT (WRONG)
SELECT timestamp 2024 - 01 - 01 12 : 00 : 00 FROM t

-- EXPECTED OUTPUT
SELECT TIMESTAMP '2024-01-01 12:00:00'
FROM t
```

Note: Without the string literal around the timestamp, the parser treats it as arithmetic.

---

## 5. SET Configuration - Uppercasing Config Names

SET command incorrectly uppercases configuration parameter names.

```sql
-- INPUT
set spark.sql.shuffle.partitions = 200

-- CURRENT OUTPUT (WRONG)
SET spark.SQL.shuffle.PARTITIONS = 200

-- EXPECTED OUTPUT
SET spark.sql.shuffle.partitions = 200
```

---

## 6. MERGE Statement - No Clause Formatting

MERGE statements don't have clause keywords on separate lines.

```sql
-- INPUT
MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET val = s.val

-- CURRENT OUTPUT (WRONG)
MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET val = s.val

-- EXPECTED OUTPUT
MERGE INTO target t
USING source s
ON t.id = s.id
WHEN MATCHED THEN UPDATE SET val = s.val
```

---

## 7. Lambda Expression Spacing

Plus sign before a number in lambda body loses its space.

```sql
-- INPUT
select transform(arr, x -> x + 1) from t

-- CURRENT OUTPUT
SELECT TRANSFORM(arr, x -> x +1)
FROM t

-- EXPECTED OUTPUT (spacing preserved)
SELECT TRANSFORM(arr, x -> x + 1)
FROM t
```

---

## 8. Complex Inline Comments

Inline comments on columns may be misplaced during reformatting.

```sql
-- INPUT
select
    x, -- first column
    y  -- second column
from t

-- CURRENT OUTPUT (comments may shift)
-- Needs investigation

-- EXPECTED OUTPUT
SELECT
     x  -- first column
    ,y  -- second column
FROM t
```

---

## Priority

1. **High**: Unary operators, Array access (common patterns)
2. **Medium**: GROUPING SETS/ROLLUP/CUBE, Lambda spacing
3. **Low**: MERGE formatting, SET config names, Complex comments
