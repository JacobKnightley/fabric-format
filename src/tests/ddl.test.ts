/**
 * DDL Statement Tests
 */
import { TestSuite } from './framework.js';

export const ddlTests: TestSuite = {
    name: 'DDL Statements',
    tests: [
        {
            name: 'CREATE VIEW',
            input: 'create view vw as select x from t',
            expected: 'CREATE VIEW vw AS\nSELECT x\nFROM t',
        },
        {
            name: 'CREATE OR REPLACE TEMP VIEW',
            input: 'create or replace temp view v as select a, b from t',
            expected: 'CREATE OR REPLACE TEMP VIEW v AS\nSELECT\n     a\n    ,b\nFROM t',
        },
        {
            name: 'Single-column CREATE TABLE (inline)',
            input: 'create table foo (id int)',
            expected: 'CREATE TABLE foo (id INT)',
        },
        {
            name: 'Multi-column CREATE TABLE (indented)',
            input: 'create table foo (id int, name string, age int)',
            expected: 'CREATE TABLE foo (\n     id INT\n    ,name STRING\n    ,age INT\n)',
        },
        {
            name: 'DROP TABLE IF EXISTS',
            input: 'drop table if exists my_table',
            expected: 'DROP TABLE IF EXISTS my_table',
        },
        {
            name: 'DROP VIEW IF EXISTS',
            input: 'drop view if exists my_view',
            expected: 'DROP VIEW IF EXISTS my_view',
        },
        {
            name: 'TRUNCATE TABLE',
            input: 'truncate table my_table',
            expected: 'TRUNCATE TABLE my_table',
        },
    ],
};
