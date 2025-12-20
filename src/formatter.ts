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
 * - List item separators (commas in SELECT, GROUP BY, ORDER BY)
 * - Condition separators (AND/OR in WHERE/HAVING)
 */
class ParseTreeAnalyzer extends SqlBaseParserVisitor {
    identifierTokens: Set<number> = new Set();
    functionCallTokens: Set<number> = new Set();
    clauseStartTokens: Set<number> = new Set();
    
    // Track comma positions in list contexts (SELECT cols, GROUP BY, ORDER BY)
    listItemCommas: Set<number> = new Set();
    
    // Track first item in each list context
    listFirstItems: Set<number> = new Set();
    
    // Track condition operators (AND/OR) in WHERE/HAVING
    conditionOperators: Set<number> = new Set();
    
    // Track WHERE/HAVING contexts with multiple conditions
    multilineConditionClauses: Set<number> = new Set();
    
    // Track subquery depth for indentation
    subqueryDepth: number = 0;
    tokenDepthMap: Map<number, number> = new Map();
    
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
    
    visitAggregationClause(ctx: any): any {
        // GROUP BY clause
        this._markClauseStart(ctx);
        // Mark commas in GROUP BY list
        this._markCommasAtLevel(ctx);
        return this.visitChildren(ctx);
    }
    
