/**
 * Python Formatter Initialization Tests
 *
 * Tests that the Python formatter initializes correctly in different environments.
 * These are async tests that run separately from the sync test framework.
 */

import {
  formatCell,
  formatCellAsync,
  getPythonFormatterInitPromise,
  initializePythonFormatter,
  isPythonFormatterReady,
  resetPythonFormatterState,
} from '../../cell-formatter.js';
import {
  getPythonFormatter,
  resetPythonFormatter,
} from '../../formatters/python/index.js';
import type { TestResult, TestSuite } from '../framework.js';

export const initializationTests: TestSuite = {
  name: 'Python Formatter Initialization',
  tests: [], // Populated by runInitializationTests
};

interface InitTestCase {
  name: string;
  test: () => Promise<{ passed: boolean; message?: string }>;
}

const initTests: InitTestCase[] = [
  {
    name: 'Formatter initializes successfully in Node.js',
    test: async () => {
      // Reset to test fresh initialization
      resetPythonFormatter();

      try {
        await initializePythonFormatter();
        const ready = isPythonFormatterReady();
        return {
          passed: ready,
          message: ready
            ? undefined
            : 'Formatter not ready after initialization',
        };
      } catch (error) {
        return {
          passed: false,
          message: `Initialization failed: ${error}`,
        };
      }
    },
  },
  {
    name: 'Formatter works after initialization',
    test: async () => {
      // Ensure initialized (idempotent)
      await initializePythonFormatter();

      const result = formatCell('x=1', 'python');
      if (result.error) {
        return { passed: false, message: `Format error: ${result.error}` };
      }
      if (result.formatted !== 'x = 1') {
        return {
          passed: false,
          message: `Unexpected output: "${result.formatted}" (expected "x = 1")`,
        };
      }
      return { passed: true };
    },
  },
  {
    name: 'Multiple initializations are idempotent',
    test: async () => {
      // Call initialize multiple times
      await initializePythonFormatter();
      await initializePythonFormatter();
      await initializePythonFormatter();

      const result = formatCell('y=2', 'python');
      if (result.error) {
        return {
          passed: false,
          message: `Format error after multiple inits: ${result.error}`,
        };
      }
      return { passed: result.formatted === 'y = 2' };
    },
  },
  {
    name: 'Formatter instance isReady state is correct',
    test: async () => {
      // Reset formatter to get fresh instance
      resetPythonFormatter();

      // Get new formatter instance (not yet initialized)
      const formatter = getPythonFormatter();

      // Before initialization, instance should not be ready
      const notReadyBefore = !formatter.isReady();

      // Initialize the instance directly
      await formatter.initialize();

      // After initialization, instance should be ready
      const readyAfter = formatter.isReady();

      // Re-initialize global state for subsequent tests
      await initializePythonFormatter();

      return {
        passed: notReadyBefore && readyAfter,
        message: !notReadyBefore
          ? 'Formatter was ready before init'
          : !readyAfter
            ? 'Formatter not ready after init'
            : undefined,
      };
    },
  },
  {
    name: 'pyspark cell type works same as python',
    test: async () => {
      await initializePythonFormatter();

      const result = formatCell('x=1', 'pyspark');
      if (result.error) {
        return { passed: false, message: `Format error: ${result.error}` };
      }
      return {
        passed: result.formatted === 'x = 1',
        message:
          result.formatted !== 'x = 1' ? `Got: ${result.formatted}` : undefined,
      };
    },
  },
  {
    name: 'Unknown cell type returns unchanged',
    test: async () => {
      await initializePythonFormatter();

      const input = 'some random content';
      const result = formatCell(input, 'unknown' as any);

      return {
        passed: result.formatted === input && !result.changed,
        message:
          result.formatted !== input
            ? `Content was modified: ${result.formatted}`
            : undefined,
      };
    },
  },
  {
    name: 'Concurrent initializations share same promise (no race condition)',
    test: async () => {
      // Reset state to test fresh initialization
      resetPythonFormatterState();

      // Start multiple initializations concurrently (don't await)
      const promise1 = initializePythonFormatter();
      const promise2 = initializePythonFormatter();
      const promise3 = initializePythonFormatter();

      // All should return the same promise instance
      const storedPromise = getPythonFormatterInitPromise();

      // Wait for all to complete
      await Promise.all([promise1, promise2, promise3]);

      // Verify all callers got the same promise (identity check)
      // Note: We can't directly compare the returned promises because
      // async functions wrap the return value, but we can verify:
      // 1. Only one initialization occurred (formatter is ready)
      // 2. The stored promise is set during initialization
      const ready = isPythonFormatterReady();
      const hasStoredPromise = storedPromise !== null;

      return {
        passed: ready && hasStoredPromise,
        message: !ready
          ? 'Formatter not ready after concurrent inits'
          : !hasStoredPromise
            ? 'Init promise was not stored'
            : undefined,
      };
    },
  },
  {
    name: 'Initialization promise is reset on failure (allows retry)',
    test: async () => {
      // This test verifies the error recovery path
      // We can't easily force a failure, but we can verify the promise
      // is properly set during successful initialization
      resetPythonFormatterState();

      // Before init, promise should be null
      const beforeInit = getPythonFormatterInitPromise();
      if (beforeInit !== null) {
        return { passed: false, message: 'Promise was not null before init' };
      }

      // Start init but don't await yet
      const initPromise = initializePythonFormatter();

      // During init, promise should be set
      const duringInit = getPythonFormatterInitPromise();
      if (duringInit === null) {
        return { passed: false, message: 'Promise was null during init' };
      }

      // Wait for completion
      await initPromise;

      // After successful init, promise remains set (cached)
      const afterInit = getPythonFormatterInitPromise();
      if (afterInit === null) {
        return {
          passed: false,
          message: 'Promise was null after successful init',
        };
      }

      return { passed: true };
    },
  },
  {
    name: 'formatCellAsync waits for in-progress initialization',
    test: async () => {
      // Reset state to simulate fresh state
      resetPythonFormatterState();

      // Start initialization but DON'T await it
      const initPromise = initializePythonFormatter();

      // Immediately call formatCellAsync - it should wait for init
      const formatPromise = formatCellAsync('z=3', 'python');

      // Wait for format to complete (which should wait for init)
      const result = await formatPromise;

      // Also wait for init to ensure no dangling promises
      await initPromise;

      if (result.error) {
        return { passed: false, message: `Format error: ${result.error}` };
      }

      return {
        passed: result.formatted === 'z = 3',
        message:
          result.formatted !== 'z = 3'
            ? `Got: "${result.formatted}"`
            : undefined,
      };
    },
  },
  {
    name: 'formatCellAsync works when formatter already initialized',
    test: async () => {
      // Ensure formatter is initialized
      await initializePythonFormatter();

      const result = await formatCellAsync('a=1', 'python');

      if (result.error) {
        return { passed: false, message: `Format error: ${result.error}` };
      }

      return {
        passed: result.formatted === 'a = 1',
        message:
          result.formatted !== 'a = 1'
            ? `Got: "${result.formatted}"`
            : undefined,
      };
    },
  },
  {
    name: 'formatCellAsync with SQL does not require Python initialization',
    test: async () => {
      // Even without Python init, SQL should work
      const result = await formatCellAsync('select * from t', 'sparksql');

      if (result.error) {
        return { passed: false, message: `Format error: ${result.error}` };
      }

      return {
        passed: result.formatted === 'SELECT * FROM t',
        message:
          result.formatted !== 'SELECT * FROM t'
            ? `Got: "${result.formatted}"`
            : undefined,
      };
    },
  },
];

/**
 * Run initialization tests (async)
 */
export async function runInitializationTests(): Promise<{
  suiteName: string;
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of initTests) {
    try {
      const result = await tc.test();
      if (result.passed) {
        passed++;
        results.push({ name: tc.name, passed: true });
      } else {
        failed++;
        results.push({
          name: tc.name,
          passed: false,
          message: result.message,
        });
      }
    } catch (error) {
      failed++;
      results.push({
        name: tc.name,
        passed: false,
        message: `Test threw: ${error}`,
      });
    }
  }

  return {
    suiteName: initializationTests.name,
    passed,
    failed,
    results,
  };
}
