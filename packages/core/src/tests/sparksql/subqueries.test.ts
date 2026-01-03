/**
 * Subquery and CTE Tests
 * Note: Tests use multiple columns to avoid compact query mode
 */
import type { TestSuite } from '../framework.js';

export const subqueryTests: TestSuite = {
  name: 'Subqueries',
  tests: [
    {
      name: 'Subquery in FROM',
      input:
        'select a, b from (select a, b from t where x > 10) sub where sub.a = 1',
      expected:
        'SELECT\n     a\n    ,b\nFROM (\n    SELECT\n         a\n        ,b\n    FROM t\n    WHERE x > 10\n) sub\nWHERE sub.a = 1',
    },
    {
      name: 'Nested subquery (2 levels)',
      input:
        'select a, b from (select a, b from (select a, b from t) inner_q) outer_q',
      expected:
        'SELECT\n     a\n    ,b\nFROM (\n    SELECT\n         a\n        ,b\n    FROM (\n        SELECT\n             a\n            ,b\n        FROM t\n    ) inner_q\n) outer_q',
    },
    {
      name: 'WHERE IN subquery',
      input:
        'select a, b from t where x in (select id from other where y = 1 and z = 2)',
      expected:
        'SELECT\n     a\n    ,b\nFROM t\nWHERE x IN (\n    SELECT id\n    FROM other\n    WHERE\n        y = 1\n        AND z = 2\n)',
    },
    {
      name: 'WHERE EXISTS subquery',
      input:
        'select a, b from t where exists (select 1 from other where other.id = t.id and other.status = 1)',
      expected:
        'SELECT\n     a\n    ,b\nFROM t\nWHERE EXISTS (\n    SELECT 1\n    FROM other\n    WHERE\n        other.id = t.id\n        AND other.status = 1\n)',
    },
  ],
};

export const cteTests: TestSuite = {
  name: 'CTEs (WITH clause)',
  tests: [
    {
      name: 'CTE with indentation',
      input: 'with cte as (select a, b from t) select a, b from cte',
      expected:
        'WITH cte AS (\n    SELECT\n         a\n        ,b\n    FROM t\n)\nSELECT\n     a\n    ,b\nFROM cte',
    },
    {
      name: 'Multiple CTEs comma-first',
      input:
        'with cte1 as (select a, b from t1), cte2 as (select c, d from t2) select a, c from cte1 join cte2 on cte1.a = cte2.c',
      expected:
        'WITH cte1 AS (\n    SELECT\n         a\n        ,b\n    FROM t1\n)\n,cte2 AS (\n    SELECT\n         c\n        ,d\n    FROM t2\n)\nSELECT\n     a\n    ,c\nFROM cte1\nJOIN cte2\n    ON cte1.a = cte2.c',
    },
  ],
};

export const setOperationTests: TestSuite = {
  name: 'Set Operations',
  tests: [
    {
      name: 'UNION ALL',
      input: 'select a, b from t1 union all select c, d from t2',
      expected:
        'SELECT\n     a\n    ,b\nFROM t1\nUNION ALL\nSELECT\n     c\n    ,d\nFROM t2',
    },
    {
      name: 'EXCEPT',
      input: 'select a, b from t1 except select a, b from t2',
      expected:
        'SELECT\n     a\n    ,b\nFROM t1\nEXCEPT\nSELECT\n     a\n    ,b\nFROM t2',
    },
    {
      name: 'INTERSECT',
      input: 'select a, b from t1 intersect select a, b from t2',
      expected:
        'SELECT\n     a\n    ,b\nFROM t1\nINTERSECT\nSELECT\n     a\n    ,b\nFROM t2',
    },

    // === BUG: SET OPERATIONS WITH PARENTHESES ===
    // Parenthesized queries should have proper indentation
    {
      name: 'UNION ALL with parenthesized queries',
      input: '(select a, b from t1) union all (select c, d from t2)',
      expected:
        '(\n    SELECT\n         a\n        ,b\n    FROM t1\n)\nUNION ALL\n(\n    SELECT\n         c\n        ,d\n    FROM t2\n)',
    },
    {
      name: 'Parenthesized query closing paren on own line',
      input: '(select a, b from t where x > 10)',
      expected:
        '(\n    SELECT\n         a\n        ,b\n    FROM t\n    WHERE x > 10\n)',
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
      input:
        'select a, b from t where x = (select max(y) from s where z = 1 and w = 2)',
      expected:
        'SELECT\n     a\n    ,b\nFROM t\nWHERE x = (\n    SELECT MAX(y)\n    FROM s\n    WHERE\n        z = 1\n        AND w = 2\n)',
    },
    {
      name: 'IN subquery in WHERE should indent content',
      input:
        'select a, b from t where x in (select y from s where z > 10 and w < 20)',
      expected:
        'SELECT\n     a\n    ,b\nFROM t\nWHERE x IN (\n    SELECT y\n    FROM s\n    WHERE\n        z > 10\n        AND w < 20\n)',
    },
    {
      name: 'NOT EXISTS subquery should indent content',
      input:
        'select a, b from t where not exists (select 1 from s where s.id = t.id and s.status = 1)',
      expected:
        'SELECT\n     a\n    ,b\nFROM t\nWHERE NOT EXISTS (\n    SELECT 1\n    FROM s\n    WHERE\n        s.id = t.id\n        AND s.status = 1\n)',
    },
  ],
};
