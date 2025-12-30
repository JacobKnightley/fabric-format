/**
 * Table Operator Tests
 * 
 * Tests for table-transforming operators: PIVOT, UNPIVOT, LATERAL VIEW.
 */
import { TestSuite } from './framework.js';

export const pivotTests: TestSuite = {
    name: 'PIVOT',
    tests: [
        {
            name: 'PIVOT basic syntax',
            input: 'select * from t pivot (sum(val) for col in (1, 2, 3))',
            expected: 'SELECT * FROM t PIVOT (SUM(val) FOR col IN (1, 2, 3))',
        },
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

export const unpivotTests: TestSuite = {
    name: 'UNPIVOT',
    tests: [
        {
            name: 'UNPIVOT AS should be uppercase',
            input: 'select * from t unpivot (val for col in (a as col_a, b as col_b))',
            expected: 'SELECT * FROM t UNPIVOT (val FOR col IN (a AS col_a, b AS col_b))',
        },
    ],
};

export const lateralViewTests: TestSuite = {
    name: 'LATERAL VIEW',
    tests: [
        {
            name: 'LATERAL VIEW EXPLODE',
            input: 'select a, b from t lateral view explode(arr) AS item',
            expected: 'SELECT\n     a\n    ,b\nFROM t LATERAL VIEW EXPLODE(arr) AS item',
        },
        {
            name: 'LATERAL VIEW with explicit table and column alias',
            input: 'select * from t lateral view explode(arr) t_alias as col_alias',
            expected: 'SELECT * FROM t LATERAL VIEW EXPLODE(arr) t_alias AS col_alias',
        },
        {
            name: 'POSEXPLODE AS with two columns - no space before comma',
            input: 'select * from t lateral view posexplode(arr) as pos, val',
            expected: 'SELECT * FROM t LATERAL VIEW POSEXPLODE(arr) AS pos, val',
        },
        {
            name: 'Multiple LATERAL VIEWs',
            input: 'select * from t lateral view explode(arr1) as a lateral view explode(arr2) as b',
            expected: 'SELECT * FROM t LATERAL VIEW EXPLODE(arr1) AS a LATERAL VIEW EXPLODE(arr2) AS b',
        },
    ],
};

export const stackTests: TestSuite = {
    name: 'STACK Function',
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
