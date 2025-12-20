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
        expected: 'SELECT a\nFROM t',
    },
    {
        name: 'SELECT with WHERE',
        input: 'select a, b from t where x = 1',
        expected: 'SELECT a, b\nFROM t\nWHERE x = 1',
    },
    
    // Context-sensitive keywords as identifiers
    {
        name: 'Keywords as column names after dot',
        input: 'select a.key, a.order, a.value from t',
        expected: 'SELECT a.key, a.order, a.value\nFROM t',
    },
    
    // Function uppercasing
    {
        name: 'Built-in functions uppercase',
        input: 'select count(*), sum(amount), avg(price) from orders',
        expected: 'SELECT COUNT(*), SUM(amount), AVG(price)\nFROM orders',
    },
    {
        name: 'Window functions uppercase',
        input: 'select a, row_number() over (partition by b order by c) as rn from t',
        expected: 'SELECT a, ROW_NUMBER() OVER (PARTITION BY b\nORDER BY c) AS rn\nFROM t',
    },
    
    // JOINs
    {
        name: 'INNER JOIN',
        input: 'select a.id, b.name from table_a a inner join table_b b on a.id = b.a_id',
        expected: 'SELECT a.id, b.name\nFROM table_a a\nINNER JOIN table_b b ON a.id = b.a_id',
    },
    {
        name: 'LEFT JOIN',
        input: 'select * from a left join b on a.id = b.id',
        expected: 'SELECT *\nFROM a\nLEFT JOIN b ON a.id = b.id',
    },
    
    // GROUP BY / ORDER BY
    {
        name: 'GROUP BY and ORDER BY',
        input: 'select dept, count(*) as cnt from emp group by dept order by cnt desc',
        expected: 'SELECT dept, COUNT(*) AS cnt\nFROM emp\nGROUP BY dept\nORDER BY cnt DESC',
    },
    {
        name: 'HAVING clause',
        input: 'select dept, count(*) as cnt from emp group by dept having count(*) > 5',
        expected: 'SELECT dept, COUNT(*) AS cnt\nFROM emp\nGROUP BY dept\nHAVING COUNT(*) > 5',
    },
    
    // Subqueries
    {
        name: 'Subquery in FROM',
        input: 'select * from (select a, b from t where x > 10) sub where sub.a = 1',
        expected: 'SELECT *\nFROM (\nSELECT a, b\nFROM t\nWHERE x > 10) sub\nWHERE sub.a = 1',
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
        expected: 'SELECT u.userid, u.username, COUNT(o.orderid) AS order_count\nFROM users u\nINNER JOIN orders o ON u.userid = o.userid\nWHERE o.status = \'completed\'\nGROUP BY u.userid, u.username\nHAVING COUNT(o.orderid) > 5\nORDER BY order_count DESC\nLIMIT 10',
    },
    
    // Preserve identifier casing
    {
        name: 'Preserve mixed case identifiers',
        input: 'select UserId, UserName from Users where IsActive = true',
        expected: 'SELECT UserId, UserName\nFROM Users\nWHERE IsActive = TRUE',
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
