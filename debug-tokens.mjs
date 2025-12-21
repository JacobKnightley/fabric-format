import SqlBaseLexer from './dist/generated/SqlBaseLexer.js';
import antlr4 from 'antlr4';

function analyzeTokens(sql) {
    console.log('SQL:', sql);
    console.log('---');
    const stream = new antlr4.CharStream(sql);
    const lexer = new SqlBaseLexer(stream);
    const tokens = new antlr4.CommonTokenStream(lexer);
    tokens.fill();

    for (let i = 0; i < tokens.tokens.length; i++) {
        const token = tokens.tokens[i];
        if (token.type === antlr4.Token.EOF) continue;
        
        const typeName = SqlBaseLexer.symbolicNames[token.type] || 'UNKNOWN';
        const text = token.text.replace(/\n/g, '\\n');
        const channel = token.channel === 0 ? 'DEFAULT' : token.channel === 1 ? 'HIDDEN' : token.channel;
        
        console.log(`[${i}] ${typeName.padEnd(20)} ch=${channel.toString().padEnd(7)} line=${token.line} col=${token.column.toString().padEnd(3)} text="${text}"`);
    }
    console.log();
}

// Test 1: Comment after opening paren
analyzeTokens('with cte as ( -- comment\nselect a from t)');

// Test 2: Comment on own line
analyzeTokens('with cte as (select a from t)\n/* main query */\nselect * from cte');

// Test 3: Comment between clauses
analyzeTokens('select a from t\n-- filter\nwhere x > 1');
