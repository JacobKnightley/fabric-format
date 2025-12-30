/**
 * JOIN Tests
 */
import { TestSuite } from './framework.js';

export const joinTests: TestSuite = {
    name: 'JOIN Variants',
    tests: [
        {
            name: 'INNER JOIN',
            input: 'select a.id, b.name from table_a a inner join table_b b on a.id = b.a_id',
            expected: 'SELECT\n     a.id\n    ,b.name\nFROM table_a a\nINNER JOIN table_b b\n    ON a.id = b.a_id',
        },
        {
            name: 'LEFT JOIN',
            input: 'select * from a left join b on a.id = b.id',
            expected: 'SELECT *\nFROM a\nLEFT JOIN b\n    ON a.id = b.id',
        },
        {
            name: 'LEFT SEMI JOIN',
            input: 'select * from t1 left semi join t2 on t1.id = t2.id',
            expected: 'SELECT *\nFROM t1\nLEFT SEMI JOIN t2\n    ON t1.id = t2.id',
        },
        {
            name: 'LEFT ANTI JOIN',
            input: 'select * from t1 left anti join t2 on t1.id = t2.id',
            expected: 'SELECT *\nFROM t1\nLEFT ANTI JOIN t2\n    ON t1.id = t2.id',
        },
        {
            name: 'NATURAL JOIN',
            input: 'select * from t1 natural join t2',
            expected: 'SELECT *\nFROM t1\nNATURAL JOIN t2',
        },
        {
            name: 'JOIN USING',
            input: 'select * from t1 join t2 using (id, name)',
            expected: 'SELECT *\nFROM t1\nJOIN t2 USING (id, name)',
        },
        {
            name: 'Multiple JOIN conditions',
            input: 'select * from a join b on a.id = b.id and a.col = b.col',
            expected: 'SELECT *\nFROM a\nJOIN b\n    ON a.id = b.id\n    AND a.col = b.col',
        },
        {
            name: 'JOIN ON on new line with indent',
            input: 'select a.id, b.name from orders a join customers b on a.cust_id=b.id',
            expected: 'SELECT\n     a.id\n    ,b.name\nFROM orders a\nJOIN customers b\n    ON a.cust_id = b.id',
        },
        
        // === BUG: AND/OR INSIDE PARENS IN ON CLAUSE ===
        // AND inside parentheses should stay inline, not split
        {
            name: 'AND inside parentheses should stay inline',
            input: 'select * from a join b on x = y or (p is null and q = true)',
            expected: 'SELECT *\nFROM a\nJOIN b\n    ON x = y\n    OR (p IS NULL AND q = TRUE)',
        },
        {
            name: 'Complex OR with parenthesized AND',
            input: 'select * from a join b on (a.id = b.id and a.type = b.type) or (a.alt_id = b.id)',
            expected: 'SELECT *\nFROM a\nJOIN b\n    ON (a.id = b.id AND a.type = b.type)\n    OR (a.alt_id = b.id)',
        },
        
        // Implicit cross join (comma-separated tables)
        {
            name: 'Implicit cross join should not have space before comma',
            input: 'select * from a, b, c',
            expected: 'SELECT * FROM a, b, c',
        },
        {
            name: 'Multiple tables in FROM with WHERE',
            input: 'select * from a, b, c where a.id = b.id and b.id = c.id',
            expected: 'SELECT *\nFROM a, b, c\nWHERE\n    a.id = b.id\n    AND b.id = c.id',
        },
        
        // LATERAL subquery
        {
            name: 'LATERAL subquery should not have space before comma',
            input: 'select * from t, lateral (select * from s where s.id = t.id)',
            expected: 'SELECT * FROM t, LATERAL (SELECT * FROM s WHERE s.id = t.id)',
        },
    ],
};
