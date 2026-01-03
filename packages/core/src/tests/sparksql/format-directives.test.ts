/**
 * Format Directive Tests
 *
 * Tests for formatting suppression via format directives:
 * - Statement-level: `-- fmt: off` bypasses all formatting
 * - Line-level: `-- fmt: collapse` forces inline formatting
 */
import type { TestSuite } from '../framework.js';

export const fmtOffTests: TestSuite = {
  name: 'Format Off (Statement-Level)',
  tests: [
    {
      name: 'fmt:off bypasses formatting',
      input: '-- fmt: off\nSELECT   x,y,z FROM t WHERE a=1',
      expected: '-- fmt: off\nSELECT   x,y,z FROM t WHERE a=1',
    },
    {
      name: 'fmt:off without space after colon',
      input: '-- fmt:off\nselect * from t',
      expected: '-- fmt:off\nselect * from t',
    },
    {
      name: 'fmt:off block comment',
      input: '/* fmt: off */ SELECT   x,y,z FROM t',
      expected: '/* fmt: off */ SELECT   x,y,z FROM t',
    },
    {
      name: 'fmt:off case insensitive (FMT: OFF)',
      input: '-- FMT: OFF\nselect * from t',
      expected: '-- FMT: OFF\nselect * from t',
    },
    {
      name: 'fmt:off preserves lowercase keywords',
      input: '-- fmt: off\nselect a, b from table_name where x = 1',
      expected: '-- fmt: off\nselect a, b from table_name where x = 1',
    },
    {
      name: 'fmt:off preserves weird spacing',
      input: '-- fmt: off\nSELECT    a,b,c    FROM   t',
      expected: '-- fmt: off\nSELECT    a,b,c    FROM   t',
    },
    {
      name: 'Statement without directive is formatted normally',
      input: 'select x,y from t',
      expected: 'SELECT\n     x\n    ,y\nFROM t',
    },
    {
      name: 'fmt:off only affects its own statement (semicolon separated)',
      input: '-- fmt: off\nselect * from t1; select a,b from t2',
      expected:
        '-- fmt: off\nselect * from t1;\n\nSELECT\n     a\n    ,b\nFROM t2',
    },
    {
      name: 'Second statement with fmt:off',
      input: 'select a from t1; -- fmt: off\nselect * from t2',
      expected: 'SELECT a FROM t1;\n\n-- fmt: off\nselect * from t2',
    },
  ],
};

