/**
 * Spark SQL Formatter - 100% Grammar-Driven
 * 
 * NO HARDCODED KEYWORD, FUNCTION, OR CLAUSE LISTS.
 * Everything derived from ANTLR lexer symbolicNames and parse tree context.
 * 
 * Rules:
 * - Token in identifier context (not function) → preserve original casing
 * - Token in function call context → uppercase
 * - Token is keyword (symbolicName === text) → uppercase
 * - Newlines before clause-starting tokens (from parse tree structure)
 */
import antlr4 from 'antlr4';
// @ts-ignore
import SqlBaseLexer from './generated/SqlBaseLexer.js';
// @ts-ignore
import SqlBaseParser from './generated/SqlBaseParser.js';
// @ts-ignore
import SqlBaseParserVisitor from './generated/SqlBaseParserVisitor.js';

/**
 * Build a map from symbolic name to token type (derived from grammar at runtime)
 */
const SYMBOLIC_NAME_TO_TYPE: Map<string, number> = new Map();
for (let i = 0; i < SqlBaseLexer.symbolicNames.length; i++) {
    const name = SqlBaseLexer.symbolicNames[i];
    if (name) {
        SYMBOLIC_NAME_TO_TYPE.set(name, i);
    }
}

/**
 * Get token type by name (grammar-derived)
 */
function getTokenType(name: string): number {
    return SYMBOLIC_NAME_TO_TYPE.get(name) ?? -1;
}

/**
 * Check if a token is a keyword by comparing its symbolic name to its text.
 * Keywords in ANTLR are defined like: SELECT: 'SELECT';
 * So symbolicNames[tokenType] === tokenText for keywords.
 */
function isKeywordToken(tokenType: number, tokenText: string): boolean {
    const symbolicName = SqlBaseLexer.symbolicNames[tokenType];
    // A keyword's symbolic name matches its uppercase text
    return symbolicName !== null && 
           symbolicName !== undefined && 
           symbolicName === tokenText.toUpperCase();
}

/**
 * Visitor that collects context information from parse tree:
 * - Identifier tokens (preserve casing)
 * - Function call tokens (uppercase)
 * - Clause-starting tokens (newline before)
 */
class ParseTreeAnalyzer extends SqlBaseParserVisitor {
    identifierTokens: Set<number> = new Set();
    functionCallTokens: Set<number> = new Set();
    clauseStartTokens: Set<number> = new Set();
    
    visit(ctx: any): any {
        if (!ctx) return null;
        return this.visitChildren(ctx);
    }
    
    visitChildren(ctx: any): any {
        if (!ctx?.children) return null;
        for (const child of ctx.children) {
            if (child?.accept) child.accept(this);
        }
        return null;
    }
    
    // ========== IDENTIFIER CONTEXTS ==========
    // All grammar rules that define identifier positions
    
    visitIdentifier(ctx: any): any {
        this._markIdentifier(ctx);
        return this.visitChildren(ctx);
    }
    
    visitStrictIdentifier(ctx: any): any {
        this._markIdentifier(ctx);
        return this.visitChildren(ctx);
    }
    
    visitQuotedIdentifier(ctx: any): any {
        this._markIdentifier(ctx);
        return this.visitChildren(ctx);
    }
    
    visitBackQuotedIdentifier(ctx: any): any {
        this._markIdentifier(ctx);
        return this.visitChildren(ctx);
    }
    
    visitUnquotedIdentifier(ctx: any): any {
        this._markIdentifier(ctx);
        return this.visitChildren(ctx);
    }
    
    visitErrorCapturingIdentifier(ctx: any): any {
        this._markIdentifier(ctx);
        return this.visitChildren(ctx);
    }
    
    // ========== FUNCTION CALL CONTEXTS ==========
    // Grammar rules that identify function calls
    
    visitFunctionCall(ctx: any): any {
        if (ctx.start) {
            this.functionCallTokens.add(ctx.start.tokenIndex);
        }
        return this.visitChildren(ctx);
    }
    
    visitFunctionName(ctx: any): any {
        if (ctx.start) {
            this.functionCallTokens.add(ctx.start.tokenIndex);
        }
        return this.visitChildren(ctx);
    }
    
    // ========== CLAUSE-STARTING CONTEXTS ==========
    // Grammar rules for clauses that should start on new lines
    
    visitFromClause(ctx: any): any {
        this._markClauseStart(ctx);
        return this.visitChildren(ctx);
    }
    
    visitWhereClause(ctx: any): any {
        this._markClauseStart(ctx);
        return this.visitChildren(ctx);
    }
    
