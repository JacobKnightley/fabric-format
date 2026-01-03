/**
 * Python Magic Command Tests
 *
 * Tests that IPython/Jupyter magic commands are handled correctly.
 */
import type { TestSuite } from '../framework.js';

export const magicCommandTests: TestSuite = {
  name: 'Python Magic Commands',
  tests: [
    // Cell magics (%%magic)
    {
      name: '%%pyspark magic - Python code formatted',
      input: '%%pyspark\nx=1\ny=2',
      expected: '%%pyspark\nx = 1\ny = 2',
    },
    {
      name: '%%python magic - Python code formatted',
      input: '%%python\ndef foo(x,y):return x+y',
      expected: '%%python\ndef foo(x, y):\n    return x + y',
    },
    {
      name: '%%sql magic - not Python, returned unchanged',
      input: '%%sql\nSELECT * FROM table',
      expected: '%%sql\nSELECT * FROM table',
    },
    {
      name: '%%scala magic - not Python, returned unchanged',
      input: '%%scala\nval x = 1',
      expected: '%%scala\nval x = 1',
    },
    {
      name: '%%sh magic - not Python, returned unchanged',
      input: '%%sh\nls -la',
      expected: '%%sh\nls -la',
    },
    {
      name: '%%r magic - not Python, returned unchanged',
      input: '%%r\nx <- 1',
      expected: '%%r\nx <- 1',
    },
    {
      name: '%%pyspark with empty body - unchanged',
      input: '%%pyspark\n',
      expected: '%%pyspark\n',
    },
    {
      name: '%%pyspark with whitespace body - preserved (no python to format)',
      input: '%%pyspark\n   ',
      expected: '%%pyspark\n   ', // No Python code to format, returned as-is
    },

    // Line magics (%magic) - preserved at start
    {
      name: '%pip magic at start - preserved',
      input: '%pip install pandas\nimport pandas',
      expected: '%pip install pandas\nimport pandas',
    },
    {
      name: '%run magic - preserved',
      input: '%run ./other_notebook',
      expected: '%run ./other_notebook',
    },
    {
      name: 'Multiple line magics - all preserved',
      input: '%pip install pandas\n%pip install numpy\nimport pandas',
      expected: '%pip install pandas\n%pip install numpy\nimport pandas',
    },
    {
      name: 'Comment before Python code - preserved',
      input: '# Setup\nx=1',
      expected: '# Setup\nx = 1',
    },
    {
      name: 'Empty lines and comments before code',
      input: '# Comment\n\n# Another\nx=1',
      expected: '# Comment\n\n# Another\nx = 1',
    },

    // Only magics/comments (no Python to format)
    {
      name: 'Only line magic - returned unchanged',
      input: '%pip install pandas',
      expected: '%pip install pandas',
    },
    {
      name: 'Only comments - returned unchanged',
      input: '# Just a comment\n# Another comment',
      expected: '# Just a comment\n# Another comment',
    },
  ],
};
