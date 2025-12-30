/**
 * DML Statement Tests
 */
import { TestSuite } from './framework.js';

export const dmlTests: TestSuite = {
    name: 'DML Statements',
    tests: [
        {
            name: 'INSERT INTO SELECT',
            input: 'insert into target select id, name from source where active = true',
            expected: 'INSERT INTO target\nSELECT\n     id\n    ,name\nFROM source\nWHERE active = TRUE',
        },
        {
            name: 'INSERT VALUES comma-first',
            input: "insert into t values (1, 'a'), (2, 'b')",
            expected: "INSERT INTO t VALUES\n(1, 'a')\n,(2, 'b')",
        },
        {
            name: 'VALUES without SELECT (simple inline)',
            input: 'values 1, 2, 3',
            expected: 'VALUES 1, 2, 3',
        },
        {
            name: 'Single-item UPDATE SET (inline)',
            input: 'update t set x = 1 where z = 3',
            expected: 'UPDATE t\nSET x = 1\nWHERE z = 3',
        },
        {
            name: 'Multi-item UPDATE SET (multiline)',
            input: 'update t set x = 1, y = 2, z = 3 where id = 5',
            expected: 'UPDATE t\nSET\n     x = 1\n    ,y = 2\n    ,z = 3\nWHERE id = 5',
        },
        {
            name: 'DELETE with multiple conditions',
            input: "delete from users where created < '2020-01-01' and status = 'inactive'",
            expected: "DELETE FROM users\nWHERE\n    created < '2020-01-01'\n    AND status = 'inactive'",
        },
        {
            name: 'MERGE clause formatting',
            input: 'MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET val = s.val',
            expected: 'MERGE INTO target t\nUSING source s\nON t.id = s.id\nWHEN MATCHED THEN UPDATE SET val = s.val',
        },
    ],
};