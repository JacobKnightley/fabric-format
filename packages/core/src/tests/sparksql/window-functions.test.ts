/**
 * Window Function Tests
 *
 * Tests for window functions including OVER clause, named windows,
 * frame specifications, and null handling modifiers.
 */

import { formatSql } from '../../formatters/sparksql/index.js';
import type { TestSuite } from '../framework.js';

export const windowFunctionTests: TestSuite = {
  name: 'Window Functions',
  tests: [
    {
      name: 'Short window spec stays inline',
      input: 'select row_number() over (partition by a order by b) from t',
      expected: 'SELECT ROW_NUMBER() OVER (PARTITION BY a ORDER BY b) FROM t',
    },
    {
      name: 'Window stays inline when line under 140 chars',
      input:
        'select row_number() over (partition by very_long_column_name_one, very_long_column_name_two order by another_long_name) from t',
      expected:
        'SELECT ROW_NUMBER() OVER (PARTITION BY very_long_column_name_one, very_long_column_name_two ORDER BY another_long_name) FROM t',
    },
    {
      name: 'Window expands when full line exceeds 140 chars',
      input:
        'select row_number() over (partition by extremely_long_column_name_one, extremely_long_column_name_two, extremely_long_column_name_three order by yet_another_extremely_long_sort_column_name) from t',
      expected:
        'SELECT ROW_NUMBER() OVER (\n        PARTITION BY extremely_long_column_name_one, extremely_long_column_name_two, extremely_long_column_name_three\n        ORDER BY yet_another_extremely_long_sort_column_name\n    )\nFROM t',
    },
    {
      name: 'Window with frame clause stays inline under 140',
      input:
        'select sum(amount) over (partition by customer_id order by transaction_date rows between unbounded preceding and current row) from t',
      expected:
        'SELECT SUM(amount) OVER (PARTITION BY customer_id ORDER BY transaction_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) FROM t',
    },
    {
      name: 'Window in CTE stays inline when under 140',
      input:
        'with cte as (select lead(x) over (partition by very_long_name_a, very_long_name_b, very_long_name_c order by sort_col) from t) select * from cte',
      expected:
        'WITH cte AS (\n    SELECT LEAD(x) OVER (PARTITION BY very_long_name_a, very_long_name_b, very_long_name_c ORDER BY sort_col)\n    FROM t\n)\nSELECT * FROM cte',
    },
    {
      name: 'OVER with nested CAST that expands - idempotency check',
      // This test verifies idempotency: OVER should expand on first pass if nested CAST would expand
      // Pattern from real notebook: DENSE_RANK() OVER (ORDER BY REGEXP_EXTRACT_ALL(...), CAST(REGEXP_EXTRACT(...) AS INT))
      input:
        "select dense_rank() over (order by regexp_extract_all(col_name, '([A-Z]+)',1),cast(regexp_extract(col_name, '([0-9]+)',1) as int)) as rank_col from t",
      expected:
        "SELECT DENSE_RANK() OVER (\n        ORDER BY REGEXP_EXTRACT_ALL(col_name, '([A-Z]+)', 1), CAST(REGEXP_EXTRACT(col_name, '([0-9]+)', 1) AS INT)\n    ) AS rank_col\nFROM t",
      customValidator: (_input: string, expected: string, actual: string) => {
        // Run formatting twice and verify idempotency
        const pass2 = formatSql(actual);
        if (pass2 !== actual) {
          return {
            passed: false,
            message: `Not idempotent!\nPass 1: ${JSON.stringify(actual)}\nPass 2: ${JSON.stringify(pass2)}`,
          };
        }
        return { passed: actual === expected };
      },
    },
  ],
};

export const namedWindowTests: TestSuite = {
  name: 'Named Windows (WINDOW clause)',
  tests: [
    {
      name: 'WINDOW clause with named window',
      input:
        'select a, sum(b) over w from t window w as (partition by c order by d)',
      expected:
        'SELECT\n     a\n    ,SUM(b) OVER w\nFROM t WINDOW w AS (PARTITION BY c ORDER BY d)',
    },
    {
      name: 'Named window reference with OVER',
      input:
        'select sum(x) over w from t window w as (partition by y order by z)',
      expected:
        'SELECT SUM(x) OVER w FROM t WINDOW w AS (PARTITION BY y ORDER BY z)',
    },
  ],
};

export const nullHandlingTests: TestSuite = {
  name: 'Null Handling (IGNORE/RESPECT NULLS)',
  tests: [
    {
      name: 'IGNORE NULLS with window function',
      input: 'select first_value(x) ignore nulls over (order by y) from t',
      expected: 'SELECT FIRST_VALUE(x) IGNORE NULLS OVER (ORDER BY y) FROM t',
    },
    {
      name: 'RESPECT NULLS with window function',
      input: 'select last_value(x) respect nulls over (order by y) from t',
      expected: 'SELECT LAST_VALUE(x) RESPECT NULLS OVER (ORDER BY y) FROM t',
    },
  ],
};
