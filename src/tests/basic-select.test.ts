/**
 * Basic SELECT Tests
 */
import { TestSuite } from './framework.js';

export const basicSelectTests: TestSuite = {
    name: 'Basic SELECT',
    tests: [
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
        {
            name: 'LIMIT clause',
            input: 'select * from t limit 10',
            expected: 'SELECT *\nFROM t\nLIMIT 10',
        },
        {
            name: 'Complex query with multiple clauses',
            input: 'select u.userid, u.username, count(o.orderid) as order_count from users u inner join orders o on u.userid = o.userid where o.status = \'completed\' group by u.userid, u.username having count(o.orderid) > 5 order by order_count desc limit 10',
            expected: 'SELECT\n     u.userid\n    ,u.username\n    ,COUNT(o.orderid) AS order_count\nFROM users u\nINNER JOIN orders o\n    ON u.userid = o.userid\nWHERE o.status = \'completed\'\nGROUP BY\n     u.userid\n    ,u.username\nHAVING COUNT(o.orderid) > 5\nORDER BY order_count DESC\nLIMIT 10',
        },
    ],
};
