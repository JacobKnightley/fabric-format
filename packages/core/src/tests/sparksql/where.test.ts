/**
 * WHERE Clause Tests
 * Note: Tests use multiple columns or multiple conditions to avoid compact query mode
 */
import type { TestSuite } from '../framework.js';

export const whereTests: TestSuite = {
  name: 'WHERE Conditions',
  tests: [
    {
      name: 'Single-item WHERE (inline)',
      input: 'select a, b from t where x = 1',
      expected: 'SELECT\n     a\n    ,b\nFROM t\nWHERE x = 1',
    },
    {
      name: 'Multi-item WHERE with AND (multiline)',
      input: 'select a, b from t where a=1 and b=2 and c=3',
      expected:
        'SELECT\n     a\n    ,b\nFROM t\nWHERE\n    a = 1\n    AND b = 2\n    AND c = 3',
    },
    {
      name: 'Multi-item WHERE with OR (multiline)',
      input: 'select a, b from t where a=1 or b=2 or c=3',
      expected:
        'SELECT\n     a\n    ,b\nFROM t\nWHERE\n    a = 1\n    OR b = 2\n    OR c = 3',
    },
    {
      name: 'IS NULL',
      input: 'select x, y from t where x is null',
      expected: 'SELECT\n     x\n    ,y\nFROM t\nWHERE x IS NULL',
    },
    {
      name: 'IS NOT NULL',
      input: 'select x, y from t where x is not null',
      expected: 'SELECT\n     x\n    ,y\nFROM t\nWHERE x IS NOT NULL',
    },
    {
      name: 'IS DISTINCT FROM',
      input: 'select x, y from t where x is distinct from y',
      expected: 'SELECT\n     x\n    ,y\nFROM t\nWHERE x IS DISTINCT FROM y',
    },
    {
      name: 'IS NOT DISTINCT FROM',
      input: 'select x, y from t where x is not distinct from y',
      expected:
        'SELECT\n     x\n    ,y\nFROM t\nWHERE x IS NOT DISTINCT FROM y',
    },
    {
      name: 'BETWEEN (dont split on AND)',
      input: 'select x, y from t where x between 1 and 10',
      expected: 'SELECT\n     x\n    ,y\nFROM t\nWHERE x BETWEEN 1 AND 10',
    },
    {
      name: 'IN list (comma space)',
      input: 'select x, y from t where x in (1,2,3)',
      expected: 'SELECT\n     x\n    ,y\nFROM t\nWHERE x IN (1, 2, 3)',
    },
    {
      name: 'IN list wraps when exceeding line width',
      // Query exceeds 140 chars total, so it expands (FROM/WHERE on own lines)
      // After expansion, the WHERE line is 122 chars, under 140, so no IN list wrap needed
      input:
        'SELECT * FROM very_long_table_name WHERE long_column_name IN (value_one, value_two, value_three, value_four, value_five, value_six, value_seven, value_eight)',
      expected:
        'SELECT *\nFROM very_long_table_name\nWHERE long_column_name IN (value_one, value_two, value_three, value_four, value_five, value_six, value_seven, value_eight)',
    },
    {
      name: 'IN list multiple wraps maintain alignment',
      // Query exceeds 140 chars total, so it expands (FROM/WHERE on own lines)
      // After expansion, the WHERE line exceeds 140 chars, so IN list wraps
      input:
        'SELECT * FROM very_long_table_name WHERE long_column_name IN (value_one, value_two, value_three, value_four, value_five, value_six, value_seven, value_eight, value_nine, value_ten, value_eleven, value_twelve, value_thirteen)',
      expected:
        'SELECT *\nFROM very_long_table_name\nWHERE long_column_name IN (value_one, value_two, value_three, value_four, value_five, value_six, value_seven, value_eight, value_nine,\n                           value_ten, value_eleven, value_twelve, value_thirteen)',
    },
    {
      name: 'RLIKE',
      input: 'select x, y from t where x rlike pattern',
      expected: 'SELECT\n     x\n    ,y\nFROM t\nWHERE x RLIKE pattern',
    },

    // === BUG: LIKE ESCAPE CLAUSE ===
    // ESCAPE clause should stay with LIKE expression
    {
      name: 'LIKE with ESCAPE backslash',
      input: "select a, b from t where name like '%\\_test%' escape '\\\\'",
      expected:
        "SELECT\n     a\n    ,b\nFROM t\nWHERE name LIKE '%\\_test%' ESCAPE '\\\\'",
    },
    {
      name: 'Multiple conditions after LIKE ESCAPE',
      input:
        "select a, b from t where name like '%test%' escape '!' and status = 1",
      expected:
        "SELECT\n     a\n    ,b\nFROM t\nWHERE\n    name LIKE '%test%' ESCAPE '!'\n    AND status = 1",
    },

    // LIKE with ALL/ANY/SOME quantifiers
    {
      name: 'ALL keyword in LIKE predicate',
      input: 'select * from t where x like all (a, b, c)',
      expected: 'SELECT * FROM t WHERE x LIKE ALL (a, b, c)',
    },
    {
      name: 'ANY keyword in LIKE predicate',
      input: 'select * from t where x like any (a, b, c)',
      expected: 'SELECT * FROM t WHERE x LIKE ANY (a, b, c)',
    },
    {
      name: 'SOME keyword in LIKE predicate',
      input: 'select * from t where x like some (a, b, c)',
      expected: 'SELECT * FROM t WHERE x LIKE SOME (a, b, c)',
    },

    // === IN list with nested functions (regression test for fabric-format-9c5) ===
    {
      name: 'IN list with nested CAST expressions preserves structure',
      // Each CAST(CONV(...)) is ~52 chars. Together they fit under 140 with proper wrapping.
      // Function expansion should NOT break CAST mid-expression.
      input:
        "SELECT a, b FROM t WHERE id IN (CAST(CONV(RIGHT(MD5('msit'), 16), 16, -10) AS BIGINT), CAST(CONV(RIGHT(MD5('prod'), 16), 16, -10) AS BIGINT))",
      expected:
        "SELECT\n     a\n    ,b\nFROM t\nWHERE id IN (CAST(CONV(RIGHT(MD5('msit'), 16), 16, -10) AS BIGINT), CAST(CONV(RIGHT(MD5('prod'), 16), 16, -10) AS BIGINT))",
    },
    {
      name: 'IN list with deeply nested functions stays inline when under line width',
      input:
        'SELECT a, b FROM t WHERE x IN (UPPER(TRIM(col1)), LOWER(TRIM(col2)))',
      expected:
        'SELECT\n     a\n    ,b\nFROM t\nWHERE x IN (UPPER(TRIM(col1)), LOWER(TRIM(col2)))',
    },
    {
      name: 'IN list with function containing multiple args stays intact',
      // COALESCE has commas inside, but those should not be treated as IN list separators
      input:
        "SELECT a, b FROM t WHERE x IN (COALESCE(a, b, 'default'), COALESCE(c, d, 'other'))",
      expected:
        "SELECT\n     a\n    ,b\nFROM t\nWHERE x IN (COALESCE(a, b, 'default'), COALESCE(c, d, 'other'))",
    },
  ],
};

export const selectExceptTests: TestSuite = {
  name: 'SELECT EXCEPT Column Exclusion',
  tests: [
    {
      name: 'EXCEPT columns on qualified star should not expand',
      input: 'select t.* except (a, b) from t',
      expected: 'SELECT t.* EXCEPT (a, b) FROM t',
    },
    {
      name: 'EXCEPT with unqualified star',
      input: 'select * except (col1, col2) from t',
      expected: 'SELECT * EXCEPT (col1, col2) FROM t',
    },
  ],
};
