/**
 * Utility Command Tests
 */
import { TestSuite } from './framework.js';

export const utilityTests: TestSuite = {
    name: 'Utility Commands',
    tests: [
        {
            name: 'USE database',
            input: 'use my_database',
            expected: 'USE my_database',
        },
        {
            name: 'SHOW TABLES',
            input: 'show tables',
            expected: 'SHOW TABLES',
        },
        {
            name: 'SHOW SYSTEM FUNCTIONS',
            input: 'show system functions',
            expected: 'SHOW SYSTEM FUNCTIONS',
        },
        {
            name: 'DESCRIBE table',
            input: 'describe my_table',
            expected: 'DESCRIBE my_table',
        },
        {
            name: 'EXPLAIN query',
            input: 'explain select x from t',
            expected: 'EXPLAIN SELECT x FROM t',
        },
        {
            name: 'CACHE TABLE',
            input: 'cache table t',
            expected: 'CACHE TABLE t',
        },
        {
            name: 'ANALYZE TABLE',
            input: 'analyze table t',
            expected: 'ANALYZE TABLE t',
        },
        {
            name: 'ANALYZE TABLE column list',
            input: 'analyze table t compute statistics for columns a, b',
            expected: 'ANALYZE TABLE t COMPUTE STATISTICS FOR COLUMNS a, b',
        },
        {
            name: 'ANALYZE TABLE NOSCAN',
            input: 'analyze table t compute statistics noscan',
            expected: 'ANALYZE TABLE t COMPUTE STATISTICS NOSCAN',
        },
        {
            name: 'SET config preserves lowercase',
            input: 'set spark.sql.shuffle.partitions = 200',
            expected: 'SET spark.sql.shuffle.partitions = 200',
        },
        // TRANSFORM (Hive streaming)
        {
            name: 'TRANSFORM (Hive streaming)',
            input: "select transform(a, b) using 'script.py' as (c, d) from t",
            expected: "SELECT TRANSFORM(a, b) USING 'script.py' AS (c, d)\nFROM t",
        },
    ],
};