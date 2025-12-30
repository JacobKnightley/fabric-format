// Using dynamic import since this is ES module
async function main() {
const { formatSql } = await import('../dist/formatter.js');

// Test helper
function test(sql, desc) {
    try {
        const result = formatSql(sql);
        console.log(`${desc}:`);
        console.log(`  IN:  ${sql}`);
        console.log(`  OUT: ${result.replace(/\n/g, '\\n')}`);
        console.log();
        return result;
    } catch (e) {
        console.log(`${desc} - ERROR: ${e.message}`);
        return null;
    }
}

console.log("=== EDGE CASE TESTING ===\n");

// 1. Unicode identifiers
test('select 日本語 from テーブル', 'Unicode identifiers');
test('select `名前` as `価格` from data', 'Unicode backticked identifiers');

// 2. String literals with special chars
test("select 'it''s a test' from t", 'Escaped single quote');
test('select "test""test" from t', 'Escaped double quote');
test("select 'line1\nline2' from t", 'Literal newline in string');

// 3. Operators
test('select a <=> b from t', 'Null-safe equals operator');
test('select a || b from t', 'Concat operator');
test('select a << 2 from t', 'Bit shift left');
test('select a >> 2 from t', 'Bit shift right');
test('select a ^ b from t', 'XOR operator');
test('select a & b from t', 'Bitwise AND operator');
test('select a | b from t', 'Bitwise OR operator');
test('select ~a from t', 'Bitwise NOT');
test('select a <> b from t', 'Not equals operator <>');
test('select a != b from t', 'Not equals operator !=');

// 4. Complex array/struct access
test('select a[0].b.c from t', 'Array then struct access');
test('select a.b[0] from t', 'Struct then array access');
test('select map["key"] from t', 'Map access with string key');
test("select a[0][1] from t", 'Nested array access');
test("select struct(1, 2).col1 from t", 'Inline struct access');

// 5. Numbers
test('select 1.23e-10 from dual', 'Scientific notation negative exp');
test('select 1.23E+10 from dual', 'Scientific notation positive exp');
test('select .5 from dual', 'Decimal starting with dot');
test('select 1. from dual', 'Decimal ending with dot');
test('select 0x1A2B from dual', 'Hex literal');
test('select 1L from dual', 'Long literal suffix');
test('select 1S from dual', 'Short literal suffix');
test('select 1Y from dual', 'Tinyint literal suffix');
test('select 1BD from dual', 'BigDecimal literal suffix');
test('select 1D from dual', 'Double literal suffix');
test('select 1F from dual', 'Float literal suffix');

// 6. Type casts and type constructors
test('select int(x), y from t', 'INT type function');
test('select string(x), y from t', 'STRING type function');
test('select double(x), y from t', 'DOUBLE type function');
test('select boolean(x), y from t', 'BOOLEAN type function');
test('select decimal(10, 2) from t', 'DECIMAL with precision');
test('select x::int from t', 'Double-colon cast to int');
test('select x::array<int> from t', 'Double-colon cast to array type');
test('select x::map<string, int> from t', 'Double-colon cast to map type');
test('select x::struct<a:int, b:string> from t', 'Double-colon cast to struct type');

// 7. Complex type literals
test('select array(1, 2, 3) from t', 'ARRAY constructor');
test('select map("a", 1, "b", 2) from t', 'MAP constructor');
test('select struct(1 as a, 2 as b) from t', 'STRUCT constructor with AS');
test('select named_struct("a", 1, "b", 2) from t', 'NAMED_STRUCT');

// 8. Window functions - complex cases
test('select row_number() over(order by x) from t', 'Window function no space');
test('select sum(x) over(partition by y order by z rows between unbounded preceding and current row) from t', 'Complex window frame');
test('select sum(x) over(partition by y order by z range between interval 1 day preceding and current row) from t', 'Range with interval');
test('select lag(x, 1, 0) over(partition by y order by z) from t', 'LAG with 3 args');
test('select nth_value(x, 2) over(partition by y order by z) from t', 'NTH_VALUE');
test('select first_value(x) ignore nulls over(order by y) from t', 'FIRST_VALUE IGNORE NULLS');
test('select last_value(x) respect nulls over(order by y) from t', 'LAST_VALUE RESPECT NULLS');

// 9. Lambda expressions
test('select transform(arr, x -> x + 1) from t', 'Lambda single arg');
test('select transform(arr, (x, i) -> x + i) from t', 'Lambda two args');
test('select filter(arr, x -> x > 0) from t', 'FILTER with lambda');
test('select aggregate(arr, 0, (acc, x) -> acc + x) from t', 'AGGREGATE with lambda');
test('select aggregate(arr, 0, (acc, x) -> acc + x, acc -> acc * 2) from t', 'AGGREGATE with finish lambda');
test('select map_filter(m, (k, v) -> v > 0) from t', 'MAP_FILTER lambda');
test('select reduce(arr, 0, (acc, x) -> acc + x) from t', 'REDUCE with lambda');

// 10. LATERAL VIEW
test('select a, b from t lateral view explode(arr) as x', 'Basic LATERAL VIEW');
test('select a, b from t lateral view outer explode(arr) as x', 'LATERAL VIEW OUTER');
test('select a, b from t lateral view explode(arr) tbl as x lateral view explode(arr2) tbl2 as y', 'Multiple LATERAL VIEW');
test('select a, b from t lateral view posexplode(arr) as pos, val', 'POSEXPLODE');
test('select * from t lateral view inline(arr) as a, b', 'INLINE');

// 11. Table-valued functions
test('select * from range(10)', 'RANGE table function');
test('select * from explode(array(1, 2, 3))', 'EXPLODE as table');

// 12. PIVOT/UNPIVOT
test("select * from t pivot(sum(val) for col in ('a', 'b', 'c'))", 'PIVOT basic');
test("select * from t pivot(sum(val) as s, avg(val) as a for col in ('a', 'b'))", 'PIVOT multiple aggregates');
test("select * from t unpivot(val for col in (a, b, c))", 'UNPIVOT basic');
test("select * from t unpivot include nulls (val for col in (a, b, c))", 'UNPIVOT include nulls');

// 13. CTEs - complex cases
test('with a as (select 1), b as (select * from a) select * from b', 'Multiple CTEs');
test('with recursive a as (select 1 union all select * from a where false) select * from a', 'Recursive CTE');

// 14. Subqueries in different positions
test('select (select max(x) from t2) from t', 'Scalar subquery in SELECT');
test('select * from (select * from t) sub', 'Subquery in FROM');
test('select * from t where x in (select y from t2)', 'Subquery in IN');
test('select * from t where exists (select 1 from t2 where t2.id = t.id)', 'EXISTS subquery');
test('select * from t where x > all (select y from t2)', 'ALL subquery');
test('select * from t where x > any (select y from t2)', 'ANY subquery');
test('select * from t where x > some (select y from t2)', 'SOME subquery');

// 15. Complex JOINs
test('select * from a natural join b', 'NATURAL JOIN');
test('select * from a cross join b', 'CROSS JOIN');
test('select * from a, b, c', 'Implicit cross join');
test('select * from a join b using (id)', 'JOIN USING');
test('select * from a left semi join b on a.id = b.id', 'LEFT SEMI JOIN');
test('select * from a left anti join b on a.id = b.id', 'LEFT ANTI JOIN');

// 16. Complex expressions
test("select x is null from t", 'IS NULL');
test("select x is not null from t", 'IS NOT NULL');
test("select x is distinct from y from t", 'IS DISTINCT FROM');
test("select x is not distinct from y from t", 'IS NOT DISTINCT FROM');
test("select x between 1 and 10 from t", 'BETWEEN');
test("select x not between 1 and 10 from t", 'NOT BETWEEN');
test("select x like '%test%' from t", 'LIKE');
test("select x rlike '^test' from t", 'RLIKE');
test("select x ilike '%TEST%' from t", 'ILIKE');
test("select x similar to 'pattern' from t", 'SIMILAR TO');

// 17. OVER clauses with named windows
test('select sum(x) over w from t window w as (partition by y order by z)', 'Named window');
test('select sum(x) over (w rows 1 preceding) from t window w as (partition by y order by z)', 'Named window with modification');

// 18. QUALIFY clause
test('select * from t qualify row_number() over(partition by x order by y) = 1', 'QUALIFY clause');

// 19. Complex GROUP BY
test('select a, sum(b) from t group by 1', 'GROUP BY ordinal');
test('select a, b, sum(c) from t group by rollup(a, b)', 'GROUP BY ROLLUP');
test('select a, b, sum(c) from t group by cube(a, b)', 'GROUP BY CUBE');
test('select a, b, sum(c) from t group by grouping sets((a), (b), ())', 'GROUP BY GROUPING SETS');
test('select a, b, sum(c) from t group by all', 'GROUP BY ALL');

// 20. TABLESAMPLE
test('select * from t tablesample(10 percent)', 'TABLESAMPLE percent');
test('select * from t tablesample(100 rows)', 'TABLESAMPLE rows');
test('select * from t tablesample bucket 1 out of 10', 'TABLESAMPLE bucket');

// 21. Hints
test('select /*+ BROADCAST(t) */ * from t', 'Broadcast hint');
test('select /*+ COALESCE(3) */ * from t', 'Coalesce hint');
test('select /*+ REPARTITION(5) */ * from t', 'Repartition hint');
test('select /*+ SHUFFLE_HASH(t) */ * from t join s on t.id = s.id', 'Shuffle hash hint');
test('select /*+ MERGE(t) */ * from t', 'Merge hint');

// 22. Complex CASE expressions
test('select case x when 1 then a when 2 then b else c end from t', 'Simple CASE');
test('select case when x = 1 and y = 2 then a when x = 3 or y = 4 then b else c end from t', 'Searched CASE with AND/OR');

// 23. Complex IN expressions
test('select * from t where x in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10)', 'IN with many values');
test("select * from t where x in ('a', 'b', 'c')", 'IN with strings');
test('select * from t where (x, y) in ((1, 2), (3, 4))', 'IN with tuples');
test('select * from t where x not in (1, 2, 3)', 'NOT IN');

// 24. INTERVAL expressions
test('select interval 1 day from t', 'INTERVAL day');
test('select interval 1 hour + interval 30 minute from t', 'INTERVAL arithmetic');
test("select interval '1-2' year to month from t", 'INTERVAL YEAR TO MONTH');
test("select interval '1 2:3:4' day to second from t", 'INTERVAL DAY TO SECOND');
test('select current_timestamp - interval 1 day from t', 'Date minus INTERVAL');

// 25. Complex function nesting
test('select coalesce(nullif(trim(x), ""), "default") from t', 'Nested functions');
test('select concat_ws(",", collect_list(distinct x)) from t', 'DISTINCT in aggregate');
test('select percentile_approx(x, array(0.25, 0.5, 0.75)) from t', 'Percentile with array');

// 26. EXTRACT
test("select extract(year from x) from t", 'EXTRACT YEAR');
test("select extract(month from x) from t", 'EXTRACT MONTH');
test("select extract(day from x) from t", 'EXTRACT DAY');
test("select extract(hour from x) from t", 'EXTRACT HOUR');
test("select extract(dayofweek from x) from t", 'EXTRACT DAYOFWEEK');

// 27. DATE_ADD/DATE_SUB variations
test("select date_add(x, 1) from t", 'DATE_ADD');
test("select date_sub(x, 1) from t", 'DATE_SUB');
test("select dateadd(day, 1, x) from t", 'DATEADD with unit');
test("select datediff(x, y) from t", 'DATEDIFF');

// 28. JSON functions
test('select get_json_object(json, "$.key") from t', 'GET_JSON_OBJECT');
test('select json_tuple(json, "a", "b", "c") from t', 'JSON_TUPLE');
test('select from_json(json, "struct<a:int, b:string>") from t', 'FROM_JSON');
test("select to_json(struct(a, b)) from t", 'TO_JSON');
test('select schema_of_json(json) from t', 'SCHEMA_OF_JSON');

// 29. String functions
test('select substr(x, 1, 5) from t', 'SUBSTR');
test('select substring(x, 1, 5) from t', 'SUBSTRING');
test('select substring(x from 1 for 5) from t', 'SUBSTRING with FROM FOR');
test("select trim(both ' ' from x) from t", 'TRIM with BOTH');
test("select trim(leading '0' from x) from t", 'TRIM LEADING');
test("select trim(trailing ' ' from x) from t", 'TRIM TRAILING');
test('select overlay(x placing y from 1 for 2) from t', 'OVERLAY');
test("select position('a' in x) from t", 'POSITION');

// 30. Array functions
test('select array_contains(arr, 1) from t', 'ARRAY_CONTAINS');
test('select array_distinct(arr) from t', 'ARRAY_DISTINCT');
test('select array_except(arr1, arr2) from t', 'ARRAY_EXCEPT');
test('select array_intersect(arr1, arr2) from t', 'ARRAY_INTERSECT');
test('select array_union(arr1, arr2) from t', 'ARRAY_UNION');
test('select array_join(arr, ",") from t', 'ARRAY_JOIN');
test('select array_position(arr, 1) from t', 'ARRAY_POSITION');
test('select element_at(arr, 1) from t', 'ELEMENT_AT');
test('select slice(arr, 1, 3) from t', 'SLICE');
test('select sequence(1, 10) from t', 'SEQUENCE');
test('select sequence(1, 10, 2) from t', 'SEQUENCE with step');
test('select flatten(arr) from t', 'FLATTEN');
test('select arrays_zip(arr1, arr2) from t', 'ARRAYS_ZIP');
test('select zip_with(arr1, arr2, (x, y) -> x + y) from t', 'ZIP_WITH');
test('select sort_array(arr) from t', 'SORT_ARRAY');
test('select sort_array(arr, false) from t', 'SORT_ARRAY descending');
test('select array_sort(arr, (l, r) -> case when l < r then -1 when l > r then 1 else 0 end) from t', 'ARRAY_SORT with comparator');

// 31. Map functions
test('select map_keys(m) from t', 'MAP_KEYS');
test('select map_values(m) from t', 'MAP_VALUES');
test('select map_entries(m) from t', 'MAP_ENTRIES');
test('select map_from_entries(arr) from t', 'MAP_FROM_ENTRIES');
test('select map_concat(m1, m2) from t', 'MAP_CONCAT');
test('select str_to_map(s) from t', 'STR_TO_MAP');
test("select str_to_map(s, ',', ':') from t", 'STR_TO_MAP with delimiters');
test('select transform_keys(m, (k, v) -> upper(k)) from t', 'TRANSFORM_KEYS');
test('select transform_values(m, (k, v) -> v + 1) from t', 'TRANSFORM_VALUES');
test('select map_zip_with(m1, m2, (k, v1, v2) -> v1 + v2) from t', 'MAP_ZIP_WITH');

// 32. Struct functions
test('select struct(a, b, c) from t', 'STRUCT simple');
test('select named_struct("x", 1, "y", 2) from t', 'NAMED_STRUCT');
test('select s.field from t', 'Struct field access');
test('select s.* from t', 'Struct star expansion');

// 33. Higher-order functions
test('select exists(arr, x -> x > 0) from t', 'EXISTS array function');
test('select forall(arr, x -> x > 0) from t', 'FORALL');
test('select filter(arr, x -> x > 0) from t', 'FILTER');
test('select transform(arr, x -> x * 2) from t', 'TRANSFORM');

// 34. Edge case: empty parentheses and special syntax
test('select * from t where ()', 'Empty parens in WHERE');
test('select () from t', 'Empty parens as column');

// 35. Comments in various positions
test('select /* comment */ a from t', 'Comment before column');
test('select a /* comment */ from t', 'Comment after column');
test('select a from /* comment */ t', 'Comment before table');
test('select a from t /* comment */', 'Comment at end');
test('select a from t -- line comment', 'Line comment at end');
test('-- comment\nselect a from t', 'Line comment at start');
test('select a, -- inline\nb from t', 'Line comment inline');

// 36. Multiple statements
test('select 1; select 2', 'Multiple statements');
test('select 1;; select 2', 'Double semicolon');

// 37. Very long expressions
test('select a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q + r + s + t + u + v + w + x + y + z from t', 'Very long expression');

// 38. Reserved word as identifier
test('select `select` from t', 'SELECT as identifier');
test('select `from` from t', 'FROM as identifier');
test('select `order` from t order by 1', 'ORDER as identifier');
test('select `group` from t group by 1', 'GROUP as identifier');
test('select t.order from t order by t.order', 'ORDER as field name');

// 39. Collation
test("select 'a' collate utf8_binary from t", 'COLLATE');

// 40. Dollar-quoted strings
test("select $$hello world$$ from t", 'Dollar-quoted string');
test("select $tag$hello world$tag$ from t", 'Tagged dollar-quoted string');

// 41. Parameterized queries
test('select * from t where x = ?', 'Positional parameter');
test('select * from t where x = :param', 'Named parameter');
test('select * from t where x = ${var}', 'Variable substitution');

// 42. EXPLAIN
test('explain select * from t', 'EXPLAIN');
test('explain extended select * from t', 'EXPLAIN EXTENDED');
test('explain codegen select * from t', 'EXPLAIN CODEGEN');
test('explain cost select * from t', 'EXPLAIN COST');
test('explain formatted select * from t', 'EXPLAIN FORMATTED');

// 43. DESCRIBE
test('describe t', 'DESCRIBE table');
test('describe extended t', 'DESCRIBE EXTENDED');
test('describe formatted t', 'DESCRIBE FORMATTED');
test('describe table t col', 'DESCRIBE column');

// 44. SHOW commands
test('show tables', 'SHOW TABLES');
test('show databases', 'SHOW DATABASES');
test('show columns from t', 'SHOW COLUMNS');
test('show partitions t', 'SHOW PARTITIONS');
test('show functions', 'SHOW FUNCTIONS');
test('show create table t', 'SHOW CREATE TABLE');

// 45. SET/RESET
test('set spark.sql.shuffle.partitions=200', 'SET configuration');
test('set spark.sql.shuffle.partitions', 'SET show value');
test('reset spark.sql.shuffle.partitions', 'RESET configuration');

// 46. USE
test('use database_name', 'USE database');
test('use catalog.database_name', 'USE catalog.database');

// 47. Complex DDL
test('create table t (a int, b string) using parquet partitioned by (dt) clustered by (a) into 10 buckets', 'CREATE TABLE with clustering');
test('create table t (a int, b string) using parquet options (path "/tmp/t")', 'CREATE TABLE with options');
test('create table t (a int comment "column a", b string) comment "table t"', 'CREATE TABLE with comments');
test('create or replace temp view v as select * from t', 'CREATE OR REPLACE TEMP VIEW');
test('create global temporary view v as select * from t', 'CREATE GLOBAL TEMP VIEW');

// 48. ALTER TABLE
test('alter table t add columns (c int, d string)', 'ALTER TABLE ADD COLUMNS');
test('alter table t drop column c', 'ALTER TABLE DROP COLUMN');
test('alter table t rename column c to d', 'ALTER TABLE RENAME COLUMN');
test('alter table t set tblproperties ("key" = "value")', 'ALTER TABLE SET TBLPROPERTIES');
test('alter table t add partition (dt = "2024-01-01")', 'ALTER TABLE ADD PARTITION');

// 49. INSERT variations
test('insert into t values (1, 2), (3, 4)', 'INSERT VALUES');
test('insert into t partition (dt = "2024-01-01") select * from s', 'INSERT with partition');
test('insert overwrite t select * from s', 'INSERT OVERWRITE');
test('insert into t (a, b) values (1, 2)', 'INSERT with columns');

// 50. MERGE
test('merge into t using s on t.id = s.id when matched then update set t.val = s.val when not matched then insert *', 'MERGE basic');
test('merge into t using s on t.id = s.id when matched and s.deleted then delete when matched then update set * when not matched then insert *', 'MERGE with conditions');

// 51. DELETE/UPDATE
test('delete from t where x = 1', 'DELETE');
test('update t set x = 1 where y = 2', 'UPDATE');
test('update t set x = 1, y = 2 where z = 3', 'UPDATE multiple columns');

// 52. Complex WHERE with parens
test('select * from t where (a = 1 or b = 2) and (c = 3 or d = 4)', 'WHERE with parens');
test('select * from t where not (a = 1 and b = 2)', 'WHERE with NOT and parens');

// 53. UNION variations
test('select 1 union select 2', 'UNION');
test('select 1 union all select 2', 'UNION ALL');
test('select 1 intersect select 2', 'INTERSECT');
test('select 1 except select 2', 'EXCEPT');
test('select 1 minus select 2', 'MINUS');
test('(select 1) union (select 2)', 'UNION with parens');

// 54. Multiple nested subqueries
test('select * from (select * from (select * from t) a) b', 'Triple nested subquery');

// 55. EXISTS/NOT EXISTS
test('select * from t where exists (select 1)', 'EXISTS');
test('select * from t where not exists (select 1)', 'NOT EXISTS');

// 56. HAVING
test('select a, sum(b) from t group by a having sum(b) > 10', 'HAVING');
test('select a, sum(b) from t group by a having sum(b) > 10 and count(*) > 5', 'HAVING with AND');

// 57. ORDER BY variations
test('select * from t order by a asc, b desc', 'ORDER BY asc/desc');
test('select * from t order by a nulls first, b nulls last', 'ORDER BY nulls first/last');
test('select * from t order by a asc nulls first', 'ORDER BY with both modifiers');

// 58. LIMIT/OFFSET
test('select * from t limit 10', 'LIMIT');
test('select * from t limit 10 offset 5', 'LIMIT OFFSET');
test('select * from t limit all', 'LIMIT ALL');

// 59. FETCH
test('select * from t fetch first 10 rows only', 'FETCH FIRST');
test('select * from t offset 5 rows fetch next 10 rows only', 'OFFSET FETCH');

// 60. Spark-specific: DISTRIBUTE BY, CLUSTER BY, SORT BY
test('select * from t distribute by a', 'DISTRIBUTE BY');
test('select * from t cluster by a', 'CLUSTER BY');
test('select * from t sort by a', 'SORT BY');
test('select * from t distribute by a sort by b', 'DISTRIBUTE BY SORT BY');

// 61. VALUES as table
test('select * from values (1, 2), (3, 4) as t(a, b)', 'VALUES as table');
test('select * from (values (1, 2), (3, 4)) as t(a, b)', 'VALUES in subquery');

// 62. Generated columns
test('create table t (a int, b int generated always as (a * 2))', 'Generated column');

// 63. ANALYZE
test('analyze table t compute statistics', 'ANALYZE TABLE');
test('analyze table t compute statistics for columns a, b', 'ANALYZE TABLE for columns');
test('analyze table t compute statistics noscan', 'ANALYZE TABLE noscan');

// 64. CACHE/UNCACHE
test('cache table t', 'CACHE TABLE');
test('cache lazy table t', 'CACHE LAZY TABLE');
test('cache table t options ("storageLevel" = "MEMORY_ONLY")', 'CACHE TABLE with options');
test('uncache table t', 'UNCACHE TABLE');

// 65. REFRESH
test('refresh table t', 'REFRESH TABLE');
test('refresh t', 'REFRESH path');

// 66. MSCK
test('msck repair table t', 'MSCK REPAIR TABLE');

// 67. TRUNCATE
test('truncate table t', 'TRUNCATE TABLE');
test('truncate table t partition (dt = "2024-01-01")', 'TRUNCATE TABLE partition');

// 68. Complex type declarations
test('create table t (a array<int>, b map<string, int>, c struct<x:int, y:string>)', 'Complex types in DDL');
test('create table t (a array<array<int>>, b map<string, struct<x:int>>)', 'Nested complex types');

// 69. Table properties
test('create table t (a int) tblproperties ("key1" = "val1", "key2" = "val2")', 'Multiple TBLPROPERTIES');

// 70. Location
test('create table t (a int) location "/path/to/table"', 'CREATE TABLE with LOCATION');

// Test some likely problematic combinations
console.log("\n=== LIKELY PROBLEMATIC COMBINATIONS ===\n");

// Nested lambda in window function
test('select transform(arr, x -> sum(x) over(order by x)) from t', 'Lambda with window function');

// Multiple window functions
test('select sum(a) over(order by b), avg(a) over(order by b), count(*) over(order by b) from t', 'Multiple window functions');

// Complex CASE in window
test('select sum(case when x > 0 then 1 else 0 end) over(partition by y) from t', 'CASE in window function');

// Deeply nested expressions
test('select coalesce(a, coalesce(b, coalesce(c, coalesce(d, e)))) from t', 'Deeply nested COALESCE');

// Mixed operators
test('select a + b * c - d / e % f from t', 'Mixed arithmetic operators');

// String concatenation with functions
test("select concat(upper(a), '_', lower(b), '_', trim(c)) from t", 'Concat with multiple functions');

// Complex JOIN ON conditions
test('select * from a join b on a.x = b.x and a.y = b.y and a.z > b.z', 'Complex JOIN ON');

// Subquery in CASE
test('select case when x > (select avg(y) from t2) then 1 else 0 end from t', 'Subquery in CASE');

// Multiple CTEs with references
test('with a as (select 1 as x), b as (select x + 1 as y from a), c as (select y + 1 as z from b) select * from c', 'Multiple CTEs with dependencies');

// LATERAL VIEW with complex expression
test('select * from t lateral view explode(transform(arr, x -> x + 1)) as val', 'LATERAL VIEW with TRANSFORM');

// Window with frame and partition
test('select avg(x) over(partition by y, z order by a, b rows between 2 preceding and 2 following) from t', 'Complex window with multiple partitions');

console.log("\n=== DONE ===");
}
main();