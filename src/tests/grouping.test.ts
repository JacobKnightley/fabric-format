/**
 * GROUP BY, ORDER BY, HAVING Tests
 */
import { TestSuite } from './framework.js';

export const groupByTests: TestSuite = {
    name: 'GROUP BY / ORDER BY / HAVING',
    tests: [
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
    ],
};
