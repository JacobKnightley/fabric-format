/**
 * Spark SQL in Python Tests
 *
 * Tests for extracting and formatting SQL within spark.sql() calls in Python code.
 *
 * Note: The Python formatter (Ruff) normalizes string quotes to double quotes.
 * This is expected behavior as Ruff standardizes Python code style.
 */
import type { TestSuite } from '../framework.js';

/**
 * Tests for the spark.sql() extraction functionality.
 */
export const sparkSqlExtractionTests: TestSuite = {
  name: 'Spark SQL Extraction',
  tests: [
    // Basic string types
    {
      name: 'Simple double-quoted string',
      input: 'spark.sql("select * from table")',
      expected: 'spark.sql("SELECT * FROM table")',
    },
    {
      // Note: Ruff normalizes quotes to double quotes
      name: 'Simple single-quoted string (Ruff normalizes to double)',
      input: "spark.sql('select * from table')",
      expected: 'spark.sql("SELECT * FROM table")',
    },
    {
      name: 'Triple double-quoted string',
      input: 'spark.sql("""select * from table""")',
      expected: 'spark.sql("""SELECT * FROM table""")',
    },
    {
      // Note: Ruff normalizes triple quotes to double quotes
      name: 'Triple single-quoted string (Ruff normalizes to double)',
      input: "spark.sql('''select * from table''')",
      expected: 'spark.sql("""SELECT * FROM table""")',
    },

    // String prefixes
    {
      name: 'Raw string (r)',
      input: 'spark.sql(r"select * from table")',
      expected: 'spark.sql(r"SELECT * FROM table")',
    },

    // Multiple calls in one file
    {
      name: 'Multiple spark.sql calls',
      input: `df1 = spark.sql("select a from t1")
df2 = spark.sql("select b from t2")`,
      expected: `df1 = spark.sql("SELECT a FROM t1")
df2 = spark.sql("SELECT b FROM t2")`,
    },

    // Non-spark.sql patterns (should be unchanged)
    {
      name: 'Variable reference unchanged',
      input: 'spark.sql(query)',
      expected: 'spark.sql(query)',
    },
    {
      name: 'Generic .sql() method unchanged',
      input: 'db.sql("select * from table")',
      expected: 'db.sql("select * from table")',
    },

    // Complex Python context
    {
      name: 'spark.sql in function',
      input: `def get_data():
    return spark.sql("select * from table")`,
      expected: `def get_data():
    return spark.sql("SELECT * FROM table")`,
    },
    {
      // Note: Multi-item SELECT expands to multiple lines
      name: 'spark.sql with multi-column SELECT expands',
      input: 'df = spark.sql("select id, name from users")',
      expected: 'df = spark.sql("SELECT\\n     id\\n    ,name\\nFROM users")',
    },

    // Whitespace in call
    {
      name: 'Whitespace after open paren',
      input: 'spark.sql(  "select * from table"  )',
      expected: 'spark.sql("SELECT * FROM table")',
    },

    // Empty/trivial cases
    {
      name: 'No spark.sql calls',
      input: 'x = 1\ny = 2',
      expected: 'x = 1\ny = 2',
    },
  ],
};

/**
 * Tests for f-string and .format() placeholder handling.
 */
export const sparkSqlPlaceholderTests: TestSuite = {
  name: 'Spark SQL Placeholders',
  tests: [
    // f-strings
    {
      name: 'f-string with simple variable',
      input: 'spark.sql(f"select * from {table_name}")',
      expected: 'spark.sql(f"SELECT * FROM {table_name}")',
    },
    {
      name: 'f-string with expression',
      input: 'spark.sql(f"select * from {schema}.{table}")',
      expected: 'spark.sql(f"SELECT * FROM {schema}.{table}")',
    },

    // .format() strings
    {
      name: '.format() with named placeholder',
      input: 'spark.sql("select * from {table}".format(table=tbl))',
      expected: 'spark.sql("SELECT * FROM {table}".format(table=tbl))',
    },
    {
      name: '.format() with positional placeholder',
      input: 'spark.sql("select * from {0}".format(table_name))',
      expected: 'spark.sql("SELECT * FROM {0}".format(table_name))',
    },
    {
      name: '.format() with empty placeholder',
      input: 'spark.sql("select * from {}".format(table_name))',
      expected: 'spark.sql("SELECT * FROM {}".format(table_name))',
    },

    // Combined
    {
      name: 'rf-string (raw f-string)',
      input: 'spark.sql(rf"select * from {table}")',
      expected: 'spark.sql(rf"SELECT * FROM {table}")',
    },
  ],
};

/**
 * Tests for edge cases and error handling.
 */
export const sparkSqlEdgeCaseTests: TestSuite = {
  name: 'Spark SQL Edge Cases',
  tests: [
    // Nested parentheses
    {
      name: 'SQL with nested function calls',
      input: 'spark.sql("select count(*) from table")',
      expected: 'spark.sql("SELECT COUNT(*) FROM table")',
    },
    {
      name: 'SQL with CASE expression',
      input:
        "spark.sql(\"select case when x = 1 then 'a' else 'b' end from t\")",
      expected:
        "spark.sql(\"SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END FROM t\")",
    },

    // Strings containing quotes
    {
      name: 'SQL with single quotes in double-quoted string',
      input: 'spark.sql("select * from t where name = \'test\'")',
      expected: 'spark.sql("SELECT * FROM t WHERE name = \'test\'")',
    },

    // Already formatted
    {
      name: 'Already formatted SQL unchanged',
      input: 'spark.sql("SELECT * FROM table")',
      expected: 'spark.sql("SELECT * FROM table")',
    },

    // Invalid/skipped patterns
    {
      name: 'Concatenation skipped',
      input: 'spark.sql("select " + columns + " from table")',
      expected: 'spark.sql("select " + columns + " from table")',
    },
  ],
};

// Export all test suites
export const allSparkSqlInPythonTests: TestSuite[] = [
  sparkSqlExtractionTests,
  sparkSqlPlaceholderTests,
  sparkSqlEdgeCaseTests,
];
