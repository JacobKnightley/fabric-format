/**
 * Main Test Runner for Spark SQL Formatter
 * 
 * Runs all test suites and reports results.
 */
import { formatSql } from '../formatter.js';
import { runSuite, printSuiteResult, printSummary, SuiteResult } from './framework.js';

// Import all test suites
import { basicSelectTests } from './basic-select.test.js';
import { casingTests, aliasTests } from './casing.test.js';
import { joinTests } from './joins.test.js';
import { groupByTests } from './grouping.test.js';
import { whereTests } from './where.test.js';
import { subqueryTests, cteTests, setOperationTests, subqueryIndentationTests } from './subqueries.test.js';
import { caseExpressionTests, castTests, literalTests, unaryOperatorTests, arrayAccessTests } from './expressions.test.js';
import { commentTests, hintTests } from './comments.test.js';
import { ddlTests } from './ddl.test.js';
import { dmlTests } from './dml.test.js';
import { sparkFeaturesTests, lambdaTests, pivotFormattingTests, unpivotFormattingTests, lateralViewFormattingTests } from './spark-features.test.js';
import { utilityTests } from './utility.test.js';

// All test suites in order
const allSuites = [
    basicSelectTests,
    casingTests,
    aliasTests,
    joinTests,
    groupByTests,
    whereTests,
    subqueryTests,
    cteTests,
    setOperationTests,
    subqueryIndentationTests,
    caseExpressionTests,
    castTests,
    literalTests,
    unaryOperatorTests,
    arrayAccessTests,
    commentTests,
    hintTests,
    ddlTests,
    dmlTests,
    sparkFeaturesTests,
    lambdaTests,
    pivotFormattingTests,
    unpivotFormattingTests,
    lateralViewFormattingTests,
    utilityTests,
];

function main(): void {
    console.log('='.repeat(50));
    console.log('Spark SQL Formatter Test Suite');
    console.log('='.repeat(50));

    const results: SuiteResult[] = [];
    const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

    for (const suite of allSuites) {
        const result = runSuite(suite, formatSql);
        results.push(result);
        printSuiteResult(result, verbose);
    }

    const { totalPassed, totalFailed } = printSummary(results);

    // Exit with appropriate code
    if (totalFailed > 0) {
        process.exit(1);
    }
}

main();
