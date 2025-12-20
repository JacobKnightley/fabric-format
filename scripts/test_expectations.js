import {formatSql} from '../dist/formatter.js';

// REMAINING GAPS - Tests that don't match expected output yet
// These represent work items to be fixed (all related to indent inside parens)
const tests = [
  // === GAP: Subquery indentation ===
  ['FROM subquery with 4-space indent', 
   'select x from (select y as x from s) sub',
   'SELECT\n     x\nFROM (\n    SELECT\n         y AS x\n    FROM s\n) sub'],
  
  // === GAP: CTE formatting ===
  ['Single CTE with indent', 
   'with cte as (select x from t) select * from cte',
   'WITH cte AS (\n    SELECT\n         x\n    FROM t\n)\nSELECT\n     *\nFROM cte'],
  ['Multiple CTEs comma-first', 
   'with a as (select 1 as x), b as (select x from a) select * from b',
   'WITH a AS (\n    SELECT\n         1 AS x\n)\n,b AS (\n    SELECT\n         x\n    FROM a\n)\nSELECT\n     *\nFROM b'],
  
  // === GAP: DDL formatting ===
  ['CREATE TABLE column list', 
   'create table users (id int, name string)',
   'CREATE TABLE users (\n     id INT\n    ,name STRING\n)'],
];

console.log('=== Comparing Output vs Expected ===\n');
let pass = 0, fail = 0;
for (const [name, sql, expected] of tests) {
  try {
    const result = formatSql(sql);
    if (result === expected) {
      console.log(`✓ ${name}`);
      pass++;
    } else {
      console.log(`✗ ${name}`);
      console.log(`  Expected: ${expected.replace(/\n/g, '\\n')}`);
      console.log(`  Got:      ${result.replace(/\n/g, '\\n')}`);
      fail++;
    }
  } catch (e) {
    console.log(`✗ ${name} - ERROR: ${e.message.split('\n')[0]}`);
    fail++;
  }
}
console.log(`\n=== Summary: ${pass} pass, ${fail} fail ===`);
