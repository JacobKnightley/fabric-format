/**
 * Tests for magic-sql-extractor.ts
 * Tests extraction and formatting of SQL cells from Fabric notebook files
 * Supports Python (.py), Scala (.scala), and R (.r) notebooks
 */

import { TestSuite, TestCase } from './framework.js';
import { extractMagicSqlCells, formatFabricNotebook } from '../magic-sql-extractor.js';
import { formatSql } from '../formatter.js';

// Helper: create a test that uses formatFabricNotebook
function fabricTest(name: string, input: string, expected: string): TestCase {
  return { name, input, expected };
}

const formatNotebookTests: TestCase[] = [
  fabricTest(
    'formats SQL cell in Fabric notebook (simple query stays inline)',
    `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC select * from table where id=1

# METADATA ********************`,
    `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC SELECT * FROM table WHERE id = 1

# METADATA ********************`
  ),
  fabricTest(
    'formats multiple SQL cells (simple queries stay inline)',
    `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC select a from t1

# METADATA ********************

# CELL ********************

# MAGIC %%sql
# MAGIC select b from t2

# METADATA ********************`,
    `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC SELECT a FROM t1

# METADATA ********************

# CELL ********************

# MAGIC %%sql
# MAGIC SELECT b FROM t2

# METADATA ********************`
  ),
  fabricTest(
    'preserves Python cells unchanged',
    `# Fabric notebook source

# CELL ********************

print("hello world")

# METADATA ********************

# CELL ********************

# MAGIC %%sql
# MAGIC select * from t

# METADATA ********************`,
    `# Fabric notebook source

# CELL ********************

print("hello world")

# METADATA ********************

# CELL ********************

# MAGIC %%sql
# MAGIC SELECT * FROM t

# METADATA ********************`
  ),
  fabricTest(
    'returns non-Fabric file unchanged',
    `# Regular Python file
print("hello")`,
    `# Regular Python file
print("hello")`
  ),
  fabricTest(
    'handles multi-line SQL with JOINs (expands)',
    `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC select a.id, b.name from table_a a inner join table_b b on a.id = b.id where a.status = 1

# METADATA ********************`,
    `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC SELECT
# MAGIC      a.id
# MAGIC     ,b.name
# MAGIC FROM table_a a
# MAGIC INNER JOIN table_b b
# MAGIC     ON a.id = b.id
# MAGIC WHERE a.status = 1

# METADATA ********************`
  ),
  fabricTest(
    'handles CREATE VIEW statements (expands with multiple columns)',
    `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC create or replace temporary view vwTest as select col1, col2 from source_table

# METADATA ********************`,
    `# Fabric notebook source

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TEMPORARY VIEW vwTest AS
# MAGIC SELECT
# MAGIC      col1
# MAGIC     ,col2
# MAGIC FROM source_table

# METADATA ********************`
  ),
];

// Scala notebook tests
const scalaNotebookTests: TestCase[] = [
  fabricTest(
    'formats SQL cell in Scala Fabric notebook',
    `// Fabric notebook source

// CELL ********************

// MAGIC %%sql
// MAGIC select * from table where id=1

// METADATA ********************`,
    `// Fabric notebook source

// CELL ********************

// MAGIC %%sql
// MAGIC SELECT * FROM table WHERE id = 1

// METADATA ********************`
  ),
  fabricTest(
    'formats multiple SQL cells in Scala notebook',
    `// Fabric notebook source

// CELL ********************

// MAGIC %%sql
// MAGIC select a from t1

// METADATA ********************

// CELL ********************

// MAGIC %%sql
// MAGIC select b from t2

// METADATA ********************`,
    `// Fabric notebook source

// CELL ********************

// MAGIC %%sql
// MAGIC SELECT a FROM t1

// METADATA ********************

// CELL ********************

// MAGIC %%sql
// MAGIC SELECT b FROM t2

// METADATA ********************`
  ),
  fabricTest(
    'preserves Scala code cells unchanged',
    `// Fabric notebook source

// CELL ********************

val df = spark.read.table("my_table")

// METADATA ********************

// CELL ********************

// MAGIC %%sql
// MAGIC select * from t

// METADATA ********************`,
    `// Fabric notebook source

// CELL ********************

val df = spark.read.table("my_table")

// METADATA ********************

// CELL ********************

// MAGIC %%sql
// MAGIC SELECT * FROM t

// METADATA ********************`
  ),
  fabricTest(
    'handles multi-line SQL in Scala notebook (expands)',
    `// Fabric notebook source

// CELL ********************

// MAGIC %%sql
// MAGIC select a.id, b.name from table_a a inner join table_b b on a.id = b.id

// METADATA ********************`,
    `// Fabric notebook source

// CELL ********************

// MAGIC %%sql
// MAGIC SELECT
// MAGIC      a.id
// MAGIC     ,b.name
// MAGIC FROM table_a a
// MAGIC INNER JOIN table_b b
// MAGIC     ON a.id = b.id

// METADATA ********************`
  ),
  fabricTest(
    'returns non-Fabric Scala file unchanged',
    `// Regular Scala file
object Main extends App {
  println("hello")
}`,
    `// Regular Scala file
object Main extends App {
  println("hello")
}`
  ),
];

