/**
 * Type Cast Tests
 * 
 * Tests for type conversion syntax: CAST, TRY_CAST, :: operator,
 * and complex type syntax (ARRAY, MAP, STRUCT).
 */
import { TestSuite } from './framework.js';

export const castTests: TestSuite = {
    name: 'CAST Function',
    tests: [
        {
            name: 'CAST (no space after name)',
            input: 'select cast(x as string), y from t',
            expected: 'SELECT\n     CAST(x AS STRING)\n    ,y\nFROM t',
        },
        {
            name: 'CAST single column stays inline',
            input: 'select cast(x as string) from t',
            expected: 'SELECT CAST(x AS STRING) FROM t',
        },
        {
            name: 'TRY_CAST function',
            input: 'select try_cast(x as int) from t',
            expected: 'SELECT TRY_CAST(x AS INT) FROM t',
        },
    ],
};

export const doubleColonCastTests: TestSuite = {
    name: 'Double-Colon Cast (::)',
    tests: [
        {
            name: 'Double-colon cast (no spaces)',
            input: 'select x::string, y from t',
            expected: 'SELECT\n     x::STRING\n    ,y\nFROM t',
        },
        {
            name: 'Double-colon cast to ARRAY type',
            input: 'select x::array<int> from t',
            expected: 'SELECT x::ARRAY<INT> FROM t',
        },
        {
            name: 'Double-colon cast to MAP type',
            input: 'select x::map<string, int> from t',
            expected: 'SELECT x::MAP<STRING, INT> FROM t',
        },
        {
            name: 'Double-colon cast to STRUCT type',
            input: 'select x::struct<a:int, b:string> from t',
            expected: 'SELECT x::STRUCT<a:INT, b:STRING> FROM t',
        },
    ],
};
