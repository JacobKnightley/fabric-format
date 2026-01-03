/**
 * Test Framework for Spark SQL Formatter
 */

/** Custom validator result */
export interface ValidatorResult {
  passed: boolean;
  message?: string;
}

/** Custom validator function type */
export type CustomValidator = (
  input: string,
  expected: string,
  actual: string,
) => ValidatorResult;

export interface TestCase {
  name: string;
  input: string;
  expected: string;
  /** Optional custom validator for complex checks like idempotency */
  customValidator?: CustomValidator;
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
}

export interface TestResult {
  name: string;
  passed: boolean;
  input?: string;
  expected?: string;
  got?: string;
  message?: string;
}

export interface SuiteResult {
  suiteName: string;
  passed: number;
  failed: number;
  results: TestResult[];
}

export function runSuite(
  suite: TestSuite,
  formatFn: (sql: string) => string,
): SuiteResult {
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of suite.tests) {
    const result = formatFn(tc.input);

    // Use custom validator if provided, otherwise simple equality check
    let success: boolean;
    let message: string | undefined;

    if (tc.customValidator) {
      const validatorResult = tc.customValidator(tc.input, tc.expected, result);
      success = validatorResult.passed;
      message = validatorResult.message;
    } else {
      success = result === tc.expected;
    }

    if (success) {
      passed++;
      results.push({ name: tc.name, passed: true });
    } else {
      failed++;
      results.push({
        name: tc.name,
        passed: false,
        input: tc.input,
        expected: tc.expected,
        got: result,
        message: message,
      });
    }
  }

  return { suiteName: suite.name, passed, failed, results };
}

export function printSuiteResult(
  result: SuiteResult,
  verbose: boolean = false,
): void {
  console.log(`\n[Suite] ${result.suiteName}`);

  for (const r of result.results) {
    if (r.passed) {
      console.log(`  [PASS] ${r.name}`);
    } else {
      console.log(`  [FAIL] ${r.name}`);
      if (verbose) {
        console.log(`    Input:    ${r.input}`);
        console.log(`    Expected: ${r.expected?.replace(/\n/g, '\\n')}`);
        console.log(`    Got:      ${r.got?.replace(/\n/g, '\\n')}`);
        if (r.message) {
          console.log(`    Message:  ${r.message.replace(/\n/g, '\\n')}`);
        }
      }
    }
  }

  console.log(`  [${result.passed}/${result.passed + result.failed} passed]`);
}

export function printSummary(results: SuiteResult[]): {
  totalPassed: number;
  totalFailed: number;
} {
  let totalPassed = 0;
  let totalFailed = 0;

  for (const r of results) {
    totalPassed += r.passed;
    totalFailed += r.failed;
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(
    `TOTAL: ${totalPassed}/${totalPassed + totalFailed} tests passed`,
  );
  console.log('='.repeat(50));

  return { totalPassed, totalFailed };
}