/**
 * SQL notebook tests (-- MAGIC prefix).
 * SQL notebooks support both:
 *   1. MAGIC-prefixed SQL cells (-- MAGIC %%sql)
 *   2. Raw SQL cells (no prefix, just SQL)
 */
const sqlNotebookTests: TestCase[] = [
  fabricTest(
    'formats simple SQL cell in SQL notebook (stays compact)',
    `-- Fabric notebook source

-- CELL ********************

-- MAGIC %%sql
-- MAGIC select * from test

-- METADATA ********************`,
    `-- Fabric notebook source

-- CELL ********************

-- MAGIC %%sql
-- MAGIC SELECT * FROM test

-- METADATA ********************`
  ),
  fabricTest(
    'formats raw SQL cell (no MAGIC prefix, stays compact)',
    `-- Fabric notebook source

-- CELL ********************

select * from test

-- METADATA ********************`,
    `-- Fabric notebook source

-- CELL ********************

SELECT * FROM test

-- METADATA ********************`
  ),
  fabricTest(
    'formats mixed MAGIC and raw SQL cells (simple queries stay compact)',
    `-- Fabric notebook source

-- CELL ********************

-- MAGIC %%sql
-- MAGIC select id from table_a

-- METADATA ********************

-- CELL ********************

select name from table_b

-- METADATA ********************`,
    `-- Fabric notebook source

-- CELL ********************

-- MAGIC %%sql
-- MAGIC SELECT id FROM table_a

-- METADATA ********************

-- CELL ********************

SELECT name FROM table_b

-- METADATA ********************`
  ),
  fabricTest(
    'formats raw SQL cell with JOIN (expands)',
    `-- Fabric notebook source

-- CELL ********************

select a.id, b.name from table_a a inner join table_b b on a.id = b.id

-- METADATA ********************`,
    `-- Fabric notebook source

-- CELL ********************

SELECT
     a.id
    ,b.name
FROM table_a a
INNER JOIN table_b b
    ON a.id = b.id

-- METADATA ********************`
  ),
  fabricTest(
    'preserves non-SQL cells in SQL notebook (raw SQL stays compact)',
    `-- Fabric notebook source

-- CELL ********************

-- MAGIC %%pyspark
-- MAGIC print("hello")

-- METADATA ********************

-- CELL ********************

select * from test

-- METADATA ********************`,
    `-- Fabric notebook source

-- CELL ********************

-- MAGIC %%pyspark
-- MAGIC print("hello")

-- METADATA ********************

-- CELL ********************

SELECT * FROM test

-- METADATA ********************`
  ),
  fabricTest(
    'returns non-Fabric SQL file unchanged',
    `-- Regular SQL file
SELECT * FROM test;`,
    `-- Regular SQL file
SELECT * FROM test;`
  ),
];

// Custom format function that uses formatFabricNotebook
function formatFabricNotebookWrapper(input: string): string {
  return formatFabricNotebook(input, formatSql);
}

export const magicSqlSuite: TestSuite = {
  name: 'Magic SQL Extractor (Python Notebooks)',
  tests: formatNotebookTests,
};

export const scalaMagicSqlSuite: TestSuite = {
  name: 'Magic SQL Extractor (Scala Notebooks)',
  tests: scalaNotebookTests,
};

export const sqlMagicSqlSuite: TestSuite = {
  name: 'Magic SQL Extractor (SQL Notebooks)',
  tests: sqlNotebookTests,
};

// Export a custom runner for these suites since they use formatFabricNotebook
export function runMagicSqlSuite(): { passed: number; failed: number; results: Array<{ name: string; passed: boolean; input?: string; expected?: string; got?: string }> } {
  const allTests = [...formatNotebookTests, ...scalaNotebookTests, ...sqlNotebookTests];
  const results: Array<{ name: string; passed: boolean; input?: string; expected?: string; got?: string }> = [];
  let passed = 0;
  let failed = 0;

  for (const tc of allTests) {
    const result = formatFabricNotebookWrapper(tc.input);
    const success = result === tc.expected;

    if (success) {
      passed++;
      results.push({ name: tc.name, passed: true });
    } else {
      failed++;
      results.push({
        name: tc.name,
        passed: false,
        input: tc.input,
        expected: tc.expected,
        got: result,
      });
    }
  }

  return { passed, failed, results };
}
