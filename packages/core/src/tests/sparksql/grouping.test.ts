/**
 * GROUP BY, ORDER BY, HAVING Tests
 * Note: Tests use multiple columns to avoid compact query mode
 */
import type { TestSuite } from '../framework.js';

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
      input: 'select a, b from t order by x',
      expected: 'SELECT\n     a\n    ,b\nFROM t\nORDER BY x',
    },
    {
      name: 'Multi-item ORDER BY (multiline)',
      input: 'select a, b from t order by x, y desc, z',
      expected:
        'SELECT\n     a\n    ,b\nFROM t\nORDER BY\n     x\n    ,y DESC\n    ,z',
    },
    {
      name: 'GROUP BY and ORDER BY',
      input:
        'select dept, count(*) as cnt from emp group by dept order by cnt desc',
      expected:
        'SELECT\n     dept\n    ,COUNT(*) AS cnt\nFROM emp\nGROUP BY dept\nORDER BY cnt DESC',
    },
    {
      name: 'HAVING clause',
      input:
        'select dept, count(*) as cnt from emp group by dept having count(*) > 5',
      expected:
        'SELECT\n     dept\n    ,COUNT(*) AS cnt\nFROM emp\nGROUP BY dept\nHAVING COUNT(*) > 5',
    },
    {
      name: 'Single-item HAVING (inline)',
      input: 'select dept, count(*) from t group by dept having count(*) > 5',
      expected:
        'SELECT\n     dept\n    ,COUNT(*)\nFROM t\nGROUP BY dept\nHAVING COUNT(*) > 5',
    },
    {
      name: 'Multi-item HAVING (multiline)',
      input:
        'select dept, count(*) from t group by dept having count(*) > 5 and sum(x) < 100',
      expected:
        'SELECT\n     dept\n    ,COUNT(*)\nFROM t\nGROUP BY dept\nHAVING\n    COUNT(*) > 5\n    AND SUM(x) < 100',
    },
    {
      name: 'GROUPING SETS inline',
      input: 'select a, sum(x) from t group by grouping sets ((a), (b), ())',
      expected:
        'SELECT\n     a\n    ,SUM(x)\nFROM t\nGROUP BY GROUPING SETS ((a), (b), ())',
    },
    {
      name: 'ROLLUP inline',
      input: 'select a, b, sum(x) from t group by rollup(a, b)',
      expected:
        'SELECT\n     a\n    ,b\n    ,SUM(x)\nFROM t\nGROUP BY ROLLUP(a, b)',
    },
    {
      name: 'CUBE inline',
      input: 'select a, b, sum(x) from t group by cube(a, b)',
      expected:
        'SELECT\n     a\n    ,b\n    ,SUM(x)\nFROM t\nGROUP BY CUBE(a, b)',
    },
    {
      name: 'GROUP BY ALL',
      input: 'select col1, count(*) from table1 group by all',
      expected: 'SELECT\n     col1\n    ,COUNT(*)\nFROM table1\nGROUP BY ALL',
    },
    {
      name: 'GROUP BY ALL with WHERE',
      input: 'select col1, sum(col2) from t1 where col3 > 10 group by all',
      expected:
        'SELECT\n     col1\n    ,SUM(col2)\nFROM t1\nWHERE col3 > 10\nGROUP BY ALL',
    },
  ],
};

export const distributionTests: TestSuite = {
  name: 'CLUSTER BY / DISTRIBUTE BY / SORT BY',
  tests: [
    {
      name: 'CLUSTER BY',
      input: 'select a, b from t cluster by a',
      expected: 'SELECT\n     a\n    ,b\nFROM t CLUSTER BY a',
    },
    {
      name: 'CLUSTER BY single column stays inline',
      input: 'select * from t cluster by x',
      expected: 'SELECT * FROM t CLUSTER BY x',
    },
    {
      name: 'DISTRIBUTE BY SORT BY',
      input: 'select a, b from t distribute by a sort by b',
      expected: 'SELECT\n     a\n    ,b\nFROM t DISTRIBUTE BY a SORT BY b',
    },
    {
      name: 'DISTRIBUTE BY single column stays inline',
      input: 'select * from t distribute by x',
      expected: 'SELECT * FROM t DISTRIBUTE BY x',
    },
    {
      name: 'SORT BY single column stays inline',
      input: 'select * from t sort by x',
      expected: 'SELECT * FROM t SORT BY x',
    },
  ],
};
