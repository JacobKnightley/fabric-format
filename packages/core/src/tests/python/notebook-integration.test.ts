/**
 * Python Notebook Integration Tests
 *
 * Tests that Python formatting works correctly in Fabric notebooks.
 */

import {
  formatNotebook,
  initializePythonFormatter,
} from '../../notebook-formatter.js';
import type { TestResult, TestSuite } from '../framework.js';

export const notebookIntegrationTests: TestSuite = {
  name: 'Python Notebook Integration',
  tests: [], // Populated by runNotebookIntegrationTests
};

interface NotebookTestCase {
  name: string;
  input: string;
  expected: string;
  fileExt: string;
}

const notebookTests: NotebookTestCase[] = [
  {
    name: 'Python cell in .py notebook formatted',
    fileExt: '.py',
    input: `# Fabric notebook source

# CELL ********************

x=1
y=2

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
`,
    expected: `# Fabric notebook source

# CELL ********************

x = 1
y = 2

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
`,
  },
  {
    name: 'Multiple Python cells all formatted',
    fileExt: '.py',
    input: `# Fabric notebook source

# CELL ********************

x=1

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

def foo(a,b):return a+b

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
`,
    expected: `# Fabric notebook source

# CELL ********************

x = 1

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

def foo(a, b):
    return a + b

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
`,
  },
  {
    name: 'Mixed Python and SQL cells - both formatted',
    fileExt: '.py',
    input: `# Fabric notebook source

# CELL ********************

x=1

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC select * from table

# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }
`,
    expected: `# Fabric notebook source

# CELL ********************

x = 1

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC SELECT * FROM table

# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }
`,
  },
  {
    name: 'Python cell with %%pyspark magic formatted',
    fileExt: '.py',
    input: `# Fabric notebook source

# CELL ********************

# MAGIC %%pyspark
# MAGIC x=1
# MAGIC y=2

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
`,
    expected: `# Fabric notebook source

# CELL ********************

# MAGIC %%pyspark
# MAGIC x = 1
# MAGIC y = 2

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
`,
  },
  {
    name: 'pyspark language in metadata formatted',
    fileExt: '.py',
    input: `# Fabric notebook source

# CELL ********************

x=1

# METADATA ********************

# META {
# META   "language": "pyspark",
# META   "language_group": "synapse_pyspark"
# META }
`,
    expected: `# Fabric notebook source

# CELL ********************

x = 1

# METADATA ********************

# META {
# META   "language": "pyspark",
# META   "language_group": "synapse_pyspark"
# META }
`,
  },
  {
    name: 'Already formatted Python cell unchanged',
    fileExt: '.py',
    input: `# Fabric notebook source

# CELL ********************

x = 1
y = 2

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
`,
    expected: `# Fabric notebook source

# CELL ********************

x = 1
y = 2

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
`,
  },
  {
    name: 'Python with imports formatted',
    fileExt: '.py',
    input: `# Fabric notebook source

# CELL ********************

import pandas as pd
from pyspark.sql import SparkSession
df=spark.read.parquet("data.parquet")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
`,
    expected: `# Fabric notebook source

# CELL ********************

import pandas as pd
from pyspark.sql import SparkSession

df = spark.read.parquet("data.parquet")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
`,
  },
];

/**
 * Run notebook integration tests (async)
 */
export async function runNotebookIntegrationTests(): Promise<{
  suiteName: string;
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  // Initialize Python formatter
  await initializePythonFormatter();

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of notebookTests) {
    try {
      const { content: formatted } = await formatNotebook(
        tc.input,
        tc.fileExt,
        {
          formatPython: true,
          formatSql: true,
        },
      );

      if (formatted === tc.expected) {
        passed++;
        results.push({ name: tc.name, passed: true });
      } else {
        failed++;
        results.push({
          name: tc.name,
          passed: false,
          input: tc.input,
          expected: tc.expected,
          got: formatted,
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
    suiteName: notebookIntegrationTests.name,
    passed,
    failed,
    results,
  };
}