export const fmtInlineTests: TestSuite = {
  name: 'Format Inline (Line-Level)',
  tests: [
    {
      name: 'fmt:inline keeps COALESCE on one line',
      input:
        'select coalesce(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) -- fmt: inline\nfrom t',
      expected:
        'SELECT COALESCE(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) -- fmt: inline\nFROM t',
    },
    {
      name: 'fmt:inline without space',
      input:
        'select coalesce(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) --fmt:inline\nfrom t',
      expected:
        'SELECT COALESCE(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) --fmt:inline\nFROM t',
    },
    {
      name: 'fmt:inline block comment',
      input:
        'select coalesce(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) /* fmt: inline */\nfrom t',
      expected:
        'SELECT COALESCE(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) /* fmt: inline */ FROM t',
    },
    {
      name: 'fmt:inline case insensitive',
      input:
        'select coalesce(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) -- FMT:INLINE\nfrom t',
      expected:
        'SELECT COALESCE(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) -- FMT:INLINE\nFROM t',
    },
    {
      name: 'fmt:inline still uppercases keywords',
      input: 'select coalesce(a, b, c, d, e) -- fmt: inline\nfrom t',
      expected: 'SELECT COALESCE(a, b, c, d, e) -- fmt: inline\nFROM t',
    },
    {
      name: 'Inline suppresses expansion that would normally happen',
      input:
        'select column_name_prefix_a, column_name_prefix_b, column_name_prefix_c, column_name_prefix_d, coalesce(a, b, c, d, e, f, g, h) -- fmt: inline\nfrom t',
      expected:
        'SELECT\n     column_name_prefix_a\n    ,column_name_prefix_b\n    ,column_name_prefix_c\n    ,column_name_prefix_d\n    ,COALESCE(a, b, c, d, e, f, g, h) -- fmt: inline\nFROM t',
    },
    {
      name: 'Inline on window function',
      input:
        'select row_number() over (partition by a, b, c, d, e order by x, y, z) -- fmt: inline\nfrom t',
      expected:
        'SELECT ROW_NUMBER() OVER (PARTITION BY a, b, c, d, e ORDER BY x, y, z) -- fmt: inline\nFROM t',
    },
    {
      name: 'Long COALESCE expands WITHOUT inline directive',
      input:
        'SELECT COALESCE(very_long_column_name_a, very_long_column_name_b, very_long_column_name_c, very_long_column_name_d, very_long_column_name_e, very_long_column_name_f) FROM t',
      expected:
        'SELECT COALESCE(\n         very_long_column_name_a\n        ,very_long_column_name_b\n        ,very_long_column_name_c\n        ,very_long_column_name_d\n        ,very_long_column_name_e\n        ,very_long_column_name_f\n    )\nFROM t',
    },
    {
      name: 'Long COALESCE stays inline WITH fmt:inline',
      input:
        'SELECT COALESCE(very_long_column_name_a, very_long_column_name_b, very_long_column_name_c, very_long_column_name_d, very_long_column_name_e, very_long_column_name_f) --fmt:inline\nFROM t',
      expected:
        'SELECT COALESCE(very_long_column_name_a, very_long_column_name_b, very_long_column_name_c, very_long_column_name_d, very_long_column_name_e, very_long_column_name_f) --fmt:inline\nFROM t',
    },
    {
      name: 'Inline with comma-after style input',
      input: 'SELECT\nFunction(a,b,c,d,e,f,g,h), --fmt:inline\nColB\nFROM t',
      expected:
        'SELECT\n     FUNCTION(a, b, c, d, e, f, g, h) --fmt:inline\n    ,ColB\nFROM t',
    },
    {
      name: 'Inline with block comment before comma',
      input: 'SELECT Function(a,b,c) /*fmt:inline*/, ColB FROM t',
      expected:
        'SELECT\n     FUNCTION(a, b, c) /*fmt:inline*/\n    ,ColB\nFROM t',
    },
    {
      name: 'Inline block comment at end of line',
      input: 'SELECT Function(a,b,c), ColB /*fmt:inline*/ FROM t',
      expected:
        'SELECT\n     FUNCTION(a, b, c)\n    ,ColB /*fmt:inline*/\nFROM t',
    },
    // Active collapse tests - multi-line input should collapse with fmt:inline
    {
      name: 'Active collapse: multi-line COALESCE collapses to single line',
      input: `SELECT COALESCE(
    very_long_column_name_a,
    very_long_column_name_b,
    very_long_column_name_c,
    very_long_column_name_d
) -- fmt: inline
FROM t`,
      expected:
        'SELECT COALESCE(very_long_column_name_a, very_long_column_name_b, very_long_column_name_c, very_long_column_name_d) -- fmt: inline\nFROM t',
    },
    {
      name: 'Active collapse: expanded function collapses with fmt:inline',
      input: `SELECT CONCAT(
    a,
    b,
    c,
    d,
    e
) --fmt:inline
FROM t`,
      expected: 'SELECT CONCAT(a, b, c, d, e) --fmt:inline\nFROM t',
    },
    {
      name: 'Active collapse: window function collapses',
      input: `SELECT ROW_NUMBER() OVER (
    PARTITION BY a, b, c
    ORDER BY x, y
) -- fmt: inline
FROM t`,
      expected:
        'SELECT ROW_NUMBER() OVER (PARTITION BY a, b, c ORDER BY x, y) -- fmt: inline\nFROM t',
    },
    {
      name: 'Active collapse: block comment style also collapses',
      input: `SELECT COALESCE(
    a,
    b,
    c,
    d
) /* fmt: inline */
FROM t`,
      expected: 'SELECT COALESCE(a, b, c, d) /* fmt: inline */ FROM t',
    },
    {
      name: 'Active collapse: only affects the targeted function',
      input: `SELECT 
    COALESCE(
        col_a,
        col_b,
        col_c
    ) -- fmt: inline
    ,CONCAT(
        x,
        y,
        z
    )
FROM t`,
      expected:
        'SELECT\n     COALESCE(col_a, col_b, col_c) -- fmt: inline\n    ,CONCAT(x, y, z)\nFROM t',
    },
  ],
};