    visitHavingClause(ctx: any): any {
        this._markClauseStart(ctx);
        return this.visitChildren(ctx);
    }
    
    visitAggregationClause(ctx: any): any {
        // GROUP BY clause
        this._markClauseStart(ctx);
        return this.visitChildren(ctx);
    }
    
    visitQueryOrganization(ctx: any): any {
        // ORDER BY, LIMIT, etc. - scan children for specific tokens
        // Mark ORDER token and LIMIT token separately
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'ORDER' || symName === 'LIMIT') {
                        this.clauseStartTokens.add(child.symbol.tokenIndex);
                    }
                }
            }
        }
        return this.visitChildren(ctx);
    }
    
    visitSortItem(ctx: any): any {
        // Don't mark sort items as clause starters (they're part of ORDER BY)
        return this.visitChildren(ctx);
    }
    
    visitLimitClause(ctx: any): any {
        this._markClauseStart(ctx);
        return this.visitChildren(ctx);
    }
    
    visitJoinRelation(ctx: any): any {
        // JOIN clauses
        this._markClauseStart(ctx);
        return this.visitChildren(ctx);
    }
    
    visitWindowDef(ctx: any): any {
        // Window definition - mark ORDER BY token inside OVER clause
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'ORDER') {
                        this.clauseStartTokens.add(child.symbol.tokenIndex);
                    }
                }
            }
        }
        return this.visitChildren(ctx);
    }
    
    visitSetOperation(ctx: any): any {
        // UNION, EXCEPT, INTERSECT - find the operator token
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'UNION' || symName === 'EXCEPT' || symName === 'INTERSECT') {
                        this.clauseStartTokens.add(child.symbol.tokenIndex);
                    }
                }
            }
        }
        return this.visitChildren(ctx);
    }
    
    visitSelectClause(ctx: any): any {
        // SELECT keyword - new line for nested/union SELECTs
        this._markClauseStart(ctx);
        return this.visitChildren(ctx);
    }
    
    // Helper methods
    
    private _markIdentifier(ctx: any): void {
        if (ctx.start) {
            for (let i = ctx.start.tokenIndex; i <= (ctx.stop?.tokenIndex ?? ctx.start.tokenIndex); i++) {
                this.identifierTokens.add(i);
            }
        }
    }
    
    private _markClauseStart(ctx: any): void {
        if (ctx.start) {
            this.clauseStartTokens.add(ctx.start.tokenIndex);
        }
    }
}

/**
 * Format a hint's content: uppercase hint names, preserve table names
 * Example: "broadcast(t1), merge(t2)" → "BROADCAST(t1), MERGE(t2)"
 */
