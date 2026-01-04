/**
 * Benchmark: extractCodeFromEditor optimizations
 * Compares old vs new implementation using JSDOM mock
 */

import { JSDOM } from 'jsdom';

// ============================================================================
// OLD Implementation (before optimization)
// ============================================================================
function extractCodeFromEditor_OLD(editorElement) {
  const lines = editorElement.querySelectorAll('.view-lines .view-line');
  const codeLines = [];

  const sortedLines = Array.from(lines).sort((a, b) => {
    const topA = parseFloat(a.style?.top) || 0;
    const topB = parseFloat(b.style?.top) || 0;
    return topA - topB;
  });

  for (const line of sortedLines) {
    let lineText = '';
    const spans = line.querySelectorAll('span > span');

    if (spans.length > 0) {
      for (const span of spans) {
        lineText += span.textContent.replace(/\u00a0/g, ' ');
      }
    } else {
      lineText = line.textContent.replace(/\u00a0/g, ' ');
    }

    codeLines.push(lineText);
  }

  return codeLines.join('\n');
}

// ============================================================================
// NEW Implementation (optimized)
// ============================================================================
function extractCodeFromEditor_NEW(editorElement) {
  const lines = editorElement.querySelectorAll('.view-lines .view-line');
  const codeLines = [];

  if (lines.length === 0) {
    return '';
  }

  // Optimization: Pre-compute top values and check if already sorted
  const linesArray = Array.from(lines);
  const topValues = linesArray.map((line) => parseFloat(line.style?.top) || 0);

  // Check if already sorted by comparing adjacent pairs
  let needsSort = false;
  for (let i = 1; i < topValues.length; i++) {
    if (topValues[i] < topValues[i - 1]) {
      needsSort = true;
      break;
    }
  }

  let sortedLines;
  if (needsSort) {
    // Create index array and sort by pre-computed top values
    const indices = linesArray.map((_, i) => i);
    indices.sort((a, b) => topValues[a] - topValues[b]);
    sortedLines = indices.map((i) => linesArray[i]);
  } else {
    sortedLines = linesArray;
  }

  // Optimization: Use children iteration instead of querySelectorAll
  // and defer nbsp replacement to end
  for (const line of sortedLines) {
    let lineText = '';
    let hasSpans = false;

    for (const child of line.children) {
      if (child.tagName === 'SPAN') {
        for (const span of child.children) {
          if (span.tagName === 'SPAN') {
            lineText += span.textContent;
            hasSpans = true;
          }
        }
        if (!hasSpans && child.textContent) {
          lineText += child.textContent;
          hasSpans = true;
        }
      }
    }

    if (!hasSpans) {
      lineText = line.textContent;
    }

    codeLines.push(lineText);
  }

  // Single nbsp replacement at the end
  const rawCode = codeLines.join('\n');
  return rawCode.includes('\u00a0')
    ? rawCode.replaceAll('\u00a0', ' ')
    : rawCode;
}

// ============================================================================
// Test DOM Creation
// ============================================================================
function createMockEditor(lineCount, shuffled = false, withNbsp = false) {
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    const top = shuffled ? Math.random() * lineCount * 20 : i * 20;
    const text = withNbsp 
      ? `SELECT\u00a0*\u00a0FROM\u00a0table_${i}\u00a0WHERE\u00a0id\u00a0=\u00a0${i}`
      : `SELECT * FROM table_${i} WHERE id = ${i}`;
    lines.push(`
      <div class="view-line" style="top: ${top}px">
        <span><span>${text}</span></span>
      </div>
    `);
  }

  const html = `
    <div class="monaco-editor">
      <div class="view-lines">
        ${lines.join('')}
      </div>
    </div>
  `;

  const dom = new JSDOM(html);
  return dom.window.document.querySelector('.monaco-editor');
}

