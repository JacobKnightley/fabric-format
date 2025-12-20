# Known Issues - Spark SQL Formatter

This document tracks known formatting issues that still need to be fixed.

**Last Updated:** Session with 92/92 tests passing

---

## 1. Complex CASE Statements - Should Multiline

**Priority**: HIGH

Single WHEN stays inline, but multiple WHEN branches should multiline.

```sql
-- INPUT
select case when status = 1 then 'active' when status = 2 then 'pending' else 'unknown' end from t

-- CURRENT OUTPUT (WRONG)
SELECT CASE WHEN status = 1 THEN 'active' WHEN status = 2 THEN 'pending' ELSE 'unknown' END
FROM t

-- EXPECTED OUTPUT
SELECT
     CASE
        WHEN status = 1 THEN 'active'
        WHEN status = 2 THEN 'pending'
        ELSE 'unknown'
     END
FROM t
```

---

## 2. GROUPING SETS / ROLLUP / CUBE - Comma Breaking

**Priority**: MEDIUM

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

## 3. Unary Operators - Extra Space

**Priority**: HIGH

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

## 4. Array Access - Extra Spaces

**Priority**: HIGH

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

## 5. Timestamp/Interval Literals - Not Parsed Correctly

**Priority**: LOW

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

## 6. SET Configuration - Uppercasing Config Names

**Priority**: LOW

```sql
-- INPUT
set spark.sql.shuffle.partitions = 200

-- CURRENT OUTPUT (WRONG)
SET spark.SQL.shuffle.PARTITIONS = 200

-- EXPECTED OUTPUT
SET spark.sql.shuffle.partitions = 200
```

---

## 7. MERGE Statement - No Clause Formatting

**Priority**: LOW

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

## 8. Lambda Expression Spacing

**Priority**: MEDIUM

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

## 9. Complex Inline Comments

**Priority**: LOW

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

## Priority Summary

| Priority | Issues |
|----------|--------|
| HIGH | #1 Complex CASE, #3 Unary operators, #4 Array access |
| MEDIUM | #2 GROUPING SETS, #8 Lambda spacing |
| LOW | #5 Timestamp literals, #6 SET config, #7 MERGE, #9 Comments |
