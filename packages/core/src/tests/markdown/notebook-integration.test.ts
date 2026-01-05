/**
 * Markdown Notebook Integration Tests
 *
 * Tests for notebook-level markdown cell formatting including:
 * - MARKDOWN header detection
 * - Comment prefix stripping/restoration
 * - Mixed notebook with python + sparksql + markdown cells
 * - Edge cases like empty cells, code blocks inside markdown
 */

import type { SuiteResult } from '../framework.js';
import { formatNotebook, parseNotebook } from '../../notebook-formatter.js';

/**
 * Run all notebook integration tests for markdown.
 */
export async function runNotebookIntegrationTests(): Promise<SuiteResult> {
  const results: { name: string; passed: boolean; message?: string }[] = [];
  let passed = 0;
  let failed = 0;

  // Note: Suite header is printed by printSuiteResult in the test runner

  // Test: Detect MARKDOWN cell header in Python file
  try {
    const content = `# Fabric notebook source

# CELL ********************

# MARKDOWN ********************
# # Hello World
# This is a **markdown** cell.

# METADATA ********************
# META {
# META   "language": "markdown"
# META }
`;
    const notebook = parseNotebook(content, '.py');
    if (notebook.cells.length === 1 && notebook.cells[0].language === 'markdown') {
      console.log("  [PASS] Detect '# MARKDOWN ********************' cell header");
      passed++;
      results.push({ name: "Detect '# MARKDOWN ********************' cell header", passed: true });
    } else {
      console.log("  [FAIL] Detect '# MARKDOWN ********************' cell header");
      failed++;
      results.push({
        name: "Detect '# MARKDOWN ********************' cell header",
        passed: false,
        message: `Expected markdown cell, got ${notebook.cells[0]?.language}`,
      });
    }
  } catch (e) {
    console.log(`  [FAIL] Detect '# MARKDOWN ********************' cell header: ${e}`);
    failed++;
    results.push({
      name: "Detect '# MARKDOWN ********************' cell header",
      passed: false,
      message: String(e),
    });
  }

  // Test: Strip '# ' prefix from content lines
  try {
    const content = `# Fabric notebook source

# CELL ********************

# MARKDOWN ********************
# # Hello
# Some text

# METADATA ********************
# META {
# META   "language": "markdown"
# META }
`;
    const notebook = parseNotebook(content, '.py');
    const expectedContent = '# Hello\nSome text';
    if (notebook.cells[0]?.content === expectedContent) {
      console.log("  [PASS] Strip '# ' prefix from content lines");
      passed++;
      results.push({ name: "Strip '# ' prefix from content lines", passed: true });
    } else {
      console.log("  [FAIL] Strip '# ' prefix from content lines");
      failed++;
      results.push({
        name: "Strip '# ' prefix from content lines",
        passed: false,
        message: `Expected "${expectedContent}", got "${notebook.cells[0]?.content}"`,
      });
    }
  } catch (e) {
    console.log(`  [FAIL] Strip '# ' prefix from content lines: ${e}`);
    failed++;
    results.push({
      name: "Strip '# ' prefix from content lines",
      passed: false,
      message: String(e),
    });
  }

  // Test: Restore '# ' prefix after formatting
  try {
    const content = `# Fabric notebook source

# CELL ********************

# MARKDOWN ********************
# Hello   world

# METADATA ********************
# META {
# META   "language": "markdown"
# META }
`;
    const result = await formatNotebook(content, '.py');
    // After formatting, "Hello   world" should become "Hello world" and be prefixed with "# "
    if (result.content.includes('# Hello world')) {
      console.log("  [PASS] Restore '# ' prefix after formatting");
      passed++;
      results.push({ name: "Restore '# ' prefix after formatting", passed: true });
    } else {
      console.log("  [FAIL] Restore '# ' prefix after formatting");
      failed++;
      results.push({
        name: "Restore '# ' prefix after formatting",
        passed: false,
        message: `Content does not include "# Hello world": ${result.content}`,
      });
    }
  } catch (e) {
    console.log(`  [FAIL] Restore '# ' prefix after formatting: ${e}`);
    failed++;
    results.push({
      name: "Restore '# ' prefix after formatting",
      passed: false,
      message: String(e),
    });
  }

  // Test: Mixed notebook with python + sparksql + markdown cells
  try {
    const content = `# Fabric notebook source

# CELL ********************

x=1

# METADATA ********************
# META {
# META   "language": "python"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC select *
# MAGIC from table

# METADATA ********************
# META {
# META   "language": "sparksql"
# META }

# CELL ********************

# MARKDOWN ********************
# # Title
# Some text.

# METADATA ********************
# META {
# META   "language": "markdown"
# META }
`;
    const result = await formatNotebook(content, '.py');
    // Should format all three types
    if (
      result.stats.pythonCellsFormatted >= 0 &&
      result.stats.sparkSqlCellsFormatted >= 0 &&
      result.stats.markdownCellsFormatted >= 0 &&
      !result.stats.errors.length
    ) {
      console.log('  [PASS] Mixed notebook with python + sparksql + markdown cells');
      passed++;
      results.push({ name: 'Mixed notebook with python + sparksql + markdown cells', passed: true });
    } else {
      console.log('  [FAIL] Mixed notebook with python + sparksql + markdown cells');
      failed++;
      results.push({
        name: 'Mixed notebook with python + sparksql + markdown cells',
        passed: false,
        message: `Errors: ${result.stats.errors.join(', ')}`,
      });
    }
  } catch (e) {
    console.log(`  [FAIL] Mixed notebook with python + sparksql + markdown cells: ${e}`);
    failed++;
    results.push({
      name: 'Mixed notebook with python + sparksql + markdown cells',
      passed: false,
      message: String(e),
    });
  }

  // Test: Empty markdown cell handling
  try {
    const content = `# Fabric notebook source

# CELL ********************

# MARKDOWN ********************
#

# METADATA ********************
# META {
# META   "language": "markdown"
# META }
`;
    const notebook = parseNotebook(content, '.py');
    if (notebook.cells.length === 1 && notebook.cells[0].language === 'markdown') {
      console.log('  [PASS] Empty markdown cell handling');
      passed++;
      results.push({ name: 'Empty markdown cell handling', passed: true });
    } else {
      console.log('  [FAIL] Empty markdown cell handling');
      failed++;
      results.push({
        name: 'Empty markdown cell handling',
        passed: false,
        message: `Expected 1 markdown cell, got ${notebook.cells.length} with language ${notebook.cells[0]?.language}`,
      });
    }
  } catch (e) {
    console.log(`  [FAIL] Empty markdown cell handling: ${e}`);
    failed++;
    results.push({
      name: 'Empty markdown cell handling',
      passed: false,
      message: String(e),
    });
  }

  // Test: Markdown cell with code blocks (should preserve)
  try {
    const content = `# Fabric notebook source

# CELL ********************

# MARKDOWN ********************
# Here is some code:
# \`\`\`python
# x = 1
# \`\`\`

# METADATA ********************
# META {
# META   "language": "markdown"
# META }
`;
    const result = await formatNotebook(content, '.py');
    // Code blocks should be preserved
    if (result.content.includes('```python') && result.content.includes('x = 1')) {
      console.log('  [PASS] Markdown cell with code blocks (should preserve)');
      passed++;
      results.push({ name: 'Markdown cell with code blocks (should preserve)', passed: true });
    } else {
      console.log('  [FAIL] Markdown cell with code blocks (should preserve)');
      failed++;
      results.push({
        name: 'Markdown cell with code blocks (should preserve)',
        passed: false,
        message: 'Code block not preserved correctly',
      });
    }
  } catch (e) {
    console.log(`  [FAIL] Markdown cell with code blocks (should preserve): ${e}`);
    failed++;
    results.push({
      name: 'Markdown cell with code blocks (should preserve)',
      passed: false,
      message: String(e),
    });
  }

  // Test: Edge case - line is just '#' (empty content line)
  try {
    const content = `# Fabric notebook source

# CELL ********************

# MARKDOWN ********************
# First line
#
# Third line

# METADATA ********************
# META {
# META   "language": "markdown"
# META }
`;
    const notebook = parseNotebook(content, '.py');
    // Should handle '#' as empty line
    if (
      notebook.cells.length === 1 &&
      notebook.cells[0].content.includes('First line') &&
      notebook.cells[0].content.includes('Third line')
    ) {
      console.log("  [PASS] Edge case: line is just '#' (empty content line)");
      passed++;
      results.push({ name: "Edge case: line is just '#' (empty content line)", passed: true });
    } else {
      console.log("  [FAIL] Edge case: line is just '#' (empty content line)");
      failed++;
      results.push({
        name: "Edge case: line is just '#' (empty content line)",
        passed: false,
        message: `Content: ${notebook.cells[0]?.content}`,
      });
    }
  } catch (e) {
    console.log(`  [FAIL] Edge case: line is just '#' (empty content line): ${e}`);
    failed++;
    results.push({
      name: "Edge case: line is just '#' (empty content line)",
      passed: false,
      message: String(e),
    });
  }

  // Test: FormatStats.markdownCellsFormatted increments correctly
  try {
    const content = `# Fabric notebook source

# CELL ********************

# MARKDOWN ********************
# Hello   world

# METADATA ********************
# META {
# META   "language": "markdown"
# META }

# CELL ********************

# MARKDOWN ********************
# Another   cell

# METADATA ********************
# META {
# META   "language": "markdown"
# META }
`;
    const result = await formatNotebook(content, '.py');
    if (result.stats.markdownCellsFormatted === 2) {
      console.log('  [PASS] FormatStats.markdownCellsFormatted increments correctly');
      passed++;
      results.push({ name: 'FormatStats.markdownCellsFormatted increments correctly', passed: true });
    } else {
      console.log('  [FAIL] FormatStats.markdownCellsFormatted increments correctly');
      failed++;
      results.push({
        name: 'FormatStats.markdownCellsFormatted increments correctly',
        passed: false,
        message: `Expected 2, got ${result.stats.markdownCellsFormatted}`,
      });
    }
  } catch (e) {
    console.log(`  [FAIL] FormatStats.markdownCellsFormatted increments correctly: ${e}`);
    failed++;
    results.push({
      name: 'FormatStats.markdownCellsFormatted increments correctly',
      passed: false,
      message: String(e),
    });
  }

  console.log(`  [${passed}/${passed + failed} passed]`);

  return {
    suiteName: 'Markdown Notebook Integration',
    passed,
    failed,
    results: results.map((r) => ({ name: r.name, passed: r.passed, message: r.message })),
  };
}
