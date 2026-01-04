/**
 * SQL Formatter Benchmark Suite
 *
 * Measures performance of the SQL formatter across various query sizes and complexity levels.
 * Outputs timing data for profiling and optimization work.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatSql } from '../formatters/sparksql/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BenchmarkResult {
  name: string;
  category: string;
  inputSize: number;
  outputSize: number;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
  changed: boolean;
}

interface CategorySummary {
  category: string;
  fileCount: number;
  totalInputChars: number;
  totalTimeMs: number;
  avgTimePerFile: number;
  avgTimePerKilochar: number;
}

/**
 * Run a single benchmark with multiple iterations.
 */
function runBenchmark(
  name: string,
  category: string,
  sql: string,
  iterations: number,
): BenchmarkResult {
  const times: number[] = [];
  let output = '';

  // Warm-up run (not counted)
  formatSql(sql);

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    output = formatSql(sql);
    const end = performance.now();
    times.push(end - start);
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / iterations;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);

  return {
    name,
    category,
    inputSize: sql.length,
    outputSize: output.length,
    iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    opsPerSec: 1000 / avgMs,
    changed: output !== sql,
  };
}

/**
 * Load all SQL files from a directory.
 */
function loadFixtures(dir: string): Map<string, string> {
  const fixtures = new Map<string, string>();

  if (!fs.existsSync(dir)) {
    return fixtures;
  }

  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.sql')) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      fixtures.set(file, content);
    }
  }

  return fixtures;
}

/**
 * Format duration in a human-readable way.
 */
function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(1)}µs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format a table row with aligned columns.
 */
function formatRow(
  cols: string[],
  widths: number[],
  align: ('left' | 'right')[],
): string {
  return cols
    .map((col, i) => {
      const width = widths[i] || 20;
      const a = align[i] || 'left';
      return a === 'left' ? col.padEnd(width) : col.padStart(width);
    })
    .join(' │ ');
}

/**
 * Run all benchmarks and output results.
 */
async function main() {
  const args = process.argv.slice(2);
  const iterations = Number.parseInt(args[0], 10) || 100;
  const outputJson = args.includes('--json');

  console.log(
    '╔════════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║           SQL Formatter Benchmark Suite                        ║',
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝',
  );
  console.log();
  console.log(`Iterations per file: ${iterations}`);
  console.log();

  const fixturesDir = path.join(__dirname, 'fixtures');
  const categories = ['small', 'medium', 'large'];
  const results: BenchmarkResult[] = [];
  const summaries: CategorySummary[] = [];

  for (const category of categories) {
    const categoryDir = path.join(fixturesDir, category);
    const fixtures = loadFixtures(categoryDir);

    if (fixtures.size === 0) {
      console.log(`⚠️  No fixtures found in ${category}/`);
      continue;
    }

    console.log(
      `\n━━━ ${category.toUpperCase()} QUERIES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    );

    const colWidths = [30, 10, 10, 12, 12, 10];
    const colAlign: ('left' | 'right')[] = [
      'left',
      'right',
      'right',
      'right',
      'right',
      'right',
    ];

    console.log(
      formatRow(
        ['File', 'Size', 'Avg', 'Min', 'Max', 'ops/sec'],
        colWidths,
        colAlign,
      ),
    );
    console.log('─'.repeat(90));

    let categoryTime = 0;
    let categoryChars = 0;

    for (const [file, sql] of fixtures) {
      const result = runBenchmark(file, category, sql, iterations);
      results.push(result);

      categoryTime += result.avgMs;
      categoryChars += result.inputSize;

      console.log(
        formatRow(
          [
            file,
            `${result.inputSize}`,
            formatDuration(result.avgMs),
            formatDuration(result.minMs),
            formatDuration(result.maxMs),
            `${result.opsPerSec.toFixed(1)}`,
          ],
          colWidths,
          colAlign,
        ),
      );
    }

    summaries.push({
      category,
      fileCount: fixtures.size,
      totalInputChars: categoryChars,
      totalTimeMs: categoryTime,
      avgTimePerFile: categoryTime / fixtures.size,
      avgTimePerKilochar: (categoryTime / categoryChars) * 1000,
    });
  }

  // Summary
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║                        SUMMARY                                 ║',
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝',
  );
  console.log();

  const summaryWidths = [10, 8, 12, 14, 14];
  const summaryAlign: ('left' | 'right')[] = [
    'left',
    'right',
    'right',
    'right',
    'right',
  ];

  console.log(
    formatRow(
      ['Category', 'Files', 'Total Chars', 'Avg/File', 'ms/1K chars'],
      summaryWidths,
      summaryAlign,
    ),
  );
  console.log('─'.repeat(65));

  for (const s of summaries) {
    console.log(
      formatRow(
        [
          s.category,
          `${s.fileCount}`,
          `${s.totalInputChars}`,
          formatDuration(s.avgTimePerFile),
          s.avgTimePerKilochar.toFixed(3),
        ],
        summaryWidths,
        summaryAlign,
      ),
    );
  }

  const totalTime = summaries.reduce((a, s) => a + s.totalTimeMs, 0);
  const totalChars = summaries.reduce((a, s) => a + s.totalInputChars, 0);
  const totalFiles = summaries.reduce((a, s) => a + s.fileCount, 0);

  console.log('─'.repeat(65));
  console.log(
    formatRow(
      [
        'TOTAL',
        `${totalFiles}`,
        `${totalChars}`,
        formatDuration(totalTime / totalFiles),
        ((totalTime / totalChars) * 1000).toFixed(3),
      ],
      summaryWidths,
      summaryAlign,
    ),
  );

  console.log();
  console.log(
    `Total benchmark time: ${formatDuration(totalTime * iterations)}`,
  );

  if (outputJson) {
    const jsonOutput = {
      timestamp: new Date().toISOString(),
      iterations,
      results,
      summaries,
      totals: {
        files: totalFiles,
        chars: totalChars,
        avgTimePerFile: totalTime / totalFiles,
        msPerKilochar: (totalTime / totalChars) * 1000,
      },
    };
    const jsonPath = path.join(__dirname, 'results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
    console.log(`\nResults saved to: ${jsonPath}`);
  }
}

main().catch(console.error);
