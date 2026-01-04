/**
 * SQL Formatter Profiler
 *
 * Profiles the SQL formatter to identify performance bottlenecks.
 * Run with: node --prof dist/benchmarks/profile.js
 * Then: node --prof-process isolate-*.log > profile.txt
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatSql } from '../formatters/sparksql/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load a fixture file.
 */
function loadFixture(category: string, name: string): string {
  const fixturePath = path.join(__dirname, 'fixtures', category, name);
  return fs.readFileSync(fixturePath, 'utf-8');
}

/**
 * Run many iterations to get enough data for profiling.
 */
function profileSql(sql: string, iterations: number, label: string): void {
  console.log(`Profiling ${label}: ${iterations} iterations...`);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    formatSql(sql);
  }
  const end = performance.now();

  console.log(`  Completed in ${(end - start).toFixed(2)}ms`);
  console.log(
    `  Average: ${((end - start) / iterations).toFixed(3)}ms per call`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const iterations = Number.parseInt(args[0], 10) || 1000;

  console.log(
    '╔══════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║            SQL Formatter Profiler                            ║',
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════╝',
  );
  console.log();
  console.log('Run this script with --prof flag to generate V8 profile data:');
  console.log('  node --prof dist/benchmarks/profile.js');
  console.log();
  console.log('Then process the log:');
  console.log('  node --prof-process isolate-*.log > profile.txt');
  console.log();

  // Load fixtures
  const smallSql = loadFixture('small', 'simple-select.sql');
  const mediumSql = loadFixture('medium', 'cte.sql');
  const largeSql = loadFixture('large', 'complex-analytics.sql');

  // Warm up
  console.log('Warming up...');
  for (let i = 0; i < 10; i++) {
    formatSql(smallSql);
    formatSql(mediumSql);
    formatSql(largeSql);
  }

  console.log();
  console.log(`Running ${iterations} iterations per fixture...`);
  console.log();

  // Profile each size
  profileSql(smallSql, iterations, 'small (simple-select.sql)');
  profileSql(mediumSql, iterations, 'medium (cte.sql)');
  profileSql(
    largeSql,
    Math.floor(iterations / 2),
    'large (complex-analytics.sql)',
  );

  console.log();
  console.log('Profile data collection complete.');
}

main().catch(console.error);
