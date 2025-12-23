import SqlBaseLexer from './dist/generated/SqlBaseLexer.js';
import SqlBaseParser from './dist/generated/SqlBaseParser.js';
import antlr4 from 'antlr4';

const sql = 'SELECT a/*comment*/b FROM t';
console.log(`Input: ${sql}\n`);

const chars = new antlr4.InputStream(sql);
const lexer = new SqlBaseLexer(chars);
const tokens = new antlr4.CommonTokenStream(lexer);
tokens.fill();

console.log('Tokens:');
for (const token of tokens.tokens) {
    if (token.type !== antlr4.Token.EOF) {
        const symbolicName = SqlBaseLexer.symbolicNames[token.type] || token.type;
        console.log(`  ${symbolicName}: "${token.text}"`);
    }
}

// Parse it
const chars2 = new antlr4.InputStream(sql);
const lexer2 = new SqlBaseLexer(chars2);
const tokens2 = new antlr4.CommonTokenStream(lexer2);
const parser = new SqlBaseParser(tokens2);
parser.removeErrorListeners();

try {
    const tree = parser.singleStatement();
    console.log('\nParsed successfully');
} catch (e) {
    console.log('\nParse error:', e.message);
}
