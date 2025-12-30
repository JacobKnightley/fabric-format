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
            expected: 'SELECT * FROM t PIVOT (SUM(val) FOR col IN (1, 2, 3))',
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
            expected: 'SELECT * FROM t TABLESAMPLE (10 PERCENT)',
        },
    ],
};

export const windowFunctionTests: TestSuite = {
    name: 'Window Function Formatting',
    tests: [
        {
            name: 'Short window spec stays inline',
            input: 'select row_number() over (partition by a order by b) from t',
            expected: 'SELECT ROW_NUMBER() OVER (PARTITION BY a ORDER BY b) FROM t',
        },
        {
            name: 'Window stays inline when line under 140 chars',
            input: 'select row_number() over (partition by very_long_column_name_one, very_long_column_name_two order by another_long_name) from t',
            expected: 'SELECT ROW_NUMBER() OVER (PARTITION BY very_long_column_name_one, very_long_column_name_two ORDER BY another_long_name) FROM t',
        },
        {
            name: 'Window expands when full line exceeds 140 chars',
            input: 'select row_number() over (partition by extremely_long_column_name_one, extremely_long_column_name_two, extremely_long_column_name_three order by yet_another_extremely_long_sort_column_name) from t',
            expected: 'SELECT ROW_NUMBER() OVER (\n        PARTITION BY extremely_long_column_name_one, extremely_long_column_name_two, extremely_long_column_name_three\n        ORDER BY yet_another_extremely_long_sort_column_name\n    )\nFROM t',
        },
        {
            name: 'Window with frame clause stays inline under 140',
            input: 'select sum(amount) over (partition by customer_id order by transaction_date rows between unbounded preceding and current row) from t',
            expected: 'SELECT SUM(amount) OVER (PARTITION BY customer_id ORDER BY transaction_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) FROM t',
        },
        {
            name: 'Window in CTE stays inline when under 140',
            input: 'with cte as (select lead(x) over (partition by very_long_name_a, very_long_name_b, very_long_name_c order by sort_col) from t) select * from cte',
            expected: 'WITH cte AS (\n    SELECT LEAD(x) OVER (PARTITION BY very_long_name_a, very_long_name_b, very_long_name_c ORDER BY sort_col)\n    FROM t\n) SELECT * FROM cte',
        },
    ],
};

export const lambdaTests: TestSuite = {
    name: 'Lambda Expressions',
    tests: [
        // Lambda expressions in single-item SELECT should stay inline
        // (commas inside function calls don't count as multiple select items)
        {
            name: 'Lambda expression (TRANSFORM)',
            input: 'select transform(arr, x -> x + 1) from t',
            expected: 'SELECT TRANSFORM(arr, x -> x + 1) FROM t',
        },
        {
            name: 'Lambda expression (FILTER)',
            input: 'select filter(arr, x -> x > 0) from t',
            expected: 'SELECT FILTER(arr, x -> x > 0) FROM t',
        },
        {
            name: 'Lambda expression (AGGREGATE)',
            input: 'select aggregate(arr, 0, (acc, x) -> acc + x) from t',
            expected: 'SELECT AGGREGATE(arr, 0, (acc, x) -> acc + x) FROM t',
        },
        
        // 4-argument AGGREGATE with finish lambda
        {
            name: 'AGGREGATE with 4 args (with finish)',
            input: 'select aggregate(arr, 0, (acc, x) -> acc + x, acc -> acc * 10) from t',
            expected: 'SELECT AGGREGATE(arr, 0, (acc, x) -> acc + x, acc -> acc * 10) FROM t',
        },
    ],
};

// === PIVOT FORMATTING ===
export const pivotFormattingTests: TestSuite = {
    name: 'PIVOT Formatting',
    tests: [
        {
            name: 'PIVOT with single aggregate',
            input: 'select * from t pivot (sum(x) for col in (\'a\', \'b\'))',
            expected: 'SELECT * FROM t PIVOT (SUM(x) FOR col IN (\'a\', \'b\'))',
        },
        {
            name: 'PIVOT with multiple aggregates should not split',
            input: 'select * from t pivot (sum(x) as s, avg(y) as a for col in (\'a\', \'b\'))',
            expected: 'SELECT * FROM t PIVOT (SUM(x) AS s, AVG(y) AS a FOR col IN (\'a\', \'b\'))',
        },
        {
            name: 'PIVOT expands when line exceeds 140 chars',
            // Query exceeds 140 chars, so outer query expands (FROM on own line)
            // PIVOT also expands due to multiple aggregates
            input: 'select * from sales_data pivot (sum(revenue) as total_rev, avg(revenue) as avg_rev, count(*) as cnt for quarter_name in (Q1_2023, Q2_2023, Q3_2023, Q4_2023))',
            expected: 'SELECT *\nFROM sales_data PIVOT (\n     SUM(revenue) AS total_rev\n    ,AVG(revenue) AS avg_rev\n    ,COUNT(*) AS cnt\n    FOR quarter_name IN (Q1_2023, Q2_2023, Q3_2023, Q4_2023)\n)',
        },
        {
            name: 'PIVOT IN list wraps when exceeding line width',
            input: 'select * from t pivot (sum(val) for category in (category_one, category_two, category_three, category_four, category_five, category_six, category_seven, category_eight, category_nine))',
            expected: 'SELECT *\nFROM t PIVOT (\n     SUM(val)\n    FOR category IN (category_one, category_two, category_three, category_four, category_five, category_six, category_seven, category_eight,\n                     category_nine)\n)',
        },
    ],
};

// === STACK FUNCTION FORMATTING ===
export const stackFormattingTests: TestSuite = {
    name: 'STACK Function Formatting',
    tests: [
        {
            name: 'Short STACK stays inline',
            input: 'select stack(2, \'a\', 1, \'b\', 2) from t',
            expected: "SELECT STACK(2, 'a', 1, 'b', 2) FROM t",
        },
        {
            name: 'Long STACK expands by pairs',
            input: 'select stack(5, \'very_long_alias_name_one\', col1, \'very_long_alias_name_two\', col2, \'very_long_alias_name_three\', col3, \'very_long_alias_name_four\', col4, \'very_long_alias_name_five\', col5) from t',
            expected: 'SELECT STACK(\n         5\n        ,\'very_long_alias_name_one\', col1\n        ,\'very_long_alias_name_two\', col2\n        ,\'very_long_alias_name_three\', col3\n        ,\'very_long_alias_name_four\', col4\n        ,\'very_long_alias_name_five\', col5\n    )\nFROM t',
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
            expected: 'SELECT * FROM t UNPIVOT (val FOR col IN (a AS col_a, b AS col_b))',
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
