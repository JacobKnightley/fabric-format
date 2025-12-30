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
        // Complex types in DDL
        {
            name: 'Complex types in DDL (ARRAY, MAP, STRUCT)',
            input: 'create table t (a array<int>, b map<string, int>, c struct<x:int, y:string>)',
            expected: 'CREATE TABLE t (\n     a ARRAY<INT>\n    ,b MAP<STRING, INT>\n    ,c STRUCT<x:INT, y:STRING>\n)',
        },
        {
            name: 'Nested complex types in DDL',
            input: 'create table t (a array<array<int> >, b map<string, struct<x:int> >)',
            expected: 'CREATE TABLE t (\n     a ARRAY<ARRAY<INT>>\n    ,b MAP<STRING, STRUCT<x:INT>>\n)',
        },
        // CREATE FUNCTION
        {
            name: 'CREATE FUNCTION should not have space before parens',
            input: 'create function f(x int) returns int return x + 1',
            expected: 'CREATE FUNCTION f(x INT) RETURNS INT RETURN x + 1',
        },
        // Partition transforms (Iceberg/Delta Lake)
        {
            name: 'PARTITIONED BY with transform functions',
            input: 'create table t partitioned by (bucket(3, col), days(ts), year(dt))',
            expected: 'CREATE TABLE t PARTITIONED BY (BUCKET(3, col), DAYS(ts), YEAR(dt))',
        },
        {
            name: 'PARTITIONED BY with all transform types',
            input: 'create table t partitioned by (year(d), month(d), day(d), hour(ts), truncate(s, 10))',
            expected: 'CREATE TABLE t PARTITIONED BY (YEAR(d), MONTH(d), DAY(d), HOUR(ts), TRUNCATE(s, 10))',
        },
        {
            name: 'Partition transform keywords as column names stay lowercase',
            input: 'select year, month, day, bucket from t',
            expected: 'SELECT\n     year\n    ,month\n    ,day\n    ,bucket\nFROM t',
        },
    ],
};
