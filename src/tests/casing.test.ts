/**
 * Casing and Identifier Tests
 */
import { TestSuite } from './framework.js';

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
            expected: 'SELECT\n     a.key\n    ,a.order\n    ,a.value\nFROM t\nORDER BY a.order',
        },
        {
            name: 'Preserve mixed case identifiers',
            input: 'select UserId, UserName from Users where IsActive = true',
            expected: 'SELECT\n     UserId\n    ,UserName\nFROM Users\nWHERE IsActive = TRUE',
        },
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
            input: 'select upper(lower(trim(x))) from t',
            expected: 'SELECT UPPER(LOWER(TRIM(x)))\nFROM t',
        },
        {
            name: 'COALESCE',
            input: 'select coalesce(a, b, c) from t',
            expected: 'SELECT COALESCE(a, b, c)\nFROM t',
        },
    ],
};

export const aliasTests: TestSuite = {
    name: 'Alias Handling',
    tests: [
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
    ],
};
