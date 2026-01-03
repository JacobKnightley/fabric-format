/**
 * Expression Tests (CASE, operators, literals)
 * Note: Tests use multiple columns to avoid compact query mode
 */
import type { TestSuite } from '../framework.js';

export const caseExpressionTests: TestSuite = {
  name: 'CASE Expressions',
  tests: [
    {
      name: 'CASE WHEN (single branch inline)',
      input: "select case when a = 1 then 'yes' else 'no' end, b from t",
      expected:
        "SELECT\n     CASE WHEN a = 1 THEN 'yes' ELSE 'no' END\n    ,b\nFROM t",
    },
    {
      name: 'CASE with single WHEN (inline)',
      input: 'select case when x = 1 then "a" else "b" end, y from t',
      expected:
        'SELECT\n     CASE WHEN x = 1 THEN "a" ELSE "b" END\n    ,y\nFROM t',
    },
    {
      name: 'CASE with multiple WHEN (multiline)',
      input:
        'select case when status = 1 then "active" when status = 2 then "pending" when status = 3 then "closed" else "unknown" end, id from t',
      expected:
        'SELECT\n     CASE\n        WHEN status = 1 THEN "active"\n        WHEN status = 2 THEN "pending"\n        WHEN status = 3 THEN "closed"\n        ELSE "unknown"\n     END\n    ,id\nFROM t',
    },
    {
      name: 'CASE without ELSE',
      input:
        'select case when x = 1 then "a" when x = 2 then "b" end, y from t',
      expected:
        'SELECT\n     CASE\n        WHEN x = 1 THEN "a"\n        WHEN x = 2 THEN "b"\n     END\n    ,y\nFROM t',
    },

    // Nested CASE: inner CASE inside THEN stays inline when it's single-WHEN
    // The outer CASE follows normal multiline rules (>1 WHEN triggers multiline)
    {
      name: 'Nested single-WHEN CASE expressions stay inline',
      input:
        "select case when a = 1 then case when b = 2 then 'x' else 'y' end else 'z' end, c from t",
      expected:
        "SELECT\n     CASE WHEN a = 1 THEN CASE WHEN b = 2 THEN 'x' ELSE 'y' END ELSE 'z' END\n    ,c\nFROM t",
    },

    // Simple CASE expression (CASE value WHEN ... THEN ...)
    {
      name: 'Simple CASE expression value should be on same line as CASE',
      input: 'select case x when 1 then a when 2 then b else c end from t',
      expected:
        'SELECT\n     CASE x\n        WHEN 1 THEN a\n        WHEN 2 THEN b\n        ELSE c\n     END\nFROM t',
    },
  ],
};

export const literalTests: TestSuite = {
  name: 'Literals',
  tests: [
    {
      name: 'String literals preserved exactly',
      input: "select a, b from t where name = 'John Doe' and status = 1",
      expected:
        "SELECT\n     a\n    ,b\nFROM t\nWHERE\n    name = 'John Doe'\n    AND status = 1",
    },
    {
      name: 'DATE literal',
      input: "select date '2024-01-01', x from t",
      expected: "SELECT\n     DATE '2024-01-01'\n    ,x\nFROM t",
    },
    {
      name: 'TIMESTAMP literal',
      input: "select timestamp '2024-01-01 12:00:00', x from t",
      expected: "SELECT\n     TIMESTAMP '2024-01-01 12:00:00'\n    ,x\nFROM t",
    },
    // Decimal ending with dot
    {
      name: 'Decimal ending with dot should have space before FROM',
      input: 'select 1. from dual',
      expected: 'SELECT 1. FROM dual',
    },
  ],
};

export const unaryOperatorTests: TestSuite = {
  name: 'Unary Operators',
  tests: [
    {
      name: 'Unary minus (no space)',
      input: 'select -x, y from t',
      expected: 'SELECT\n     -x\n    ,y\nFROM t',
    },
    {
      name: 'Unary plus (no space)',
      input: 'select +y, x from t',
      expected: 'SELECT\n     +y\n    ,x\nFROM t',
    },
    {
      name: 'Multiple unary operators',
      input: 'select -x, +y from t',
      expected: 'SELECT\n     -x\n    ,+y\nFROM t',
    },
    {
      name: 'Unary minus in expression',
      input: 'select a + -b, c from t',
      expected: 'SELECT\n     a + -b\n    ,c\nFROM t',
    },
    // Bitwise NOT
    {
      name: 'Bitwise NOT should not have space after tilde',
      input: 'select ~a from t',
      expected: 'SELECT ~a FROM t',
    },
    // Double negative (must have space to avoid being parsed as comment)
    {
      name: 'Double negative with space formats correctly',
      input: 'select - -5 from t',
      expected: 'SELECT - -5 FROM t',
    },
  ],
};

