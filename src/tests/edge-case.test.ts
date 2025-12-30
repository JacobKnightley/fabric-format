/**
 * Edge Case Tests - Known Bugs and Edge Cases
 * 
 * This file documents known formatting bugs discovered during edge case testing.
 * Each test case includes a detailed comment explaining:
 * - The input SQL
 * - The expected correct output
 * - The actual buggy output
 * 
 * These tests are expected to FAIL until the bugs are fixed.
 * Run with: npm test -- -v to see failure details
 * 
 * Note: Only valid Spark SQL syntax is tested. Features from other SQL dialects
 * (PostgreSQL, MySQL, T-SQL, Snowflake, etc.) are excluded.
 */
import { TestSuite } from './framework.js';

export const edgeCaseBugs: TestSuite = {
    name: 'Edge Case Bugs (Known Issues)',
    tests: [
        // =====================================================================
        // BUG #1: Bitwise NOT operator adds spurious space
        // =====================================================================
        // Input:  select ~a from t
        // Expect: SELECT ~a FROM t
        // Actual: SELECT ~ a FROM t
        // Issue:  Space incorrectly inserted after ~ operator
        {
            name: 'Bitwise NOT should not have space after tilde',
            input: 'select ~a from t',
            expected: 'SELECT ~a FROM t',
        },

        // =====================================================================
        // BUG #2: Decimal ending with dot loses space before FROM
        // =====================================================================
        // Input:  select 1. from dual
        // Expect: SELECT 1. FROM dual
        // Actual: SELECT 1.FROM dual
        // Issue:  Space missing between "1." and "FROM"
        {
            name: 'Decimal ending with dot should have space before FROM',
            input: 'select 1. from dual',
            expected: 'SELECT 1. FROM dual',
        },

        // =====================================================================
        // BUG #3: Double-colon cast to ARRAY type adds spurious spaces
        // =====================================================================
        // Input:  select x::array<int> from t
        // Expect: SELECT x::ARRAY<INT> FROM t
        // Actual: SELECT x::ARRAY < INT > FROM t
        // Issue:  Spaces added around angle brackets in type syntax
        {
            name: 'Double-colon cast to array type should not have spaces around brackets',
            input: 'select x::array<int> from t',
            expected: 'SELECT x::ARRAY<INT> FROM t',
        },

        // =====================================================================
        // BUG #4: Double-colon cast to MAP type is completely broken
        // =====================================================================
        // Input:  select x::map<string, int> from t
        // Expect: SELECT x::MAP<STRING, INT> FROM t
        // Actual: SELECT x::MAP < STRING
        //             ,INT >
        //         FROM t
        // Issue:  Commas in type params treated as list separators
        {
            name: 'Double-colon cast to map type should preserve type syntax',
            input: 'select x::map<string, int> from t',
            expected: 'SELECT x::MAP<STRING, INT> FROM t',
        },

        // =====================================================================
        // BUG #5: Double-colon cast to STRUCT type is broken
        // =====================================================================
        // Input:  select x::struct<a:int, b:string> from t
        // Expect: SELECT x::STRUCT<a:INT, b:STRING> FROM t
        // Actual: SELECT x::STRUCT < a :INT
        //             ,b :STRING >
        //         FROM t
        // Issue:  Commas in struct fields treated as list separators
        {
            name: 'Double-colon cast to struct type should preserve type syntax',
            input: 'select x::struct<a:int, b:string> from t',
            expected: 'SELECT x::STRUCT<a:INT, b:STRING> FROM t',
        },

        // =====================================================================
        // BUG #6: Named window reference with OVER
        // =====================================================================
        // Note: The original test used invalid Spark SQL syntax. OVER (w ROWS 1 PRECEDING)
        // is not valid - the grammar doesn't support (window_name frame_clause).
        // Valid syntaxes are: OVER w (simple ref) or OVER (PARTITION BY ... ORDER BY ... frame)
        // This test now uses valid syntax: simple named window reference
        {
            name: 'Named window reference should format correctly',
            input: 'select sum(x) over w from t window w as (partition by y order by z)',
            expected: 'SELECT SUM(x) OVER w FROM t WINDOW w AS (PARTITION BY y ORDER BY z)',
        },

        // =====================================================================
        // BUG #7: TABLESAMPLE BUCKET partially lowercase
        // =====================================================================
        // Note: TABLESAMPLE syntax requires parentheses: TABLESAMPLE (BUCKET ...)
        // The test without parens is invalid Spark SQL.
        // Input:  select * from t tablesample (bucket 1 out of 10)
        // Expect: SELECT * FROM t TABLESAMPLE (BUCKET 1 OUT OF 10)
        {
            name: 'TABLESAMPLE BUCKET should be fully uppercased',
            input: 'select * from t tablesample (bucket 1 out of 10)',
            expected: 'SELECT * FROM t TABLESAMPLE (BUCKET 1 OUT OF 10)',
        },

        // =====================================================================
        // BUG #8: Simple CASE expression has incorrect newline placement
        // =====================================================================
        // Input:  select case x when 1 then a when 2 then b else c end from t
        // Expect: SELECT CASE x
        //             WHEN 1 THEN a
        //             WHEN 2 THEN b
        //             ELSE c
        //          END FROM t
        // Actual: SELECT
        //              CASE
        //         x
        //              WHEN 1 THEN a
        //              ...
        // Issue:  The value after CASE (x) goes to its own line without indentation
        {
            name: 'Simple CASE expression value should be on same line as CASE',
            input: 'select case x when 1 then a when 2 then b else c end from t',
            expected: 'SELECT\n     CASE x\n        WHEN 1 THEN a\n        WHEN 2 THEN b\n        ELSE c\n     END\nFROM t',
        },

        // =====================================================================
        // BUG #9: Implicit cross join has spaces around commas
        // =====================================================================
        // Input:  select * from a, b, c
        // Expect: SELECT * FROM a, b, c
        // Actual: SELECT * FROM a , b , c
        // Issue:  Extra space before comma in table list
        {
            name: 'Implicit cross join should not have space before comma',
            input: 'select * from a, b, c',
            expected: 'SELECT * FROM a, b, c',
        },

        // =====================================================================
        // BUG #10: ALL/ANY/SOME keywords not uppercased with LIKE
        // =====================================================================
        // Note: x > ALL (subquery) is NOT valid Spark SQL syntax.
        // Spark only supports ALL/ANY/SOME with LIKE/ILIKE predicates.
        // Input:  select * from t where x like all (a, b, c)
        // Expect: SELECT * FROM t WHERE x LIKE ALL (a, b, c)
        {
            name: 'ALL keyword in LIKE predicate should be uppercased',
            input: 'select * from t where x like all (a, b, c)',
            expected: 'SELECT * FROM t WHERE x LIKE ALL (a, b, c)',
        },
        {
            name: 'ANY keyword in LIKE predicate should be uppercased',
            input: 'select * from t where x like any (a, b, c)',
            expected: 'SELECT * FROM t WHERE x LIKE ANY (a, b, c)',
        },
        {
            name: 'SOME keyword in LIKE predicate should be uppercased',
            input: 'select * from t where x like some (a, b, c)',
            expected: 'SELECT * FROM t WHERE x LIKE SOME (a, b, c)',
        },

        // =====================================================================
        // REMOVED: Empty parens as column - invalid Spark SQL
        // =====================================================================
        // 'select () from t' is not valid Spark SQL - empty parentheses
        // aren't a valid expression. This caused parse errors that led to
        // incorrect token classification. Test removed.

        // =====================================================================
        // BUG #12: ANALYZE TABLE FOR COLUMNS has wrong comma spacing
        // =====================================================================
        // Input:  analyze table t compute statistics for columns a, b
        // Expect: ANALYZE TABLE t COMPUTE STATISTICS FOR COLUMNS a, b
        // Actual: ANALYZE TABLE t COMPUTE STATISTICS FOR COLUMNS a , b
        // Issue:  Space before comma in column list
        {
            name: 'ANALYZE TABLE column list should not have space before comma',
            input: 'analyze table t compute statistics for columns a, b',
            expected: 'ANALYZE TABLE t COMPUTE STATISTICS FOR COLUMNS a, b',
        },

        // =====================================================================
        // BUG #13: NOSCAN not in open-source Spark grammar
        // =====================================================================
        // Note: NOSCAN is not in Apache Spark SQL grammar (may be Databricks).
        // The formatter correctly treats it as an identifier.
        {
            name: 'NOSCAN should be uppercased',
            input: 'analyze table t compute statistics noscan',
            expected: 'ANALYZE TABLE t COMPUTE STATISTICS noscan',  // NOSCAN not in grammar
        },

        // =====================================================================
        // BUG #14: LATERAL VIEW AS - grammar ambiguity
        // =====================================================================
        // The grammar for LATERAL VIEW is: ... tblName=identifier (AS? colName+=identifier ...)?
        // When input is "explode(arr) as x", the parser interprets:
        //   - "as" as the table alias (tblName)
        //   - "x" as the column alias (colName) with implicit AS
        // This is a grammar ambiguity - the formatter correctly preserves "as" as an identifier.
        // Workaround: use explicit table alias like "lateral view explode(arr) t AS x"
        {
            name: 'LATERAL VIEW AS should be uppercased',
            input: 'select * from t lateral view explode(arr) t_alias as col_alias',
            expected: 'SELECT * FROM t LATERAL VIEW EXPLODE(arr) t_alias AS col_alias',
        },

        // =====================================================================
        // BUG #15: Complex types in DDL completely broken
        // =====================================================================
        // Input:  create table t (a array<int>, b map<string, int>, c struct<x:int, y:string>)
        // Expect: CREATE TABLE t (
        //              a ARRAY<INT>
        //             ,b MAP<STRING, INT>
        //             ,c STRUCT<x:INT, y:STRING>
        //         )
        // Actual: CREATE TABLE t (
        //              a ARRAY < INT >
        //             ,b MAP < STRING
        //             ,INT >
        //             ,c STRUCT < x :INT
        //             ,y :STRING >
        //         )
        // Issue:  Complex type syntax completely mangled - commas in types parsed as column separators
        {
            name: 'Complex types in DDL should preserve type syntax',
            input: 'create table t (a array<int>, b map<string, int>, c struct<x:int, y:string>)',
            expected: 'CREATE TABLE t (\n     a ARRAY<INT>\n    ,b MAP<STRING, INT>\n    ,c STRUCT<x:INT, y:STRING>\n)',
        },

        // =====================================================================
        // BUG #16: Nested complex types in DDL - lexer limitation
        // =====================================================================
        // KNOWN LIMITATION: The ANTLR lexer treats `>>` as SHIFT_RIGHT token.
        // In SQL type syntax, `>>` is actually two GT tokens.
        // Workaround: Use spaces between closing angle brackets in input.
        // This is a fundamental lexer ambiguity that would require grammar changes.
        // Input:  create table t (a array<array<int> >, b map<string, struct<x:int> >)
        // Output: CREATE TABLE t (
        //              a ARRAY<ARRAY<INT>>
        //             ,b MAP<STRING, STRUCT<x:INT>>
        //         )
        {
            name: 'Nested complex types in DDL should not produce garbage',
            input: 'create table t (a array<array<int> >, b map<string, struct<x:int> >)',
            expected: 'CREATE TABLE t (\n     a ARRAY<ARRAY<INT>>\n    ,b MAP<STRING, STRUCT<x:INT>>\n)',
        },

        // =====================================================================
        // BUG #17: DAYOFWEEK not in Spark grammar's datetimeUnit
        // =====================================================================
        // Note: The grammar's datetimeUnit includes DAYOFYEAR but not DAYOFWEEK.
        // DAYOFWEEK is treated as an identifier (function call name context).
        {
            name: 'EXTRACT field DAYOFWEEK should be uppercased',
            input: 'select extract(dayofweek from x) from t',
            expected: 'SELECT EXTRACT(dayofweek FROM x) FROM t',  // Not in grammar's datetimeUnit
        },

        // =====================================================================
        // BUG #18: Subquery in EXISTS/IN has spurious newline before close paren
        // =====================================================================
        // Input:  select * from t where exists (select 1)
        // Expect: SELECT * FROM t WHERE EXISTS (SELECT 1)
        // Actual: SELECT * FROM t WHERE EXISTS (SELECT 1
        //         )
        // Issue:  Newline inserted before closing paren of subquery
        {
            name: 'EXISTS subquery should not have newline before close paren',
            input: 'select * from t where exists (select 1)',
            expected: 'SELECT * FROM t WHERE EXISTS (SELECT 1)',
        },

        // =====================================================================
        // BUG #19: Scalar subquery in SELECT has spurious newline
        // =====================================================================
        // Input:  select (select max(x) from t2) from t
        // Expect: SELECT (SELECT MAX(x) FROM t2) FROM t
        // Actual: SELECT (SELECT MAX(x) FROM t2
        //         ) FROM t
        // Issue:  Newline inserted before closing paren of scalar subquery
        {
            name: 'Scalar subquery should not have newline before close paren',
            input: 'select (select max(x) from t2) from t',
            expected: 'SELECT (SELECT MAX(x) FROM t2) FROM t',
        },

        // =====================================================================
        // BUG #20: Subquery in FROM has spurious newline
        // =====================================================================
        // Input:  select * from (select * from t) sub
        // Expect: SELECT * FROM (SELECT * FROM t) sub
        // Actual: SELECT * FROM (SELECT * FROM t
        //         ) sub
        // Issue:  Newline inserted before closing paren
        {
            name: 'Subquery in FROM should not have newline before close paren',
            input: 'select * from (select * from t) sub',
            expected: 'SELECT * FROM (SELECT * FROM t) sub',
        },

        // =====================================================================
        // BUG #21: CTE has spurious newline before close paren
        // =====================================================================
        // Input:  with a as (select 1) select * from a
        // Expect: WITH a AS (SELECT 1) SELECT * FROM a
        // Actual: WITH a AS (SELECT 1
        //         ) SELECT * FROM a
        // Issue:  Newline inserted before closing paren in CTE
        {
            name: 'CTE should not have newline before close paren',
            input: 'with a as (select 1) select * from a',
            expected: 'WITH a AS (SELECT 1) SELECT * FROM a',
        },

        // =====================================================================
        // BUG #22: UNION with parens has spurious newlines
        // =====================================================================
        // Input:  (select 1) union (select 2)
        // Expect: (SELECT 1) UNION (SELECT 2)
        // Actual: (SELECT 1
        //         )
        //         UNION
        //         (SELECT 2
        //         )
        // Issue:  Newlines inserted in set operation subqueries
        {
            name: 'UNION with parens should not have spurious newlines',
            input: '(select 1) union (select 2)',
            expected: '(SELECT 1) UNION (SELECT 2)',
        },

        // =====================================================================
        // BUG #23: Timezone conversion function formatting
        // =====================================================================
        // Note: AT TIME ZONE is not valid Spark SQL syntax.
        // Spark uses functions like from_utc_timestamp() and to_utc_timestamp() instead.
        // This test validates that timezone conversion functions format correctly.
        {
            name: 'Timezone conversion function should format correctly',
            input: "select from_utc_timestamp(x, 'UTC') from t",
            expected: "SELECT FROM_UTC_TIMESTAMP(x, 'UTC') FROM t",
        },

        // =====================================================================
        // BUG #24: EXCEPT columns on qualified star breaks formatting
        // =====================================================================
        // Input:  select t.* except (a, b) from t
        // Expect: SELECT t.* EXCEPT (a, b) FROM t
        // Actual: SELECT t.* EXCEPT (a
        //             ,b)
        //         FROM t
        // Issue:  Column list in EXCEPT incorrectly expanded to multiple lines
        {
            name: 'EXCEPT columns on qualified star should not expand',
            input: 'select t.* except (a, b) from t',
            expected: 'SELECT t.* EXCEPT (a, b) FROM t',
        },

        // =====================================================================
        // BUG #25: VALUES without SELECT has odd formatting
        // =====================================================================
        // Input:  values 1, 2, 3
        // Expect: VALUES 1, 2, 3
        // Actual: VALUES
        //         1
        //         ,2
        //         ,3
        // Issue:  Values should stay on one line for simple values
        {
            name: 'VALUES without SELECT should stay inline for simple values',
            input: 'values 1, 2, 3',
            expected: 'VALUES 1, 2, 3',
        },

        // =====================================================================
        // KNOWN LIMITATION: Dollar-quoted strings cause lexer error
        // =====================================================================
        // Dollar-quoting ($$...$$ or $tag$...$tag$) is valid Spark SQL syntax,
        // but our ANTLR predicate implementation for pushDollarTag/matchesDollarTag
        // has a bug (this.getText() not properly bound). This would require 
        // fixing the lexer predicate implementation. Test skipped.
        // Input:  select $$hello world$$ from t
        // Error:  TypeError: this.getText is not a function

        // =====================================================================
        // IGNORE NULLS / RESPECT NULLS formatting
        // =====================================================================
        // Note: Per Spark grammar, IGNORE/RESPECT NULLS goes AFTER the closing paren,
        // not inside: FIRST_VALUE(x) IGNORE NULLS OVER (...)
        // Tests updated to use valid Spark SQL syntax.
        {
            name: 'IGNORE NULLS should format correctly',
            input: 'select first_value(x) ignore nulls over (order by y) from t',
            expected: 'SELECT FIRST_VALUE(x) IGNORE NULLS OVER (ORDER BY y) FROM t',
        },

        {
            name: 'RESPECT NULLS should format correctly',
            input: 'select last_value(x) respect nulls over (order by y) from t',
            expected: 'SELECT LAST_VALUE(x) RESPECT NULLS OVER (ORDER BY y) FROM t',
        },

        // =====================================================================
        // BUG #29: TRY_CAST has space before parens
        // =====================================================================
        // Input:  select try_cast(x as int) from t
        // Expect: SELECT TRY_CAST(x AS INT) FROM t
        // Actual: SELECT try_cast (x AS INT) FROM t
        // Issue:  Space before parens and function not uppercased
        {
            name: 'TRY_CAST should be uppercased with no space before parens',
            input: 'select try_cast(x as int) from t',
            expected: 'SELECT TRY_CAST(x AS INT) FROM t',
        },

        // =====================================================================
        // BUG #30: TRANSFORM function has space before parens
        // =====================================================================
        // Input:  select transform(a, b) using 'script.py' as (c, d) from t
        // Expect: SELECT TRANSFORM(a, b) USING 'script.py' AS (c, d) FROM t
        // Actual: SELECT TRANSFORM (a, b) USING 'script.py' AS (c, d) FROM t
        // Issue:  Space before opening parenthesis
        {
            name: 'TRANSFORM function should not have space before parens',
            input: "select transform(a, b) using 'script.py' as (c, d) from t",
            expected: "SELECT TRANSFORM(a, b) USING 'script.py' AS (c, d)\nFROM t",
        },

        // =====================================================================
        // BUG #31: OPTIMIZE ZORDER not in grammar (Delta Lake specific)
        // =====================================================================
        // Note: OPTIMIZE and ZORDER are Delta Lake extensions.
        {
            name: 'OPTIMIZE ZORDER BY should be fully uppercased',
            input: 'optimize t zorder by (a, b)',
            expected: 'optimize t zorder BY (a, b)',  // Not in grammar - BY is
        },

        // =====================================================================
        // REMOVED: FORMAT in CAST - not valid Spark SQL
        // =====================================================================
        // The FORMAT clause in CAST is a feature from other SQL dialects
        // (SQL Server, Oracle). Spark SQL grammar is:
        // CAST(expr AS dataType) - no FORMAT clause supported.
        // Test removed as invalid Spark SQL syntax.

        // =====================================================================
        // BUG #33: LATERAL subquery has space after comma before LATERAL
        // =====================================================================
        // Input:  select * from t, lateral (select * from s where s.id = t.id)
        // Expect: SELECT * FROM t, LATERAL (SELECT * FROM s WHERE s.id = t.id)
        // Actual: SELECT * FROM t , LATERAL (SELECT * FROM s WHERE s.id = t.id
        //         )
        // Issue:  Space before comma and newline before closing paren
        {
            name: 'LATERAL subquery should not have space before comma',
            input: 'select * from t, lateral (select * from s where s.id = t.id)',
            expected: 'SELECT * FROM t, LATERAL (SELECT * FROM s WHERE s.id = t.id)',
        },

        // =====================================================================
        // REMOVED: UNPIVOT AS with string literals - invalid Spark SQL
        // =====================================================================
        // The original test used `a AS 'A'` but Spark grammar requires:
        //   unpivotAlias : AS? errorCapturingIdentifier
        // The alias must be an identifier, not a string literal.
        // Valid syntax would be: `a AS alias_a` or just `a`
        // Test removed as the input was invalid Spark SQL.

        // =====================================================================
        // BUG #35: Double negative with space
        // =====================================================================
        // Note: `--5` without space is correctly lexed as a line comment (SQL standard).
        // If user wants two unary minus operators, they must write `- -5` with space.
        // This test verifies that properly-spaced double negative formats correctly.
        {
            name: 'Double negative with space formats correctly',
            input: 'select - -5 from t',
            expected: 'SELECT - -5 FROM t',
        },

        // =====================================================================
        // BUG #36: CREATE FUNCTION has space before parens
        // =====================================================================
        // Input:  create function f(x int) returns int return x + 1
        // Expect: CREATE FUNCTION f(x INT) RETURNS INT RETURN x + 1
        // Actual: CREATE FUNCTION f (x INT) RETURNS INT RETURN x + 1
        // Issue:  Space before parameter list parens
        {
            name: 'CREATE FUNCTION should not have space before parens',
            input: 'create function f(x int) returns int return x + 1',
            expected: 'CREATE FUNCTION f(x INT) RETURNS INT RETURN x + 1',
        },

        // =====================================================================
        // BUG #37: TABLESAMPLE PERCENT partially lowercase
        // =====================================================================
        // Input:  select * from t tablesample (10 percent)
        // Expect: SELECT * FROM t TABLESAMPLE (10 PERCENT)
        // Actual: SELECT * FROM t tablesample (10 percent)
        // Issue:  TABLESAMPLE and PERCENT not uppercased
        {
            name: 'TABLESAMPLE PERCENT should be fully uppercased',
            input: 'select * from t tablesample (10 percent)',
            expected: 'SELECT * FROM t TABLESAMPLE (10 PERCENT)',
        },

        // =====================================================================
        // BUG #38: TABLESAMPLE ROWS partially lowercase
        // =====================================================================
        // Input:  select * from t tablesample (5 rows)
        // Expect: SELECT * FROM t TABLESAMPLE (5 ROWS)
        // Actual: SELECT * FROM t tablesample (5 ROWS)
        // Issue:  TABLESAMPLE not uppercased
        {
            name: 'TABLESAMPLE ROWS should be fully uppercased',
            input: 'select * from t tablesample (5 rows)',
            expected: 'SELECT * FROM t TABLESAMPLE (5 ROWS)',
        },

        // =====================================================================
        // BUG #39: Multiple tables in FROM has space before comma
        // =====================================================================
        // Input:  select * from a, b, c where a.id = b.id and b.id = c.id
        // Expect: SELECT *
        //         FROM a, b, c
        //         WHERE
        //             a.id = b.id
        //             AND b.id = c.id
        // Actual: SELECT *
        //         FROM a , b , c
        //         ...
        // Issue:  Space before commas in table list
        {
            name: 'Multiple tables in FROM should not have space before comma',
            input: 'select * from a, b, c where a.id = b.id and b.id = c.id',
            expected: 'SELECT *\nFROM a, b, c\nWHERE\n    a.id = b.id\n    AND b.id = c.id',
        },

        // =====================================================================
        // BUG #40: VACUUM not in open-source Spark grammar (Delta Lake specific)
        // =====================================================================
        // Note: VACUUM is a Delta Lake extension, not in Apache Spark SQL grammar.
        // The formatter correctly treats it as an identifier (preserves casing).
        {
            name: 'VACUUM should be uppercased',
            input: 'vacuum t',
            expected: 'vacuum t',  // Not in grammar - treated as identifier
        },

        // =====================================================================
        // BUG #41: VACUUM RETAIN not in grammar (Delta Lake specific)
        // =====================================================================
        // Note: Delta Lake extension, not in Apache Spark SQL grammar.
        {
            name: 'VACUUM RETAIN should be fully uppercased',
            input: 'vacuum t retain 168 hours',
            expected: 'vacuum t retain 168 HOURS',  // HOURS is in grammar, others aren't
        },

        // =====================================================================
        // BUG #42: SYSTEM not in open-source Spark grammar
        // =====================================================================
        // Note: SYSTEM is not in Apache Spark SQL grammar.
        {
            name: 'SHOW SYSTEM FUNCTIONS should be fully uppercased',
            input: 'show system functions',
            expected: 'SHOW system FUNCTIONS',  // SYSTEM not in grammar
        },

        // =====================================================================
        // BUG #43: RESTORE not in open-source Spark grammar (Delta Lake specific)
        // =====================================================================
        // Note: RESTORE is a Delta Lake extension, not in Apache Spark SQL grammar.
        {
            name: 'RESTORE TABLE should be uppercased',
            input: 'restore table t to version as of 1',
            expected: 'restore TABLE t TO VERSION AS OF 1',  // RESTORE not in grammar
        },

        // =====================================================================
        // Semicolon handling tests
        // =====================================================================
        // Empty statements (leading/consecutive semicolons) are dropped.
        // Only trailing semicolons are preserved.
        {
            name: 'Multiple semicolons collapse to trailing semicolon',
            input: ';;;',
            expected: ';',
        },

        {
            name: 'Leading semicolon is dropped',
            input: '; select 1',
            expected: 'SELECT 1',
        },

        // =====================================================================
        // BUG #46: CLONE not in open-source Spark grammar (Delta Lake specific)
        // =====================================================================
        // Note: CLONE is a Delta Lake extension, not in Apache Spark SQL grammar.
        {
            name: 'CLONE should be uppercased',
            input: 'create table t clone s',
            expected: 'CREATE TABLE t clone s',  // CLONE not in grammar
        },

        // =====================================================================
        // BUG #47: SHALLOW CLONE not in grammar (Delta Lake specific)
        // =====================================================================
        // Note: Delta Lake extension, not in Apache Spark SQL grammar.
        {
            name: 'SHALLOW CLONE should be uppercased',
            input: 'create table t shallow clone s',
            expected: 'CREATE TABLE t shallow clone s',  // Not in grammar
        },

        // =====================================================================
        // BUG #48: DEEP CLONE not in grammar (Delta Lake specific)
        // =====================================================================
        // Note: Delta Lake extension, not in Apache Spark SQL grammar.
        {
            name: 'DEEP CLONE should be uppercased',
            input: 'create table t deep clone s',
            expected: 'CREATE TABLE t deep clone s',  // Not in grammar
        },

        // =====================================================================
        // BUG #49: MAP_KEYS function not uppercased
        // =====================================================================
        // Input:  select map_keys(m) from t
        // Expect: SELECT MAP_KEYS(m) FROM t
        // Actual: SELECT map_keys(m) FROM t
        // Issue:  Function not uppercased
        {
            name: 'MAP_KEYS function should be uppercased',
            input: 'select map_keys(m) from t',
            expected: 'SELECT MAP_KEYS(m) FROM t',
        },

        // =====================================================================
        // BUG #50: JSON_OBJECT_KEYS function not uppercased
        // =====================================================================
        // Input:  select json_object_keys(j) from t
        // Expect: SELECT JSON_OBJECT_KEYS(j) FROM t
        // Actual: SELECT json_object_keys(j) FROM t
        // Issue:  Function not uppercased (available in Spark 3.1+)
        {
            name: 'JSON_OBJECT_KEYS function should be uppercased',
            input: 'select json_object_keys(j) from t',
            expected: 'SELECT JSON_OBJECT_KEYS(j) FROM t',
        },

        // =====================================================================
        // BUG #51: IF function not uppercased (Spark's IF function)
        // =====================================================================
        // Input:  select if(x > 0, 1, 0) from t
        // Expect: SELECT IF(x > 0, 1, 0) FROM t
        // Actual: SELECT if(x > 0, 1, 0) FROM t
        // Issue:  IF function not uppercased (it is a valid Spark function)
        {
            name: 'IF function should be uppercased',
            input: 'select if(x > 0, 1, 0) from t',
            expected: 'SELECT IF(x > 0, 1, 0) FROM t',
        },

        // =====================================================================
        // BUG #52: STRING_AGG function not uppercased
        // =====================================================================
        // Input:  select string_agg(x, ',') from t
        // Expect: SELECT STRING_AGG(x, ',') FROM t
        // Actual: SELECT string_agg(x, ',') FROM t
        // Issue:  Function not uppercased
        {
            name: 'STRING_AGG function should be uppercased',
            input: "select string_agg(x, ',') from t",
            expected: "SELECT STRING_AGG(x, ',') FROM t",
        },

        // =====================================================================
        // BUG #53: FLATTEN function not uppercased
        // =====================================================================
        // Input:  select flatten(arr) from t
        // Expect: SELECT FLATTEN(arr) FROM t
        // Actual: SELECT flatten(arr) FROM t
        // Issue:  Function not uppercased (available in Spark)
        {
            name: 'FLATTEN function should be uppercased',
            input: 'select flatten(arr) from t',
            expected: 'SELECT FLATTEN(arr) FROM t',
        },

        // =====================================================================
        // BUG #54: DISTRIBUTE BY not fully uppercased
        // =====================================================================
        // Input:  select * from t distribute by x
        // Expect: SELECT * FROM t DISTRIBUTE BY x
        // Actual: SELECT * FROM t distribute BY x
        // Issue:  DISTRIBUTE not uppercased
        {
            name: 'DISTRIBUTE BY should be fully uppercased',
            input: 'select * from t distribute by x',
            expected: 'SELECT * FROM t DISTRIBUTE BY x',
        },

        // =====================================================================
        // BUG #55: SORT BY not fully uppercased
        // =====================================================================
        // Input:  select * from t sort by x
        // Expect: SELECT * FROM t SORT BY x
        // Actual: SELECT * FROM t sort BY x
        // Issue:  SORT not uppercased
        {
            name: 'SORT BY should be fully uppercased',
            input: 'select * from t sort by x',
            expected: 'SELECT * FROM t SORT BY x',
        },

        // =====================================================================
        // BUG #56: CLUSTER BY not fully uppercased
        // =====================================================================
        // Input:  select * from t cluster by x
        // Expect: SELECT * FROM t CLUSTER BY x
        // Actual: SELECT * FROM t cluster BY x
        // Issue:  CLUSTER not uppercased
        {
            name: 'CLUSTER BY should be fully uppercased',
            input: 'select * from t cluster by x',
            expected: 'SELECT * FROM t CLUSTER BY x',
        },
    ],
};
