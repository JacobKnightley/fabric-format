/**
 * Lint Fixes Tests
 *
 * Tests for the safe auto-fix linting rules applied during Python formatting.
 * These rules perform in-cell syntactic transformations only - no cross-cell
 * context or import-adding rules.
 */

import type { TestSuite } from '../framework.js';

export const lintFixesSuite: TestSuite = {
  name: 'Python Lint Fixes',
  tests: [
    // Import sorting (I001)
    {
      name: 'I001: Sorts imports within cell',
      input: 'import sys\nimport os\nx = 1',
      expected: 'import os\nimport sys\n\nx = 1',
    },
    {
      name: 'I001: Preserves already-sorted imports',
      input: 'import os\nimport sys\nx = 1',
      expected: 'import os\nimport sys\n\nx = 1',
    },
    {
      name: 'I001: Third-party imports stay in order',
      input: 'import pandas as pd\nfrom pyspark.sql import SparkSession\nx = 1',
      expected:
        'import pandas as pd\nfrom pyspark.sql import SparkSession\n\nx = 1',
    },

    // pyupgrade - UP rules
    {
      name: 'UP008: Removes super() parameters',
      input:
        'class Foo(Bar):\n    def __init__(self):\n        super(Foo, self).__init__()',
      expected:
        'class Foo(Bar):\n    def __init__(self):\n        super().__init__()',
    },
    {
      name: 'UP018: Converts type literals to native',
      input: 'x = str("hello")',
      expected: 'x = "hello"',
    },
    {
      name: 'UP032: Uses f-string instead of .format()',
      input: 'x = "Hello {}".format(name)',
      expected: 'x = f"Hello {name}"',
    },

    // flake8-comprehensions - C4 rules
    {
      name: 'C408: Unnecessary dict() call',
      input: 'x = dict()',
      expected: 'x = {}',
    },
    {
      name: 'C408: Unnecessary list() call',
      input: 'x = list()',
      expected: 'x = []',
    },
    {
      name: 'C416: Unnecessary list comprehension',
      input: 'x = [i for i in items]',
      expected: 'x = list(items)',
    },

    // flake8-simplify - SIM rules
    {
      name: 'SIM118: Use key in dict instead of key in dict.keys()',
      input: 'if key in d.keys():\n    pass',
      expected: 'if key in d:\n    pass',
    },
    {
      name: 'SIM201: Use != instead of not ==',
      input: 'if not x == y:\n    pass',
      expected: 'if x != y:\n    pass',
    },
    {
      name: 'SIM300: Yoda condition fixed',
      input: 'if "hello" == x:\n    pass',
      expected: 'if x == "hello":\n    pass',
    },

    // flake8-bugbear - B rules
    {
      name: 'B009: Use getattr with constant',
      input: 'x = getattr(obj, "attr")',
      expected: 'x = obj.attr',
    },
    {
      name: 'B010: Use setattr with constant',
      input: 'setattr(obj, "attr", value)',
      expected: 'obj.attr = value',
    },

    // pycodestyle - E rules
    {
      name: 'E703: Removes useless semicolon',
      input: 'x = 1;',
      expected: 'x = 1',
    },
    {
      name: 'E711: Use is None instead of == None',
      input: 'if x == None:\n    pass',
      expected: 'if x is None:\n    pass',
    },
    // E712 doesn't have a fix in the current Ruff version, removed

    // Pyflakes - F rules (cell-safe only)
    {
      name: 'F632: Use == for equality check, not is',
      input: 'if x is []:\n    pass',
      expected: 'if x == []:\n    pass',
    },

    // PIE808 doesn't have an auto-fix, removed

    // Ruff-specific - RUF rules
    {
      name: 'RUF005: Concatenate lists with unpacking',
      input: 'x = [1, 2] + [3, 4]',
      expected: 'x = [1, 2, 3, 4]',
    },

    // Ensure RET504 is NOT applied (we excluded it)
    {
      name: 'RET504: Preserves intermediate variable assignments (excluded)',
      input: 'def add(a, b):\n    result = a + b\n    return result',
      expected: 'def add(a, b):\n    result = a + b\n    return result',
    },

    // Ensure cross-cell rules are NOT applied
    {
      name: 'F401: Does NOT remove "unused" imports (cross-cell danger)',
      input: 'import os',
      expected: 'import os',
    },
    {
      name: 'F841: Does NOT remove "unused" variables (cross-cell danger)',
      input: 'x = 1',
      expected: 'x = 1',
    },
  ],
};
