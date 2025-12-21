/**
 * Tests for semicolon handling (statement separator)
 */
import { TestSuite } from './framework.js';

export const semicolonTests: TestSuite = {
    name: 'Semicolon Statement Separator',
    tests: [
        {
            name: 'Two simple statements with semicolon',
            input: 'select * from table1; select * from table2',
            expected: 'SELECT *\nFROM table1;\n\nSELECT *\nFROM table2'
        },
        {
            name: 'Three statements with semicolons',
            input: 'select * from t1; select * from t2; select * from t3',
            expected: 'SELECT *\nFROM t1;\n\nSELECT *\nFROM t2;\n\nSELECT *\nFROM t3'
        },
        {
            name: 'Complex statements with semicolons',
            input: 'select col1, col2 from t1 where x = 1; select col3 from t2',
            expected: 'SELECT\n     col1\n    ,col2\nFROM t1\nWHERE x = 1;\n\nSELECT col3\nFROM t2'
        },
        {
            name: 'Statement with trailing semicolon',
            input: 'select * from table1;',
            expected: 'SELECT *\nFROM table1;'
        },
        {
            name: 'Multiple trailing semicolons (empty statements)',
            input: 'select * from table1;;',
            expected: 'SELECT *\nFROM table1;'
        },
        {
            name: 'Semicolon with whitespace',
            input: 'select * from t1 ; select * from t2',
            expected: 'SELECT *\nFROM t1;\n\nSELECT *\nFROM t2'
        },
        {
            name: 'DML statements with semicolons',
            input: 'insert into t1 values (1); update t2 set x = 1; delete from t3',
            expected: 'INSERT INTO t1 VALUES\n(1);\n\nUPDATE t2\nSET x = 1;\n\nDELETE FROM t3'
        },
        {
            name: 'Semicolon should not affect string literals',
            input: "select 'a;b' from t1",
            expected: "SELECT 'a;b'\nFROM t1"
        }
    ]
};
