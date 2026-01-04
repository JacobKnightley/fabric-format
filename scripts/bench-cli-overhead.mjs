/**
 * Benchmark to diagnose CLI overhead
 */
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';

const dir = 'C:/dev/HelixData/workspace';

// 1. Test file discovery (sync)
console.log('=== Sync File Discovery ===');
const syncStart = performance.now();
const filesSync = [];
function walkSync(d) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build'].includes(entry.name)) {
      walkSync(full);
    } else if (entry.isFile() && (entry.name.endsWith('.py') || entry.name.endsWith('.sql'))) {
      filesSync.push(full);
    }
  }
}
walkSync(dir);
console.log(`  Found ${filesSync.length} files in ${(performance.now() - syncStart).toFixed(0)}ms`);

// 2. Test file discovery (async like CLI)
console.log('\n=== Async File Discovery (CLI style) ===');
const asyncStart = performance.now();
const filesAsync = [];
async function walkAsync(d) {
  const entries = await fs.promises.readdir(d, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(d, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build'].includes(entry.name)) {
      await walkAsync(full);
    } else if (entry.isFile() && (entry.name.endsWith('.py') || entry.name.endsWith('.sql'))) {
      filesAsync.push(full);
    }
  }
}
await walkAsync(dir);
console.log(`  Found ${filesAsync.length} files in ${(performance.now() - asyncStart).toFixed(0)}ms`);

// 3. Test file reading (sync)
console.log('\n=== Sync File Reading ===');
const readSyncStart = performance.now();
let totalBytesSync = 0;
for (const file of filesSync) {
  const content = fs.readFileSync(file, 'utf8');
  totalBytesSync += content.length;
}
console.log(`  Read ${filesSync.length} files (${(totalBytesSync / 1024 / 1024).toFixed(1)}MB) in ${(performance.now() - readSyncStart).toFixed(0)}ms`);

// 4. Test file reading (async sequential like CLI)
console.log('\n=== Async Sequential File Reading (CLI style) ===');
const readAsyncSeqStart = performance.now();
let totalBytesAsyncSeq = 0;
for (const file of filesAsync) {
  const content = await fs.promises.readFile(file, 'utf8');
  totalBytesAsyncSeq += content.length;
}
console.log(`  Read ${filesAsync.length} files (${(totalBytesAsyncSeq / 1024 / 1024).toFixed(1)}MB) in ${(performance.now() - readAsyncSeqStart).toFixed(0)}ms`);

// 5. Now test formatting with detailed timing
console.log('\n=== Formatting with Detailed Timing (Run 1 - JIT warmup) ===');
const { formatNotebook, initializePythonFormatter } = await import('../packages/core/dist/index.js');
await initializePythonFormatter();

let formatTime = 0;
let readTime = 0;

const fmtStart = performance.now();
for (const file of filesSync) {
  const readStart = performance.now();
  const content = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file);
  readTime += performance.now() - readStart;
  
  const formatStart = performance.now();
  await formatNotebook(content, ext, { filePath: file });
  formatTime += performance.now() - formatStart;
}
const totalTime = performance.now() - fmtStart;
console.log(`  Total: ${totalTime.toFixed(0)}ms`);
console.log(`  File reads: ${readTime.toFixed(0)}ms`);
console.log(`  Formatting: ${formatTime.toFixed(0)}ms`);
console.log(`  Other: ${(totalTime - readTime - formatTime).toFixed(0)}ms`);

// Run 2 - warmed
console.log('\n=== Formatting with Detailed Timing (Run 2 - JIT warmed) ===');
formatTime = 0;
readTime = 0;

const fmtStart2 = performance.now();
for (const file of filesSync) {
  const readStart = performance.now();
  const content = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file);
  readTime += performance.now() - readStart;
  
  const formatStart = performance.now();
  await formatNotebook(content, ext, { filePath: file });
  formatTime += performance.now() - formatStart;
}
const totalTime2 = performance.now() - fmtStart2;
console.log(`  Total: ${totalTime2.toFixed(0)}ms`);
console.log(`  File reads: ${readTime.toFixed(0)}ms`);
console.log(`  Formatting: ${formatTime.toFixed(0)}ms`);
console.log(`  Other: ${(totalTime2 - readTime - formatTime).toFixed(0)}ms`);
