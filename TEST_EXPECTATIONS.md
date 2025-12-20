# Spark SQL Formatter Test Expectations

This document lists all SQL formatting test cases from the sparkfmt-core crate, showing INPUT → OUTPUT expectations.

## Table of Contents
- [Basic SELECT](#basic-select)
- [Casing Rules](#casing-rules)
- [Context-Sensitive Identifiers](#context-sensitive-identifiers)
- [Comments and Hints](#comments-and-hints)
- [JOIN Variants](#join-variants)
- [GROUP BY and Aggregations](#group-by-and-aggregations)
- [WHERE and HAVING Conditions](#where-and-having-conditions)
- [Subqueries](#subqueries)
- [CTEs (WITH clause)](#ctes-with-clause)
- [Set Operations (UNION, EXCEPT, INTERSECT)](#set-operations)
- [Window Functions](#window-functions)
- [Expressions](#expressions)
- [Literals and Types](#literals-and-types)
- [FROM Clause Features](#from-clause-features)
- [Spark-Specific Clauses](#spark-specific-clauses)
- [DDL Statements](#ddl-statements)
- [DML Statements](#dml-statements)
- [Session Commands](#session-commands)

---

## Basic SELECT

### Simple SELECT with multiple columns
```sql
-- INPUT
select a,b,count(*) c from t where x=1 and y=2 group by a,b having count(*)>1 order by a limit 10

-- OUTPUT
SELECT
     a
    ,b
    ,COUNT(*) AS c
FROM t
WHERE
    x=1
    AND y=2
GROUP BY
     a
    ,b
HAVING COUNT(*)>1
ORDER BY
     a
LIMIT 10
```

### SELECT DISTINCT
```sql
-- INPUT
select distinct col1, col2 from t

-- OUTPUT
SELECT DISTINCT
     col1
    ,col2
FROM t
```

### SELECT *
```sql
-- INPUT
select * from t

-- OUTPUT
SELECT
     *
FROM t
```

### Qualified column (table.column)
```sql
-- INPUT
select t.col1, t.col2 from t

-- OUTPUT
SELECT
     t.col1
    ,t.col2
FROM t
```

### Qualified star (table.*)
```sql
-- INPUT
select t.* from t

-- OUTPUT
SELECT
     t.*
FROM t
```

---

## Casing Rules

### Keywords uppercase
```sql
-- INPUT
select a from t where x=1

-- OUTPUT
SELECT
     a
FROM t
WHERE x=1
```

### Built-in functions uppercase
```sql
-- INPUT
select count(*), sum(x), avg(y), min(z), max(w) from t

-- OUTPUT
SELECT
     COUNT(*)
    ,SUM(x)
    ,AVG(y)
    ,MIN(z)
    ,MAX(w)
FROM t
```

### String functions uppercase
```sql
-- INPUT
select concat(a,b), substring(c,1,5), trim(d) from t

-- OUTPUT
SELECT
     CONCAT(a,b)
    ,SUBSTRING(c,1,5)
    ,TRIM(d)
FROM t
```

### User-defined functions preserve casing
```sql
-- INPUT
select MyCustomFunc(x), my_udf(a,b) from t

-- OUTPUT
SELECT
     MyCustomFunc(x)
    ,my_udf(a,b)
FROM t
```

### Mixed built-in and UDFs
```sql
-- INPUT
select count(*), MyCustomFunc(x), sum(y), my_udf(z) from t

-- OUTPUT
SELECT
     COUNT(*)
    ,MyCustomFunc(x)
    ,SUM(y)
    ,my_udf(z)
FROM t
```

### Nested functions
```sql
-- INPUT
select upper(lower(trim(x))) from t

-- OUTPUT
SELECT
     UPPER(LOWER(TRIM(x)))
FROM t
```

### COALESCE function
```sql
-- INPUT
select coalesce(a,b,'default') from t

-- OUTPUT
SELECT
     COALESCE(a,b,'default')
FROM t
```

---

## Context-Sensitive Identifiers

### Column names preserve casing
```sql
-- INPUT
select MyColumn, another_col from MyTable

-- OUTPUT
SELECT
     MyColumn
    ,another_col
FROM MyTable
```

### Keywords as column names (after dot)
```sql
-- INPUT
select a.order, b.select, c.from from tables

-- OUTPUT
SELECT
     a.order
    ,b.select
    ,c.from
FROM tables
```

### Column alias always uses AS
```sql
-- INPUT
select COUNT(*) cnt from t

-- OUTPUT
SELECT
     COUNT(*) AS cnt
FROM t
```

### Table alias never uses AS
```sql
-- INPUT
select o.id from orders o

-- OUTPUT
SELECT
     o.id
FROM orders o
```

### Complex query with mixed casing
```sql
-- INPUT
select a.Id, b.Name, COUNT(*) as total from Users a join Orders b on a.Id=b.UserId where a.Status='active' group by a.Id, b.Name

-- OUTPUT
SELECT
     a.Id
    ,b.Name
    ,COUNT(*) AS total
FROM Users a
INNER JOIN Orders b
    ON a.Id=b.UserId
WHERE a.Status='active'
GROUP BY
     a.Id
    ,b.Name
```

---

## Comments and Hints

### Leading line comment
```sql
-- INPUT
-- header comment
select x from t

-- OUTPUT
-- header comment
SELECT
     x
FROM t
```

### Leading block comment (multiline)
```sql
-- INPUT
/* This is a
   multiline comment */
select x from t

-- OUTPUT
/* This is a
   multiline comment */
SELECT
     x
FROM t
```

### Trailing inline comment on column
```sql
-- INPUT
select
    x, -- first column
    y  -- second column
from t

-- OUTPUT
SELECT
     x
    ,y -- first column
FROM t
-- second column
```

### Comment in WHERE clause
```sql
-- INPUT
select x from t where a = 1 -- condition 1
and b = 2 -- condition 2

-- OUTPUT
SELECT
     x
FROM t
WHERE
    a=1 -- condition 1
    AND b=2 -- condition 2
```

### BROADCAST hint
```sql
-- INPUT
select /*+ broadcast(t) */ * from t

-- OUTPUT
SELECT /*+ BROADCAST(t) */
     *
FROM t
```

### Multiple hints
```sql
-- INPUT
select /*+ broadcast(t1), merge(t2) */ * from t

-- OUTPUT
SELECT /*+ BROADCAST(t1),MERGE(t2) */
     *
FROM t
```

### Hint preserves table name casing
```sql
-- INPUT
select /*+ broadcast(MyTable) */ * from MyTable

-- OUTPUT
SELECT /*+ BROADCAST(MyTable) */
     *
FROM MyTable
```

---

## JOIN Variants

### INNER JOIN
```sql
-- INPUT
select a.id, b.name from orders a inner join customers b on a.cust_id=b.id

-- OUTPUT
SELECT
     a.id
    ,b.name
FROM orders a
INNER JOIN customers b
    ON a.cust_id=b.id
```

### LEFT JOIN
```sql
-- INPUT
select * from a left join b on a.id=b.id

-- OUTPUT
SELECT
     *
FROM a
LEFT JOIN b
    ON a.id=b.id
```

### LEFT SEMI JOIN (Spark-specific)
```sql
-- INPUT
select * from t1 left semi join t2 on t1.id = t2.id

-- OUTPUT
SELECT
     *
FROM t1
LEFT SEMI JOIN t2
    ON t1.id=t2.id
```

### LEFT ANTI JOIN (Spark-specific)
```sql
-- INPUT
select * from t1 left anti join t2 on t1.id = t2.id

-- OUTPUT
SELECT
     *
FROM t1
LEFT ANTI JOIN t2
    ON t1.id=t2.id
```

### NATURAL JOIN
```sql
-- INPUT
select * from t1 natural join t2

-- OUTPUT
SELECT
     *
FROM t1
NATURAL JOIN t2
```

### JOIN USING
```sql
-- INPUT
select * from t1 join t2 using (id, name)

-- OUTPUT
SELECT
     *
FROM t1
INNER JOIN t2
    USING (id,name)
```

### Multiple JOINs
```sql
-- INPUT
select * from a inner join b on a.id=b.id left join c on b.id=c.id

-- OUTPUT
SELECT
     *
FROM a
INNER JOIN b
    ON a.id=b.id
LEFT JOIN c
    ON b.id=c.id
```

### Multiple JOIN conditions
```sql
-- INPUT
select * from a join b on a.id=b.id and a.col=b.col and a.type=b.type

-- OUTPUT
SELECT
     *
FROM a
INNER JOIN b
    ON a.id=b.id
    AND a.col=b.col
    AND a.type=b.type
```

---

## GROUP BY and Aggregations

### GROUPING SETS
```sql
-- INPUT
select a, b, sum(x) from t group by grouping sets ((a), (b), ())

-- OUTPUT
SELECT
     a
    ,b
    ,SUM(x)
FROM t
GROUP BY
     GROUPING SETS((a),(b),())
```

### ROLLUP
```sql
-- INPUT
select a, b, sum(x) from t group by rollup(a, b)

-- OUTPUT
SELECT
     a
    ,b
    ,SUM(x)
FROM t
GROUP BY
     ROLLUP(a,b)
```

### CUBE
```sql
-- INPUT
select a, b, sum(x) from t group by cube(a, b)

-- OUTPUT
SELECT
     a
    ,b
    ,SUM(x)
FROM t
GROUP BY
     CUBE(a,b)
```

---

## WHERE and HAVING Conditions

### Single WHERE condition (inline)
```sql
-- INPUT
select a from t where status='active'

-- OUTPUT
SELECT
     a
FROM t
WHERE status='active'
```

### Multiple WHERE conditions (multiline)
```sql
-- INPUT
select a from t where a=1 and b=2 and c=3

-- OUTPUT
SELECT
     a
FROM t
WHERE
    a=1
    AND b=2
    AND c=3
```

### WHERE with OR
```sql
-- INPUT
select * from t where a=1 or b=2 or c=3

-- OUTPUT
SELECT
     *
FROM t
WHERE
    a=1
    OR b=2
    OR c=3
```

### Parenthesized expressions
```sql
-- INPUT
select * from t where (a=1 or a=2) and b=3

-- OUTPUT
SELECT
     *
FROM t
WHERE
    (a=1ORa=2)
    AND b=3
```

### Single HAVING condition (inline)
```sql
-- INPUT
select a, COUNT(*) from t group by a having COUNT(*)>10

-- OUTPUT
SELECT
     a
    ,COUNT(*)
FROM t
GROUP BY
     a
HAVING COUNT(*)>10
```

### Multiple HAVING conditions (multiline)
```sql
-- INPUT
select a, COUNT(*) from t group by a having COUNT(*)>10 and SUM(x)>100

-- OUTPUT
SELECT
     a
    ,COUNT(*)
FROM t
GROUP BY
     a
HAVING
    COUNT(*)>10
    AND SUM(x)>100
```

---

## Subqueries

### FROM subquery with indentation
```sql
-- INPUT
select x from (select y as x from s) sub

-- OUTPUT
SELECT
     x
FROM (
    SELECT
         y AS x
    FROM s
) sub
```

### Nested subqueries
```sql
-- INPUT
select * from (select * from (select x from t) a) b

-- OUTPUT
SELECT
     *
FROM (
    SELECT
         *
    FROM (
        SELECT
             x
        FROM t
    ) a
) b
```

### Scalar subquery
```sql
-- INPUT
select (select max(y) from s) as max_val from t

-- OUTPUT
SELECT
     (SELECT
     MAX(y)
FROM s) AS max_val
FROM t
```

### IN subquery
```sql
-- INPUT
SELECT x FROM t WHERE x IN (SELECT y FROM s)

-- OUTPUT
SELECT
     x
FROM t
WHERE x IN (SELECT
     y
FROM s)
```

### EXISTS
```sql
-- INPUT
SELECT x FROM t WHERE EXISTS (SELECT 1 FROM s WHERE s.id = t.id)

-- OUTPUT
SELECT
     x
FROM t
WHERE EXISTS (SELECT
     1
FROM s
WHERE s.id=t.id)
```

---

## CTEs (WITH clause)

### Single CTE
```sql
-- INPUT
with cte as (select x from t) select * from cte

-- OUTPUT
WITH cte AS (
    SELECT
         x
    FROM t
)
SELECT
     *
FROM cte
```

### Multiple CTEs (comma-first)
```sql
-- INPUT
with a as (select 1 as x), b as (select x from a) select * from b

-- OUTPUT
WITH a AS (
    SELECT
         1 AS x
)
,b AS (
    SELECT
         x
    FROM a
)
SELECT
     *
FROM b
```

---

## Set Operations

### UNION
```sql
-- INPUT
select a from t1 union select b from t2

-- OUTPUT
SELECT
     a
FROM t1
UNION
SELECT
     b
FROM t2
```

### UNION ALL
```sql
-- INPUT
select a from t1 union all select a from t2

-- OUTPUT
SELECT
     a
FROM t1
UNION ALL
SELECT
     a
FROM t2
```

### EXCEPT
```sql
-- INPUT
SELECT a FROM t1 EXCEPT SELECT a FROM t2

-- OUTPUT
SELECT
     a
FROM t1
EXCEPT
SELECT
     a
FROM t2
```

### INTERSECT
```sql
-- INPUT
SELECT a FROM t1 INTERSECT SELECT a FROM t2

-- OUTPUT
SELECT
     a
FROM t1
INTERSECT
SELECT
     a
FROM t2
```

---

## Window Functions

### ROW_NUMBER with PARTITION BY
```sql
-- INPUT
SELECT ROW_NUMBER() OVER (PARTITION BY x ORDER BY y) FROM t

-- OUTPUT
SELECT
     ROW_NUMBER() OVER (PARTITION BY x ORDER BY y)
FROM t
```

### RANK
```sql
-- INPUT
SELECT RANK() OVER (ORDER BY x DESC) FROM t

-- OUTPUT
SELECT
     RANK() OVER (ORDER BY x DESC)
FROM t
```

### Window with frame specification
```sql
-- INPUT
SELECT SUM(x) OVER (PARTITION BY y ORDER BY z ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) FROM t

-- OUTPUT
SELECT
     SUM(x) OVER (PARTITION BY y ORDER BY z ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
FROM t
```

### LEAD function
```sql
-- INPUT
SELECT LEAD(x, 1) OVER (ORDER BY y) FROM t

-- OUTPUT
SELECT
     LEAD(x,1) OVER (ORDER BY y)
FROM t
```

---

## Expressions

### Unary operators
```sql
-- INPUT
SELECT -x, +y, NOT z, ~w FROM t

-- OUTPUT
SELECT
     -x
    ,+y
    ,NOT z
    ,~w
FROM t
```

### Quoted identifiers
```sql
-- INPUT
SELECT `my column`, `select`, `from` FROM t

-- OUTPUT
SELECT
     `my column`
    ,`select`
    ,`from`
FROM t
```

### Array access
```sql
-- INPUT
SELECT arr[0], arr[i + 1], map_col['key'] FROM t

-- OUTPUT
SELECT
     arr[0]
    ,arr[i+1]
    ,map_col['key']
FROM t
```

### CASE WHEN
```sql
-- INPUT
SELECT CASE WHEN x = 1 THEN 'a' WHEN x = 2 THEN 'b' ELSE 'c' END FROM t

-- OUTPUT
SELECT
     CASE WHEN x=1 THEN 'a' WHEN x=2 THEN 'b' ELSE 'c' END
FROM t
```

### CAST
```sql
-- INPUT
SELECT CAST(x AS STRING), CAST(y AS DECIMAL(10,2)) FROM t

-- OUTPUT
SELECT
     CAST(x AS STRING)
    ,CAST(y AS DECIMAL(10,2))
FROM t
```

### IS NULL / IS NOT NULL
```sql
-- INPUT
SELECT x FROM t WHERE x IS NULL
SELECT x FROM t WHERE x IS NOT NULL

-- OUTPUT
SELECT
     x
FROM t
WHERE x IS NULL

SELECT
     x
FROM t
WHERE x IS NOT NULL
```

### BETWEEN
```sql
-- INPUT
SELECT x FROM t WHERE x BETWEEN 1 AND 10

-- OUTPUT
SELECT
     x
FROM t
WHERE x BETWEEN 1 AND 10
```

### IN list
```sql
-- INPUT
SELECT x FROM t WHERE x IN (1, 2, 3)

-- OUTPUT
SELECT
     x
FROM t
WHERE x IN (1,2,3)
```

### LIKE / RLIKE
```sql
-- INPUT
SELECT x FROM t WHERE x LIKE '%pattern%'
SELECT x FROM t WHERE x RLIKE '.*pattern.*'

-- OUTPUT
SELECT
     x
FROM t
WHERE x LIKE '%pattern%'

SELECT
     x
FROM t
WHERE x RLIKE '.*pattern.*'
```

### IS DISTINCT FROM
```sql
-- INPUT
select x from t where x is distinct from y
select x from t where x is not distinct from y

-- OUTPUT
SELECT
     x
FROM t
WHERE x IS DISTINCT FROM y

SELECT
     x
FROM t
WHERE x IS NOT DISTINCT FROM y
```

---

## Literals and Types

### Date literal
```sql
-- INPUT
select date '2024-01-01' from t

-- OUTPUT
SELECT
     DATE '2024-01-01'
FROM t
```

### Timestamp literal
```sql
-- INPUT
select timestamp '2024-01-01 12:00:00' from t

-- OUTPUT
SELECT
     TIMESTAMP '2024-01-01 12:00:00'
FROM t
```

### Interval literal
```sql
-- INPUT
select interval 1 day from t
select interval 3 months from t

-- OUTPUT
SELECT
     INTERVAL 1 DAY
FROM t

SELECT
     INTERVAL 3 MONTHS
FROM t
```

### Double-colon cast (Spark)
```sql
-- INPUT
select x::string from t
select (x + y)::int from t

-- OUTPUT
SELECT
     x::STRING
FROM t

SELECT
     (x+y)::INT
FROM t
```

### Numeric literals with suffixes
```sql
-- INPUT
SELECT 100L, 50S, 10Y, 3.14F, 2.718D, 99.99BD, 1.5e10 FROM t

-- OUTPUT
SELECT
     100L
    ,50S
    ,10Y
    ,3.14F
    ,2.718D
    ,99.99BD
    ,1.5e10
FROM t
```

### Operators
```sql
-- INPUT
SELECT a <=> b, c || d, e |> f, g << 1, h >> 2 FROM t

-- OUTPUT
SELECT
     a<=>b
    ,c||d
    ,e|>f
    ,g<<1
    ,h>>2
FROM t
```

---

## FROM Clause Features

### LATERAL VIEW
```sql
-- INPUT
select x, elem from t lateral view explode(arr) exploded as elem

-- OUTPUT
SELECT
     x
    ,elem
FROM t
LATERAL VIEW EXPLODE(arr) exploded AS elem
```

### LATERAL VIEW OUTER
```sql
-- INPUT
select x, elem from t lateral view outer explode(arr) exploded as elem

-- OUTPUT
SELECT
     x
    ,elem
FROM t
LATERAL VIEW OUTER EXPLODE(arr) exploded AS elem
```

### PIVOT
```sql
-- INPUT
select * from t pivot (sum(val) for category in ('a','b'))

-- OUTPUT
SELECT
     *
FROM t
PIVOT (SUM(val) FOR category IN ('a','b'))
```

### TABLESAMPLE
```sql
-- INPUT
select * from t tablesample (10 percent)
select * from t tablesample (100 rows)

-- OUTPUT
SELECT
     *
FROM t TABLESAMPLE (10 PERCENT)

SELECT
     *
FROM t TABLESAMPLE (100 ROWS)
```

---

## Spark-Specific Clauses

### CLUSTER BY
```sql
-- INPUT
SELECT * FROM t CLUSTER BY a

-- OUTPUT
SELECT
     *
FROM t
CLUSTER BY
     a
```

### DISTRIBUTE BY
```sql
-- INPUT
SELECT * FROM t DISTRIBUTE BY a

-- OUTPUT
SELECT
     *
FROM t
DISTRIBUTE BY
     a
```

### SORT BY
```sql
-- INPUT
SELECT * FROM t SORT BY a ASC, b DESC

-- OUTPUT
SELECT
     *
FROM t
SORT BY
     a ASC
    ,b DESC
```

### DISTRIBUTE BY + SORT BY
```sql
-- INPUT
SELECT * FROM t DISTRIBUTE BY a SORT BY b

-- OUTPUT
SELECT
     *
FROM t
DISTRIBUTE BY
     a
SORT BY
     b
```

---

## DDL Statements

### CREATE TABLE
```sql
-- INPUT
create table users (id int, name string, email string)

-- OUTPUT
CREATE TABLE users (
     id INT
    ,name STRING
    ,email STRING
)
```

### CREATE VIEW
```sql
-- INPUT
create view vw as select x from t

-- OUTPUT
CREATE VIEW vw AS
SELECT
     x
FROM t
```

### CREATE OR REPLACE VIEW
```sql
-- INPUT
create or replace view vw as select x from t

-- OUTPUT
CREATE OR REPLACE VIEW vw AS
SELECT
     x
FROM t
```

### DROP TABLE
```sql
-- INPUT
drop table if exists users

-- OUTPUT
DROP TABLE IF EXISTS users
```

### DROP VIEW
```sql
-- INPUT
drop view if exists vw

-- OUTPUT
DROP VIEW IF EXISTS vw
```

### DESCRIBE
```sql
-- INPUT
describe users
describe extended users

-- OUTPUT
DESCRIBE users
DESCRIBE EXTENDED users
```

### SHOW commands
```sql
-- INPUT
show tables
show tables in mydb
show databases
show views
show columns from t

-- OUTPUT
SHOW TABLES
SHOW TABLES IN mydb
SHOW DATABASES
SHOW VIEWS
SHOW COLUMNS FROM t
```

### ALTER TABLE
```sql
-- INPUT
alter table t add column c string
ALTER TABLE myTable RENAME TO newTable

-- OUTPUT
ALTER TABLE t ADD COLUMN c STRING
ALTER TABLE myTable RENAME TO newTable
```

---

## DML Statements

### INSERT INTO SELECT
```sql
-- INPUT
insert into target select id, name from source where active = true

-- OUTPUT
INSERT INTO target
SELECT
     id
    ,name
FROM source
WHERE active=true
```

### INSERT VALUES
```sql
-- INPUT
insert into t values (1, 'a'), (2, 'b')

-- OUTPUT
INSERT INTO t VALUES
(1,'a')
,(2,'b')
```

### INSERT OVERWRITE
```sql
-- INPUT
insert overwrite t select x from s

-- OUTPUT
INSERT OVERWRITE t
SELECT
     x
FROM s
```

### UPDATE
```sql
-- INPUT
update t set x = 1, y = 2 where z = 3

-- OUTPUT
UPDATE t
SET
     x=1
    ,y=2
WHERE z=3
```

### DELETE
```sql
-- INPUT
delete from users where created < '2020-01-01' and status = 'inactive'

-- OUTPUT
DELETE FROM users
WHERE
    created<'2020-01-01'
    AND status='inactive'
```

### MERGE
```sql
-- INPUT
MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET val = s.val

-- OUTPUT
MERGE INTO target t
USING source s
ON t.id=s.id
WHEN MATCHED THEN UPDATE SET val=s.val
```

### TRUNCATE
```sql
-- INPUT
truncate table t

-- OUTPUT
TRUNCATE TABLE t
```

---

## Session Commands

### SET
```sql
-- INPUT
set spark.sql.shuffle.partitions = 200

-- OUTPUT
SET spark.sql.shuffle.partitions=200
```

### USE
```sql
-- INPUT
use my_database

-- OUTPUT
USE my_database
```

### CACHE TABLE
```sql
-- INPUT
cache table t
cache lazy table t

-- OUTPUT
CACHE TABLE t
CACHE LAZY TABLE t
```

### UNCACHE / REFRESH / CLEAR
```sql
-- INPUT
uncache table t
refresh table t
clear cache

-- OUTPUT
UNCACHE TABLE t
REFRESH TABLE t
CLEAR CACHE
```

### EXPLAIN
```sql
-- INPUT
explain select x from t
explain extended select x from t

-- OUTPUT
EXPLAIN
SELECT
     x
FROM t

EXPLAIN EXTENDED
SELECT
     x
FROM t
```

### ANALYZE
```sql
-- INPUT
analyze table t

-- OUTPUT
ANALYZE TABLE t
```

### RESET
```sql
-- INPUT
reset

-- OUTPUT
RESET
```

---

## Formatting Rules Summary

1. **Keywords**: Always UPPERCASE (`SELECT`, `FROM`, `WHERE`, etc.)
2. **Built-in functions**: Always UPPERCASE (`COUNT`, `SUM`, `UPPER`, etc.)
3. **User-defined functions**: Preserve original casing
4. **Identifiers**: Preserve original casing
5. **Column aliases**: Always use `AS` keyword
6. **Table aliases**: Never use `AS` keyword
7. **Comma-first style**: Lists use leading commas with 5-space first indent, 4-space subsequent
8. **Clause newlines**: Major clauses (FROM, WHERE, JOIN, GROUP BY, etc.) start on new lines
9. **Condition formatting**: Single condition inline, multiple conditions multiline with operator-leading
10. **Subquery indentation**: 4-space indent inside parentheses
11. **No spaces in function calls**: `func(a,b,c)` not `func(a, b, c)`
12. **Normalized spacing**: Single space between tokens in expressions
