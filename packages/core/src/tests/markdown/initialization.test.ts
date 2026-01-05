/**
 * Markdown Formatter Initialization Tests
 *
 * Tests for WASM loading, isReady() state, and concurrent initialization safety.
 */
import type { TestSuite } from '../framework.js';
import {
  getMarkdownFormatter,
} from '../../formatters/markdown/index.js';
import { resetMarkdownFormatterState } from '../../cell-formatter.js';

export const initializationTests: TestSuite = {
  name: 'Markdown Initialization',
  tests: [
    // These tests require manual running since they test async behavior
    {
      name: 'placeholder for async tests',
      input: '',
      expected: '',
    },
  ],
};

/**
 * Run initialization tests manually (async tests can't use basic framework).
 */
export async function runInitializationTests(): Promise<{
  passed: number;
  failed: number;
}> {
  let passed = 0;
  let failed = 0;

  console.log('\n[Suite] Markdown Initialization (Async)');

  // Test: Formatter not ready before initialization
  try {
    resetMarkdownFormatterState();
    const formatter = getMarkdownFormatter();
    if (!formatter.isReady()) {
      console.log('  [PASS] Formatter not ready before initialization');
      passed++;
    } else {
      console.log('  [FAIL] Formatter should not be ready before initialization');
      failed++;
    }
  } catch (e) {
    console.log(`  [FAIL] Error checking ready state: ${e}`);
    failed++;
  }

  // Test: Formatter ready after initialization
  try {
    resetMarkdownFormatterState();
    const formatter = getMarkdownFormatter();
    await formatter.initialize();
    if (formatter.isReady()) {
      console.log('  [PASS] Formatter ready after initialization');
      passed++;
    } else {
      console.log('  [FAIL] Formatter should be ready after initialization');
      failed++;
    }
  } catch (e) {
    console.log(`  [FAIL] Error during initialization: ${e}`);
    failed++;
  }

  // Test: Multiple initialization calls are safe (idempotent)
  try {
    resetMarkdownFormatterState();
    const formatter = getMarkdownFormatter();
    await formatter.initialize();
    await formatter.initialize(); // Second call should be no-op
    if (formatter.isReady()) {
      console.log('  [PASS] Multiple initialization calls are safe');
      passed++;
    } else {
      console.log('  [FAIL] Formatter should be ready after multiple init calls');
      failed++;
    }
  } catch (e) {
    console.log(`  [FAIL] Error during multiple initialization: ${e}`);
    failed++;
  }

  // Test: Can format after initialization
  try {
    resetMarkdownFormatterState();
    const formatter = getMarkdownFormatter();
    await formatter.initialize();
    const result = formatter.format('# Test', { stripTrailingNewline: true });
    if (!result.error && result.formatted === '# Test') {
      console.log('  [PASS] Can format after initialization');
      passed++;
    } else {
      console.log(`  [FAIL] Format failed: ${result.error || `got "${result.formatted}" instead of "# Test"`}`);
      failed++;
    }
  } catch (e) {
    console.log(`  [FAIL] Error during format: ${e}`);
    failed++;
  }

  // Test: Reset allows re-initialization
  try {
    resetMarkdownFormatterState();
    const formatter1 = getMarkdownFormatter();
    await formatter1.initialize();
    resetMarkdownFormatterState();
    const formatter2 = getMarkdownFormatter();
    if (!formatter2.isReady()) {
      console.log('  [PASS] Reset clears ready state');
      passed++;
    } else {
      console.log('  [FAIL] Reset should clear ready state');
      failed++;
    }
  } catch (e) {
    console.log(`  [FAIL] Error during reset test: ${e}`);
    failed++;
  }

  console.log(`  [${passed}/${passed + failed} passed]`);

  return { passed, failed };
}
