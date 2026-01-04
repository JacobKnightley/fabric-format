/**
 * Instrumented version of CLI to diagnose slowness
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance } from 'perf_hooks';

const globalStart = performance.now();

// Time module imports
const importStart = performance.now();
const { formatNotebook, initializePythonFormatter } = await import('../packages/core/dist/index.js');
console.log(`Module import: ${(performance.now() - importStart).toFixed(0)}ms`);

const dir = 'C:/dev/HelixData/workspace';

// File discovery
console.log('\nFile discovery...');
const discoverStart = performance.now();
const files = [];
function walk(d) {
  const entries = fs.readdirSync(d, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(d, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build'].includes(entry.name)) {
      walk(full);
    } else if (entry.isFile() && (entry.name.endsWith('.py') || entry.name.endsWith('.sql') || entry.name.endsWith('.scala') || entry.name.endsWith('.r'))) {
      files.push(full);
    }
  }
}
walk(dir);
console.log(`  Found ${files.length} files in ${(performance.now() - discoverStart).toFixed(0)}ms`);

// Python init
console.log('\nPython formatter init...');
const pyStart = performance.now();
await initializePythonFormatter();
console.log(`  Init: ${(performance.now() - pyStart).toFixed(0)}ms`);

// Process files
console.log('\nProcessing files...');
let readTime = 0, formatTime = 0, writeCheckTime = 0;
let formattedCount = 0;

const processStart = performance.now();
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  
  const readStart = performance.now();
  const content = fs.readFileSync(file, 'utf8');
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  readTime += performance.now() - readStart;
  
  const fmtStart = performance.now();
  const ext = path.extname(file).toLowerCase();
  // Test without filePath option
  const { content: formatted } = await formatNotebook(normalized, ext, {
    formatPython: true,
    formatSql: true,
    // filePath: file,  // Commented out for testing
  });
  formatTime += performance.now() - fmtStart;
  
  const writeStart = performance.now();
  if (formatted !== normalized) {
    // Would write here, but skip for benchmark
    formattedCount++;
  }
  writeCheckTime += performance.now() - writeStart;
  
  // Progress every 50 files
  if ((i + 1) % 50 === 0) {
    console.log(`  Processed ${i + 1}/${files.length}...`);
  }
}

const totalProcess = performance.now() - processStart;
const totalTime = performance.now() - globalStart;

console.log(`\nBreakdown:`);
console.log(`  Read time: ${readTime.toFixed(0)}ms`);
console.log(`  Format time: ${formatTime.toFixed(0)}ms`);
console.log(`  Write check: ${writeCheckTime.toFixed(0)}ms`);
console.log(`  Process loop: ${totalProcess.toFixed(0)}ms`);
console.log(`\nTotal: ${totalTime.toFixed(0)}ms`);
console.log(`Files that would be formatted: ${formattedCount}`);