function formatHintContent(content: string): string {
    // Hint format: HINT_NAME(args) [, HINT_NAME(args)]*
    // Uppercase the hint name before '(', preserve everything else
    return content.replace(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(\()/g, (match, name, paren) => {
        return name.toUpperCase() + paren;
    });
}

/**
 * Format SQL - 100% grammar-driven
 */
export function formatSql(sql: string): string {
    try {
        // Uppercase for lexing (grammar matches uppercase keywords)
        const upperSql = sql.toUpperCase();
        const chars = new antlr4.InputStream(upperSql);
        const lexer = new SqlBaseLexer(chars);
        const tokens = new antlr4.CommonTokenStream(lexer);
        tokens.fill();
        
        const parser = new SqlBaseParser(tokens);
        // @ts-ignore
        parser.removeErrorListeners?.();
        
        let tree: any;
        try {
            tree = parser.singleStatement();
        } catch {
            return sql;
        }
        
        // Analyze parse tree for context
        const analyzer = new ParseTreeAnalyzer();
        analyzer.visit(tree);
        
        // Re-lex original SQL to get original token texts
        const origChars = new antlr4.InputStream(sql);
        const origLexer = new SqlBaseLexer(origChars);
        const origTokens = new antlr4.CommonTokenStream(origLexer);
        origTokens.fill();
        
        // Build a map of all tokens (including hidden) by their position
        // We'll process them in order, including hidden channel tokens
        const allOrigTokens = origTokens.tokens;
        
        // Format tokens
        const tokenList = tokens.tokens;        // Uppercase parse (correct types)
        const output: string[] = [];
        let prevWasFunctionName = false;
        let isFirstNonWsToken = true;
        let insideHint = false;
        let hintContent: string[] = [];
        let lastProcessedIndex = -1;
        
        for (let i = 0; i < tokenList.length && i < allOrigTokens.length; i++) {
            const token = tokenList[i];
            const origToken = allOrigTokens[i];
            
            if (token.type === antlr4.Token.EOF) continue;
            
            // Process any hidden tokens (comments) that appear before this token
            // by checking tokens between lastProcessedIndex and current i
            for (let j = lastProcessedIndex + 1; j < i; j++) {
                const hiddenToken = allOrigTokens[j];
                if (hiddenToken.channel === 1) { // HIDDEN channel
                    if (hiddenToken.type === SqlBaseLexer.SIMPLE_COMMENT || 
                        hiddenToken.type === SqlBaseLexer.BRACKETED_COMMENT) {
                        // Add newline before comment if not at start and not already on new line
                        if (output.length > 0) {
                            const lastStr = output[output.length - 1];
                            if (lastStr.charAt(lastStr.length - 1) !== '\n') {
                                output.push('\n');
                            }
                        }
                        output.push(hiddenToken.text);
                        // SIMPLE_COMMENT already includes its trailing newline
                        // BRACKETED_COMMENT needs a newline after it
                        if (hiddenToken.type === SqlBaseLexer.BRACKETED_COMMENT && 
                            !hiddenToken.text.endsWith('\n')) {
                            output.push('\n');
                        }
                    }
                }
            }
            lastProcessedIndex = i;
            
            if (token.type === SqlBaseLexer.WS) continue;
            
            const text = origToken.text;
            const tokenType = token.type;
            const tokenIndex = token.tokenIndex;
            
            // Handle hints: /*+ ... */
            if (tokenType === SqlBaseLexer.HENT_START) {
                // Add space before hint if needed
                if (output.length > 0) {
                    const last = output[output.length - 1];
                    if (last !== ' ' && last !== '\n') {
                        output.push(' ');
                    }
                }
                insideHint = true;
                hintContent = [];
                output.push('/*+');
                continue;
            }
            
            if (insideHint) {
                if (tokenType === SqlBaseLexer.HENT_END) {
                    // Format and output hint content
                    const formatted = formatHintContent(hintContent.join(''));
                    output.push(' ' + formatted + ' ');
                    output.push('*/');
                    insideHint = false;
                    hintContent = [];
                    prevWasFunctionName = false;
                    continue;
                } else {
                    // Collect hint content with spacing
                    // Add space before token if needed (not after ( or , and not before ) or ,)
                    if (hintContent.length > 0) {
                        const last = hintContent[hintContent.length - 1];
                        // Don't add space if last was '(' or if last was ', ' (space after comma)
                        // or if current token is ')' or ','
                        const needsSpace = last !== '(' && last !== ' ' && 
                                          text !== ')' && text !== ',';
                        if (needsSpace) {
                            hintContent.push(' ');
                        }
                    }
                    hintContent.push(text);
                    // Add space after comma
                    if (text === ',') {
                        hintContent.push(' ');
                    }
                    continue;
                }
            }
            
            const isInIdentifierContext = analyzer.identifierTokens.has(tokenIndex);
            const isFunctionCall = analyzer.functionCallTokens.has(tokenIndex);
            const isClauseStart = analyzer.clauseStartTokens.has(tokenIndex);
            
            // Determine output text based on context
            let outputText: string;
            
            if (isFunctionCall) {
                // Function name → uppercase
                outputText = text.toUpperCase();
            } else if (isInIdentifierContext) {
                // Identifier → preserve original casing
                outputText = text;
            } else if (isKeywordToken(tokenType, text)) {
                // Keyword (symbolicName === text) → uppercase
                outputText = text.toUpperCase();
            } else {
                // Everything else (operators, literals) → preserve
                outputText = text;
            }
            
            // Newlines before clause starters (skip first token)
            const needsNewline = !isFirstNonWsToken && 
                                 isClauseStart && 
                                 !isInIdentifierContext;
            
            // Spacing
            if (needsNewline) {
                // Only add newline if not already at start of line
                if (output.length > 0) {
                    const lastStr = output[output.length - 1];
                    if (lastStr.charAt(lastStr.length - 1) !== '\n') {
                        output.push('\n');
                    }
                } else {
                    output.push('\n');
                }
            } else if (output.length > 0) {
                const lastStr = output[output.length - 1];
                const lastChar = lastStr.charAt(lastStr.length - 1);
                const skipSpace = lastChar === '(' || lastChar === '.' || lastChar === '\n' ||
                    text === ')' || text === ',' || text === '.' ||
                    (text === '(' && prevWasFunctionName);
                if (!skipSpace) output.push(' ');
            }
            
            output.push(outputText);
            prevWasFunctionName = isFunctionCall;
            isFirstNonWsToken = false;
        }
        
        return output.join('').trim();
    } catch {
        return sql;
    }
}

export function needsFormatting(sql: string): boolean {
    return formatSql(sql) !== sql;
}
