import SqlBaseLexer from './dist/generated/SqlBaseLexer.js';
import antlr4 from 'antlr4';

// Test how -- is tokenized
const testCases = [
    '1--2',
    '1 --2',
    '1- -2',
    '1 - -2',
    'a--b',
    'a --comment'
];

for (const sql of testCases) {
    console.log(`\nInput: ${sql}`);
    const chars = new antlr4.InputStream(sql);
    const lexer = new SqlBaseLexer(chars);
    const tokens = new antlr4.CommonTokenStream(lexer);
    tokens.fill();
    
    for (const token of tokens.tokens) {
        if (token.type !== antlr4.Token.EOF) {
            const symbolicName = SqlBaseLexer.symbolicNames[token.type] || token.type;
            console.log(`  ${symbolicName}: "${token.text}"`);
        }
    }
}
