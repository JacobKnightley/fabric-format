/**
 * Comment and Hint Tests
 */
import { TestSuite } from './framework.js';

export const commentTests: TestSuite = {
    name: 'Comments',
    tests: [
        // === LEADING COMMENTS ===
        {
            name: 'Leading line comment',
            input: '-- header comment\nselect x from t',
            expected: '-- header comment\nSELECT x\nFROM t',
        },
        {
            name: 'Leading block comment',
            input: '/* multi\nline */\nselect x from t',
            expected: '/* multi\nline */\nSELECT x\nFROM t',
        },
        {
            name: 'Multiple leading line comments',
            input: '-- comment 1\n-- comment 2\nselect x from t',
            expected: '-- comment 1\n-- comment 2\nSELECT x\nFROM t',
        },
        {
            name: 'Leading block comment single line',
            input: '/* header */ select x from t',
            expected: '/* header */ SELECT x\nFROM t',
        },
        
        // === TRAILING COMMENTS ===
        {
            name: 'Trailing inline comment',
            input: 'select x from t -- inline comment',
            expected: 'SELECT x\nFROM t -- inline comment',
        },
        {
            name: 'Trailing block comment',
            input: 'select x from t /* end comment */',
            expected: 'SELECT x\nFROM t /* end comment */',
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
            input: 'select x /* rename */ as col1 from t',
            expected: 'SELECT x /* rename */ AS col1\nFROM t',
        },
        
        // === COMMENTS IN FROM CLAUSE ===
        {
            name: 'Comment after FROM keyword',
            input: 'select x from /* source */ t',
            expected: 'SELECT x\nFROM /* source */ t',
        },
        {
            name: 'Comment after table name',
            input: 'select x from t -- main table',
            expected: 'SELECT x\nFROM t -- main table',
        },
        {
            name: 'Comment between table and alias',
            input: 'select x from t /* tbl */ as a',
            expected: 'SELECT x\nFROM t /* tbl */ AS a',
        },
        
        // === COMMENTS IN WHERE CLAUSE ===
        {
            name: 'Comment in WHERE clause',
            input: 'select x from t where /* filter */ a = 1',
            expected: 'SELECT x\nFROM t\nWHERE /* filter */ a = 1',
        },
        {
            name: 'Comment after WHERE keyword',
            input: 'select x from t where -- conditions\na = 1',
            expected: 'SELECT x\nFROM t\nWHERE -- conditions\na = 1',
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
            input: 'select x from t order by /* sorting */ x desc',
            expected: 'SELECT x\nFROM t\nORDER BY /* sorting */ x DESC',
        },
        
        // === COMMENTED OUT SQL CODE ===
        {
            name: 'Commented out column',
            input: 'select x, /* y, */ z from t',
            expected: 'SELECT\n     x /* y, */\n    ,z\nFROM t',
        },
        {
            name: 'Commented out WHERE clause',
            input: 'select x from t -- where a = 1',
            expected: 'SELECT x\nFROM t -- where a = 1',
        },
        {
            name: 'Commented out JOIN',
            input: 'select x from t1 /* join t2 on t1.id = t2.id */',
            expected: 'SELECT x\nFROM t1 /* join t2 on t1.id = t2.id */',
        },
        {
            name: 'Commented out condition with AND',
            input: 'select x from t where a = 1 /* and b = 2 */',
            expected: 'SELECT x\nFROM t\nWHERE a = 1 /* and b = 2 */',
        },
        
        // === MIXED COMMENT STYLES ===
        {
            name: 'Line and block comments mixed',
            input: '-- header\nselect /* cols */ x from t -- end',
            expected: '-- header\nSELECT /* cols */ x\nFROM t -- end',
        },
        {
            name: 'Multiple block comments',
            input: 'select /* a */ x, /* b */ y from /* c */ t',
            expected: 'SELECT /* a */\n     x /* b */\n    ,y\nFROM /* c */ t',
        },
        
        // === EDGE CASES ===
        {
            name: 'Empty block comment',
            input: 'select /**/ x from t',
            expected: 'SELECT /**/ x\nFROM t',
        },
        {
            name: 'Block comment with asterisks',
            input: 'select /*** important ***/ x from t',
            expected: 'SELECT /*** important ***/ x\nFROM t',
        },
        {
            name: 'Comment with SQL keywords inside',
            input: 'select x from t /* SELECT FROM WHERE */',
            expected: 'SELECT x\nFROM t /* SELECT FROM WHERE */',
        },
        {
            name: 'Comment with special characters',
            input: "select x from t -- TODO: fix this! @#$%",
            expected: "SELECT x\nFROM t -- TODO: fix this! @#$%",
        },
        {
            name: 'Nested-looking block comment',
            input: 'select x from t /* outer /* inner */ still outer */',
            expected: 'SELECT x\nFROM t /* outer /* inner */ still outer */',
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
            input: 'select x from (select /* inner */ y from t) sub',
            expected: 'SELECT x\nFROM (\n    SELECT /* inner */ y\n    FROM t\n) sub',
        },
        {
            name: 'Comment before subquery',
            input: 'select x from /* derived */ (select y from t) sub',
            expected: 'SELECT x\nFROM /* derived */ (\n    SELECT y\n    FROM t\n) sub',
        },
        
        // === COMMENTS IN CTE ===
        {
            name: 'Comment in CTE',
            input: 'with /* cte */ a as (select x from t) select * from a',
            expected: 'WITH /* cte */ a AS (\n    SELECT x\n    FROM t\n)\nSELECT *\nFROM a',
        },
        {
            name: 'Comment after CTE name',
            input: 'with a /* temp */ as (select x from t) select * from a',
            expected: 'WITH a /* temp */ AS (\n    SELECT x\n    FROM t\n)\nSELECT *\nFROM a',
        },
        
        // === COMMENTS IN FUNCTIONS ===
        {
            name: 'Comment in function arguments',
            input: 'select coalesce(/* default */ a, b) from t',
            expected: 'SELECT COALESCE(/* default */ a, b)\nFROM t',
        },
        {
            name: 'Comment between function args',
            input: 'select concat(a, /* sep */ b) from t',
            expected: 'SELECT CONCAT(a, /* sep */ b)\nFROM t',
        },
        
        // === COMMENTS IN CASE EXPRESSIONS ===
        {
            name: 'Comment in CASE expression',
            input: 'select case /* check */ when a = 1 then b else c end from t',
            expected: 'SELECT CASE /* check */ WHEN a = 1 THEN b ELSE c END\nFROM t',
        },
        {
            name: 'Comment after WHEN',
            input: 'select case when /* condition */ a = 1 then b end from t',
            expected: 'SELECT CASE WHEN /* condition */ a = 1 THEN b END\nFROM t',
        },
        
        // === COMMENTS IN DML ===
        {
            name: 'Comment in INSERT',
            input: 'insert into /* target */ t select x from s',
            expected: 'INSERT INTO /* target */ t\nSELECT x\nFROM s',
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
            input: 'select x/* comment */from t',
            expected: 'SELECT x /* comment */\nFROM t',
        },
        {
            name: 'Comment with no space after',
            input: 'select /* comment */x from t',
            expected: 'SELECT /* comment */ x\nFROM t',
        },
        {
            name: 'Line comment at end with newline',
            input: 'select x from t -- comment\n',
            expected: 'SELECT x\nFROM t -- comment',
        },
        
        // === BUG: COMMENT AFTER OPENING PAREN ===
        // Space should be preserved between "(" and line comment
        {
            name: 'Line comment after CTE opening paren should preserve space',
            input: 'with cte as ( -- comment\nselect a from t\n) select * from cte',
            expected: 'WITH cte AS ( -- comment\n    SELECT a\n    FROM t\n)\nSELECT *\nFROM cte',
        },
        {
            name: 'Line comment after LATERAL opening paren',
            input: 'select * from t left join lateral ( -- subquery\nselect a from s\n) sub on true',
            expected: 'SELECT *\nFROM t\nLEFT JOIN LATERAL ( -- subquery\n    SELECT a\n    FROM s\n) sub\n    ON TRUE',
        },
        
        // === BUG: COMMENT BETWEEN STATEMENTS ===
        // Comments between ")" and next statement should stay on own line
        {
            name: 'Block comment between CTE close and SELECT on own line',
            input: 'with cte as (select a from t)\n/* main query */\nselect * from cte',
            expected: 'WITH cte AS (\n    SELECT a\n    FROM t\n)\n/* main query */\nSELECT *\nFROM cte',
        },
        {
            name: 'Line comment between CTE close and SELECT',
            input: 'with cte as (select a from t)\n-- main query\nselect * from cte',
            expected: 'WITH cte AS (\n    SELECT a\n    FROM t\n)\n-- main query\nSELECT *\nFROM cte',
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
            input: 'select a from t\n-- filter active only\nwhere status = 1',
            expected: 'SELECT a\nFROM t\n-- filter active only\nWHERE status = 1',
        },
    ],
};

export const hintTests: TestSuite = {
    name: 'Hints',
    tests: [
        {
            name: 'BROADCAST hint',
            input: 'select /*+ broadcast(t) */ * from t',
            expected: 'SELECT /*+ BROADCAST(t) */ *\nFROM t',
        },
        {
            name: 'Multiple hints',
            input: 'select /*+ broadcast(t1), merge(t2) */ * from t',
            expected: 'SELECT /*+ BROADCAST(t1), MERGE(t2) */ *\nFROM t',
        },
        {
            name: 'Hint preserves table name casing',
            input: 'select /*+ broadcast(MyTable) */ * from MyTable',
            expected: 'SELECT /*+ BROADCAST(MyTable) */ *\nFROM MyTable',
        },
    ],
};
