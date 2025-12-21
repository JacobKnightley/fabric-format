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
            name: 'DESCRIBE table',
            input: 'describe my_table',
            expected: 'DESCRIBE my_table',
        },
        {
            name: 'EXPLAIN query',
            input: 'explain select x from t',
            expected: 'EXPLAIN\nSELECT x\nFROM t',
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
            name: 'SET config preserves lowercase',
            input: 'set spark.sql.shuffle.partitions = 200',
            expected: 'SET spark.sql.shuffle.partitions = 200',
        },    ],
};