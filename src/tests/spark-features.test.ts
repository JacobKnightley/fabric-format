/**
 * Spark-Specific Feature Tests
 */
import { TestSuite } from './framework.js';

export const sparkFeaturesTests: TestSuite = {
    name: 'Spark-Specific Features',
    tests: [
        {
            name: 'LATERAL VIEW EXPLODE',
            input: 'select a, b from t lateral view explode(arr) AS item',
            expected: 'SELECT\n     a\n    ,b\nFROM t LATERAL VIEW EXPLODE(arr) AS item',
        },
        {
            name: 'WINDOW clause (named window)',
            input: 'select a, sum(b) over w from t window w as (partition by c order by d)',
            expected: 'SELECT\n     a\n    ,SUM(b) OVER w\nFROM t WINDOW w AS (PARTITION BY c ORDER BY d)',
        },
        {
            name: 'PIVOT',
            input: 'select * from t pivot (sum(val) for col in (1, 2, 3))',
            expected: 'SELECT *\nFROM t PIVOT (SUM(val) FOR col IN (1, 2, 3))',
        },
        {
            name: 'CLUSTER BY',
            input: 'select a, b from t cluster by a',
            expected: 'SELECT\n     a\n    ,b\nFROM t CLUSTER BY a',
        },
        {
            name: 'DISTRIBUTE BY SORT BY',
            input: 'select a, b from t distribute by a sort by b',
            expected: 'SELECT\n     a\n    ,b\nFROM t DISTRIBUTE BY a SORT BY b',
        },
        {
            name: 'TABLESAMPLE',
            input: 'select * from t tablesample (10 percent)',
            expected: 'SELECT *\nFROM t TABLESAMPLE (10 PERCENT)',
        },
    ],
};

export const lambdaTests: TestSuite = {
    name: 'Lambda Expressions',
    tests: [
        {
            name: 'Lambda expression (TRANSFORM)',
            input: 'select transform(arr, x -> x + 1) from t',
            expected: 'SELECT TRANSFORM(arr, x -> x + 1)\nFROM t',
        },
        {
            name: 'Lambda expression (FILTER)',
            input: 'select filter(arr, x -> x > 0) from t',
            expected: 'SELECT FILTER(arr, x -> x > 0)\nFROM t',
        },
        {
            name: 'Lambda expression (AGGREGATE)',
            input: 'select aggregate(arr, 0, (acc, x) -> acc + x) from t',
            expected: 'SELECT AGGREGATE(arr, 0, (acc, x) -> acc + x)\nFROM t',
        },
        
        // === BUG: AGGREGATE FUNCTION WITH 4 ARGS ===
        // 4-argument AGGREGATE with finish lambda should not split
        {
            name: 'AGGREGATE with 4 args (with finish)',
            input: 'select aggregate(arr, 0, (acc, x) -> acc + x, acc -> acc * 10) from t',
            expected: 'SELECT AGGREGATE(arr, 0, (acc, x) -> acc + x, acc -> acc * 10)\nFROM t',
        },
    ],
};

// === BUG: PIVOT FORMATTING ===
export const pivotFormattingTests: TestSuite = {
    name: 'PIVOT Formatting',
    tests: [
        {
            name: 'PIVOT with single aggregate',
            input: 'select * from t pivot (sum(x) for col in (\'a\', \'b\'))',
            expected: 'SELECT *\nFROM t PIVOT (SUM(x) FOR col IN (\'a\', \'b\'))',
        },
        {
            name: 'PIVOT with multiple aggregates should not split',
            input: 'select * from t pivot (sum(x) as s, avg(y) as a for col in (\'a\', \'b\'))',
            expected: 'SELECT *\nFROM t PIVOT (SUM(x) AS s, AVG(y) AS a FOR col IN (\'a\', \'b\'))',
        },
    ],
};

// === BUG: UNPIVOT AS CASING ===
export const unpivotFormattingTests: TestSuite = {
    name: 'UNPIVOT Formatting',
    tests: [
        {
            name: 'UNPIVOT AS should be uppercase',
            input: 'select * from t unpivot (val for col in (a as col_a, b as col_b))',
            expected: 'SELECT *\nFROM t UNPIVOT (val FOR col IN (a AS col_a, b AS col_b))',
        },
    ],
};

// === BUG: LATERAL VIEW COMMA SPACING ===
export const lateralViewFormattingTests: TestSuite = {
    name: 'LATERAL VIEW Formatting',
    tests: [
        {
            name: 'POSEXPLODE AS with two columns - no space before comma',
            input: 'select idx, item from t lateral view posexplode(arr) exp as idx, item',
            expected: 'SELECT\n     idx\n    ,item\nFROM t LATERAL VIEW POSEXPLODE(arr) exp AS idx, item',
        },
        {
            name: 'Multiple LATERAL VIEWs',
            input: 'select a, b from t lateral view explode(arr1) e1 as a lateral view explode(arr2) e2 as b',
            expected: 'SELECT\n     a\n    ,b\nFROM t LATERAL VIEW EXPLODE(arr1) e1 AS a LATERAL VIEW EXPLODE(arr2) e2 AS b',
        },
    ],
};
