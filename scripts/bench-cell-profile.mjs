/**
 * Profile individual cell formatting
 */
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';

const dir = 'C:/dev/HelixData/workspace';
const { formatNotebook, initializePythonFormatter, formatCell } = await import('../packages/core/dist/index.js');

await initializePythonFormatter();

// Get a sample file (must exist)
const allFiles = [];
function walk(d) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) {
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.py')) {
      allFiles.push(full);
    }
  }
}
walk(dir);

const sampleFile = allFiles[0];
const content = fs.readFileSync(sampleFile, 'utf8');

console.log(`File: ${sampleFile}`);
console.log(`Size: ${(content.length / 1024).toFixed(1)}KB`);

// Extract cells manually and time them
const cellRegex = /"language":\s*"(\w+)"/g;
let match;
let sqlCount = 0, pyCount = 0;
while ((match = cellRegex.exec(content)) !== null) {
  if (match[1] === 'sparksql') sqlCount++;
  else if (match[1] === 'python' || match[1] === 'pyspark') pyCount++;
}
console.log(`Cells: ${sqlCount} SQL, ${pyCount} Python\n`);

// Time full file format
console.log('=== Full File Format ===');
const fullTimes = [];
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  await formatNotebook(content, '.py', { filePath: sampleFile });
  fullTimes.push(performance.now() - start);
}
const avgFull = fullTimes.reduce((a, b) => a + b) / fullTimes.length;
console.log(`  Avg time: ${avgFull.toFixed(1)}ms (${fullTimes.map(t => t.toFixed(0)).join(', ')})`);

// Time just SQL formatting (no file structure)
console.log('\n=== Just SQL Formatting (isolated) ===');
const testSql = 'select a.col1, b.col2, c.col3 from table_a a inner join table_b b on a.id = b.id inner join table_c c on b.id = c.id where a.status = 1 and b.type in (1,2,3) order by a.created_at desc';
const sqlTimes = [];
for (let i = 0; i < 100; i++) {
  const start = performance.now();
  formatCell(testSql, 'sparksql');
  sqlTimes.push(performance.now() - start);
}
const avgSql = sqlTimes.reduce((a, b) => a + b) / sqlTimes.length;
console.log(`  Avg time: ${avgSql.toFixed(2)}ms`);
console.log(`  SQL throughput: ${(1000 / avgSql).toFixed(0)} cells/sec`);

// Time just Python formatting
console.log('\n=== Just Python Formatting (isolated) ===');
const testPy = `def process_data(df):
    result = df.filter(df.status == 'active')
    result = result.select('id', 'name', 'value')
    result = result.withColumn('processed_at', current_timestamp())
    return result`;
const pyTimes = [];
for (let i = 0; i < 100; i++) {
  const start = performance.now();
  formatCell(testPy, 'python');
  pyTimes.push(performance.now() - start);
}
const avgPy = pyTimes.reduce((a, b) => a + b) / pyTimes.length;
console.log(`  Avg time: ${avgPy.toFixed(2)}ms`);
console.log(`  Python throughput: ${(1000 / avgPy).toFixed(0)} cells/sec`);

// Calculate expected vs actual
const expectedFileTime = (sqlCount * avgSql) + (pyCount * avgPy);
console.log(`\n=== Analysis ===`);
console.log(`Expected (cells only): ${expectedFileTime.toFixed(0)}ms`);
console.log(`Actual (full file): ${avgFull.toFixed(0)}ms`);
console.log(`Overhead: ${(avgFull - expectedFileTime).toFixed(0)}ms (${((avgFull / expectedFileTime - 1) * 100).toFixed(0)}% extra)`);
