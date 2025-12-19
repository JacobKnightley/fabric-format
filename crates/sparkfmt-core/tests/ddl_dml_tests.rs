use sparkfmt_core::format_sql;

// DDL Tests

#[test]
fn test_create_table_simple() {
    let input = "create table users (id int, name string, email string)";
    let expected = "CREATE TABLE users (
     id INT
    ,name STRING
    ,email STRING
)";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_drop_table() {
    let input = "drop table users";
    let expected = "DROP TABLE users";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_drop_table_if_exists() {
    let input = "drop table if exists users";
    let expected = "DROP TABLE IF EXISTS users";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_describe_table() {
    let input = "describe users";
    let expected = "DESCRIBE users";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_describe_extended() {
    let input = "describe extended users";
    let expected = "DESCRIBE EXTENDED users";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_show_tables() {
    let input = "show tables";
    let expected = "SHOW TABLES";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_show_tables_in_database() {
    let input = "show tables in mydb";
    let expected = "SHOW TABLES IN mydb";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

// DML Tests

#[test]
fn test_insert_into_select() {
    let input = "insert into target select id, name from source";
    let expected = "INSERT INTO target
SELECT
     id
    ,name
FROM source";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_insert_into_select_with_where() {
    let input = "insert into target select id, name from source where active = true";
    let expected = "INSERT INTO target
SELECT
     id
    ,name
FROM source
WHERE active=true";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_delete_from() {
    let input = "delete from users where id = 123";
    let expected = "DELETE FROM users
WHERE id=123";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_delete_from_multiple_conditions() {
    let input = "delete from users where created < '2020-01-01' and status = 'inactive'";
    let expected = "DELETE FROM users
WHERE
    created<'2020-01-01'
    AND status='inactive'";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

// Session Tests

#[test]
fn test_set_config() {
    let input = "set spark.sql.shuffle.partitions = 200";
    let expected = "SET spark.sql.shuffle.partitions=200";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_use_database() {
    let input = "use my_database";
    let expected = "USE my_database";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_use_database_with_keyword() {
    let input = "use database analytics";
    let expected = "USE analytics";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

// Combined Tests with Comments

#[test]
fn test_create_table_with_leading_comment() {
    let input = "-- User table\ncreate table users (id int, name string)";
    let expected = "-- User table\nCREATE TABLE users (
     id INT
    ,name STRING
)";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_insert_with_leading_comment() {
    let input = "-- Load data\ninsert into target select * from source";
    let expected = "-- Load data\nINSERT INTO target
SELECT
     *
FROM source";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

// New Statement Tests

#[test]
fn test_create_view() {
    let input = "create view vw as select x from t";
    let expected = "CREATE VIEW vw AS
SELECT
     x
FROM t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_create_or_replace_view() {
    let input = "create or replace view vw as select x from t";
    let expected = "CREATE OR REPLACE VIEW vw AS
SELECT
     x
FROM t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_create_temporary_view() {
    let input = "create temporary view vw as select x from t";
    let expected = "CREATE TEMPORARY VIEW vw AS
SELECT
     x
FROM t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_drop_view() {
    let input = "drop view vw";
    let expected = "DROP VIEW vw";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_drop_view_if_exists() {
    let input = "drop view if exists vw";
    let expected = "DROP VIEW IF EXISTS vw";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_show_databases() {
    let input = "show databases";
    let expected = "SHOW DATABASES";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_show_schemas() {
    let input = "show schemas";
    let expected = "SHOW DATABASES";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_show_views() {
    let input = "show views";
    let expected = "SHOW VIEWS";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_show_views_in_database() {
    let input = "show views in mydb";
    let expected = "SHOW VIEWS IN mydb";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_show_columns() {
    let input = "show columns from t";
    let expected = "SHOW COLUMNS FROM t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_insert_values() {
    let input = "insert into t values (1, 'a'), (2, 'b')";
    let expected = "INSERT INTO t VALUES
(1,'a')
,(2,'b')";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_insert_overwrite() {
    let input = "insert overwrite t select x from s";
    let expected = "INSERT OVERWRITE t
SELECT
     x
FROM s";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_update_simple() {
    let input = "update t set x = 1 where y = 2";
    let expected = "UPDATE t
SET
     x=1
WHERE y=2";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_update_multiple_columns() {
    let input = "update t set x = 1, y = 2 where z = 3";
    let expected = "UPDATE t
SET
     x=1
    ,y=2
WHERE z=3";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_truncate_table() {
    let input = "truncate table t";
    let expected = "TRUNCATE TABLE t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_alter_table_add_column() {
    let input = "alter table t add column c string";
    let expected = "ALTER TABLE t ADD COLUMN c STRING";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_explain_simple() {
    let input = "explain select x from t";
    let expected = "EXPLAIN
SELECT
     x
FROM t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_explain_extended() {
    let input = "explain extended select x from t";
    let expected = "EXPLAIN EXTENDED
SELECT
     x
FROM t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_cache_table() {
    let input = "cache table t";
    let expected = "CACHE TABLE t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_cache_lazy_table() {
    let input = "cache lazy table t";
    let expected = "CACHE LAZY TABLE t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_uncache_table() {
    let input = "uncache table t";
    let expected = "UNCACHE TABLE t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_refresh_table() {
    let input = "refresh table t";
    let expected = "REFRESH TABLE t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_clear_cache() {
    let input = "clear cache";
    let expected = "CLEAR CACHE";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_analyze_table() {
    let input = "analyze table t";
    let expected = "ANALYZE TABLE t";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_reset() {
    let input = "reset";
    let expected = "RESET";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

// Additional tests for MERGE and ALTER TABLE fixes

#[test]
fn test_merge_with_aliases() {
    let input = "MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET val = s.val";
    let expected = "MERGE INTO target t
USING source s
ON t.id=s.id
WHEN MATCHED THEN UPDATE SET val=s.val";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_alter_table_rename() {
    let input = "ALTER TABLE myTable RENAME TO newTable";
    let expected = "ALTER TABLE myTable RENAME TO newTable";
    let result = format_sql(input).unwrap();
    assert_eq!(result, expected);
}
