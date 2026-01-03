/**
 * Error Context Tests
 *
 * Tests that formatter error messages include proper context
 * (cell index, file path, language) for debugging.
 */

import { formatCell, initializePythonFormatter } from '../../cell-formatter.js';
import {
  formatContextLocation,
  formatErrorWithContext,
} from '../../formatters/index.js';
import type { SuiteResult, TestResult } from '../framework.js';

interface ErrorContextTestCase {
  name: string;
  test: () => { passed: boolean; message?: string };
}

const errorContextTests: ErrorContextTestCase[] = [
  // Unit tests for context formatting utilities
  {
    name: 'formatContextLocation with cell and file',
    test: () => {
      const location = formatContextLocation({
        cellIndex: 5,
        filePath: 'notebook.py',
      });
      const expected = 'cell 5 of notebook.py';
      return {
        passed: location === expected,
        message: location !== expected ? `Expected "${expected}", got "${location}"` : undefined,
      };
    },
  },
  {
    name: 'formatContextLocation with only cell',
    test: () => {
      const location = formatContextLocation({ cellIndex: 3 });
      const expected = 'cell 3';
      return {
        passed: location === expected,
        message: location !== expected ? `Expected "${expected}", got "${location}"` : undefined,
      };
    },
  },
  {
    name: 'formatContextLocation with only file',
    test: () => {
      const location = formatContextLocation({ filePath: 'test.py' });
      const expected = 'test.py';
      return {
        passed: location === expected,
        message: location !== expected ? `Expected "${expected}", got "${location}"` : undefined,
      };
    },
  },
  {
    name: 'formatContextLocation with empty context',
    test: () => {
      const location = formatContextLocation({});
      return {
        passed: location === '',
        message: location !== '' ? `Expected empty string, got "${location}"` : undefined,
      };
    },
  },
  {
    name: 'formatContextLocation with undefined context',
    test: () => {
      const location = formatContextLocation(undefined);
      return {
        passed: location === '',
        message: location !== '' ? `Expected empty string, got "${location}"` : undefined,
      };
    },
  },
  {
    name: 'formatErrorWithContext adds location prefix',
    test: () => {
      const error = formatErrorWithContext('syntax error', {
        cellIndex: 5,
        filePath: 'notebook.py',
      });
      const expected = 'Format error in cell 5 of notebook.py: syntax error';
      return {
        passed: error === expected,
        message: error !== expected ? `Expected "${expected}", got "${error}"` : undefined,
      };
    },
  },
  {
    name: 'formatErrorWithContext without context returns base error',
    test: () => {
      const error = formatErrorWithContext('syntax error', undefined);
      return {
        passed: error === 'syntax error',
        message: error !== 'syntax error' ? `Expected "syntax error", got "${error}"` : undefined,
      };
    },
  },
  {
    name: 'formatErrorWithContext with cell only',
    test: () => {
      const error = formatErrorWithContext('parse failed', { cellIndex: 42 });
      const expected = 'Format error in cell 42: parse failed';
      return {
        passed: error === expected,
        message: error !== expected ? `Expected "${expected}", got "${error}"` : undefined,
      };
    },
  },
  {
    name: 'formatErrorWithContext with file only',
    test: () => {
      const error = formatErrorWithContext('parse failed', { filePath: 'myfile.py' });
      const expected = 'Format error in myfile.py: parse failed';
      return {
        passed: error === expected,
        message: error !== expected ? `Expected "${expected}", got "${error}"` : undefined,
      };
    },
  },

  // Integration tests for formatCell with context - successful cases
  {
    name: 'formatCell SQL success has no error regardless of context',
    test: () => {
      const result = formatCell('SELECT * FROM t', 'sparksql', {
        cellIndex: 1,
        filePath: 'test.py',
      });
      
      return {
        passed: result.error === undefined,
        message: result.error ? `Unexpected error: "${result.error}"` : undefined,
      };
    },
  },
  {
    name: 'formatCell Python success has no error regardless of context',
    test: () => {
      // Python formatter should be initialized by the test runner
      const result = formatCell('x = 1', 'python', {
        cellIndex: 2,
        filePath: 'analysis.py',
      });
      
      return {
        passed: result.error === undefined,
        message: result.error ? `Unexpected error: "${result.error}"` : undefined,
      };
    },
  },
  {
    name: 'formatCell context parameter is optional (backward compatible)',
    test: () => {
      const sqlResult = formatCell('SELECT * FROM t', 'sparksql');
      const pyResult = formatCell('x = 1', 'python');
      
      const sqlOk = sqlResult.error === undefined;
      const pyOk = pyResult.error === undefined;
      
      return {
        passed: sqlOk && pyOk,
        message: !sqlOk ? `SQL error: ${sqlResult.error}` : 
                 !pyOk ? `Python error: ${pyResult.error}` : undefined,
      };
    },
  },
];

export const errorContextSuite = {
  name: 'Error Context',
  tests: errorContextTests,
};

export async function runErrorContextTests(): Promise<SuiteResult> {
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  // Ensure Python is initialized at the start
  await initializePythonFormatter();

  for (const tc of errorContextTests) {
    try {
      const testResult = tc.test();
      if (testResult.passed) {
        passed++;
        results.push({ name: tc.name, passed: true });
      } else {
        failed++;
        results.push({
          name: tc.name,
          passed: false,
          message: testResult.message,
        });
      }
    } catch (error) {
      failed++;
      results.push({
        name: tc.name,
        passed: false,
        message: `Exception: ${error}`,
      });
    }
  }

  return {
    suiteName: errorContextSuite.name,
    passed,
    failed,
    results,
  };
}
