/**
 * WHERE Clause Tests
 */
import { TestSuite } from './framework.js';

export const whereTests: TestSuite = {
    name: 'WHERE Conditions',
    tests: [
        {
            name: 'Single-item WHERE (inline)',
            input: 'select a from t where x = 1',
            expected: 'SELECT a\nFROM t\nWHERE x = 1',
        },
        {
            name: 'Multi-item WHERE with AND (multiline)',
            input: 'select a from t where a=1 and b=2 and c=3',
            expected: 'SELECT a\nFROM t\nWHERE\n    a = 1\n    AND b = 2\n    AND c = 3',
        },
        {
            name: 'Multi-item WHERE with OR (multiline)',
            input: 'select a from t where a=1 or b=2 or c=3',
            expected: 'SELECT a\nFROM t\nWHERE\n    a = 1\n    OR b = 2\n    OR c = 3',
        },
        {
            name: 'IS NULL',
            input: 'select x from t where x is null',
            expected: 'SELECT x\nFROM t\nWHERE x IS NULL',
        },
        {
            name: 'IS NOT NULL',
            input: 'select x from t where x is not null',
            expected: 'SELECT x\nFROM t\nWHERE x IS NOT NULL',
        },
        {
            name: 'IS DISTINCT FROM',
            input: 'select x from t where x is distinct from y',
            expected: 'SELECT x\nFROM t\nWHERE x IS DISTINCT FROM y',
        },
        {
            name: 'IS NOT DISTINCT FROM',
            input: 'select x from t where x is not distinct from y',
            expected: 'SELECT x\nFROM t\nWHERE x IS NOT DISTINCT FROM y',
        },
        {
            name: 'BETWEEN (dont split on AND)',
            input: 'select x from t where x between 1 and 10',
            expected: 'SELECT x\nFROM t\nWHERE x BETWEEN 1 AND 10',
        },
        {
            name: 'IN list (comma space)',
            input: 'select x from t where x in (1,2,3)',
            expected: 'SELECT x\nFROM t\nWHERE x IN (1, 2, 3)',
        },
        {
            name: 'RLIKE',
            input: 'select x from t where x rlike pattern',
            expected: 'SELECT x\nFROM t\nWHERE x RLIKE pattern',
        },
        
        // === BUG: LIKE ESCAPE CLAUSE ===
        // ESCAPE clause should stay with LIKE expression
        {
            name: 'LIKE with ESCAPE backslash',
            input: 'select a from t where name like \'%\\_test%\' escape \'\\\\\'',
            expected: 'SELECT a\nFROM t\nWHERE name LIKE \'%\\_test%\' ESCAPE \'\\\\\'',
        },
        {
            name: 'Multiple conditions after LIKE ESCAPE',
            input: 'select a from t where name like \'%test%\' escape \'!\' and status = 1',
            expected: 'SELECT a\nFROM t\nWHERE\n    name LIKE \'%test%\' ESCAPE \'!\'\n    AND status = 1',
        },
    ],
};
