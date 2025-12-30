/**
 * Noqa Directive Tests
 * 
 * Tests for formatting suppression via noqa comments:
 * - Statement-level: `-- noqa` bypasses all formatting
 * - Line-level: `-- noqa:expansion` suppresses multi-line expansion only
 */
import { TestSuite } from './framework.js';

export const noqaStatementTests: TestSuite = {
    name: 'Noqa Statement-Level',
    tests: [
        // === STATEMENT-LEVEL NOQA (FULL BYPASS) ===
        {
            name: 'Line comment noqa bypasses formatting',
            input: '-- noqa\nSELECT   x,y,z FROM t WHERE a=1',
            expected: '-- noqa\nSELECT   x,y,z FROM t WHERE a=1',
        },
        {
            name: 'Line comment noqa with extra space',
            input: '--  noqa\nselect * from t',
            expected: '--  noqa\nselect * from t',
        },
        {
            name: 'Block comment noqa bypasses formatting',
            input: '/* noqa */ SELECT   x,y,z FROM t',
            expected: '/* noqa */ SELECT   x,y,z FROM t',
        },
        {
            name: 'Block comment noqa with spaces',
            input: '/*  noqa  */  select * from t',
            expected: '/*  noqa  */  select * from t',
        },
        {
            name: 'Noqa preserves lowercase keywords',
            input: '-- noqa\nselect a, b from table_name where x = 1',
            expected: '-- noqa\nselect a, b from table_name where x = 1',
        },
        {
            name: 'Noqa preserves weird spacing',
            input: '-- noqa\nSELECT    a,b,c    FROM   t',
            expected: '-- noqa\nSELECT    a,b,c    FROM   t',
        },
        {
            name: 'Noqa case insensitive (NOQA)',
            input: '-- NOQA\nselect * from t',
            expected: '-- NOQA\nselect * from t',
        },
        {
            name: 'Noqa case insensitive (NoQa)',
            input: '-- NoQa\nselect * from t',
            expected: '-- NoQa\nselect * from t',
        },
        {
            name: 'Statement without noqa is formatted normally',
            input: 'select x,y from t',
            expected: 'SELECT\n     x\n    ,y\nFROM t',
        },
        {
            name: 'Noqa only affects its own statement (semicolon separated)',
            input: '-- noqa\nselect * from t1; select a,b from t2',
            expected: '-- noqa\nselect * from t1;\n\nSELECT\n     a\n    ,b\nFROM t2',
        },
        {
            name: 'Second statement with noqa',
            input: 'select a from t1; -- noqa\nselect * from t2',
            expected: 'SELECT a FROM t1;\n\n-- noqa\nselect * from t2',
        },
    ],
};

export const noqaExpansionTests: TestSuite = {
    name: 'Noqa Expansion Suppression',
    tests: [
        // === LINE-LEVEL NOQA:EXPANSION ===
        {
            name: 'noqa:expansion keeps COALESCE on one line',
            input: 'select coalesce(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) -- noqa:expansion\nfrom t',
            expected: 'SELECT COALESCE(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) -- noqa:expansion\nFROM t',
        },
        {
            name: 'noqa:expansion with block comment',
            input: 'select coalesce(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) /* noqa:expansion */\nfrom t',
            expected: 'SELECT COALESCE(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) /* noqa:expansion */ FROM t',
        },
        {
            name: 'noqa:expansion case insensitive',
            input: 'select coalesce(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) -- NOQA:EXPANSION\nfrom t',
            expected: 'SELECT COALESCE(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) -- NOQA:EXPANSION\nFROM t',
        },
        {
            name: 'noqa:expansion with space around colon',
            input: 'select coalesce(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) -- noqa : expansion\nfrom t',
            expected: 'SELECT COALESCE(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) -- noqa : expansion\nFROM t',
        },
        {
            name: 'noqa:expansion still uppercases keywords',
            input: 'select coalesce(a, b, c, d, e) -- noqa:expansion\nfrom t',
            expected: 'SELECT COALESCE(a, b, c, d, e) -- noqa:expansion\nFROM t',
        },
        {
            name: 'noqa:expansion keeps function on one line even when it would expand',
            // Input is short, but noqa prevents expansion if it were triggered
            input: 'select coalesce(a, b, c, d, e) -- noqa:expansion\nfrom t',
            expected: 'SELECT COALESCE(a, b, c, d, e) -- noqa:expansion\nFROM t',
        },
        {
            name: 'noqa:expansion suppresses expansion that would normally happen',
            // When a long column prefix pushes position past threshold, noqa:expansion keeps it inline
            input: 'select column_name_prefix_a, column_name_prefix_b, column_name_prefix_c, column_name_prefix_d, coalesce(a, b, c, d, e, f, g, h) -- noqa:expansion\nfrom t',
            expected: 'SELECT\n     column_name_prefix_a\n    ,column_name_prefix_b\n    ,column_name_prefix_c\n    ,column_name_prefix_d\n    ,COALESCE(a, b, c, d, e, f, g, h) -- noqa:expansion\nFROM t',
        },
        {
            name: 'noqa:expansion on window function',
            input: 'select row_number() over (partition by a, b, c, d, e order by x, y, z) -- noqa:expansion\nfrom t',
            expected: 'SELECT ROW_NUMBER() OVER (PARTITION BY a, b, c, d, e ORDER BY x, y, z) -- noqa:expansion\nFROM t',
        },
        {
            name: 'Long COALESCE expands WITHOUT noqa',
            // This should expand because it exceeds line width
            input: 'SELECT COALESCE(very_long_column_name_a, very_long_column_name_b, very_long_column_name_c, very_long_column_name_d, very_long_column_name_e, very_long_column_name_f) FROM t',
            expected: 'SELECT COALESCE(\n         very_long_column_name_a\n        ,very_long_column_name_b\n        ,very_long_column_name_c\n        ,very_long_column_name_d\n        ,very_long_column_name_e\n        ,very_long_column_name_f\n    )\nFROM t',
        },
        {
            name: 'Long COALESCE stays inline WITH noqa:expansion',
            // Same long COALESCE but with noqa:expansion - should NOT expand
            input: 'SELECT COALESCE(very_long_column_name_a, very_long_column_name_b, very_long_column_name_c, very_long_column_name_d, very_long_column_name_e, very_long_column_name_f) --noqa:expansion\nFROM t',
            expected: 'SELECT COALESCE(very_long_column_name_a, very_long_column_name_b, very_long_column_name_c, very_long_column_name_d, very_long_column_name_e, very_long_column_name_f) --noqa:expansion\nFROM t',
        },
        {
            name: 'noqa:expansion with comma-after style input',
            // User has comma-after style, noqa:expansion keeps function on one line
            input: 'SELECT\nFunction(a,b,c,d,e,f,g,h), --noqa:expansion\nColB\nFROM t',
            expected: 'SELECT\n     FUNCTION(a, b, c, d, e, f, g, h) --noqa:expansion\n    ,ColB\nFROM t',
        },
        {
            name: 'noqa:expansion inline with block comment before comma',
            input: 'SELECT Function(a,b,c) /*noqa:expansion*/, ColB FROM t',
            expected: 'SELECT\n     FUNCTION(a, b, c) /*noqa:expansion*/\n    ,ColB\nFROM t',
        },
        {
            name: 'noqa:expansion block comment at end of line',
            input: 'SELECT Function(a,b,c), ColB /*noqa:expansion*/ FROM t',
            expected: 'SELECT\n     FUNCTION(a, b, c)\n    ,ColB /*noqa:expansion*/\nFROM t',
        },
    ],
};
