/**
 * Subquery and CTE Tests
 */
import { TestSuite } from './framework.js';

export const subqueryTests: TestSuite = {
    name: 'Subqueries',
    tests: [
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
            name: 'WHERE IN subquery',
            input: 'select a from t where x in (select id from other)',
            expected: 'SELECT a\nFROM t\nWHERE x IN (\n    SELECT id\n    FROM other\n)',
        },
        {
            name: 'WHERE EXISTS subquery',
            input: 'select a from t where exists (select 1 from other where other.id = t.id)',
            expected: 'SELECT a\nFROM t\nWHERE EXISTS (\n    SELECT 1\n    FROM other\n    WHERE other.id = t.id\n)',
        },
    ],
};

export const cteTests: TestSuite = {
    name: 'CTEs (WITH clause)',
    tests: [
        {
            name: 'CTE with indentation',
            input: 'with cte as (select a, b from t) select * from cte',
            expected: 'WITH cte AS (\n    SELECT\n         a\n        ,b\n    FROM t\n)\nSELECT *\nFROM cte',
        },
        {
            name: 'Multiple CTEs comma-first',
            input: 'with cte1 as (select a from t1), cte2 as (select b from t2) select * from cte1 join cte2',
            expected: 'WITH cte1 AS (\n    SELECT a\n    FROM t1\n)\n,cte2 AS (\n    SELECT b\n    FROM t2\n)\nSELECT *\nFROM cte1\nJOIN cte2',
        },
    ],
};

export const setOperationTests: TestSuite = {
    name: 'Set Operations',
    tests: [
        {
            name: 'UNION ALL',
            input: 'select a from t1 union all select b from t2',
            expected: 'SELECT a\nFROM t1\nUNION ALL\nSELECT b\nFROM t2',
        },
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
        
        // === BUG: SET OPERATIONS WITH PARENTHESES ===
        // Parenthesized queries should have proper indentation
        {
            name: 'UNION ALL with parenthesized queries',
            input: '(select a from t1) union all (select b from t2)',
            expected: '(\n    SELECT a\n    FROM t1\n)\nUNION ALL\n(\n    SELECT b\n    FROM t2\n)',
        },
        {
            name: 'Parenthesized query closing paren on own line',
            input: '(select a, b from t where x > 10)',
            expected: '(\n    SELECT\n         a\n        ,b\n    FROM t\n    WHERE x > 10\n)',
        },
    ],
};

// === BUG: SUBQUERY INDENTATION IN WHERE ===
// Scalar and IN subqueries in WHERE should have proper indentation
export const subqueryIndentationTests: TestSuite = {
    name: 'Subquery Indentation in WHERE',
    tests: [
        {
            name: 'Scalar subquery in WHERE should indent content',
            input: 'select a from t where x = (select max(y) from s)',
            expected: 'SELECT a\nFROM t\nWHERE x = (\n    SELECT MAX(y)\n    FROM s\n)',
        },
        {
            name: 'IN subquery in WHERE should indent content',
            input: 'select a from t where x in (select y from s where z > 10)',
            expected: 'SELECT a\nFROM t\nWHERE x IN (\n    SELECT y\n    FROM s\n    WHERE z > 10\n)',
        },
        {
            name: 'NOT EXISTS subquery should indent content',
            input: 'select a from t where not exists (select 1 from s where s.id = t.id)',
            expected: 'SELECT a\nFROM t\nWHERE NOT EXISTS (\n    SELECT 1\n    FROM s\n    WHERE s.id = t.id\n)',
        },
    ],
};
