/**
 * Casing and Identifier Tests
 */
import type { TestSuite } from '../framework.js';

export const casingTests: TestSuite = {
  name: 'Casing Rules',
  tests: [
    {
      name: 'Keywords as column names after dot',
      input: 'select a.key, a.order, a.value from t',
      expected: 'SELECT\n     a.key\n    ,a.order\n    ,a.value\nFROM t',
    },
    {
      name: 'Context-sensitive keyword (ORDER as column and keyword)',
      input: 'select a.key, a.order, a.value from t order by a.order',
      expected:
        'SELECT\n     a.key\n    ,a.order\n    ,a.value\nFROM t\nORDER BY a.order',
    },
    {
      name: 'Preserve mixed case identifiers',
      input: 'select UserId, UserName from Users where IsActive = true',
      expected:
        'SELECT\n     UserId\n    ,UserName\nFROM Users\nWHERE IsActive = TRUE',
    },
    {
      name: 'Built-in functions uppercase',
      input: 'select count(*), sum(amount), avg(price) from orders',
      expected:
        'SELECT\n     COUNT(*)\n    ,SUM(amount)\n    ,AVG(price)\nFROM orders',
    },
    {
      name: 'Window functions uppercase',
      input:
        'select a, row_number() over (partition by b order by c) as rn from t',
      expected:
        'SELECT\n     a\n    ,ROW_NUMBER() OVER (PARTITION BY b ORDER BY c) AS rn\nFROM t',
    },
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
    {
      name: 'Nested functions',
      input: 'select upper(lower(trim(x))), y from t',
      expected: 'SELECT\n     UPPER(LOWER(TRIM(x)))\n    ,y\nFROM t',
    },
    {
      name: 'COALESCE',
      input: 'select coalesce(a, b, c), d from t',
      expected: 'SELECT\n     COALESCE(a, b, c)\n    ,d\nFROM t',
    },
  ],
};

export const aliasTests: TestSuite = {
  name: 'Alias Handling',
  tests: [
    {
      name: 'Column alias gets AS keyword',
      input: 'select count(*) cnt, x from t',
      expected: 'SELECT\n     COUNT(*) AS cnt\n    ,x\nFROM t',
    },
    {
      name: 'Existing AS preserved',
      input: 'select count(*) as cnt, x from t',
      expected: 'SELECT\n     COUNT(*) AS cnt\n    ,x\nFROM t',
    },
    {
      name: 'Multiple aliases',
      input: 'select a x, b y, count(*) cnt from t',
      expected:
        'SELECT\n     a AS x\n    ,b AS y\n    ,COUNT(*) AS cnt\nFROM t',
    },
    // Table alias - AS should be removed
    {
      name: 'Table alias AS is removed',
      input: 'select * from users as u',
      expected: 'SELECT * FROM users u',
    },
    {
      name: 'Table alias without AS preserved',
      input: 'select * from users u',
      expected: 'SELECT * FROM users u',
    },
    {
      name: 'Subquery alias AS is removed',
      input: 'select * from (select 1) as sub',
      expected: 'SELECT * FROM (SELECT 1) sub',
    },
    {
      name: 'JOIN table alias AS is removed',
      input: 'select * from t1 as a join t2 as b on a.id = b.id',
      expected: 'SELECT *\nFROM t1 a\nJOIN t2 b\n    ON a.id = b.id',
    },
  ],
};

export const builtinFunctionCasingTests: TestSuite = {
  name: 'Built-in Function Casing',
  tests: [
    // Map/Collection functions
    {
      name: 'MAP_KEYS function',
      input: 'select map_keys(m) from t',
      expected: 'SELECT MAP_KEYS(m) FROM t',
    },
    {
      name: 'FLATTEN function',
      input: 'select flatten(arr) from t',
      expected: 'SELECT FLATTEN(arr) FROM t',
    },
    // JSON functions
    {
      name: 'JSON_OBJECT_KEYS function',
      input: 'select json_object_keys(j) from t',
      expected: 'SELECT JSON_OBJECT_KEYS(j) FROM t',
    },
    // Conditional functions
    {
      name: 'IF function',
      input: 'select if(x > 0, 1, 0) from t',
      expected: 'SELECT IF(x > 0, 1, 0) FROM t',
    },
    // Aggregate functions
    {
      name: 'STRING_AGG function',
      input: "select string_agg(x, ',') from t",
      expected: "SELECT STRING_AGG(x, ',') FROM t",
    },
    // Timezone conversion functions
    {
      name: 'FROM_UTC_TIMESTAMP function',
      input: "select from_utc_timestamp(x, 'UTC') from t",
      expected: "SELECT FROM_UTC_TIMESTAMP(x, 'UTC') FROM t",
    },
    {
      name: 'TO_UTC_TIMESTAMP function',
      input: "select to_utc_timestamp(x, 'America/New_York') from t",
      expected: "SELECT TO_UTC_TIMESTAMP(x, 'America/New_York') FROM t",
    },
    // Note: EXTRACT(DAYOFWEEK FROM x) is not valid Spark SQL.
    // Use the DAYOFWEEK() function instead: SELECT DAYOFWEEK(x) FROM t
    {
      name: 'EXTRACT with YEAR',
      input: 'select extract(year from x) from t',
      expected: 'SELECT EXTRACT(YEAR FROM x) FROM t',
    },
  ],
};