// ============================================================================
// Benchmark Runner
// ============================================================================
function benchmark(name, fn, iterations) {
  // Warmup
  for (let i = 0; i < 10; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;
  return { name, elapsed, perCall: elapsed / iterations };
}

function runBenchmark(scenario, editor, iterations) {
  console.log(`\n📊 ${scenario} (${iterations} iterations)`);
  console.log('─'.repeat(50));

  const oldResult = benchmark('OLD', () => extractCodeFromEditor_OLD(editor), iterations);
  const newResult = benchmark('NEW', () => extractCodeFromEditor_NEW(editor), iterations);

  const speedup = ((oldResult.elapsed - newResult.elapsed) / oldResult.elapsed * 100).toFixed(1);
  const faster = newResult.elapsed < oldResult.elapsed;

  console.log(`  OLD: ${oldResult.elapsed.toFixed(2)}ms total, ${oldResult.perCall.toFixed(3)}ms/call`);
  console.log(`  NEW: ${newResult.elapsed.toFixed(2)}ms total, ${newResult.perCall.toFixed(3)}ms/call`);
  console.log(`  ${faster ? '✅' : '❌'} ${faster ? 'Faster' : 'Slower'} by ${Math.abs(speedup)}%`);

  // Verify correctness
  const oldCode = extractCodeFromEditor_OLD(editor);
  const newCode = extractCodeFromEditor_NEW(editor);
  if (oldCode !== newCode) {
    console.log('  ⚠️  WARNING: Output mismatch!');
    console.log(`  OLD length: ${oldCode.length}, NEW length: ${newCode.length}`);
  } else {
    console.log('  ✓ Output matches');
  }

  return { oldResult, newResult, speedup: parseFloat(speedup) };
}

// ============================================================================
// Main
// ============================================================================
console.log('╔══════════════════════════════════════════════════╗');
console.log('║  extractCodeFromEditor Optimization Benchmark    ║');
console.log('╚══════════════════════════════════════════════════╝');

const results = [];

// Scenario 1: Small editor, already sorted (common case)
const small = createMockEditor(20, false, false);
results.push(runBenchmark('Small (20 lines, sorted)', small, 1000));

// Scenario 2: Medium editor, already sorted
const medium = createMockEditor(100, false, false);
results.push(runBenchmark('Medium (100 lines, sorted)', medium, 500));

// Scenario 3: Large editor, already sorted
const large = createMockEditor(500, false, false);
results.push(runBenchmark('Large (500 lines, sorted)', large, 100));

// Scenario 4: Medium editor, shuffled (needs sort)
const shuffled = createMockEditor(100, true, false);
results.push(runBenchmark('Medium (100 lines, shuffled)', shuffled, 500));

// Scenario 5: Medium editor with nbsp characters
const nbsp = createMockEditor(100, false, true);
results.push(runBenchmark('Medium (100 lines, with nbsp)', nbsp, 500));

// Scenario 6: Simulated stability loop (100 extractions from same editor)
console.log('\n📊 Stability Loop Simulation (100 extractions)');
console.log('─'.repeat(50));
const stabilityEditor = createMockEditor(50, false, true);

const stabilityOld = benchmark('OLD x100', () => {
  for (let i = 0; i < 100; i++) extractCodeFromEditor_OLD(stabilityEditor);
}, 10);

const stabilityNew = benchmark('NEW x100', () => {
  for (let i = 0; i < 100; i++) extractCodeFromEditor_NEW(stabilityEditor);
}, 10);

const stabilitySpeedup = ((stabilityOld.elapsed - stabilityNew.elapsed) / stabilityOld.elapsed * 100).toFixed(1);
console.log(`  OLD: ${stabilityOld.elapsed.toFixed(2)}ms for 1000 extractions`);
console.log(`  NEW: ${stabilityNew.elapsed.toFixed(2)}ms for 1000 extractions`);
console.log(`  ${stabilityNew.elapsed < stabilityOld.elapsed ? '✅' : '❌'} ${Math.abs(stabilitySpeedup)}% ${stabilityNew.elapsed < stabilityOld.elapsed ? 'faster' : 'slower'}`);

// Summary
console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║                    SUMMARY                       ║');
console.log('╚══════════════════════════════════════════════════╝');
const avgSpeedup = results.reduce((sum, r) => sum + r.speedup, 0) / results.length;
console.log(`Average speedup: ${avgSpeedup.toFixed(1)}%`);