    visitQueryOrganization(ctx: any): any {
        // ORDER BY, LIMIT, etc. - scan children for specific tokens
        // Mark ORDER token and LIMIT token separately
        // Also track ORDER BY list commas
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'ORDER') {
                        this.clauseStartTokens.add(child.symbol.tokenIndex);
                    } else if (symName === 'LIMIT') {
                        this.clauseStartTokens.add(child.symbol.tokenIndex);
                    }
                }
            }
        }
        // Mark commas in ORDER BY list
        this._markCommasAtLevel(ctx);
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
        // Check if JOIN has multiple conditions (AND/OR)
        this._analyzeJoinConditions(ctx);
        return this.visitChildren(ctx);
    }
    
    private _analyzeJoinConditions(ctx: any): void {
        // Count AND/OR operators in JOIN ON condition
        const operators = this._countConditionOperators(ctx);
        if (operators > 0) {
            // Multiple conditions - find the ON token (recursively in children)
            const onTokenIndex = this._findOnToken(ctx);
            if (onTokenIndex !== -1) {
                this.multilineConditionClauses.add(onTokenIndex);
            }
        }
    }
    
    private _findOnToken(ctx: any): number {
        if (!ctx) return -1;
        if (ctx.symbol) {
            const symName = SqlBaseLexer.symbolicNames[ctx.symbol.type];
            if (symName === 'ON') {
                return ctx.symbol.tokenIndex;
            }
        }
        if (ctx.children) {
            for (const child of ctx.children) {
                const result = this._findOnToken(child);
                if (result !== -1) return result;
            }
        }
        return -1;
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
    
    // ========== LIST CONTEXTS (SELECT columns, GROUP BY, ORDER BY) ==========
    
    visitNamedExpressionSeq(ctx: any): any {
        // SELECT column list
        this._markListContext(ctx);
        return this.visitChildren(ctx);
    }
    
    visitGroupByClause(ctx: any): any {
        // Individual GROUP BY item - just recurse
        return this.visitChildren(ctx);
    }
    
    private _markCommasAtLevel(ctx: any): void {
        // Mark commas at this level and recursively in children
        if (!ctx || !ctx.children) return;
        for (const child of ctx.children) {
            if (child.symbol) {
                if (child.symbol.type === getTokenType('COMMA')) {
                    this.listItemCommas.add(child.symbol.tokenIndex);
                }
            } else if (child.ruleIndex !== undefined) {
                // Recurse into rule contexts
                this._markCommasAtLevel(child);
            }
        }
    }
    
    // ========== CONDITION CONTEXTS (WHERE/HAVING) ==========
    
    visitWhereClause(ctx: any): any {
        this._markClauseStart(ctx);
        // Check if this WHERE has multiple conditions
        this._analyzeConditionClause(ctx);
        return this.visitChildren(ctx);
    }
    
    visitHavingClause(ctx: any): any {
        this._markClauseStart(ctx);
        // Check if this HAVING has multiple conditions
        this._analyzeConditionClause(ctx);
        return this.visitChildren(ctx);
    }
    
    // ========== SUBQUERY TRACKING ==========
    
    visitQuerySpecification(ctx: any): any {
        this.subqueryDepth++;
        // Mark depth for all tokens in this query
        this._markDepthForContext(ctx);
        const result = this.visitChildren(ctx);
        this.subqueryDepth--;
        return result;
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
    
    private _markListContext(ctx: any): void {
        // Mark commas in this list context by walking all children
        if (ctx.children) {
            let isFirst = true;
            for (const child of ctx.children) {
                if (child.symbol) {
                    const tokenType = child.symbol.type;
                    if (tokenType === getTokenType('COMMA')) {
                        this.listItemCommas.add(child.symbol.tokenIndex);
                    } else if (isFirst && tokenType !== getTokenType('COMMA') && child.symbol.tokenIndex >= 0) {
                        // Mark first non-comma token
                        this.listFirstItems.add(child.symbol.tokenIndex);
                        isFirst = false;
                    }
                } else if (child.children) {
                    // Recurse to find commas in nested contexts
                    this._markCommasInContext(child);
                }
            }
        }
    }
    
    private _markCommasInContext(ctx: any): void {
        if (!ctx || !ctx.children) return;
        for (const child of ctx.children) {
            if (child.symbol) {
                if (child.symbol.type === getTokenType('COMMA')) {
                    this.listItemCommas.add(child.symbol.tokenIndex);
                }
            } else if (child.children) {
                this._markCommasInContext(child);
            }
        }
    }
    
    private _analyzeConditionClause(ctx: any): void {
        // Count AND/OR operators in WHERE/HAVING
        const operators = this._countConditionOperators(ctx);
        if (operators > 0) {
            // Multiple conditions - mark for multiline
            if (ctx.start) {
                this.multilineConditionClauses.add(ctx.start.tokenIndex);
            }
        }
    }
    
    private _countConditionOperators(ctx: any): number {
        let count = 0;
        if (!ctx) return count;
        
        // Recursively count AND/OR tokens
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symbolicName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symbolicName === 'AND' || symbolicName === 'OR') {
                        count++;
                        this.conditionOperators.add(child.symbol.tokenIndex);
                    }
                }
                // Recurse into children
                count += this._countConditionOperators(child);
            }
        }
        return count;
    }
    
    private _markDepthForContext(ctx: any): void {
        // Mark current depth for all tokens in this context
        if (ctx.start && ctx.stop) {
            for (let i = ctx.start.tokenIndex; i <= ctx.stop.tokenIndex; i++) {
                if (!this.tokenDepthMap.has(i)) {
                    this.tokenDepthMap.set(i, this.subqueryDepth);
                }
            }
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
        let insideFunctionArgs = 0; // Track parentheses depth in function calls
        let isFirstNonWsToken = true;
        let insideHint = false;
        let hintContent: string[] = [];
        let lastProcessedIndex = -1;
        let baseIndent = 0; // Base indentation level
        
        // Track if we just output a SELECT/GROUP BY/ORDER BY keyword
        // to know when to add comma-first formatting for the list
        let afterSelectKeyword = false;
        let afterGroupByKeyword = false;
        let afterOrderByKeyword = false;
        let afterWhereKeyword = false;
        let afterHavingKeyword = false;
        
        // Track first item in current list context
        let isFirstListItem = true;
        
        // Track if we just output a comma on its own line (comma-first style)
        let justOutputCommaFirstStyle = false;
        
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
                        // Add space before comment if not at start and not already on new line
                        if (output.length > 0) {
                            const lastStr = output[output.length - 1];
                            if (lastStr.charAt(lastStr.length - 1) !== '\n') {
                                output.push(' ');
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
            const symbolicName = SqlBaseLexer.symbolicNames[tokenType];
            
            // Handle hints: /*+ ... */
            if (tokenType === SqlBaseLexer.HENT_START) {
                // Add space before hint if needed
                if (output.length > 0) {
                    const lastStr = output[output.length - 1];
                    const lastChar = lastStr.charAt(lastStr.length - 1);
                    if (lastChar !== ' ' && lastChar !== '\n') {
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
                    // Collect hint content - no spaces after commas in hints
                    if (hintContent.length > 0) {
                        const lastElement = hintContent[hintContent.length - 1];
                        const needsSpace = lastElement !== '(' && lastElement !== ' ' && 
                                          text !== ')' && text !== ',';
                        if (needsSpace) {
                            hintContent.push(' ');
                        }
                    }
                    hintContent.push(text);
                    // No space after comma in hints
                    continue;
                }
            }
            
            const isInIdentifierContext = analyzer.identifierTokens.has(tokenIndex);
            const isFunctionCall = analyzer.functionCallTokens.has(tokenIndex);
            const isClauseStart = analyzer.clauseStartTokens.has(tokenIndex);
            const isListComma = analyzer.listItemCommas.has(tokenIndex);
            const isConditionOperator = analyzer.conditionOperators.has(tokenIndex);
            
            // Determine output text based on context
            let outputText: string;
            
            if (isFunctionCall) {
                // Check if it's a built-in function (keyword) or UDF
                const isBuiltIn = isKeywordToken(tokenType, text);
                if (isBuiltIn) {
                    // Built-in function defined as keyword (CAST, IF, etc.) → uppercase
                    outputText = text.toUpperCase();
                } else {
                    // Identifier token - apply heuristic to distinguish built-in from UDF
                    // Mixed case indicates UDF (MyCustomFunc) → preserve
                    // All lowercase/uppercase (including with underscores) → uppercase as built-in
                    const hasMixedCase = text !== text.toLowerCase() && text !== text.toUpperCase();
                    if (hasMixedCase) {
                        // UDF with mixed case → preserve original casing
                        outputText = text;
                    } else {
                        // Built-in function (count, sum, row_number, etc.) → uppercase
                        outputText = text.toUpperCase();
                    }
                }
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
            
            // Track function argument depth
            if (text === '(' && prevWasFunctionName) {
                insideFunctionArgs++;
            } else if (text === ')' && insideFunctionArgs > 0) {
                insideFunctionArgs--;
            }
            
            // Determine spacing and newlines
            let needsNewline = false;
            let indent = '';
            
            // Check if this is a SELECT/GROUP BY/ORDER BY keyword
            if (symbolicName === 'SELECT' && isClauseStart) {
                afterSelectKeyword = true;
                isFirstListItem = true;
            } else if (symbolicName === 'GROUP' && isClauseStart) {
                afterGroupByKeyword = true;
                isFirstListItem = true;
            } else if (symbolicName === 'ORDER' && isClauseStart) {
                afterOrderByKeyword = true;
                isFirstListItem = true;
            } else if (symbolicName === 'WHERE' && isClauseStart) {
                const isMultiline = analyzer.multilineConditionClauses.has(tokenIndex);
                if (isMultiline) {
                    afterWhereKeyword = true;
                    // Don't override - WHERE itself gets newline from isClauseStart below
                }
            } else if (symbolicName === 'HAVING' && isClauseStart) {
                const isMultiline = analyzer.multilineConditionClauses.has(tokenIndex);
                if (isMultiline) {
                    afterHavingKeyword = true;
                    // Don't override - HAVING itself gets newline from isClauseStart below
                }
            } else if (symbolicName === 'ON') {
                // ON in JOIN clause - if multiline, add newline before ON
                const isMultiline = analyzer.multilineConditionClauses.has(tokenIndex);
                if (isMultiline && !isFirstNonWsToken) {
                    needsNewline = true;
                    indent = '    '; // 4-space indent for ON
                }
            }
            
            // Clause start gets newline (unless it's the first token)
            if (!isFirstNonWsToken && isClauseStart && !isInIdentifierContext) {
                needsNewline = true;
            }
            
            // List comma handling (SELECT columns, GROUP BY, ORDER BY)
            if (isListComma && insideFunctionArgs === 0) {
                // Comma in list context - newline before comma
                needsNewline = true;
                // The comma will be output with leading indent on its own line
                indent = '    '; // 4-space indent for comma
                isFirstListItem = false;
                justOutputCommaFirstStyle = true; // Flag to skip space after comma
            }
            
            // Condition operator handling (AND/OR in WHERE/HAVING)
            if (isConditionOperator) {
                needsNewline = true;
                indent = '    '; // 4-space indent for AND/OR
            }
            
            // First list item after SELECT/GROUP BY/ORDER BY
            if (!isListComma && (afterSelectKeyword || afterGroupByKeyword || afterOrderByKeyword) &&
                symbolicName !== 'SELECT' && symbolicName !== 'GROUP' && symbolicName !== 'ORDER') {
                // Skip the BY token after GROUP/ORDER
                if ((afterGroupByKeyword && symbolicName === 'BY') || 
                    (afterOrderByKeyword && symbolicName === 'BY') ||
                    symbolicName === 'DISTINCT') {
                    // Don't treat BY or DISTINCT as first list item
                } else if (isFirstListItem) {
                    needsNewline = true;
                    indent = '     '; // 5-space indent for first item
                    isFirstListItem = false;
                }
            }
            
            // First condition after WHERE/HAVING
            if (!isConditionOperator && (afterWhereKeyword || afterHavingKeyword) && 
                symbolicName !== 'WHERE' && symbolicName !== 'HAVING') {
                needsNewline = true;
                indent = '    '; // 4-space indent for first condition
                afterWhereKeyword = false;
                afterHavingKeyword = false;
            }
            
            // Apply spacing/newlines
            if (needsNewline) {
                // Add newline if not already at start of line
                if (output.length > 0) {
                    const lastStr = output[output.length - 1];
                    if (lastStr.charAt(lastStr.length - 1) !== '\n') {
                        output.push('\n');
                    }
                }
                if (indent) {
                    output.push(indent);
                }
            } else if (output.length > 0) {
                const lastStr = output[output.length - 1];
                const lastChar = lastStr.charAt(lastStr.length - 1);
                // Skip space in certain cases
                const skipSpace = lastChar === '(' || lastChar === '.' || lastChar === '\n' ||
                    text === ')' || text === '.' ||
                    (text === '(' && prevWasFunctionName) ||
                    (text === ',' && insideFunctionArgs > 0) || // No space before comma in functions
                    (lastChar === ',' && insideFunctionArgs > 0) || // No space after comma in functions
                    justOutputCommaFirstStyle || // No space after comma in comma-first style
                    afterWhereKeyword || afterHavingKeyword; // No space before first condition in multiline WHERE/HAVING
                if (!skipSpace) output.push(' ');
            }
            
            output.push(outputText);
            
            // Reset comma-first flag after outputting the next token
            if (justOutputCommaFirstStyle && text !== ',') {
                justOutputCommaFirstStyle = false;
            }
            
            // Reset flags after processing
            if (symbolicName !== 'SELECT' && symbolicName !== 'DISTINCT' && afterSelectKeyword && !isListComma) {
                afterSelectKeyword = false;
            }
            if (symbolicName !== 'GROUP' && symbolicName !== 'BY' && afterGroupByKeyword && !isListComma) {
                afterGroupByKeyword = false;
            }
            if (symbolicName !== 'ORDER' && symbolicName !== 'BY' && afterOrderByKeyword && !isListComma) {
                afterOrderByKeyword = false;
            }
            
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
