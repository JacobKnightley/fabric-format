/**
 * Regression Tests for Fixed Python Formatter Bugs
 *
 * These tests ensure that previously fixed bugs stay fixed.
 */

import type { TestSuite } from '../framework.js';

/**
 * fabric-format-38et: Comment duplication bug
 *
 * When Ruff's PLR5501 rule (collapsible-else-if) emitted a fix with multiple
 * atomic edits, our old implementation would only apply some edits, causing
 * comments to be duplicated on each iteration.
 *
 * The fix ensures all edits from a single diagnostic are applied atomically,
 * and overlapping diagnostics are properly deduplicated.
 *
 * Note: Ruff's PLR5501 rule removes the entire else block including any
 * comments inside it when collapsing to elif. This is expected behavior.
 * The bug was that WITHOUT the fix, the comments would be duplicated because
 * partial edits were applied. WITH the fix, comments are handled correctly
 * (removed as expected by Ruff).
 */
export const commentDuplicationBugTests: TestSuite = {
  name: 'Regression: Comment Duplication Bug (fabric-format-38et)',
  tests: [
    {
      name: 'PLR5501: else-if collapsed to elif - comments removed (not duplicated)',
      // When Ruff collapses else: if -> elif, comments in the else block are removed.
      // The bug would cause these comments to be DUPLICATED instead.
      // This test verifies they are cleanly removed (no duplication).
      input: `for item in items:
    if condition_a:
        do_a()
    else:
        # This comment is inside else block
        if condition_b:
            do_b()`,
      expected: `for _item in items:
    if condition_a:
        do_a()
    elif condition_b:
        do_b()`,
    },
    {
      name: 'PLR5501: comments before else preserved, comments inside removed',
      // Comments BEFORE the else block should be preserved
      // Comments INSIDE the else block are removed when collapsing to elif
      input: `def process(x):
    if x > 0:
        handle_positive()
    # This comment is BEFORE else - should be preserved
    else:
        # This comment is INSIDE else - will be removed
        if x < 0:
            handle_negative()`,
      expected: `def process(x):
    if x > 0:
        handle_positive()
    # This comment is BEFORE else - should be preserved
    elif x < 0:
        handle_negative()`,
    },
    {
      name: 'Multiple lint fixes in same code - no corruption',
      // Tests that multiple lint fixes applied together don't corrupt the output
      // B010 (setattr -> assignment) and E711 (== None -> is None) both apply
      input: `if x == None:
    setattr(obj, "value", 1)`,
      expected: `if x is None:
    obj.value = 1`,
    },
    {
      name: 'Formatter is idempotent on complex transformations',
      // Tests that running the formatter twice gives the same result
      // This was broken when comments were being duplicated on each pass
      input: `x=1;y=2
if x==None:pass
d=dict()`,
      expected: `x = 1
y = 2
if x is None:
    pass
d = {}`,
    },
  ],
};

/**
 * fabric-format-atyw: Overlapping lint edits bug
 *
 * When UP030 (remove positional indices) and UP032 (convert to f-string) both
 * target the same code range, applying both edits corrupted the output.
 *
 * The fix tracks which ranges have been modified and skips overlapping
 * diagnostics to prevent corruption.
 */
export const overlappingEditsBugTests: TestSuite = {
  name: 'Regression: Overlapping Lint Edits Bug (fabric-format-atyw)',
  tests: [
    {
      name: 'UP032: .format() with positional index in spark.sql() becomes f-string',
      // UP030 (remove positional indices) and UP032 (convert to f-string) could
      // both target this. The fix ensures only one is applied cleanly.
      input: `table_name = "users"
spark.sql("select * from {0}".format(table_name))`,
      expected: `table_name = "users"
spark.sql(f"SELECT * FROM {table_name}")`,
    },
    {
      name: 'UP032: multiple args - SQL with multiple columns expands to multiline',
      // When spark.sql() has multiple columns, the SQL formatter expands them
      input: `col1 = "id"
col2 = "name"
spark.sql("select {0}, {1} from table".format(col1, col2))`,
      expected: `col1 = "id"
col2 = "name"
spark.sql(f"""
    SELECT
         {col1}
        ,{col2}
    FROM table
""")`,
    },
    {
      name: 'UP032: .format() outside spark.sql() also works',
      input: `msg = "Hello {0}, welcome to {1}".format(name, place)`,
      expected: `msg = f"Hello {name}, welcome to {place}"`,
    },
    {
      name: 'UP032: named args in .format() become f-string',
      input: `query = "select * from {table}".format(table=table_name)`,
      expected: `query = f"select * from {table_name}"`,
    },
    {
      name: 'Preserves correct parentheses after conversion',
      // The bug could cause missing closing parens. This verifies proper structure.
      input: `result = some_func("value: {0}".format(x))`,
      expected: `result = some_func(f"value: {x}")`,
    },
    {
      name: 'Multiple overlapping fixes in same cell - all clean',
      // Multiple .format() -> f-string conversions in the same cell
      // Without the fix, these could interfere with each other
      input: `a = "first: {0}".format(x)
b = "second: {0}".format(y)
spark.sql("select {0} from {1}".format(col, tbl))`,
      expected: `a = f"first: {x}"
b = f"second: {y}"
spark.sql(f"SELECT {col} FROM {tbl}")`,
    },
  ],
};

/**
 * Combined regression test suite for export
 */
export const regressionBugTests: TestSuite = {
  name: 'Python Formatter Regression Tests',
  tests: [
    ...commentDuplicationBugTests.tests,
    ...overlappingEditsBugTests.tests,
  ],
};
