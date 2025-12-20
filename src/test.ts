/**
 * E2E Tests for Spark SQL Formatter
 * 
 * Tests:
 * - Uppercase keywords and functions
 * - Newlines on key clauses
 * - Context-sensitive keyword/identifier handling
 */
import { formatSql } from './formatter.js';

interface TestCase {
    name: string;
    input: string;
    expected: string;
}

const testCases: TestCase[] = [
    // Basic SELECT - single vs multi item
    {
        name: 'Single-item SELECT (inline)',
        input: 'select a from t',
        expected: 'SELECT a\nFROM t',
    },
    {
        name: 'Multi-item SELECT (multiline)',
        input: 'select a, b, c from t',
        expected: 'SELECT\n     a\n    ,b\n    ,c\nFROM t',
    },
    {
        name: 'SELECT with WHERE',
        input: 'select a, b from t where x = 1',
        expected: 'SELECT\n     a\n    ,b\nFROM t\nWHERE x = 1',
    },
    
    // Context-sensitive keywords as identifiers
    {
        name: 'Keywords as column names after dot',
        input: 'select a.key, a.order, a.value from t',
        expected: 'SELECT\n     a.key\n    ,a.order\n    ,a.value\nFROM t',
    },
    
    // Function uppercasing
    {
        name: 'Built-in functions uppercase',
        input: 'select count(*), sum(amount), avg(price) from orders',
        expected: 'SELECT\n     COUNT(*)\n    ,SUM(amount)\n    ,AVG(price)\nFROM orders',
    },
    {
        name: 'Window functions uppercase',
        input: 'select a, row_number() over (partition by b order by c) as rn from t',
        expected: 'SELECT\n     a\n    ,ROW_NUMBER() OVER (PARTITION BY b ORDER BY c) AS rn\nFROM t',
    },
    
    // JOINs
    {
        name: 'INNER JOIN',
        input: 'select a.id, b.name from table_a a inner join table_b b on a.id = b.a_id',
        expected: 'SELECT\n     a.id\n    ,b.name\nFROM table_a a\nINNER JOIN table_b b\n    ON a.id = b.a_id',
    },
    {
        name: 'LEFT JOIN',
        input: 'select * from a left join b on a.id = b.id',
        expected: 'SELECT *\nFROM a\nLEFT JOIN b\n    ON a.id = b.id',
    },
    
    // GROUP BY / ORDER BY - single vs multi item
    {
        name: 'Single-item GROUP BY (inline)',
        input: 'select count(*) from t group by x',
        expected: 'SELECT COUNT(*)\nFROM t\nGROUP BY x',
    },
    {
        name: 'Multi-item GROUP BY (multiline)',
        input: 'select count(*) from t group by x, y, z',
        expected: 'SELECT COUNT(*)\nFROM t\nGROUP BY\n     x\n    ,y\n    ,z',
    },
    {
        name: 'Single-item ORDER BY (inline)',
        input: 'select * from t order by x',
        expected: 'SELECT *\nFROM t\nORDER BY x',
    },
    {
        name: 'Multi-item ORDER BY (multiline)',
        input: 'select * from t order by x, y desc, z',
        expected: 'SELECT *\nFROM t\nORDER BY\n     x\n    ,y DESC\n    ,z',
    },
    {
        name: 'GROUP BY and ORDER BY',
        input: 'select dept, count(*) as cnt from emp group by dept order by cnt desc',
        expected: 'SELECT\n     dept\n    ,COUNT(*) AS cnt\nFROM emp\nGROUP BY dept\nORDER BY cnt DESC',
    },
    {
        name: 'HAVING clause',
        input: 'select dept, count(*) as cnt from emp group by dept having count(*) > 5',
        expected: 'SELECT\n     dept\n    ,COUNT(*) AS cnt\nFROM emp\nGROUP BY dept\nHAVING COUNT(*) > 5',
    },
    
    // Subqueries with indentation
    {
        name: 'Subquery in FROM',
        input: 'select * from (select a, b from t where x > 10) sub where sub.a = 1',
        expected: 'SELECT *\nFROM (\n    SELECT\n         a\n        ,b\n    FROM t\n    WHERE x > 10\n) sub\nWHERE sub.a = 1',
    },
    {
        name: 'Nested subquery (2 levels)',
        input: 'select * from (select * from (select a from t) inner_q) outer_q',
        expected: 'SELECT *\nFROM (\n    SELECT *\n    FROM (\n        SELECT a\n        FROM t\n    ) inner_q\n) outer_q',
    },
    {
        name: 'CTE with indentation',
        input: 'with cte as (select a, b from t) select * from cte',
        expected: 'WITH cte AS (\n    SELECT\n         a\n        ,b\n    FROM t\n)\nSELECT *\nFROM cte',
    },
    {
        name: 'WHERE IN subquery',
        input: 'select a from t where x in (select id from other)',
        expected: 'SELECT a\nFROM t\nWHERE x IN (\n    SELECT id\n    FROM other\n)',
    },
    {
        name: 'WHERE EXISTS subquery',
        input: 'select a from t where exists (select 1 from other where other.id = t.id)',
        expected: 'SELECT a\nFROM t\nWHERE EXISTS (\n    SELECT 1\n    FROM other\n    WHERE other.id = t.id\n)',
    },
    
    // UNION
    {
        name: 'UNION ALL',
        input: 'select a from t1 union all select b from t2',
        expected: 'SELECT a\nFROM t1\nUNION ALL\nSELECT b\nFROM t2',
    },
    
    // CASE WHEN
    {
        name: 'CASE WHEN',
        input: 'select case when a = 1 then \'yes\' else \'no\' end from t',
        expected: 'SELECT CASE WHEN a = 1 THEN \'yes\' ELSE \'no\' END\nFROM t',
    },
    
    // Complex real-world query
    {
        name: 'Complex query with multiple clauses',
        input: 'select u.userid, u.username, count(o.orderid) as order_count from users u inner join orders o on u.userid = o.userid where o.status = \'completed\' group by u.userid, u.username having count(o.orderid) > 5 order by order_count desc limit 10',
        expected: 'SELECT\n     u.userid\n    ,u.username\n    ,COUNT(o.orderid) AS order_count\nFROM users u\nINNER JOIN orders o\n    ON u.userid = o.userid\nWHERE o.status = \'completed\'\nGROUP BY\n     u.userid\n    ,u.username\nHAVING COUNT(o.orderid) > 5\nORDER BY order_count DESC\nLIMIT 10',
    },
    
    // Preserve identifier casing
    {
        name: 'Preserve mixed case identifiers',
        input: 'select UserId, UserName from Users where IsActive = true',
        expected: 'SELECT\n     UserId\n    ,UserName\nFROM Users\nWHERE IsActive = TRUE',
    },
    
    // String literals preserved
    {
        name: 'String literals preserved exactly',
        input: 'select * from t where name = \'John Doe\'',
        expected: 'SELECT *\nFROM t\nWHERE name = \'John Doe\'',
    },
    
    // LIMIT
    {
        name: 'LIMIT clause',
        input: 'select * from t limit 10',
        expected: 'SELECT *\nFROM t\nLIMIT 10',
    },
    
    // Comments
    {
        name: 'Leading line comment',
        input: '-- header comment\nselect x from t',
        expected: '-- header comment\nSELECT x\nFROM t',
    },
    {
        name: 'Leading block comment',
        input: '/* multi\nline */\nselect x from t',
        expected: '/* multi\nline */\nSELECT x\nFROM t',
    },
    {
        name: 'Trailing inline comment',
        input: 'select x from t -- inline comment',
        expected: 'SELECT x\nFROM t -- inline comment',
    },
    {
        name: 'Comment in WHERE clause',
        input: 'select x from t where /* filter */ a = 1',
        expected: 'SELECT x\nFROM t\nWHERE /* filter */ a = 1',
    },
    
    // Hints
    {
        name: 'BROADCAST hint',
        input: 'select /*+ broadcast(t) */ * from t',
        expected: 'SELECT /*+ BROADCAST(t) */ *\nFROM t',
    },
    {
        name: 'Multiple hints',
        input: 'select /*+ broadcast(t1), merge(t2) */ * from t',
        expected: 'SELECT /*+ BROADCAST(t1), MERGE(t2) */ *\nFROM t',
    },
    {
        name: 'Hint preserves table name casing',
        input: 'select /*+ broadcast(MyTable) */ * from MyTable',
        expected: 'SELECT /*+ BROADCAST(MyTable) */ *\nFROM MyTable',
    },
    
    // UDF casing preservation
    {
        name: 'UDF preserves casing',
        input: 'select MyCustomFunc(x), my_udf(a,b) from t',
        expected: 'SELECT\n     MyCustomFunc(x)\n    ,my_udf(a, b)\nFROM t',
    },
    {
        name: 'Mixed built-in and UDF',
        input: 'select count(*), MyFunc(x), sum(y) from t',
        expected: 'SELECT\n     COUNT(*)\n    ,MyFunc(x)\n    ,SUM(y)\nFROM t',
    },
    
    // Alias with AS keyword insertion
    {
        name: 'Column alias gets AS keyword',
        input: 'select count(*) cnt from t',
        expected: 'SELECT COUNT(*) AS cnt\nFROM t',
    },
    {
        name: 'Existing AS preserved',
        input: 'select count(*) as cnt from t',
        expected: 'SELECT COUNT(*) AS cnt\nFROM t',
    },
    {
        name: 'Multiple aliases',
        input: 'select a x, b y, count(*) cnt from t',
        expected: 'SELECT\n     a AS x\n    ,b AS y\n    ,COUNT(*) AS cnt\nFROM t',
    },
    
    // SELECT variants
    {
        name: 'SELECT DISTINCT',
        input: 'select distinct col1, col2 from t',
        expected: 'SELECT DISTINCT\n     col1\n    ,col2\nFROM t',
    },
    {
        name: 'Qualified star (t.*)',
        input: 'select t.* from t',
        expected: 'SELECT t.*\nFROM t',
    },
    
    // Literals
    {
        name: 'DATE literal',
        input: "select date '2024-01-01' from t",
        expected: "SELECT DATE '2024-01-01'\nFROM t",
    },
    
    // Expressions
    {
        name: 'IS NULL',
        input: 'select x from t where x is null',
        expected: 'SELECT x\nFROM t\nWHERE x IS NULL',
    },
    {
        name: 'IS DISTINCT FROM',
        input: 'select x from t where x is distinct from y',
        expected: 'SELECT x\nFROM t\nWHERE x IS DISTINCT FROM y',
    },
    
    // Multiple WHERE conditions
    {
        name: 'Single-item WHERE (inline)',
        input: 'select a from t where x = 1',
        expected: 'SELECT a\nFROM t\nWHERE x = 1',
    },
    {
        name: 'Multi-item WHERE with AND (multiline)',
        input: 'select a from t where a=1 and b=2 and c=3',
        expected: 'SELECT a\nFROM t\nWHERE\n    a = 1\n    AND b = 2\n    AND c = 3',
    },
    {
        name: 'Multi-item WHERE with OR (multiline)',
        input: 'select a from t where a=1 or b=2 or c=3',
        expected: 'SELECT a\nFROM t\nWHERE\n    a = 1\n    OR b = 2\n    OR c = 3',
    },
    
    // HAVING clause - single vs multi
    {
        name: 'Single-item HAVING (inline)',
        input: 'select dept, count(*) from t group by dept having count(*) > 5',
        expected: 'SELECT\n     dept\n    ,COUNT(*)\nFROM t\nGROUP BY dept\nHAVING COUNT(*) > 5',
    },
    {
        name: 'Multi-item HAVING (multiline)',
        input: 'select dept, count(*) from t group by dept having count(*) > 5 and sum(x) < 100',
        expected: 'SELECT\n     dept\n    ,COUNT(*)\nFROM t\nGROUP BY dept\nHAVING\n    COUNT(*) > 5\n    AND SUM(x) < 100',
    },
    
    // DDL
    {
        name: 'CREATE VIEW',
        input: 'create view vw as select x from t',
        expected: 'CREATE VIEW vw AS\nSELECT x\nFROM t',
    },
    {
        name: 'CREATE OR REPLACE TEMP VIEW',
        input: 'create or replace temp view v as select a, b from t',
        expected: 'CREATE OR REPLACE TEMP VIEW v AS\nSELECT\n     a\n    ,b\nFROM t',
    },
    
    // DML
    {
        name: 'INSERT INTO SELECT',
        input: 'insert into target select id, name from source where active = true',
        expected: 'INSERT INTO target\nSELECT\n     id\n    ,name\nFROM source\nWHERE active = TRUE',
    },
    {
        name: 'DELETE with multiple conditions',
        input: "delete from users where created < '2020-01-01' and status = 'inactive'",
        expected: "DELETE FROM users\nWHERE\n    created < '2020-01-01'\n    AND status = 'inactive'",
    },
    
    // Spacing tests
    {
        name: 'Double-colon cast (no spaces)',
        input: 'select x::string from t',
        expected: 'SELECT x::STRING\nFROM t',
    },
    {
        name: 'CAST (no space after name)',
        input: 'select cast(x as string) from t',
        expected: 'SELECT CAST(x AS STRING)\nFROM t',
    },
    {
        name: 'IN list (comma space)',
        input: 'select x from t where x in (1,2,3)',
        expected: 'SELECT x\nFROM t\nWHERE x IN (1, 2, 3)',
    },
    {
        name: 'BETWEEN (dont split on AND)',
        input: 'select x from t where x between 1 and 10',
        expected: 'SELECT x\nFROM t\nWHERE x BETWEEN 1 AND 10',
    },
    
    // JOIN ON formatting
    {
        name: 'JOIN ON on new line with indent',
        input: 'select a.id, b.name from orders a join customers b on a.cust_id=b.id',
        expected: 'SELECT\n     a.id\n    ,b.name\nFROM orders a\nJOIN customers b\n    ON a.cust_id = b.id',
    },
    
    // DML formatting - single vs multi
    {
        name: 'INSERT VALUES comma-first',
        input: "insert into t values (1, 'a'), (2, 'b')",
        expected: "INSERT INTO t VALUES\n(1, 'a')\n,(2, 'b')",
    },
    {
        name: 'Single-item UPDATE SET (inline)',
        input: 'update t set x = 1 where z = 3',
        expected: 'UPDATE t\nSET x = 1\nWHERE z = 3',
    },
    {
        name: 'Multi-item UPDATE SET (multiline)',
        input: 'update t set x = 1, y = 2, z = 3 where id = 5',
        expected: 'UPDATE t\nSET\n     x = 1\n    ,y = 2\n    ,z = 3\nWHERE id = 5',
    },
    
    // DDL formatting - single vs multi column
    {
        name: 'Single-column CREATE TABLE (inline)',
        input: 'create table foo (id int)',
        expected: 'CREATE TABLE foo (id INT)',
    },
    {
        name: 'Multi-column CREATE TABLE (indented)',
        input: 'create table foo (id int, name string, age int)',
        expected: 'CREATE TABLE foo (\n     id INT\n    ,name STRING\n    ,age INT\n)',
    },
    
    // Multiple CTEs
    {
        name: 'Multiple CTEs comma-first',
        input: 'with cte1 as (select a from t1), cte2 as (select b from t2) select * from cte1 join cte2',
        expected: 'WITH cte1 AS (\n    SELECT a\n    FROM t1\n)\n,cte2 AS (\n    SELECT b\n    FROM t2\n)\nSELECT *\nFROM cte1\nJOIN cte2',
    },
    
    // Spark-specific features
    {
        name: 'LATERAL VIEW EXPLODE',
        input: 'select a, b from t lateral view explode(arr) AS item',
        expected: 'SELECT\n     a\n    ,b\nFROM t LATERAL VIEW EXPLODE(arr) AS item',
    },
    {
        name: 'WINDOW clause (named window)',
        input: 'select a, sum(b) over w from t window w as (partition by c order by d)',
        expected: 'SELECT\n     a\n    ,SUM(b) OVER w\nFROM t WINDOW w AS (PARTITION BY c ORDER BY d)',
    },
    {
        name: 'PIVOT',
        input: 'select * from t pivot (sum(val) for col in (1, 2, 3))',
        expected: 'SELECT *\nFROM t PIVOT (SUM(val) FOR col IN (1, 2, 3))',
    },
    {
        name: 'CLUSTER BY',
        input: 'select a, b from t cluster by a',
        expected: 'SELECT\n     a\n    ,b\nFROM t CLUSTER BY a',
    },
    {
        name: 'DISTRIBUTE BY SORT BY',
        input: 'select a, b from t distribute by a sort by b',
        expected: 'SELECT\n     a\n    ,b\nFROM t DISTRIBUTE BY a SORT BY b',
    },
    {
        name: 'TABLESAMPLE',
        input: 'select * from t tablesample (10 percent)',
        expected: 'SELECT *\nFROM t TABLESAMPLE (10 PERCENT)',
    },
    {
        name: 'Lambda expression (TRANSFORM)',
        input: 'select transform(arr, x -> x + 1) from t',
        expected: 'SELECT TRANSFORM(arr, x -> x + 1)\nFROM t',
    },
    {
        name: 'Lambda expression (FILTER)',
        input: 'select filter(arr, x -> x > 0) from t',
        expected: 'SELECT FILTER(arr, x -> x > 0)\nFROM t',
    },
    {
        name: 'Lambda expression (AGGREGATE)',
        input: 'select aggregate(arr, 0, (acc, x) -> acc + x) from t',
        expected: 'SELECT AGGREGATE(arr, 0, (acc, x) -> acc + x)\nFROM t',
    },
    
    // JOIN variants
    {
        name: 'LEFT SEMI JOIN',
        input: 'select * from t1 left semi join t2 on t1.id = t2.id',
        expected: 'SELECT *\nFROM t1\nLEFT SEMI JOIN t2\n    ON t1.id = t2.id',
    },
    {
        name: 'LEFT ANTI JOIN',
        input: 'select * from t1 left anti join t2 on t1.id = t2.id',
        expected: 'SELECT *\nFROM t1\nLEFT ANTI JOIN t2\n    ON t1.id = t2.id',
    },
    {
        name: 'NATURAL JOIN',
        input: 'select * from t1 natural join t2',
        expected: 'SELECT *\nFROM t1\nNATURAL JOIN t2',
    },
    {
        name: 'JOIN USING',
        input: 'select * from t1 join t2 using (id, name)',
        expected: 'SELECT *\nFROM t1\nJOIN t2 USING (id, name)',
    },
    {
        name: 'Multiple JOIN conditions',
        input: 'select * from a join b on a.id = b.id and a.col = b.col',
        expected: 'SELECT *\nFROM a\nJOIN b\n    ON a.id = b.id\n    AND a.col = b.col',
    },
    
    // Set operations
    {
        name: 'EXCEPT',
        input: 'select a from t1 except select a from t2',
        expected: 'SELECT a\nFROM t1\nEXCEPT\nSELECT a\nFROM t2',
    },
    {
        name: 'INTERSECT',
        input: 'select a from t1 intersect select a from t2',
        expected: 'SELECT a\nFROM t1\nINTERSECT\nSELECT a\nFROM t2',
    },
    
    // More expressions
    {
        name: 'Nested functions',
        input: 'select upper(lower(trim(x))) from t',
        expected: 'SELECT UPPER(LOWER(TRIM(x)))\nFROM t',
    },
    {
        name: 'COALESCE',
        input: 'select coalesce(a, b, c) from t',
        expected: 'SELECT COALESCE(a, b, c)\nFROM t',
    },
    {
        name: 'IS NOT NULL',
        input: 'select x from t where x is not null',
        expected: 'SELECT x\nFROM t\nWHERE x IS NOT NULL',
    },
    {
        name: 'IS NOT DISTINCT FROM',
        input: 'select x from t where x is not distinct from y',
        expected: 'SELECT x\nFROM t\nWHERE x IS NOT DISTINCT FROM y',
    },
    {
        name: 'RLIKE',
        input: 'select x from t where x rlike pattern',
        expected: 'SELECT x\nFROM t\nWHERE x RLIKE pattern',
    },
    
    // DDL & utility commands
    {
        name: 'DROP TABLE IF EXISTS',
        input: 'drop table if exists my_table',
        expected: 'DROP TABLE IF EXISTS my_table',
    },
    {
        name: 'DROP VIEW IF EXISTS',
        input: 'drop view if exists my_view',
        expected: 'DROP VIEW IF EXISTS my_view',
    },
    {
        name: 'TRUNCATE TABLE',
        input: 'truncate table my_table',
        expected: 'TRUNCATE TABLE my_table',
    },
    {
        name: 'USE database',
        input: 'use my_database',
        expected: 'USE my_database',
    },
    {
        name: 'SHOW TABLES',
        input: 'show tables',
        expected: 'SHOW TABLES',
    },
    {
        name: 'DESCRIBE table',
        input: 'describe my_table',
        expected: 'DESCRIBE my_table',
    },
    {
        name: 'EXPLAIN query',
        input: 'explain select x from t',
        expected: 'EXPLAIN\nSELECT x\nFROM t',
    },
    {
        name: 'CACHE TABLE',
        input: 'cache table t',
        expected: 'CACHE TABLE t',
    },
    {
        name: 'ANALYZE TABLE',
        input: 'analyze table t',
        expected: 'ANALYZE TABLE t',
    },
    
    // Array/map access - no spaces around brackets
    {
        name: 'Array access with single element',
        input: 'select arr[0] from t',
        expected: 'SELECT arr[0]\nFROM t',
    },
    {
        name: 'Array access with multiple elements',
        input: 'select arr[0], arr[1], arr[2] from t',
        expected: 'SELECT\n     arr[0]\n    ,arr[1]\n    ,arr[2]\nFROM t',
    },
    {
        name: 'Map access with string key',
        input: 'select map["key"] from t',
        expected: 'SELECT map["KEY"]\nFROM t',
    },
    {
        name: 'Array access with expression',
        input: 'select arr[i + 1] from t',
        expected: 'SELECT arr[i + 1]\nFROM t',
    },
    
    // CASE expressions - single WHEN inline, multiple WHEN multiline
    {
        name: 'CASE with single WHEN (inline)',
        input: 'select case when x = 1 then "a" else "b" end from t',
        expected: 'SELECT CASE WHEN x = 1 THEN "A" ELSE "B" END\nFROM t',
    },
    {
        name: 'CASE with multiple WHEN (multiline)',
        input: 'select case when status = 1 then "active" when status = 2 then "pending" when status = 3 then "closed" else "unknown" end from t',
        expected: 'SELECT\n     CASE\n        WHEN status = 1 THEN "ACTIVE"\n        WHEN status = 2 THEN "PENDING"\n        WHEN status = 3 THEN "CLOSED"\n        ELSE "UNKNOWN"\n     END\nFROM t',
    },
    {
        name: 'CASE without ELSE',
        input: 'select case when x = 1 then "a" when x = 2 then "b" end from t',
        expected: 'SELECT\n     CASE\n        WHEN x = 1 THEN "A"\n        WHEN x = 2 THEN "B"\n     END\nFROM t',
    },
    
    // GROUPING SETS, ROLLUP, CUBE - keep arguments inline
    {
        name: 'GROUPING SETS inline',
        input: 'select a, sum(x) from t group by grouping sets ((a), (b), ())',
        expected: 'SELECT\n     a\n    ,SUM(x)\nFROM t\nGROUP BY GROUPING SETS ((a), (b), ())',
    },
    {
        name: 'ROLLUP inline',
        input: 'select a, b, sum(x) from t group by rollup(a, b)',
        expected: 'SELECT\n     a\n    ,b\n    ,SUM(x)\nFROM t\nGROUP BY ROLLUP(a, b)',
    },
    {
        name: 'CUBE inline',
        input: 'select a, b, sum(x) from t group by cube(a, b)',
        expected: 'SELECT\n     a\n    ,b\n    ,SUM(x)\nFROM t\nGROUP BY CUBE(a, b)',
    },
];

