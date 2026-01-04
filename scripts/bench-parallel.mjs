/**
 * Benchmark parallel vs sequential initialization
 */
import { performance } from 'perf_hooks';

console.log('=== Sequential vs Parallel Init ===\n');

// Test 1: Sequential (current behavior)
console.log('Test 1: Sequential initialization...');
const seqStart = performance.now();

// Load SQL formatter
const { formatSql } = await import('../packages/core/dist/formatters/sparksql/index.js');
const sqlReady = performance.now();

// First SQL format (compiles grammar)
formatSql('select a from t');
const sqlWarm = performance.now();

// Load and init Python
const { PythonFormatter } = await import('../packages/core/dist/formatters/python/python-formatter.js');
const pyFormatter1 = new PythonFormatter();
await pyFormatter1.initialize();
const pyReady = performance.now();

// First Python format
pyFormatter1.format('x=1');
const pyWarm = performance.now();

const seqTotal = pyWarm - seqStart;
console.log(`  SQL ready: ${(sqlReady - seqStart).toFixed(0)}ms`);
console.log(`  SQL warm:  ${(sqlWarm - seqStart).toFixed(0)}ms`);
console.log(`  Py ready:  ${(pyReady - seqStart).toFixed(0)}ms`);
console.log(`  Py warm:   ${(pyWarm - seqStart).toFixed(0)}ms`);
console.log(`  TOTAL:     ${seqTotal.toFixed(0)}ms\n`);

// Clear module cache for fair comparison (won't work for ESM, but let's try fresh imports)
// Note: ESM modules are cached, so we'll simulate with Promise.all pattern instead

// Test 2: Parallel initialization pattern
console.log('Test 2: Parallel initialization (simulated)...');
const parStart = performance.now();

// In a real implementation, we'd do:
// await Promise.all([initSql(), initPython()])
// Since modules are cached, we'll just time the init part

// Simulated parallel timing = max(SQL, Python) instead of SQL + Python
const sqlInitTime = sqlWarm - seqStart;  // ~270ms
const pyInitTime = pyWarm - sqlWarm;      // ~100ms
const parallelEstimate = Math.max(sqlInitTime, pyInitTime);

console.log(`  SQL init: ${sqlInitTime.toFixed(0)}ms`);
console.log(`  Py init:  ${pyInitTime.toFixed(0)}ms`);
console.log(`  Parallel: max(${sqlInitTime.toFixed(0)}, ${pyInitTime.toFixed(0)}) = ${parallelEstimate.toFixed(0)}ms`);
console.log(`  Savings:  ${(seqTotal - parallelEstimate).toFixed(0)}ms (${((1 - parallelEstimate/seqTotal) * 100).toFixed(0)}%)\n`);

// Verify formatter works after all this
console.log('=== Verification ===');
console.log('SQL: ' + formatSql('select 1'));
console.log('Py:  ' + pyFormatter1.format('x=1').formatted.trim());

console.log('\n=== Recommendations ===');
console.log('1. NODE_COMPILE_CACHE=".cache/v8" - saves ~33% on cold start');
console.log('2. Parallel init: SQL & Python can init simultaneously');
console.log('3. Lazy init: Only load Python formatter when needed for Python cells');
