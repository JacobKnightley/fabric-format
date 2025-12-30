/**
 * Comment and Hint Tests
 * Note: Tests use multiple columns to avoid compact query mode
 */
import { TestSuite } from './framework.js';

export const commentTests: TestSuite = {
    name: 'Comments',
    tests: [
        // === LEADING COMMENTS ===
        {
            name: 'Leading line comment',
            input: '-- header comment\nselect x, y from t',
            expected: '-- header comment\nSELECT\n     x\n    ,y\nFROM t',
        },
        {
            name: 'Leading block comment',
            input: '/* multi\nline */\nselect x, y from t',
            expected: '/* multi\nline */\nSELECT\n     x\n    ,y\nFROM t',
        },
        {
            name: 'Multiple leading line comments',
            input: '-- comment 1\n-- comment 2\nselect x, y from t',
            expected: '-- comment 1\n-- comment 2\nSELECT\n     x\n    ,y\nFROM t',
        },
        {
            name: 'Leading comments with blank line preserved',
            input: '-- comment 1\n\n-- comment 2\nselect x, y from t',
            expected: '-- comment 1\n\n-- comment 2\nSELECT\n     x\n    ,y\nFROM t',
        },
        {
            name: 'Leading block comment single line',
            input: '/* header */ select x, y from t',
            expected: '/* header */ SELECT\n     x\n    ,y\nFROM t',
        },
        
        // === TRAILING COMMENTS ===
        {
            name: 'Trailing inline comment',
            input: 'select x, y from t -- inline comment',
            expected: 'SELECT\n     x\n    ,y\nFROM t -- inline comment',
        },
        {
            name: 'Trailing block comment',
            input: 'select x, y from t /* end comment */',
            expected: 'SELECT\n     x\n    ,y\nFROM t /* end comment */',
        },
        
        // === COMMENTS IN SELECT CLAUSE ===
        {
            name: 'Comment after SELECT keyword',
            input: 'select /* columns */ x, y from t',
            expected: 'SELECT /* columns */\n     x\n    ,y\nFROM t',
        },
        {
            name: 'Line comment after column',
            input: 'select x, -- first col\ny from t',
            expected: 'SELECT\n     x -- first col\n    ,y\nFROM t',
        },
        {
            name: 'Block comment between columns',
            input: 'select x, /* separator */ y from t',
            expected: 'SELECT\n     x /* separator */\n    ,y\nFROM t',
        },
        {
            name: 'Comment before column alias',
            input: 'select x /* rename */ as col1, y from t',
            expected: 'SELECT\n     x /* rename */ AS col1\n    ,y\nFROM t',
        },
        
        // === COMMENTS IN FROM CLAUSE ===
        {
            name: 'Comment after FROM keyword',
            input: 'select x, y from /* source */ t',
            expected: 'SELECT\n     x\n    ,y\nFROM /* source */ t',
        },
        {
            name: 'Comment after table name',
            input: 'select x, y from t -- main table',
            expected: 'SELECT\n     x\n    ,y\nFROM t -- main table',
        },
        {
            name: 'Comment between table and alias',
            input: 'select x, y from t /* tbl */ as a',
            expected: 'SELECT\n     x\n    ,y\nFROM t /* tbl */ a',
        },
        
        // === COMMENTS IN WHERE CLAUSE ===
        {
            name: 'Comment in WHERE clause',
            input: 'select x, y from t where /* filter */ a = 1',
            expected: 'SELECT\n     x\n    ,y\nFROM t\nWHERE /* filter */ a = 1',
        },
        {
            name: 'Comment after WHERE keyword',
            input: 'select x, y from t where -- conditions\na = 1',
            expected: 'SELECT\n     x\n    ,y\nFROM t\nWHERE -- conditions\na = 1',
        },
        {
            name: 'Comment between AND conditions',
            input: 'select x from t where a = 1 /* and more */ and b = 2',
            expected: 'SELECT x\nFROM t\nWHERE\n    a = 1 /* and more */\n    AND b = 2',
        },
        {
            name: 'Line comment after condition',
            input: 'select x from t where a = 1 -- check a\nand b = 2',
            expected: 'SELECT x\nFROM t\nWHERE\n    a = 1 -- check a\n    AND b = 2',
        },
        
        // === COMMENTS IN JOIN CLAUSE ===
        {
            name: 'Comment before JOIN',
            input: 'select x from t1 /* join here */ join t2 on t1.id = t2.id',
            expected: 'SELECT x\nFROM t1 /* join here */\nJOIN t2\n    ON t1.id = t2.id',
        },
        {
            name: 'Comment after JOIN keyword',
            input: 'select x from t1 join /* lookup */ t2 on t1.id = t2.id',
            expected: 'SELECT x\nFROM t1\nJOIN /* lookup */ t2\n    ON t1.id = t2.id',
        },
        {
            name: 'Comment in ON clause',
            input: 'select x from t1 join t2 on /* key match */ t1.id = t2.id',
            expected: 'SELECT x\nFROM t1\nJOIN t2\n    ON /* key match */ t1.id = t2.id',
        },
        
        // === COMMENTS IN GROUP BY / ORDER BY ===
        {
            name: 'Comment after GROUP BY',
            input: 'select a, count(*) from t group by /* grouping */ a',
            expected: 'SELECT\n     a\n    ,COUNT(*)\nFROM t\nGROUP BY /* grouping */ a',
        },
        {
            name: 'Comment after ORDER BY',
            input: 'select x, y from t order by /* sorting */ x desc',
            expected: 'SELECT\n     x\n    ,y\nFROM t\nORDER BY /* sorting */ x DESC',
        },
        
        // === COMMENTED OUT SQL CODE ===
        {
            name: 'Commented out column',
            input: 'select x, /* y, */ z from t',
            expected: 'SELECT\n     x /* y, */\n    ,z\nFROM t',
        },
        {
            name: 'Commented out WHERE clause',
            input: 'select x, y from t -- where a = 1',
            expected: 'SELECT\n     x\n    ,y\nFROM t -- where a = 1',
        },
        {
            name: 'Commented out JOIN',
            input: 'select x, y from t1 /* join t2 on t1.id = t2.id */',
            expected: 'SELECT\n     x\n    ,y\nFROM t1 /* join t2 on t1.id = t2.id */',
        },
        {
            name: 'Commented out condition with AND',
            input: 'select x, y from t where a = 1 /* and b = 2 */',
            expected: 'SELECT\n     x\n    ,y\nFROM t\nWHERE a = 1 /* and b = 2 */',
        },
        
        // === MIXED COMMENT STYLES ===
        {
            name: 'Line and block comments mixed',
            input: '-- header\nselect /* cols */ x, y from t -- end',
            expected: '-- header\nSELECT /* cols */\n     x\n    ,y\nFROM t -- end',
        },
        {
            name: 'Multiple block comments',
            input: 'select /* a */ x, /* b */ y from /* c */ t',
            expected: 'SELECT /* a */\n     x /* b */\n    ,y\nFROM /* c */ t',
        },
        
        // === EDGE CASES ===
        {
            name: 'Empty block comment',
            input: 'select /**/ x, y from t',
            expected: 'SELECT /**/\n     x\n    ,y\nFROM t',
        },
        {
            name: 'Block comment with asterisks',
            input: 'select /*** important ***/ x, y from t',
            expected: 'SELECT /*** important ***/\n     x\n    ,y\nFROM t',
        },
        {
            name: 'Comment with SQL keywords inside',
            input: 'select x, y from t /* SELECT FROM WHERE */',
            expected: 'SELECT\n     x\n    ,y\nFROM t /* SELECT FROM WHERE */',
        },
        {
            name: 'Comment with special characters',
            input: "select x, y from t -- TODO: fix this! @#$%",
            expected: "SELECT\n     x\n    ,y\nFROM t -- TODO: fix this! @#$%",
        },
        {
            name: 'Nested-looking block comment',
            input: 'select x, y from t /* outer /* inner */ still outer */',
            expected: 'SELECT\n     x\n    ,y\nFROM t /* outer /* inner */ still outer */',
        },
        {
            name: 'Comment only (no SQL)',
            input: '-- just a comment',
            expected: '-- just a comment',
        },
        {
            name: 'Block comment only',
            input: '/* just a comment */',
            expected: '/* just a comment */',
        },
        
        // === COMMENTS IN SUBQUERIES ===
        {
            name: 'Comment in subquery',
            input: 'select x, y from (select /* inner */ a, b from t) sub',
            expected: 'SELECT\n     x\n    ,y\nFROM (\n    SELECT /* inner */\n         a\n        ,b\n    FROM t\n) sub',
        },
        {
            name: 'Comment before subquery',
            input: 'select x, y from /* derived */ (select a, b from t) sub',
            expected: 'SELECT\n     x\n    ,y\nFROM /* derived */ (\n    SELECT\n         a\n        ,b\n    FROM t\n) sub',
        },
        
        // === COMMENTS IN CTE ===
        {
            name: 'Comment in CTE',
            input: 'with /* cte */ a as (select x, y from t) select x, y from a',
            expected: 'WITH /* cte */ a AS (\n    SELECT\n         x\n        ,y\n    FROM t\n)\nSELECT\n     x\n    ,y\nFROM a',
        },
        {
            name: 'Comment after CTE name',
            input: 'with a /* temp */ as (select x, y from t) select x, y from a',
            expected: 'WITH a /* temp */ AS (\n    SELECT\n         x\n        ,y\n    FROM t\n)\nSELECT\n     x\n    ,y\nFROM a',
        },
        
        // === COMMENTS IN FUNCTIONS ===
        {
            name: 'Comment in function arguments',
            input: 'select coalesce(/* default */ a, b), c from t',
            expected: 'SELECT\n     COALESCE(/* default */ a, b)\n    ,c\nFROM t',
        },
        {
            name: 'Comment between function args',
            input: 'select concat(a, /* sep */ b), c from t',
            expected: 'SELECT\n     CONCAT(a, /* sep */ b)\n    ,c\nFROM t',
        },
        
        // === COMMENTS IN CASE EXPRESSIONS ===
        {
            name: 'Comment in CASE expression',
            input: 'select case /* check */ when a = 1 then b else c end, x from t',
            expected: 'SELECT\n     CASE /* check */ WHEN a = 1 THEN b ELSE c END\n    ,x\nFROM t',
        },
        {
            name: 'Comment after WHEN',
            input: 'select case when /* condition */ a = 1 then b end, x from t',
            expected: 'SELECT\n     CASE WHEN /* condition */ a = 1 THEN b END\n    ,x\nFROM t',
        },
        
        // === COMMENTS IN DML ===
        {
            name: 'Comment in INSERT',
            input: 'insert into /* target */ t select x, y from s',
            expected: 'INSERT INTO /* target */ t\nSELECT\n     x\n    ,y\nFROM s',
        },
        {
            name: 'Comment in UPDATE SET',
            input: 'update t set /* column */ x = 1',
            expected: 'UPDATE t\nSET /* column */ x = 1',
        },
        {
            name: 'Comment in DELETE',
            input: 'delete from /* cleanup */ t where x = 1',
            expected: 'DELETE FROM /* cleanup */ t\nWHERE x = 1',
        },
        
        // === WHITESPACE EDGE CASES ===
        {
            name: 'Comment with no space before',
            input: 'select x/* comment */, y from t',
            expected: 'SELECT\n     x /* comment */\n    ,y\nFROM t',
        },
        {
            name: 'Comment with no space after',
            input: 'select /* comment */x, y from t',
            expected: 'SELECT /* comment */\n     x\n    ,y\nFROM t',
        },
        {
            name: 'Line comment at end with newline',
            input: 'select x, y from t -- comment\n',
            expected: 'SELECT\n     x\n    ,y\nFROM t -- comment',
        },
        
        // === BUG: COMMENT AFTER OPENING PAREN ===
        // Space should be preserved between "(" and line comment
        {
            name: 'Line comment after CTE opening paren should preserve space',
            input: 'with cte as ( -- comment\nselect a, b from t\n) select a, b from cte',
            expected: 'WITH cte AS ( -- comment\n    SELECT\n         a\n        ,b\n    FROM t\n)\nSELECT\n     a\n    ,b\nFROM cte',
        },
        {
            name: 'Line comment after LATERAL opening paren',
            input: 'select * from t left join lateral ( -- subquery\nselect a, b from s\n) sub on true',
            expected: 'SELECT *\nFROM t\nLEFT JOIN LATERAL ( -- subquery\n    SELECT\n         a\n        ,b\n    FROM s\n) sub\n    ON TRUE',
        },
        
        // === BUG: COMMENT BETWEEN STATEMENTS ===
        // Comments between ")" and next statement should stay on own line
        {
            name: 'Block comment between CTE close and SELECT on own line',
            input: 'with cte as (select a, b from t)\n/* main query */\nselect a, b from cte',
            expected: 'WITH cte AS (\n    SELECT\n         a\n        ,b\n    FROM t\n)\n/* main query */\nSELECT\n     a\n    ,b\nFROM cte',
        },
        {
            name: 'Line comment between CTE close and SELECT',
            input: 'with cte as (select a, b from t)\n-- main query\nselect a, b from cte',
            expected: 'WITH cte AS (\n    SELECT\n         a\n        ,b\n    FROM t\n)\n-- main query\nSELECT\n     a\n    ,b\nFROM cte',
        },
        
        // === BUG: STANDALONE LINE COMMENTS ===
        // Comments on their own line should stay on own line, not collapse to inline
        {
            name: 'Comment on own line before column stays on own line',
            input: 'select\n    -- user info\n    id,\n    name\nfrom users',
            expected: 'SELECT\n     -- user info\n     id\n    ,name\nFROM users',
        },
        {
            name: 'Comment between clauses on own line',
            input: 'select a, b from t\n-- filter active only\nwhere status = 1',
            expected: 'SELECT\n     a\n    ,b\nFROM t\n-- filter active only\nWHERE status = 1',
        },
    ],
};

export const hintTests: TestSuite = {
    name: 'Hints',
    tests: [
        {
            name: 'BROADCAST hint',
            input: 'select /*+ broadcast(t) */ a, b from t',
            expected: 'SELECT /*+ BROADCAST(t) */\n     a\n    ,b\nFROM t',
        },
        {
            name: 'Multiple hints',
            input: 'select /*+ broadcast(t1), merge(t2) */ a, b from t',
            expected: 'SELECT /*+ BROADCAST(t1), MERGE(t2) */\n     a\n    ,b\nFROM t',
        },
        {
            name: 'Hint preserves table name casing',
            input: 'select /*+ broadcast(MyTable) */ a, b from MyTable',
            expected: 'SELECT /*+ BROADCAST(MyTable) */\n     a\n    ,b\nFROM MyTable',
        },
    ],
};
