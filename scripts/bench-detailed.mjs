/**
 * Detailed benchmark to understand formatNotebook internals
 */
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';

const dir = 'C:/dev/HelixData/workspace';

// Collect test files
const files = [];
function walk(d) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build'].includes(entry.name)) {
      walk(full);
    } else if (entry.isFile() && (entry.name.endsWith('.py') || entry.name.endsWith('.sql'))) {
      files.push(full);
    }
  }
}
walk(dir);
console.log(`Found ${files.length} files`);

// Load the library
const { formatNotebook, initializePythonFormatter, parseNotebook, formatCell } = await import('../packages/core/dist/index.js');
await initializePythonFormatter();

// Read all files first
const contents = new Map();
for (const file of files) {
  contents.set(file, fs.readFileSync(file, 'utf8'));
}

// Test 1: Full formatNotebook timing (FRESH - no caching)
console.log('\n=== Test 1: formatNotebook timing (fresh) ===');
let notebookCount = 0;
let totalCells = 0;
let sqlFormatted = 0;
let pyFormatted = 0;
let skipped = 0;
const fullStart = performance.now();
for (const [file, content] of contents.entries()) {
  const ext = path.extname(file);
  const result = await formatNotebook(content, ext, { filePath: file });
  notebookCount++;
  sqlFormatted += result.stats?.sparkSqlCellsFormatted || 0;
  pyFormatted += result.stats?.pythonCellsFormatted || 0;
  skipped += result.stats?.cellsSkipped || 0;
}
totalCells = sqlFormatted + pyFormatted + skipped;
const fullTime = performance.now() - fullStart;
console.log(`  ${notebookCount} files processed`);
console.log(`  SQL formatted: ${sqlFormatted}, Python formatted: ${pyFormatted}, Skipped: ${skipped}, Total: ${totalCells}`);
console.log(`  formatNotebook total: ${fullTime.toFixed(0)}ms (${(fullTime / notebookCount).toFixed(2)}ms per file)`);

// Test 2: How long does parseNotebook take alone?
console.log('\n=== Test 2: parseNotebook timing ===');
let parseTime = 0;
let fabricNotebooks = 0;
let cellCount = 0;
for (const [file, content] of contents.entries()) {
  const ext = path.extname(file);
  const parseStart = performance.now();
  const notebook = parseNotebook(content, ext);
  parseTime += performance.now() - parseStart;
  
  if (notebook.isFabricNotebook) {
    fabricNotebooks++;
    cellCount += notebook.cells.length;
  }
}
console.log(`  ${fabricNotebooks} notebooks, ${cellCount} cells`);
console.log(`  parseNotebook: ${parseTime.toFixed(0)}ms (${(parseTime / fabricNotebooks).toFixed(2)}ms per notebook)`);

// Test 3: How long does formatCell take for each cell?
console.log('\n=== Test 3: formatCell timing ===');
let formatCellTime = 0;
let cellsFormatted = 0;

for (const [file, content] of contents.entries()) {
  const ext = path.extname(file);
  const notebook = parseNotebook(content, ext);
  
  if (!notebook.isFabricNotebook) continue;
  
  for (const cell of notebook.cells) {
    const start = performance.now();
    formatCell(cell.content, cell.language);
    formatCellTime += performance.now() - start;
    cellsFormatted++;
  }
}
console.log(`  Formatted ${cellsFormatted} cells`);
console.log(`  formatCell total: ${formatCellTime.toFixed(0)}ms (${(formatCellTime / cellsFormatted).toFixed(2)}ms per cell)`);

// Summary
console.log('\n=== Summary ===');
const expectedTime = parseTime + formatCellTime;
const overhead = fullTime - expectedTime;
console.log(`  parseNotebook: ${parseTime.toFixed(0)}ms`);
console.log(`  formatCell sum: ${formatCellTime.toFixed(0)}ms`);
console.log(`  Expected total: ${expectedTime.toFixed(0)}ms`);
console.log(`  Actual total:   ${fullTime.toFixed(0)}ms`);
console.log(`  Overhead:       ${overhead.toFixed(0)}ms (${((overhead / expectedTime) * 100).toFixed(1)}% of expected)`);
