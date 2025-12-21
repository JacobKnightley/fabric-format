/**
 * Expression Tests (CASE, operators, literals)
 */
import { TestSuite } from './framework.js';

export const caseExpressionTests: TestSuite = {
    name: 'CASE Expressions',
    tests: [
        {
            name: 'CASE WHEN (single branch inline)',
            input: 'select case when a = 1 then \'yes\' else \'no\' end from t',
            expected: 'SELECT CASE WHEN a = 1 THEN \'yes\' ELSE \'no\' END\nFROM t',
        },
        {
            name: 'CASE with single WHEN (inline)',
            input: 'select case when x = 1 then "a" else "b" end from t',
            expected: 'SELECT CASE WHEN x = 1 THEN "A" ELSE "B" END\nFROM t',
        },
        {
            name: 'CASE with multiple WHEN (multiline)',
            input: 'select case when status = 1 then "active" when status = 2 then "pending" when status = 3 then "closed" else "unknown" end from t',
            expected: 'SELECT\n     CASE\n        WHEN status = 1 THEN "ACTIVE"\n        WHEN status = 2 THEN "PENDING"\n        WHEN status = 3 THEN "CLOSED"\n        ELSE "UNKNOWN"\n     END\nFROM t',
        },
        {
            name: 'CASE without ELSE',
            input: 'select case when x = 1 then "a" when x = 2 then "b" end from t',
            expected: 'SELECT\n     CASE\n        WHEN x = 1 THEN "A"\n        WHEN x = 2 THEN "B"\n     END\nFROM t',
        },
    ],
};

export const castTests: TestSuite = {
    name: 'CAST and Type Conversion',
    tests: [
        {
            name: 'Double-colon cast (no spaces)',
            input: 'select x::string from t',
            expected: 'SELECT x::STRING\nFROM t',
        },
        {
            name: 'CAST (no space after name)',
            input: 'select cast(x as string) from t',
            expected: 'SELECT CAST(x AS STRING)\nFROM t',
        },
    ],
};

export const literalTests: TestSuite = {
    name: 'Literals',
    tests: [
        {
            name: 'String literals preserved exactly',
            input: 'select * from t where name = \'John Doe\'',
            expected: 'SELECT *\nFROM t\nWHERE name = \'John Doe\'',
        },
        {
            name: 'DATE literal',
            input: "select date '2024-01-01' from t",
            expected: "SELECT DATE '2024-01-01'\nFROM t",
        },
        {
            name: 'TIMESTAMP literal',
            input: "select timestamp '2024-01-01 12:00:00' from t",
            expected: "SELECT TIMESTAMP '2024-01-01 12:00:00'\nFROM t",
        },
    ],
};

export const unaryOperatorTests: TestSuite = {
    name: 'Unary Operators',
    tests: [
        {
            name: 'Unary minus (no space)',
            input: 'select -x from t',
            expected: 'SELECT -x\nFROM t',
        },
        {
            name: 'Unary plus (no space)',
            input: 'select +y from t',
            expected: 'SELECT +y\nFROM t',
        },
        {
            name: 'Multiple unary operators',
            input: 'select -x, +y from t',
            expected: 'SELECT\n     -x\n    ,+y\nFROM t',
        },
        {
            name: 'Unary minus in expression',
            input: 'select a + -b from t',
            expected: 'SELECT a + -b\nFROM t',
        },
    ],
};

export const arrayAccessTests: TestSuite = {
    name: 'Array/Map Access',
    tests: [
        {
            name: 'Array access with single element',
            input: 'select arr[0] from t',
            expected: 'SELECT arr[0]\nFROM t',
        },
        {
            name: 'Array access with multiple elements',
            input: 'select arr[0], arr[1], arr[2] from t',
            expected: 'SELECT\n     arr[0]\n    ,arr[1]\n    ,arr[2]\nFROM t',
        },
        {
            name: 'Map access with string key',
            input: 'select map["key"] from t',
            expected: 'SELECT map["KEY"]\nFROM t',
        },
        {
            name: 'Array access with expression',
            input: 'select arr[i + 1] from t',
            expected: 'SELECT arr[i + 1]\nFROM t',
        },
    ],
};
