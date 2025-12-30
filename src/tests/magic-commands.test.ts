/**
 * Tests for magic command handling (Databricks/Fabric notebooks)
 */
import { TestSuite } from './framework.js';

export const magicCommandsTests: TestSuite = {
    name: 'Magic Commands',
    tests: [
        {
            name: '%%sql magic command on first line',
            input: '%%sql\nselect * from table1',
            expected: '%%sql\nSELECT * FROM table1'
        },
        {
            name: '%sql magic command on first line',
            input: '%sql\nselect * from table1',
            expected: '%sql\nSELECT * FROM table1'
        },
        {
            name: '%%sql with complex query',
            input: '%%sql\nselect col1, col2 from table1 where x = 1',
            expected: '%%sql\nSELECT\n     col1\n    ,col2\nFROM table1\nWHERE x = 1'
        },
        {
            name: '%sql with JOIN',
            input: '%sql\nselect t1.id from t1 join t2 on t1.id = t2.id',
            expected: '%sql\nSELECT t1.id\nFROM t1\nJOIN t2\n    ON t1.id = t2.id'
        },
        {
            name: 'No magic command - should not affect normal SQL',
            input: 'select * from table1',
            expected: 'SELECT * FROM table1'
        },
        {
            name: 'Magic command with leading whitespace should be ignored',
            input: '  %%sql\nselect * from table1',
            expected: '% % SQL SELECT * FROM table1'
        }
    ]
};
