/**
 * Notebook Parsing Tests
 *
 * Tests for the notebook-formatter module's parsing logic.
 * These tests verify correct detection of:
 * - Fabric notebook format detection
 * - Cell boundary detection
 * - Language detection from metadata
 * - MAGIC prefix handling
 * - Different file types (.py, .scala, .sql, .r)
 */

import { parseNotebook } from '../../notebook-formatter.js';
import type { TestResult, TestSuite } from '../framework.js';

export const notebookParsingTests: TestSuite = {
  name: 'Notebook Parsing',
  tests: [], // Populated by runNotebookParsingTests
};

interface ParsingTestCase {
  name: string;
  test: () => { passed: boolean; message?: string };
}

const parsingTests: ParsingTestCase[] = [
  // Fabric notebook detection
  {
    name: 'Detects Python Fabric notebook',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

x = 1

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.isFabricNotebook === true,
        message: result.isFabricNotebook
          ? undefined
          : 'Failed to detect Python Fabric notebook',
      };
    },
  },
  {
    name: 'Detects Scala Fabric notebook',
    test: () => {
      const content = `// Fabric notebook source

// CELL ********************

val x = 1

// METADATA ********************

// META {
// META   "language": "scala"
// META }
`;
      const result = parseNotebook(content, '.scala');
      return {
        passed: result.isFabricNotebook === true,
        message: result.isFabricNotebook
          ? undefined
          : 'Failed to detect Scala Fabric notebook',
      };
    },
  },
  {
    name: 'Detects SQL Fabric notebook',
    test: () => {
      const content = `-- Fabric notebook source

-- CELL ********************

SELECT * FROM table

-- METADATA ********************

-- META {
-- META   "language": "sparksql"
-- META }
`;
      const result = parseNotebook(content, '.sql');
      return {
        passed: result.isFabricNotebook === true,
        message: result.isFabricNotebook
          ? undefined
          : 'Failed to detect SQL Fabric notebook',
      };
    },
  },
  {
    name: 'Rejects non-Fabric Python file',
    test: () => {
      const content = `# Regular Python file
x = 1
y = 2
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.isFabricNotebook === false,
        message: result.isFabricNotebook
          ? 'Should not detect as Fabric notebook'
          : undefined,
      };
    },
  },
  {
    name: 'Rejects non-Fabric SQL file',
    test: () => {
      const content = `SELECT * FROM table WHERE id = 1`;
      const result = parseNotebook(content, '.sql');
      return {
        passed: result.isFabricNotebook === false,
        message: result.isFabricNotebook
          ? 'Should not detect as Fabric notebook'
          : undefined,
      };
    },
  },

  // Cell detection
  {
    name: 'Parses single cell',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

x = 1

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.cells.length === 1,
        message: `Expected 1 cell, got ${result.cells.length}`,
      };
    },
  },
  {
    name: 'Parses multiple cells',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

x = 1

# METADATA ********************

# META {
# META   "language": "python"
# META }

# CELL ********************

y = 2

# METADATA ********************

# META {
# META   "language": "python"
# META }

# CELL ********************

z = 3

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.cells.length === 3,
        message: `Expected 3 cells, got ${result.cells.length}`,
      };
    },
  },

  // Language detection from metadata
  {
    name: 'Detects Python language from metadata',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

x = 1

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.cells[0]?.language === 'python',
        message: `Expected 'python', got '${result.cells[0]?.language}'`,
      };
    },
  },
  {
    name: 'Detects sparksql language from metadata',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC SELECT * FROM t

# METADATA ********************

# META {
# META   "language": "sparksql"
# META }
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.cells[0]?.language === 'sparksql',
        message: `Expected 'sparksql', got '${result.cells[0]?.language}'`,
      };
    },
  },
  {
    name: 'Detects pyspark language from metadata',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

spark.read.parquet("data")

# METADATA ********************

# META {
# META   "language": "pyspark"
# META }
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.cells[0]?.language === 'python', // pyspark maps to python
        message: `Expected 'python', got '${result.cells[0]?.language}'`,
      };
    },
  },

  // Magic cell detection
  {
    name: 'Detects MAGIC cell',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC SELECT * FROM t

# METADATA ********************

# META {
# META   "language": "sparksql"
# META }
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.cells[0]?.isMagicCell === true,
        message: result.cells[0]?.isMagicCell
          ? undefined
          : 'Should detect as MAGIC cell',
      };
    },
  },
  {
    name: 'Detects raw cell (no MAGIC)',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

x = 1

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.cells[0]?.isRawCell === true,
        message: result.cells[0]?.isRawCell
          ? undefined
          : 'Should detect as raw cell',
      };
    },
  },
  {
    name: 'Extracts magic command (sql)',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC SELECT * FROM t

# METADATA ********************

# META {
# META   "language": "sparksql"
# META }
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.cells[0]?.magicCommand === 'sql',
        message: `Expected 'sql', got '${result.cells[0]?.magicCommand}'`,
      };
    },
  },
  {
    name: 'Extracts magic command (pyspark)',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

# MAGIC %%pyspark
# MAGIC x = 1

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.cells[0]?.magicCommand === 'pyspark',
        message: `Expected 'pyspark', got '${result.cells[0]?.magicCommand}'`,
      };
    },
  },

  // Content extraction
  {
    name: 'Extracts cell content correctly',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

x = 1
y = 2

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
      const result = parseNotebook(content, '.py');
      const expected = 'x = 1\ny = 2';
      return {
        passed: result.cells[0]?.content === expected,
        message: `Expected '${expected}', got '${result.cells[0]?.content}'`,
      };
    },
  },
  {
    name: 'Strips MAGIC prefix from content',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC SELECT a
# MAGIC FROM t

# METADATA ********************

# META {
# META   "language": "sparksql"
# META }
`;
      const result = parseNotebook(content, '.py');
      const expected = 'SELECT a\nFROM t';
      return {
        passed: result.cells[0]?.content === expected,
        message: `Expected '${expected}', got '${result.cells[0]?.content}'`,
      };
    },
  },

  // Unsupported file types
  {
    name: 'Returns null config for unsupported extension',
    test: () => {
      const content = `some content`;
      const result = parseNotebook(content, '.txt');
      return {
        passed: result.config === null,
        message:
          result.config === null
            ? undefined
            : 'Should return null config for .txt',
      };
    },
  },
  {
    name: 'Handles .r extension',
    test: () => {
      const content = `# Fabric notebook source

# CELL ********************

x <- 1

# METADATA ********************

# META {
# META   "language": "r"
# META }
`;
      const result = parseNotebook(content, '.r');
      return {
        passed: result.isFabricNotebook === true && result.cells.length === 1,
        message: result.isFabricNotebook
          ? undefined
          : 'Should detect R Fabric notebook',
      };
    },
  },

  // Edge cases
  {
    name: 'Handles empty file',
    test: () => {
      const content = '';
      const result = parseNotebook(content, '.py');
      return {
        passed: result.isFabricNotebook === false && result.cells.length === 0,
        message: 'Empty file should not be Fabric notebook',
      };
    },
  },
  {
    name: 'Handles notebook with no cells',
    test: () => {
      const content = `# Fabric notebook source
`;
      const result = parseNotebook(content, '.py');
      return {
        passed: result.isFabricNotebook === true && result.cells.length === 0,
        message: result.isFabricNotebook
          ? undefined
          : 'Should detect Fabric notebook even with no cells',
      };
    },
  },
];

/**
 * Run notebook parsing tests
 */
export function runNotebookParsingTests(): {
  suiteName: string;
  passed: number;
  failed: number;
  results: TestResult[];
} {
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of parsingTests) {
    try {
      const result = tc.test();
      if (result.passed) {
        passed++;
        results.push({ name: tc.name, passed: true });
      } else {
        failed++;
        results.push({
          name: tc.name,
          passed: false,
          message: result.message,
        });
      }
    } catch (error) {
      failed++;
      results.push({
        name: tc.name,
        passed: false,
        message: `Test threw: ${error}`,
      });
    }
  }

  return {
    suiteName: notebookParsingTests.name,
    passed,
    failed,
    results,
  };
}