export const nestedFunctionTests: TestSuite = {
  name: 'Nested Function Formatting',
  tests: [
    {
      name: 'Single-arg nested functions stay inline',
      input: 'select upper(lower(trim(name))), id from t',
      expected: 'SELECT\n     UPPER(LOWER(TRIM(name)))\n    ,id\nFROM t',
    },
    {
      name: 'Multi-arg function without nested calls stays inline',
      input: 'select coalesce(a, b, c), d from t',
      expected: 'SELECT\n     COALESCE(a, b, c)\n    ,d\nFROM t',
    },
    {
      name: 'Short multi-arg with nested calls stays inline (under 140 chars)',
      input: 'select coalesce(upper(a), lower(b)), c from t',
      expected: 'SELECT\n     COALESCE(UPPER(a), LOWER(b))\n    ,c\nFROM t',
    },
    {
      name: 'Long multi-arg function expands when line exceeds 140 chars',
      input:
        'select coalesce(upper(very_long_column_name_one), lower(very_long_column_name_two), trim(another_very_long_column_name_three), concat(col_four, col_five)), x from t',
      expected:
        'SELECT\n     COALESCE(\n         UPPER(very_long_column_name_one)\n        ,LOWER(very_long_column_name_two)\n        ,TRIM(another_very_long_column_name_three)\n        ,CONCAT(col_four, col_five)\n    )\n    ,x\nFROM t',
    },
    {
      name: 'Deeply nested functions expand based on line position',
      input:
        'select conv(right(md5(upper(concat(coalesce(VeryLongTable.VeryLongColumnName, AnotherLongAlias.AnotherLongColumn), SomeOtherReallyLongColumnName))), 16), 16, -10), x from t',
      expected:
        'SELECT\n     CONV(\n         RIGHT(\n             MD5(UPPER(CONCAT(\n                 COALESCE(VeryLongTable.VeryLongColumnName, AnotherLongAlias.AnotherLongColumn)\n                ,SomeOtherReallyLongColumnName\n            )))\n            ,16\n        )\n        ,16\n        ,-10\n    )\n    ,x\nFROM t',
    },
    {
      // With normalized span calculation, IF() properly expands since its content is ~120 chars
      name: 'Chained function opens with proper closing paren alignment',
      input:
        "select cast(conv(right(md5(if(lower(some_environment_column) in ('dxt', 'daily', 'msit', 'prod'), lower(some_environment_column), 'n/a')), 16), 16, -10) as bigint), x from t",
      expected:
        "SELECT\n     CAST(\n         CONV(RIGHT(\n                 MD5(IF(\n                     LOWER(some_environment_column) IN ('dxt', 'daily', 'msit', 'prod')\n                    ,LOWER(some_environment_column)\n                    ,'n/a'\n                ))\n                ,16\n            )\n            ,16\n            ,-10\n        ) AS BIGINT\n    )\n    ,x\nFROM t",
    },
    {
      // With normalized span calculation, IF() properly expands since its content is ~120 chars
      name: 'Chained opens work with non-CAST outer function (COALESCE)',
      input:
        "select coalesce(conv(right(md5(if(lower(some_environment_column) in ('dxt', 'daily', 'msit', 'prod'), lower(some_environment_column), 'n/a')), 16), 16, -10), some_really_long_default_value_here) as result, x from t",
      expected:
        "SELECT\n     COALESCE(\n         CONV(RIGHT(\n                 MD5(IF(\n                     LOWER(some_environment_column) IN ('dxt', 'daily', 'msit', 'prod')\n                    ,LOWER(some_environment_column)\n                    ,'n/a'\n                ))\n                ,16\n            )\n            ,16\n            ,-10\n        )\n        ,some_really_long_default_value_here\n    ) AS result\n    ,x\nFROM t",
    },
    {
      name: 'Short NVL2 stays inline (under 140 chars)',
      input: 'select nvl2(flag, upper(yes_val), lower(no_val)), x from t',
      expected:
        'SELECT\n     NVL2(flag, UPPER(yes_val), LOWER(no_val))\n    ,x\nFROM t',
    },
  ],
};

export const arrayAccessTests: TestSuite = {
  name: 'Array/Map Access',
  tests: [
    {
      name: 'Array access with single element',
      input: 'select arr[0], b from t',
      expected: 'SELECT\n     arr[0]\n    ,b\nFROM t',
    },
    {
      name: 'Array access with multiple elements',
      input: 'select arr[0], arr[1], arr[2] from t',
      expected: 'SELECT\n     arr[0]\n    ,arr[1]\n    ,arr[2]\nFROM t',
    },
    {
      name: 'Map access with string key',
      input: 'select map["key"], b from t',
      expected: 'SELECT\n     map["key"]\n    ,b\nFROM t',
    },
    {
      name: 'Array access with expression',
      input: 'select arr[i + 1], b from t',
      expected: 'SELECT\n     arr[i + 1]\n    ,b\nFROM t',
    },
  ],
};

export const lambdaTests: TestSuite = {
  name: 'Lambda Expressions',
  tests: [
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
    {
      name: 'AGGREGATE with 4 args (with finish)',
      input:
        'select aggregate(arr, 0, (acc, x) -> acc + x, acc -> acc * 10) from t',
      expected:
        'SELECT AGGREGATE(arr, 0, (acc, x) -> acc + x, acc -> acc * 10) FROM t',
    },
  ],
};
