/**
 * Basic Python Formatting Tests
 *
 * Tests that the Python formatter (Ruff) works correctly.
 * We don't test Ruff's formatting deeply - just that our integration works.
 */
import type { TestSuite } from '../framework.js';

export const basicFormattingTests: TestSuite = {
  name: 'Python Basic Formatting',
  tests: [
    // Whitespace normalization
    {
      name: 'Simple assignment spacing',
      input: 'x=1',
      expected: 'x = 1',
    },
    {
      name: 'Multiple assignments',
      input: 'x=1\ny=2\nz=3',
      expected: 'x = 1\ny = 2\nz = 3',
    },
    {
      name: 'Function definition spacing',
      input: 'def foo( x,y ):return x+y',
      expected: 'def foo(x, y):\n    return x + y',
    },
    {
      name: 'Function with body',
      input: 'def add(a,b):\n  result=a+b\n  return result',
      expected: 'def add(a, b):\n    result = a + b\n    return result',
    },
    {
      name: 'Class definition',
      input: 'class Foo:\n def bar(self):\n  pass',
      expected: 'class Foo:\n    def bar(self):\n        pass',
    },

    // Operator spacing
    {
      name: 'Arithmetic operators',
      input: 'result=a+b-c*d/e',
      expected: 'result = a + b - c * d / e',
    },
    {
      name: 'Comparison operators',
      input: 'if x>1 and y<2:pass',
      expected: 'if x > 1 and y < 2:\n    pass',
    },

    // Import formatting
    {
      name: 'Import statement',
      input: 'import pandas',
      expected: 'import pandas',
    },
    {
      name: 'From import',
      input: 'from pyspark.sql import SparkSession',
      expected: 'from pyspark.sql import SparkSession',
    },

    // List/Dict formatting
    {
      name: 'List literal spacing',
      input: '[1,2,3]',
      expected: '[1, 2, 3]',
    },
    {
      name: 'Dict literal spacing',
      input: '{"a":1,"b":2}',
      expected: '{"a": 1, "b": 2}',
    },

    // String handling
    {
      name: 'String literal preserved',
      input: 'x = "hello world"',
      expected: 'x = "hello world"',
    },
    {
      name: 'f-string preserved',
      input: 'x = f"value is {val}"',
      expected: 'x = f"value is {val}"',
    },

    // Already formatted code
    {
      name: 'Already formatted code unchanged',
      input: 'x = 1\ny = 2',
      expected: 'x = 1\ny = 2',
    },

    // Empty/whitespace handling
    {
      name: 'Empty string',
      input: '',
      expected: '',
    },
    {
      name: 'Whitespace only preserved by ruff',
      input: '   \n   \n   ',
      expected: '   \n   \n   ', // Ruff preserves whitespace-only input
    },

    // Comments preserved
    {
      name: 'Line comment preserved',
      input: '# this is a comment\nx = 1',
      expected: '# this is a comment\nx = 1',
    },
    {
      name: 'Inline comment preserved',
      input: 'x = 1  # inline comment',
      expected: 'x = 1  # inline comment',
    },

    // Trailing newlines stripped (our formatter option)
    {
      name: 'Trailing newlines stripped',
      input: 'x = 1\n\n\n',
      expected: 'x = 1',
    },
  ],
};
