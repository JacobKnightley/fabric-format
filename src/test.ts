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
    // Basic SELECT
    {
        name: 'Simple SELECT',
        input: 'select a from t',
        expected: 'SELECT\n     a\nFROM t',
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
        expected: 'SELECT\n     a\n    ,ROW_NUMBER() OVER (PARTITION BY b\nORDER BY\n     c) AS rn\nFROM t',
    },
    
    // JOINs
    {
        name: 'INNER JOIN',
        input: 'select a.id, b.name from table_a a inner join table_b b on a.id = b.a_id',
        expected: 'SELECT\n     a.id\n    ,b.name\nFROM table_a a\nINNER JOIN table_b b ON a.id = b.a_id',
    },
    {
        name: 'LEFT JOIN',
        input: 'select * from a left join b on a.id = b.id',
        expected: 'SELECT\n     *\nFROM a\nLEFT JOIN b ON a.id = b.id',
    },
    
    // GROUP BY / ORDER BY
    {
        name: 'GROUP BY and ORDER BY',
        input: 'select dept, count(*) as cnt from emp group by dept order by cnt desc',
        expected: 'SELECT\n     dept\n    ,COUNT(*) AS cnt\nFROM emp\nGROUP BY\n     dept\nORDER BY\n     cnt DESC',
    },
    {
        name: 'HAVING clause',
        input: 'select dept, count(*) as cnt from emp group by dept having count(*) > 5',
        expected: 'SELECT\n     dept\n    ,COUNT(*) AS cnt\nFROM emp\nGROUP BY\n     dept\nHAVING COUNT(*) > 5',
    },
    
    // Subqueries
    {
        name: 'Subquery in FROM',
        input: 'select * from (select a, b from t where x > 10) sub where sub.a = 1',
        expected: 'SELECT\n     *\nFROM (\nSELECT\n     a\n    ,b\nFROM t\nWHERE x > 10) sub\nWHERE sub.a = 1',
    },
    
    // UNION
    {
        name: 'UNION ALL',
        input: 'select a from t1 union all select b from t2',
        expected: 'SELECT\n     a\nFROM t1\nUNION ALL\nSELECT\n     b\nFROM t2',
    },
    
    // CASE WHEN
    {
        name: 'CASE WHEN',
        input: 'select case when a = 1 then \'yes\' else \'no\' end from t',
        expected: 'SELECT\n     CASE WHEN a = 1 THEN \'yes\' ELSE \'no\' END\nFROM t',
    },
    
    // Complex real-world query
    {
        name: 'Complex query with multiple clauses',
        input: 'select u.userid, u.username, count(o.orderid) as order_count from users u inner join orders o on u.userid = o.userid where o.status = \'completed\' group by u.userid, u.username having count(o.orderid) > 5 order by order_count desc limit 10',
        expected: 'SELECT\n     u.userid\n    ,u.username\n    ,COUNT(o.orderid) AS order_count\nFROM users u\nINNER JOIN orders o ON u.userid = o.userid\nWHERE o.status = \'completed\'\nGROUP BY\n     u.userid\n    ,u.username\nHAVING COUNT(o.orderid) > 5\nORDER BY\n     order_count DESC\nLIMIT 10',
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
        expected: 'SELECT\n     *\nFROM t\nWHERE name = \'John Doe\'',
    },
    
    // LIMIT
    {
        name: 'LIMIT clause',
        input: 'select * from t limit 10',
        expected: 'SELECT\n     *\nFROM t\nLIMIT 10',
    },
    
    // Comments
    {
        name: 'Leading line comment',
        input: '-- header comment\nselect x from t',
        expected: '-- header comment\nSELECT\n     x\nFROM t',
    },
    {
        name: 'Leading block comment',
        input: '/* multi\nline */\nselect x from t',
        expected: '/* multi\nline */\nSELECT\n     x\nFROM t',
    },
    {
        name: 'Trailing inline comment',
        input: 'select x from t -- inline comment',
        expected: 'SELECT\n     x\nFROM t -- inline comment',
    },
    {
        name: 'Comment in WHERE clause',
        input: 'select x from t where /* filter */ a = 1',
        expected: 'SELECT\n     x\nFROM t\nWHERE /* filter */ a = 1',
    },
    
    // Hints
    {
        name: 'BROADCAST hint',
        input: 'select /*+ broadcast(t) */ * from t',
        expected: 'SELECT /*+ BROADCAST(t) */\n     *\nFROM t',
    },
    {
        name: 'Multiple hints',
        input: 'select /*+ broadcast(t1), merge(t2) */ * from t',
        expected: 'SELECT /*+ BROADCAST(t1), MERGE(t2) */\n     *\nFROM t',
    },
    {
        name: 'Hint preserves table name casing',
        input: 'select /*+ broadcast(MyTable) */ * from MyTable',
        expected: 'SELECT /*+ BROADCAST(MyTable) */\n     *\nFROM MyTable',
    },
    
    // UDF casing preservation
    {
        name: 'UDF preserves casing',
        input: 'select MyCustomFunc(x), my_udf(a,b) from t',
        expected: 'SELECT\n     MyCustomFunc(x)\n    ,my_udf(a,b)\nFROM t',
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
        expected: 'SELECT\n     COUNT(*) AS cnt\nFROM t',
    },
    {
        name: 'Existing AS preserved',
        input: 'select count(*) as cnt from t',
        expected: 'SELECT\n     COUNT(*) AS cnt\nFROM t',
    },
    {
        name: 'Multiple aliases',
        input: 'select a x, b y, count(*) cnt from t',
        expected: 'SELECT\n     a AS x\n    ,b AS y\n    ,COUNT(*) AS cnt\nFROM t',
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
