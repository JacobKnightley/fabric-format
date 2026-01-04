/**
 * Detailed cell-by-cell profiling across entire workspace
 */
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';

const dir = 'C:/dev/HelixData/workspace';
const { formatNotebook, initializePythonFormatter, formatCell } = await import('../packages/core/dist/index.js');

await initializePythonFormatter();

// Collect all files
const allFiles = [];
function walk(d) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git', '__pycache__'].includes(entry.name)) {
      walk(full);
    } else if (entry.isFile() && (entry.name.endsWith('.py') || entry.name.endsWith('.sql'))) {
      allFiles.push(full);
    }
  }
}
walk(dir);

console.log(`Processing ${allFiles.length} files...\n`);

// Count cells and time processing
let totalSql = 0, totalPy = 0;
let totalTime = 0;

const start = performance.now();
for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file).toLowerCase();
  
  // Count cells
  const langRegex = /"language":\s*"(\w+)"/g;
  let match;
  while ((match = langRegex.exec(content)) !== null) {
    if (match[1] === 'sparksql') totalSql++;
    else if (match[1] === 'python' || match[1] === 'pyspark') totalPy++;
  }
  
  // Format
  const fileStart = performance.now();
  await formatNotebook(content, ext, { formatPython: true, formatSql: true });
  totalTime += performance.now() - fileStart;
}
const elapsed = performance.now() - start;

console.log(`Results:`);
console.log(`  Files: ${allFiles.length}`);
console.log(`  SQL cells: ${totalSql}`);
console.log(`  Python cells: ${totalPy}`);
console.log(`  Total cells: ${totalSql + totalPy}`);
console.log(`  Format time: ${(totalTime / 1000).toFixed(2)}s`);
console.log(`  Total time: ${(elapsed / 1000).toFixed(2)}s`);
console.log(`\nPer-cell:`);
console.log(`  Avg time per cell: ${(totalTime / (totalSql + totalPy)).toFixed(2)}ms`);
console.log(`  Cells/sec: ${Math.round((totalSql + totalPy) / (totalTime / 1000))}`);

// Expected times based on isolated benchmarks
const expectedSql = totalSql * 0.5;  // 0.5ms per SQL cell
const expectedPy = totalPy * 0.2;    // 0.2ms per Python cell
console.log(`\nExpected (based on isolated cell benchmarks):`);
console.log(`  SQL: ${totalSql} × 0.5ms = ${expectedSql.toFixed(0)}ms`);
console.log(`  Python: ${totalPy} × 0.2ms = ${expectedPy.toFixed(0)}ms`);
console.log(`  Total expected: ${(expectedSql + expectedPy).toFixed(0)}ms`);
console.log(`  Actual: ${totalTime.toFixed(0)}ms`);
console.log(`  Overhead: ${(totalTime - expectedSql - expectedPy).toFixed(0)}ms`);
