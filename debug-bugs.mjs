import { formatSql } from './dist/formatter.js';

// Test case 1: Comment after opening paren
const sql1 = 'with cte as ( -- comment\nselect a from t\n) select * from cte';
console.log('Test 1: Comment after opening paren');
console.log('Input:', sql1);
console.log('Expected: WITH cte AS ( -- comment\\n    SELECT a\\n    FROM t\\n)\\nSELECT *\\nFROM cte');
console.log('Got:     ', formatSql(sql1));
console.log();

// Test case 2: Comment on own line after close paren
const sql2 = 'with cte as (select a from t)\n/* main query */\nselect * from cte';
console.log('Test 2: Block comment on own line');
console.log('Input:', sql2);
console.log('Expected: WITH cte AS (\\n    SELECT a\\n    FROM t\\n)\\n/* main query */\\nSELECT *\\nFROM cte');
console.log('Got:     ', formatSql(sql2));
console.log();

// Test case 3: Comment between clauses
const sql3 = 'select a from t\n-- filter active only\nwhere status = 1';
console.log('Test 3: Comment between clauses');
console.log('Input:', sql3);
console.log('Expected: SELECT a\\nFROM t\\n-- filter active only\\nWHERE status = 1');
console.log('Got:     ', formatSql(sql3));
console.log();
