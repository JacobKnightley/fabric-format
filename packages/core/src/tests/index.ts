/**
 * Main Test Runner for Spark SQL Formatter
 *
 * Runs all test suites and reports results.
 */

import { formatCell, initializePythonFormatter } from '../cell-formatter.js';
import { formatSql } from '../formatters/sparksql/index.js';
import {
  printSuiteResult,
  printSummary,
  runSuite,
  type SuiteResult,
} from './framework.js';
// Import integration test suites
import {
  runCliTests,
  runErrorContextTests,
  runErrorPathTests,
  runNotebookParsingTests,
} from './integration/index.js';
// Import Python test suites
import {
  basicFormattingTests,
  lintFixesSuite,
  magicCommandTests,
  runInitializationTests,
  runNotebookIntegrationTests,
} from './python/index.js';
// Import all Spark SQL test suites
import {
  basicSelectTests,
  tablesampleTests,
} from './sparksql/basic-select.test.js';
import {
  aliasTests,
  builtinFunctionCasingTests,
  casingTests,
} from './sparksql/casing.test.js';
import { commentTests, hintTests } from './sparksql/comments.test.js';
import { compactQueryTests } from './sparksql/compact-query.test.js';
import { ddlTests } from './sparksql/ddl.test.js';
import { deltaLakeTests } from './sparksql/delta-lake.test.js';
import { dmlTests } from './sparksql/dml.test.js';
import {
  arrayAccessTests,
  caseExpressionTests,
  lambdaTests,
  literalTests,
  nestedFunctionTests,
  unaryOperatorTests,
} from './sparksql/expressions.test.js';
import {
  fmtInlineTests,
  fmtOffTests,
} from './sparksql/format-directives.test.js';
import { distributionTests, groupByTests } from './sparksql/grouping.test.js';
import { joinTests } from './sparksql/joins.test.js';
import { magicCommandsTests } from './sparksql/magic-commands.test.js';
import {
  magicSqlSuite,
  runMagicSqlSuite,
  runValidationSuite,
  validationSuite,
} from './sparksql/magic-sql.test.js';
import { semicolonTests } from './sparksql/semicolon.test.js';
import {
  cteTests,
  setOperationTests,
  subqueryIndentationTests,
  subqueryTests,
} from './sparksql/subqueries.test.js';
import {
  lateralViewTests,
  pivotTests,
  stackTests,
  unpivotTests,
} from './sparksql/table-operators.test.js';
import { castTests, doubleColonCastTests } from './sparksql/type-casts.test.js';
import { utilityTests } from './sparksql/utility.test.js';
import { selectExceptTests, whereTests } from './sparksql/where.test.js';
import {
  namedWindowTests,
  nullHandlingTests,
  windowFunctionTests,
} from './sparksql/window-functions.test.js';

// All Spark SQL test suites in order
const sparkSqlSuites = [
  // Core SELECT
  basicSelectTests,
  tablesampleTests,

  // Casing
  casingTests,
  aliasTests,
  builtinFunctionCasingTests,

  // Clauses
  joinTests,
  groupByTests,
  distributionTests,
  whereTests,
  selectExceptTests,

  // Subqueries
  subqueryTests,
  cteTests,
  setOperationTests,
  subqueryIndentationTests,

  // Expressions
  caseExpressionTests,
  literalTests,
  unaryOperatorTests,
  arrayAccessTests,
  lambdaTests,
  nestedFunctionTests,

  // Type casts
  castTests,
  doubleColonCastTests,

  // Window functions
  windowFunctionTests,
  namedWindowTests,
  nullHandlingTests,

  // Table operators
  pivotTests,
  unpivotTests,
  lateralViewTests,
  stackTests,

  // Comments
  commentTests,
  hintTests,

  // DDL/DML
  ddlTests,
  dmlTests,

  // Utility
  utilityTests,
  magicCommandsTests,
  semicolonTests,

  // Formatting control
  fmtOffTests,
  fmtInlineTests,
  compactQueryTests,

  // Extensions (not in grammar)
  deltaLakeTests,
];

// Python test suites (sync tests)
const pythonSyncSuites = [
  basicFormattingTests,
  lintFixesSuite,
  magicCommandTests,
];

