/**
 * Micro-benchmark to identify formatNotebook bottleneck
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
const { parseNotebook, formatCell, initializePythonFormatter } = await import('../packages/core/dist/index.js');
await initializePythonFormatter();

// Read all files
const notebooks = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file);
  const notebook = parseNotebook(content, ext);
  if (notebook.isFabricNotebook) {
    notebooks.push({ file, content, notebook });
  }
}
console.log(`Found ${notebooks.length} Fabric notebooks with ${notebooks.reduce((s, n) => s + n.notebook.cells.length, 0)} cells`);

// First run formatNotebook to warm up JIT
console.log('\n=== Warming up JIT with formatNotebook ===');
const core = await import('../packages/core/dist/index.js');
const warmupStart = performance.now();
for (const { file, content } of notebooks) {
  const ext = path.extname(file);
  await core.formatNotebook(content, ext, { filePath: file });
}
const warmupTime = performance.now() - warmupStart;
console.log(`  Warmup: ${warmupTime.toFixed(0)}ms`);

// Now simulate what formatNotebook does but with detailed timing
let parseTime = 0;
let formatTime = 0;
let computeReplacementTime = 0;
let applyReplacementsTime = 0;
let loopOverheadTime = 0;
let cellsProcessed = 0;
let cellsSkipped = 0;

for (const { file, content, notebook } of notebooks) {
  // formatCell calls
  const cellFormatStart = performance.now();
  for (const cell of notebook.cells) {
    const magicCmd = cell.magicCommand;
    const shouldFormat = (cell.language === 'sparksql' && (magicCmd === null || magicCmd === 'sql')) ||
                         (cell.language === 'python' && (magicCmd === null || magicCmd === 'pyspark'));
    
    if (shouldFormat) {
      formatCell(cell.content, cell.language);
      cellsProcessed++;
    } else {
      cellsSkipped++;
    }
  }
  formatTime += performance.now() - cellFormatStart;
  
  // computeReplacementLines simulation (just the string splits)
  const computeStart = performance.now();
  for (const cell of notebook.cells) {
    // Simulate what computeReplacementLines does
    const formattedContent = cell.content; // pretend it's formatted
    const newLines = formattedContent.split(/\r?\n/);
    // Also simulate addMagicPrefix
    if (cell.isMagicCell && notebook.config) {
      newLines.map(line => line === '' ? notebook.config.emptyMagic : notebook.config.magicPrefix + line);
    }
  }
  computeReplacementTime += performance.now() - computeStart;
}

console.log('\n=== Timing breakdown ===');
console.log(`  Cells processed: ${cellsProcessed}, skipped: ${cellsSkipped}`);
console.log(`  formatCell total: ${formatTime.toFixed(0)}ms`);
console.log(`  computeReplacement simulation: ${computeReplacementTime.toFixed(0)}ms`);
console.log(`  Loop overhead: ${loopOverheadTime.toFixed(0)}ms`);

// Now time the actual formatNotebook (2nd run - JIT warmed)
console.log('\n=== Actual formatNotebook (2nd run) ===');
const actualStart = performance.now();
for (const { file, content } of notebooks) {
  const ext = path.extname(file);
  await core.formatNotebook(content, ext, { filePath: file });
}
const actualTime = performance.now() - actualStart;
console.log(`  Total: ${actualTime.toFixed(0)}ms`);
console.log(`  Overhead vs formatCell: ${(actualTime - formatTime).toFixed(0)}ms (${((actualTime - formatTime) / formatTime * 100).toFixed(1)}%)`);
