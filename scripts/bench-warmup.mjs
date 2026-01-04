/**
 * Benchmark warmup phases to identify bottlenecks
 */
import { performance } from 'perf_hooks';

console.log('=== Warmup Phase Analysis ===\n');

const phases = [];
let phaseStart = performance.now();

// Phase 1: Module imports
console.log('Phase 1: Loading modules...');
const start = performance.now();

// Load ANTLR (SQL formatter dependencies)
phaseStart = performance.now();
const antlr4 = await import('antlr4');
phases.push({ name: 'antlr4 import', ms: performance.now() - phaseStart });

// Load SQL formatter (triggers ANTLR grammar load)
phaseStart = performance.now();
const { formatSql } = await import('../packages/core/dist/formatters/sparksql/index.js');
phases.push({ name: 'SQL formatter import', ms: performance.now() - phaseStart });

// Load Python formatter module (doesn't init WASM yet)
phaseStart = performance.now();
const { PythonFormatter } = await import('../packages/core/dist/formatters/python/python-formatter.js');
phases.push({ name: 'Python formatter import', ms: performance.now() - phaseStart });

console.log(`  Imports complete: ${(performance.now() - start).toFixed(0)}ms\n`);

// Phase 2: First SQL format (triggers ANTLR compilation)
console.log('Phase 2: First SQL format (ANTLR compile)...');
phaseStart = performance.now();
const sqlResult1 = formatSql('select a from t');
phases.push({ name: 'First SQL format', ms: performance.now() - phaseStart });
console.log(`  Result: "${sqlResult1}"`);

// Phase 3: Second SQL format (ANTLR warm)
console.log('\nPhase 3: Second SQL format (warm)...');
phaseStart = performance.now();
const sqlResult2 = formatSql('select b,c from t where x=1');
phases.push({ name: 'Second SQL format', ms: performance.now() - phaseStart });
console.log(`  Result: "${sqlResult2.substring(0, 50)}..."`);

// Phase 4: Python WASM init
console.log('\nPhase 4: Python WASM initialization...');
phaseStart = performance.now();
const pyFormatter = new PythonFormatter();
await pyFormatter.initialize();
phases.push({ name: 'Python WASM init', ms: performance.now() - phaseStart });
console.log(`  Ready: ${pyFormatter.isReady()}`);

// Phase 5: First Python format
console.log('\nPhase 5: First Python format (WASM warm)...');
phaseStart = performance.now();
const pyResult1 = pyFormatter.format('x=1');
phases.push({ name: 'First Python format', ms: performance.now() - phaseStart });
console.log(`  Result: "${pyResult1.formatted}"`);

// Phase 6: Second Python format
console.log('\nPhase 6: Second Python format (warm)...');
phaseStart = performance.now();
const pyResult2 = pyFormatter.format('def foo(a,b):\n  return a+b');
phases.push({ name: 'Second Python format', ms: performance.now() - phaseStart });
console.log(`  Result: "${pyResult2.formatted.substring(0, 30)}..."`);

// Summary
const totalTime = performance.now() - start;
console.log('\n=== Timing Summary ===');
console.log('─'.repeat(50));
for (const phase of phases) {
  const pct = ((phase.ms / totalTime) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(phase.ms / 50));
  console.log(`${phase.name.padEnd(25)} ${phase.ms.toFixed(0).padStart(5)}ms (${pct.padStart(5)}%) ${bar}`);
}
console.log('─'.repeat(50));
console.log(`${'TOTAL'.padEnd(25)} ${totalTime.toFixed(0).padStart(5)}ms`);

// What can we parallelize?
console.log('\n=== Optimization Opportunities ===');
console.log('1. ANTLR + WASM init could run in PARALLEL');
console.log('2. V8 code caching (--compile-cache flag in Node 22+)');
console.log('3. Lazy init: Only load Python formatter when needed');