async function main(): Promise<void> {
  console.log('='.repeat(50));
  console.log('Spark SQL Formatter Test Suite');
  console.log('='.repeat(50));

  const results: SuiteResult[] = [];
  const verbose =
    process.argv.includes('--verbose') || process.argv.includes('-v');
  const timing = process.argv.includes('--timing');

  // Run Spark SQL tests (sync)
  const sqlStart = performance.now();
  for (const suite of sparkSqlSuites) {
    const result = runSuite(suite, formatSql);
    results.push(result);
    printSuiteResult(result, verbose);
  }
  if (timing)
    console.log(
      `  ⏱ Spark SQL tests: ${(performance.now() - sqlStart).toFixed(0)}ms`,
    );

  // Run magic SQL suite with its custom runner
  const magicResult = runMagicSqlSuite();
  const magicSuiteResult: SuiteResult = {
    suiteName: magicSqlSuite.name,
    passed: magicResult.passed,
    failed: magicResult.failed,
    results: magicResult.results,
  };
  results.push(magicSuiteResult);
  printSuiteResult(magicSuiteResult, verbose);

  // Run validation suite with its custom runner
  const validationResult = runValidationSuite();
  const validationSuiteResult: SuiteResult = {
    suiteName: validationSuite.name,
    passed: validationResult.passed,
    failed: validationResult.failed,
    results: validationResult.results.map((r) => ({
      name: r.name,
      passed: r.passed,
      got: r.error,
    })),
  };
  results.push(validationSuiteResult);
  printSuiteResult(validationSuiteResult, verbose);

  // Python tests header
  console.log(`\n${'='.repeat(50)}`);
  console.log('Python Formatter Test Suite');
  console.log('='.repeat(50));

  // Initialize Python formatter for tests
  const pythonInitStart = performance.now();
  await initializePythonFormatter();
  if (timing)
    console.log(
      `  ⏱ Python init: ${(performance.now() - pythonInitStart).toFixed(0)}ms`,
    );

  // Run Python sync tests
  const pythonTestStart = performance.now();
  for (const suite of pythonSyncSuites) {
    const result = runSuite(suite, (code) => {
      const res = formatCell(code, 'python');
      return res.formatted;
    });
    results.push(result);
    printSuiteResult(result, verbose);
  }

  // Run Python async tests
  const initResult = await runInitializationTests();
  results.push(initResult);
  printSuiteResult(initResult, verbose);

  const notebookResult = await runNotebookIntegrationTests();
  results.push(notebookResult);
  printSuiteResult(notebookResult, verbose);
  if (timing)
    console.log(
      `  ⏱ Python tests: ${(performance.now() - pythonTestStart).toFixed(0)}ms`,
    );

  // Integration tests header
  console.log(`\n${'='.repeat(50)}`);
  console.log('Integration Test Suite');
  console.log('='.repeat(50));

  // Run error context tests
  const integrationStart = performance.now();
  const errorContextResult = await runErrorContextTests();
  results.push(errorContextResult);
  printSuiteResult(errorContextResult, verbose);

  // Run error path tests
  const errorPathResult = await runErrorPathTests();
  const errorPathSuiteResult: SuiteResult = {
    suiteName: 'Error Paths',
    passed: errorPathResult.filter((r) => r.passed).length,
    failed: errorPathResult.filter((r) => !r.passed).length,
    results: errorPathResult,
  };
  results.push(errorPathSuiteResult);
  printSuiteResult(errorPathSuiteResult, verbose);

  // Run notebook parsing tests
  const parsingResult = await runNotebookParsingTests();
  results.push(parsingResult);
  printSuiteResult(parsingResult, verbose);

  // Run CLI tests
  const cliStart = performance.now();
  const cliResult = await runCliTests();
  if (timing)
    console.log(
      `  ⏱ CLI tests: ${(performance.now() - cliStart).toFixed(0)}ms`,
    );
  results.push(cliResult);
  printSuiteResult(cliResult, verbose);
  if (timing)
    console.log(
      `  ⏱ Integration tests total: ${(performance.now() - integrationStart).toFixed(0)}ms`,
    );

  const { totalFailed } = printSummary(results);

  // Exit with appropriate code
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main();
