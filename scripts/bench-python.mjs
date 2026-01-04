/**
 * Benchmark Python vs SQL formatting time - compare with CLI
 */
import { performance } from 'perf_hooks';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const dir = 'C:/dev/HelixData/workspace';

console.log('=== Direct API ===');
// Get all notebook files (.py and .sql)
console.log('Phase 1: File discovery...');
const discoverStart = performance.now();
const files = [];
function walk(d) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.py') || entry.name.endsWith('.sql')) {
      files.push(full);
    }
  }
}
walk(dir);
console.log(`  Found ${files.length} files in ${(performance.now() - discoverStart).toFixed(0)}ms`);

// Initialize Python formatter
console.log('\nPhase 2: Module loading + Python init...');
const initStart = performance.now();
const { formatNotebook, initializePythonFormatter } = await import('../packages/core/dist/index.js');
console.log(`  Module loaded in ${(performance.now() - initStart).toFixed(0)}ms`);

const pyInitStart = performance.now();
await initializePythonFormatter();
console.log(`  Python init in ${(performance.now() - pyInitStart).toFixed(0)}ms`);

let totalSqlCells = 0;
let totalPyCells = 0;

// Process all files
console.log('\nPhase 3: Formatting...');
const formatStart = performance.now();
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  await formatNotebook(content, file);
  
  // Count cells by language
  const langRegex = /"language":\s*"(\w+)"/g;
  let match;
  while ((match = langRegex.exec(content)) !== null) {
    if (match[1] === 'sparksql') {
      totalSqlCells++;
    } else if (match[1] === 'python' || match[1] === 'pyspark') {
      totalPyCells++;
    }
  }
}
const formatElapsed = performance.now() - formatStart;

console.log(`  Formatted ${totalSqlCells} SQL + ${totalPyCells} Python cells`);
console.log(`  Format time: ${(formatElapsed / 1000).toFixed(2)}s`);
const totalDirect = performance.now() - discoverStart;
console.log(`  Total Direct API: ${(totalDirect / 1000).toFixed(2)}s`);

// Now compare to CLI
console.log('\n=== CLI (cold start) ===');
const cliStart = performance.now();
execSync(`node packages/core/dist/cli.js format "${dir}"`, { encoding: 'utf8' });
const cliElapsed = performance.now() - cliStart;
console.log(`  CLI time: ${(cliElapsed / 1000).toFixed(2)}s`);
console.log(`\nOverhead: CLI is ${(cliElapsed / totalDirect).toFixed(1)}x slower than direct API`);
