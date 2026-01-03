/**
 * Tests for simple query compaction.
 * Simple queries should stay on one line instead of being expanded.
 *
 * A query is considered simple when:
 * - It has only one select item (e.g., SELECT a, SELECT COUNT(*), SELECT *)
 * - It has no JOINs
 * - It has no GROUP BY / HAVING
 * - WHERE clause has at most one condition (no AND/OR)
 * - The entire query fits within MAX_LINE_WIDTH (140 chars)
 */
import type { TestSuite } from '../framework.js';

export const compactQueryTests: TestSuite = {
  name: 'Simple Query Compaction',
  tests: [
    // Basic compact queries that should stay on one line
    {
      name: 'Simple SELECT * stays inline',
      input: 'SELECT * FROM users',
      expected: 'SELECT * FROM users',
    },
    {
      name: 'SELECT with single column stays inline',
      input: 'select   a   from   t',
      expected: 'SELECT a FROM t',
    },
    {
      name: 'SELECT with WHERE single condition stays inline',
      input: 'select * from users where id = 1',
      expected: 'SELECT * FROM users WHERE id = 1',
    },
    {
      name: 'SELECT with qualified column stays inline',
      input: 'select t.name from users t',
      expected: 'SELECT t.name FROM users t',
    },
    {
      name: 'SELECT with function call stays inline',
      input: 'select count(*) from orders',
      expected: 'SELECT COUNT(*) FROM orders',
    },
    {
      name: 'SELECT with aggregate and alias stays inline',
      input: 'select sum(amount) total from orders',
      expected: 'SELECT SUM(amount) AS total FROM orders',
    },
    // Queries that should NOT be compacted (multiple select items)
    {
      name: 'Multiple columns should expand',
      input: 'select a, b from t',
      expected: 'SELECT\n     a\n    ,b\nFROM t',
    },
    {
      name: 'Multiple columns with WHERE should expand',
      input: 'select name, email from users where active = true',
      expected:
        'SELECT\n     name\n    ,email\nFROM users\nWHERE active = TRUE',
    },
    // Queries that should NOT be compacted (JOINs)
    {
      name: 'Query with JOIN should expand',
      input: 'select u.name from users u join orders o on u.id = o.user_id',
      expected:
        'SELECT u.name\nFROM users u\nJOIN orders o\n    ON u.id = o.user_id',
    },
    // Queries that should NOT be compacted (multiple WHERE conditions)
    {
      name: 'Query with multiple WHERE conditions should expand',
      input: 'select * from users where active = true and age > 18',
      expected:
        'SELECT *\nFROM users\nWHERE\n    active = TRUE\n    AND age > 18',
    },
    // Subqueries - both outer and inner stay inline when simple
    {
      name: 'Simple subquery in FROM stays inline',
      input: 'select * from (select id from users) t',
      expected: 'SELECT * FROM (SELECT id FROM users) t', // Both simple, both inline
    },
    {
      name: 'Simple subquery in WHERE IN stays inline',
      input: 'select * from orders where user_id in (select id from users)',
      expected: 'SELECT * FROM orders WHERE user_id IN (SELECT id FROM users)', // Both simple, both inline
    },
    // Complex outer query with simple subquery
    {
      name: 'Complex outer with simple subquery',
      input:
        'select name, email from users where id in (select user_id from orders)',
      expected:
        'SELECT\n     name\n    ,email\nFROM users\nWHERE id IN (SELECT user_id FROM orders)', // Outer expands, inner stays inline
    },
    // Edge cases
    {
      name: 'SELECT with DISTINCT stays inline',
      input: 'select distinct status from orders',
      expected: 'SELECT DISTINCT status FROM orders',
    },
    {
      name: 'SELECT with LIMIT stays inline',
      input: 'select name from users limit 10',
      expected: 'SELECT name FROM users LIMIT 10',
    },
    {
      name: 'SELECT with ORDER BY single item stays inline',
      input: 'select name from users order by name',
      expected: 'SELECT name FROM users ORDER BY name',
    },
    {
      name: 'SELECT with ORDER BY multiple items should expand',
      input: 'select name from users order by last_name, first_name',
      expected:
        'SELECT name FROM users ORDER BY\n     last_name\n    ,first_name',
    },
    // EXISTS subquery - simple subquery stays inline
    {
      name: 'EXISTS with simple subquery',
      input: 'select * from t where exists (select 1 from u)',
      expected: 'SELECT * FROM t WHERE EXISTS (SELECT 1 FROM u)', // Fixed: no newline before close paren
    },
    // GROUP BY queries are NOT simple (they expand)
    {
      name: 'COUNT with GROUP BY expands (not simple)',
      input: 'select count(*) from orders group by status',
      expected: 'SELECT COUNT(*)\nFROM orders\nGROUP BY status',
    },
    // Multiple GROUP BY items should expand
    {
      name: 'COUNT with multiple GROUP BY items expands',
      input: 'select count(*) from orders group by status, year',
      expected:
        'SELECT COUNT(*)\nFROM orders\nGROUP BY\n     status\n    ,year',
    },
  ],
};
