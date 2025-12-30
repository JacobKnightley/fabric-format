/**
 * Delta Lake Extension Tests
 * 
 * These tests cover Delta Lake-specific SQL extensions.
 * Although these keywords are not in the Apache Spark ANTLR grammar,
 * we uppercase them as extension keywords since they are well-known
 * SQL statements documented by Databricks.
 * 
 * See: https://docs.databricks.com/sql/language-manual#delta-lake-statements
 */
import { TestSuite } from './framework.js';

export const deltaLakeTests: TestSuite = {
    name: 'Delta Lake Extensions',
    tests: [
        // VACUUM is a Delta Lake extension for garbage collection
        {
            name: 'VACUUM',
            input: 'vacuum t',
            expected: 'VACUUM t',
        },
        {
            name: 'VACUUM RETAIN',
            input: 'vacuum t retain 168 hours',
            expected: 'VACUUM t RETAIN 168 HOURS',
        },

        // RESTORE is a Delta Lake time travel feature
        {
            name: 'RESTORE TABLE',
            input: 'restore table t to version as of 1',
            expected: 'RESTORE TABLE t TO VERSION AS OF 1',
        },

        // CLONE is a Delta Lake table cloning feature
        {
            name: 'CLONE',
            input: 'create table t clone s',
            expected: 'CREATE TABLE t CLONE s',
        },
        {
            name: 'SHALLOW CLONE',
            input: 'create table t shallow clone s',
            expected: 'CREATE TABLE t SHALLOW CLONE s',
        },
        {
            name: 'DEEP CLONE',
            input: 'create table t deep clone s',
            expected: 'CREATE TABLE t DEEP CLONE s',
        },

        // OPTIMIZE is a Delta Lake command for file compaction
        {
            name: 'OPTIMIZE ZORDER BY',
            input: 'optimize t zorder by (a, b)',
            expected: 'OPTIMIZE t ZORDER BY (a, b)',
        },
    ],
};