function runTests(): void {
    console.log('=== Spark SQL Formatter E2E Tests ===\n');
    
    let passed = 0;
    let failed = 0;
    const failures: {name: string; input: string; expected: string; got: string}[] = [];
    
    for (const tc of testCases) {
        const result = formatSql(tc.input);
        const success = result === tc.expected;
        
        if (success) {
            console.log(`✓ ${tc.name}`);
            passed++;
        } else {
            console.log(`✗ ${tc.name}`);
            failures.push({ name: tc.name, input: tc.input, expected: tc.expected, got: result });
            failed++;
        }
    }
    
    console.log(`\n=== Results ===`);
    console.log(`Passed: ${passed}/${testCases.length}`);
    console.log(`Failed: ${failed}/${testCases.length}`);
    
    if (failures.length > 0) {
        console.log('\n=== Failure Details ===');
        for (const f of failures) {
            console.log(`\n${f.name}:`);
            console.log(`  Input:    ${f.input}`);
            console.log(`  Expected: ${f.expected.replace(/\n/g, '\\n')}`);
            console.log(`  Got:      ${f.got.replace(/\n/g, '\\n')}`);
        }
    }
    
    // Context-sensitive keyword demonstration
    console.log('\n=== Context-Sensitive Keyword Demo ===');
    const sensitiveTest = 'select a.key, a.order, a.value from t order by a.order';
    const sensitiveResult = formatSql(sensitiveTest);
    console.log(`Input:  ${sensitiveTest}`);
    console.log(`Output: ${sensitiveResult.replace(/\n/g, '\\n')}`);
    console.log(`\nKey insight:`);
    console.log(`  - 'a.key', 'a.order', 'a.value' preserve lowercase (identifiers after dot)`);
    console.log(`  - 'ORDER BY' is uppercase (keyword position)`);
    
    // Exit with appropriate code
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
