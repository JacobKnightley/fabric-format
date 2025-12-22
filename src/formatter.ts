/**
 * Spark SQL Formatter - Main Entry Point
 * 
 * This is the 100% grammar-driven SQL formatter for Apache Spark SQL.
 * NO HARDCODED KEYWORD, FUNCTION, OR CLAUSE LISTS.
 * Everything derived from ANTLR lexer symbolicNames and parse tree context.
 * 
 * Architecture:
 * - types.ts: TypeScript interfaces
 * - token-utils.ts: Grammar-derived token detection
 * - parse-tree-analyzer.ts: AST visitor that collects formatting context
 * - formatting-context.ts: State management during formatting
 * - output-builder.ts: Output construction with column tracking
 * - formatter.ts (this file): Main orchestration
 */

import antlr4 from 'antlr4';

// Internal modules
import { 
    SqlBaseLexer, 
    getTokenType, 
    getSymbolicName, 
    isKeywordToken, 
    isFunctionLikeKeyword 
} from './token-utils.js';
// @ts-ignore - Generated ANTLR code
import SqlBaseParser from './generated/SqlBaseParser.js';
import { ParseTreeAnalyzer } from './parse-tree-analyzer.js';
import { 
    createInitialState, 
    ExpandedFunctionStack, 
    CommentManager, 
    indentCalc,
    isUnaryOperator,
    shouldExpandFunction,
    shouldExpandWindow
} from './formatting-context.js';
import { 
    OutputBuilder, 
    outputComments, 
    shouldSkipSpace, 
    shouldAddCommaSpace,
    formatHintContent 
} from './output-builder.js';
import { SPARK_BUILTIN_FUNCTIONS } from './generated/builtinFunctions.js';
import { MAX_LINE_WIDTH } from './constants.js';
import type { AnalyzerResult, ExpandedFunction, ExpandedWindow, PendingComment } from './types.js';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Format SQL - Main entry point.
 * Handles magic commands, semicolon-separated statements, and formatting.
 */
export function formatSql(sql: string): string {
    try {
        // Handle magic commands (%%sql, %sql)
        let magicCommand = '';
        let sqlToFormat = sql;
        
        const magicMatch = sql.match(/^(%%sql|%sql)\s*\n?/);
        if (magicMatch) {
            magicCommand = magicMatch[1];
            sqlToFormat = sql.substring(magicMatch[0].length);
        }
        
        // Split on semicolons and format each statement
        const statements = splitOnSemicolons(sqlToFormat);
        const formattedStatements: string[] = [];
        
        for (const stmt of statements) {
            if (stmt.trim().length === 0) continue;
            const formatted = formatSingleStatement(stmt.trim());
            formattedStatements.push(formatted);
        }
        
        let result = formattedStatements.join(';\n\n');
        
        // Preserve trailing semicolon if original had one
        if (sqlToFormat.trimEnd().endsWith(';')) {
            result += ';';
        }
        
        // Restore magic command
        if (magicCommand) {
            result = magicCommand + '\n' + result;
        }
        
        return result;
    } catch {
        return sql;
    }
}

/**
 * Check if SQL needs formatting.
 */
export function needsFormatting(sql: string): boolean {
    return formatSql(sql) !== sql;
}

// ============================================================================
// STATEMENT SPLITTING
// ============================================================================

/**
 * Split SQL on semicolons, but not semicolons inside string literals.
 */
function splitOnSemicolons(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escaped = false;
    
    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        
        if (escaped) {
            current += ch;
            escaped = false;
            continue;
        }
        
        if (ch === '\\') {
            current += ch;
            escaped = true;
            continue;
        }
        
        if (ch === "'" && !inDoubleQuote) {
            inSingleQuote = !inSingleQuote;
            current += ch;
        } else if (ch === '"' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
            current += ch;
        } else if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
            if (current.trim().length > 0) {
                statements.push(current);
            }
            current = '';
        } else {
            current += ch;
        }
    }
    
    if (current.trim().length > 0) {
        statements.push(current);
    }
    
    return statements;
}

// ============================================================================
// SINGLE STATEMENT FORMATTING
// ============================================================================

/**
 * Format a single SQL statement.
 */
function formatSingleStatement(sql: string): string {
    try {
        // Parse with uppercased SQL (grammar matches uppercase keywords)
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
        
        // Analyze parse tree
        const analyzer = new ParseTreeAnalyzer();
        analyzer.visit(tree);
        const analysis = analyzer.getResult();
        
        // Re-lex original SQL to get original token texts
        const origChars = new antlr4.InputStream(sql);
        const origLexer = new SqlBaseLexer(origChars);
        const origTokens = new antlr4.CommonTokenStream(origLexer);
        origTokens.fill();
        
        // Format tokens
        return formatTokens(tokens.tokens, origTokens.tokens, analysis);
    } catch (e: any) {
        console.error('Formatter error:', e.message, e.stack);
        return sql;
    }
}

/**
 * Format tokens using the analysis result.
 */
function formatTokens(
    tokenList: any[], 
    allOrigTokens: any[], 
    analysis: AnalyzerResult
): string {
    const builder = new OutputBuilder();
    const state = createInitialState();
    const expandedFuncs = new ExpandedFunctionStack();
    const comments = new CommentManager();
    
    let currentExpandedWindow: ExpandedWindow | null = null;
    let lastProcessedIndex = -1;
    
    // Helper to find next non-WS token
    const findNextNonWsTokenIndex = (startIdx: number): number => {
        for (let j = startIdx; j < tokenList.length; j++) {
            const tok = tokenList[j];
            if (tok.type !== SqlBaseLexer.WS && 
                tok.type !== antlr4.Token.EOF &&
                tok.type !== SqlBaseLexer.SIMPLE_COMMENT &&
                tok.type !== SqlBaseLexer.BRACKETED_COMMENT) {
                return j;
            }
        }
        return -1;
    };
    
    // Helper to collect comments from range
    const collectComments = (startIdx: number, endIdx: number): void => {
        for (let j = startIdx; j < endIdx; j++) {
            const hiddenToken = allOrigTokens[j];
            if (hiddenToken && hiddenToken.channel === 1) {
                if (hiddenToken.type === SqlBaseLexer.SIMPLE_COMMENT || 
                    hiddenToken.type === SqlBaseLexer.BRACKETED_COMMENT) {
                    const wasOnOwnLine = CommentManager.checkWasOnOwnLine(j, hiddenToken, allOrigTokens);
                    comments.add({ text: hiddenToken.text, type: hiddenToken.type, wasOnOwnLine });
                }
            }
        }
    };
    
    for (let i = 0; i < tokenList.length && i < allOrigTokens.length; i++) {
        const token = tokenList[i];
        const origToken = allOrigTokens[i];
        
        if (token.type === antlr4.Token.EOF) continue;
        
        // Collect hidden tokens (comments)
        const wasAlreadyProcessed = lastProcessedIndex >= i;
        if (!wasAlreadyProcessed) {
            collectComments(lastProcessedIndex + 1, i);
        }
        lastProcessedIndex = Math.max(lastProcessedIndex, i);
        
        // Skip WS tokens
        if (token.type === SqlBaseLexer.WS) continue;
        
        // Handle comment tokens directly
        if (token.type === SqlBaseLexer.SIMPLE_COMMENT || 
            token.type === SqlBaseLexer.BRACKETED_COMMENT) {
            if (!wasAlreadyProcessed) {
                const wasOnOwnLine = CommentManager.checkWasOnOwnLine(i, origToken, allOrigTokens);
                comments.add({ text: origToken.text, type: token.type, wasOnOwnLine });
            }
            continue;
        }
        
        const text = origToken.text;
        const tokenType = token.type;
        const tokenIndex = token.tokenIndex;
        const symbolicName = getSymbolicName(tokenType);
        
        // Handle hints
        if (tokenType === SqlBaseLexer.HENT_START) {
            builder.addSpaceIfNeeded();
            state.insideHint = true;
            state.hintContent = [];
            builder.push('/*+');
            continue;
        }
        
        if (state.insideHint) {
            if (tokenType === SqlBaseLexer.HENT_END) {
                const formatted = formatHintContent(state.hintContent.join(''));
                builder.push(' ' + formatted + ' ');
                builder.push('*/');
                state.insideHint = false;
                state.hintContent = [];
                state.prevWasFunctionName = false;
                continue;
            } else {
                if (state.hintContent.length > 0) {
                    const lastElement = state.hintContent[state.hintContent.length - 1];
                    const needsSpace = lastElement !== '(' && lastElement !== ' ' && 
                                      text !== ')' && text !== ',';
                    if (needsSpace) state.hintContent.push(' ');
                }
                state.hintContent.push(text);
                continue;
            }
        }
        
        // Get context from analysis
        const ctx = getTokenContext(tokenIndex, analysis);
        
        // Get multi-arg function info
        const multiArgFuncInfo = analysis.multiArgFunctionInfo.get(tokenIndex);
        const windowDefInfo = analysis.windowDefInfo.get(tokenIndex);
        
        // Check expanded function state
        const currentFunc = expandedFuncs.current();
        const isExpandedFunctionComma = expandedFuncs.isComma(tokenIndex);
        const isExpandedFunctionCloseParen = expandedFuncs.isCloseParen(tokenIndex);
        
        // Check expanded window state
        const isExpandedWindowOrderBy = currentExpandedWindow?.orderByTokenIndex === tokenIndex;
        const isExpandedWindowFrame = currentExpandedWindow?.windowFrameTokenIndex === tokenIndex;
        const isExpandedWindowCloseParen = currentExpandedWindow?.closeParenIndex === tokenIndex;
        
        // Detect unary operator
        const currentTokenIsUnaryOperator = isUnaryOperator(text, state.prevTokenText, state.prevTokenType);
        
        // Determine output text
        const outputText = determineOutputText(
            tokenIndex, tokenType, text, symbolicName, ctx, analysis
        );
        
        // Check for function-like keyword
        const isBuiltInFunctionKeyword = isFunctionLikeKeyword(tokenType, text);
        
        // Track function argument depth
        if (text === '(' && (state.prevWasFunctionName || state.prevWasBuiltInFunctionKeyword)) {
            state.insideFunctionArgs++;
        } else if (text === ')' && state.insideFunctionArgs > 0) {
            state.insideFunctionArgs--;
        }
        
        // Track paren depth
        if (text === '(') state.insideParens++;
        else if (text === ')' && state.insideParens > 0) state.insideParens--;
        
        // Handle AS keyword insertion
        if (analysis.aliasInsertPositions.has(tokenIndex)) {
            builder.addSpaceIfNeeded();
            builder.push('AS');
        }
        
        // Determine newlines and indent
        const { needsNewline, indent } = determineNewlineAndIndent(
            tokenIndex, text, symbolicName, ctx, analysis, state,
            expandedFuncs, currentExpandedWindow,
            isExpandedFunctionComma, isExpandedFunctionCloseParen,
            isExpandedWindowOrderBy, isExpandedWindowFrame, isExpandedWindowCloseParen
        );
        
        // Handle list commas - look ahead for comments
        if (ctx.isListComma && state.insideFunctionArgs === 0) {
            const nextIdx = findNextNonWsTokenIndex(i + 1);
            if (nextIdx > 0) {
                collectComments(i + 1, nextIdx);
                lastProcessedIndex = nextIdx - 1;
            }
        }
        
        // Similar look-ahead for other comma types
        if (ctx.isCteComma || ctx.isDdlComma || ctx.isValuesComma || ctx.isSetComma || isExpandedFunctionComma) {
            const nextIdx = findNextNonWsTokenIndex(i + 1);
            if (nextIdx > 0) {
                collectComments(i + 1, nextIdx);
                lastProcessedIndex = nextIdx - 1;
            }
        }
        
        // Apply spacing/newlines
        if (needsNewline) {
            outputWithNewline(builder, comments, indent, state);
        } else {
            outputWithoutNewline(builder, comments, text, state, currentTokenIsUnaryOperator, ctx.isLateralViewComma);
        }
        
        builder.push(outputText);
        
        // Handle multi-WHEN CASE newline after CASE
        if (analysis.multiWhenCaseTokens.has(tokenIndex)) {
            builder.push('\n');
            state.caseDepth++;
        }
        
        // Track subquery depth changes
        if (ctx.isSubqueryOpenParen) state.subqueryDepth++;
        else if (ctx.isSubqueryCloseParen && state.subqueryDepth > 0) state.subqueryDepth--;
        
        // Track DDL depth
        if (ctx.isDdlOpenParen && ctx.isDdlMultiColumn) {
            builder.push('\n' + '    '.repeat(state.subqueryDepth + 1));
            state.ddlDepth++;
        } else if (ctx.isDdlCloseParen && state.ddlDepth > 0) {
            state.ddlDepth--;
        }
        
        // Handle multi-arg function expansion
        if (multiArgFuncInfo && shouldExpandFunction(builder.getColumn(), multiArgFuncInfo)) {
            handleFunctionExpansion(builder, expandedFuncs, multiArgFuncInfo, tokenList, i, findNextNonWsTokenIndex, analysis, state);
        }
        
        // Handle window expansion
        if (windowDefInfo && shouldExpandWindow(builder.getColumn(), windowDefInfo)) {
            currentExpandedWindow = {
                closeParenIndex: windowDefInfo.closeParenIndex,
                orderByTokenIndex: windowDefInfo.orderByTokenIndex,
                windowFrameTokenIndex: windowDefInfo.windowFrameTokenIndex,
                baseDepth: state.subqueryDepth
            };
            const newIndent = '\n' + ' '.repeat(indentCalc.getWindowContentIndent(state.subqueryDepth));
            builder.push(newIndent);
            state.justOutputWindowNewline = true;
        }
        
        // Pop expanded function on close paren
        if (isExpandedFunctionCloseParen && !expandedFuncs.isEmpty()) {
            expandedFuncs.pop();
        }
        
        // Clear expanded window on close paren
        if (isExpandedWindowCloseParen && currentExpandedWindow) {
            currentExpandedWindow = null;
        }
        
        // Reset flags
        if (state.justOutputMultiArgFunctionNewline && text !== ',' && text !== '(') {
            state.justOutputMultiArgFunctionNewline = false;
        }
        if (state.justOutputWindowNewline && text !== '(' && text !== ',') {
            state.justOutputWindowNewline = false;
        }
        if (state.justOutputCommaFirstStyle && text !== ',') {
            state.justOutputCommaFirstStyle = false;
        }
        
        // Decrease CASE depth after END
        if (analysis.caseEndTokens.has(tokenIndex) && state.caseDepth > 0) {
            state.caseDepth--;
        }
        
        // Reset clause flags
        updateClauseFlags(symbolicName, ctx, state);
        
        // Update previous token tracking
        state.prevWasFunctionName = ctx.isFunctionCall;
        state.prevWasBuiltInFunctionKeyword = isBuiltInFunctionKeyword;
        state.isFirstNonWsToken = false;
        state.prevTokenWasUnaryOperator = currentTokenIsUnaryOperator;
        state.prevTokenText = text;
        state.prevTokenType = tokenType;
    }
    
    // Output remaining comments
    if (comments.hasPending()) {
        outputComments(builder, comments.getPending());
    }
    
    return builder.toString();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract token context from analysis result.
 */
function getTokenContext(tokenIndex: number, analysis: AnalyzerResult) {
    return {
        isInIdentifierContext: analysis.identifierTokens.has(tokenIndex),
        isFunctionCall: analysis.functionCallTokens.has(tokenIndex),
        isClauseStart: analysis.clauseStartTokens.has(tokenIndex),
        isListComma: analysis.listItemCommas.has(tokenIndex),
        isConditionOperator: analysis.conditionOperators.has(tokenIndex),
        isBetweenAnd: analysis.betweenAndTokens.has(tokenIndex),
        isJoinOn: analysis.joinOnTokens.has(tokenIndex),
        isSubqueryOpenParen: analysis.subqueryOpenParens.has(tokenIndex),
        isSubqueryCloseParen: analysis.subqueryCloseParens.has(tokenIndex),
        isSetOperandParen: analysis.setOperandParens.has(tokenIndex),
        isCteComma: analysis.cteCommas.has(tokenIndex),
        isDdlComma: analysis.ddlColumnCommas.has(tokenIndex),
        isDdlOpenParen: analysis.ddlOpenParens.has(tokenIndex),
        isDdlCloseParen: analysis.ddlCloseParens.has(tokenIndex),
        isDdlMultiColumn: analysis.ddlMultiColumn.has(tokenIndex),
        isValuesComma: analysis.valuesCommas.has(tokenIndex),
        isSetComma: analysis.setClauseCommas.has(tokenIndex),
        isSetKeyword: tokenIndex === analysis.setKeywordToken,
        isLateralViewComma: analysis.lateralViewCommas.has(tokenIndex),
        isMergeUsing: analysis.mergeUsingTokens.has(tokenIndex),
        isMergeOn: analysis.mergeOnTokens.has(tokenIndex),
        isMergeWhen: analysis.mergeWhenTokens.has(tokenIndex),
    };
}

/**
 * Determine the output text for a token (casing rules).
 */
function determineOutputText(
    tokenIndex: number,
    tokenType: number,
    text: string,
    symbolicName: string | null,
    ctx: ReturnType<typeof getTokenContext>,
    analysis: AnalyzerResult
): string {
    // SET config tokens - preserve casing
    if (analysis.setConfigTokens.has(tokenIndex)) {
        return text;
    }
    
    // GROUP BY ALL - uppercase
    if (analysis.groupByAllTokens.has(tokenIndex)) {
        return text.toUpperCase();
    }
    
    // Function call context
    if (ctx.isFunctionCall) {
        const funcLower = text.toLowerCase();
        const isBuiltIn = SPARK_BUILTIN_FUNCTIONS.has(funcLower) || isKeywordToken(tokenType, text);
        return isBuiltIn ? text.toUpperCase() : text;
    }
    
    // Identifier context - preserve
    if (ctx.isInIdentifierContext) {
        return text;
    }
    
    // Keyword - uppercase
    if (isKeywordToken(tokenType, text)) {
        return text.toUpperCase();
    }
    
    // Default - preserve
    return text;
}

/**
 * Determine if a newline and indent are needed before this token.
 */
function determineNewlineAndIndent(
    tokenIndex: number,
    text: string,
    symbolicName: string | null,
    ctx: ReturnType<typeof getTokenContext>,
    analysis: AnalyzerResult,
    state: ReturnType<typeof createInitialState>,
    expandedFuncs: ExpandedFunctionStack,
    currentExpandedWindow: ExpandedWindow | null,
    isExpandedFunctionComma: boolean,
    isExpandedFunctionCloseParen: boolean,
    isExpandedWindowOrderBy: boolean,
    isExpandedWindowFrame: boolean,
    isExpandedWindowCloseParen: boolean
): { needsNewline: boolean; indent: string } {
    let needsNewline = false;
    let indent = '';
    
    const baseIndent = indentCalc.getBaseIndent(state.subqueryDepth, state.ddlDepth);
    
    // Clause state updates
    if (symbolicName === 'SELECT' && ctx.isClauseStart) {
        state.afterSelectKeyword = true;
        state.isFirstListItem = true;
        state.currentClauseIsMultiItem = analysis.multiItemClauses.has(tokenIndex);
    } else if (symbolicName === 'GROUP' && ctx.isClauseStart) {
        state.afterGroupByKeyword = true;
        state.isFirstListItem = true;
        state.currentClauseIsMultiItem = analysis.multiItemClauses.has(tokenIndex);
    } else if (symbolicName === 'ORDER' && ctx.isClauseStart) {
        state.afterOrderByKeyword = true;
        state.isFirstListItem = true;
        state.currentClauseIsMultiItem = analysis.multiItemClauses.has(tokenIndex);
    } else if (symbolicName === 'WHERE' && ctx.isClauseStart) {
        if (analysis.multilineConditionClauses.has(tokenIndex)) {
            state.afterWhereKeyword = true;
        }
    } else if (symbolicName === 'HAVING' && ctx.isClauseStart) {
        if (analysis.multilineConditionClauses.has(tokenIndex)) {
            state.afterHavingKeyword = true;
        }
    } else if (symbolicName === 'ON' && ctx.isJoinOn && !state.isFirstNonWsToken) {
        needsNewline = true;
        indent = indentCalc.getOnClauseIndent(state.subqueryDepth, state.ddlDepth);
    } else if (symbolicName === 'SET' && ctx.isSetKeyword) {
        state.afterSetKeyword = true;
        state.isFirstListItem = true;
        state.currentClauseIsMultiItem = analysis.multiItemClauses.has(tokenIndex);
    } else if (symbolicName === 'VALUES') {
        state.afterValuesKeyword = true;
        state.isFirstListItem = true;
    }
    
    // CASE expression handling
    if (analysis.caseWhenTokens.has(tokenIndex)) {
        needsNewline = true;
        indent = indentCalc.getCaseWhenIndent(state.subqueryDepth, state.ddlDepth);
    } else if (analysis.caseElseTokens.has(tokenIndex)) {
        needsNewline = true;
        indent = indentCalc.getCaseWhenIndent(state.subqueryDepth, state.ddlDepth);
    } else if (analysis.caseEndTokens.has(tokenIndex)) {
        needsNewline = true;
        indent = indentCalc.getCaseEndIndent(state.subqueryDepth, state.ddlDepth);
    }
    
    // MERGE clause handling
    if ((ctx.isMergeUsing || ctx.isMergeOn || ctx.isMergeWhen) && !state.isFirstNonWsToken) {
        needsNewline = true;
        indent = baseIndent;
    }
    
    // Clause start newline
    if (!state.isFirstNonWsToken && ctx.isClauseStart && !ctx.isInIdentifierContext) {
        needsNewline = true;
        indent = baseIndent;
    }
    
    // Set operation operand parens
    if (ctx.isSetOperandParen && !state.isFirstNonWsToken) {
        needsNewline = true;
        indent = baseIndent;
    }
    
    // Subquery close paren
    if (ctx.isSubqueryCloseParen) {
        needsNewline = true;
        indent = indentCalc.getBaseIndent(state.subqueryDepth - 1);
    }
    
    // DDL close paren
    if (ctx.isDdlCloseParen && state.ddlDepth > 0) {
        needsNewline = true;
        indent = '    '.repeat(state.subqueryDepth + state.ddlDepth - 1);
    }
    
    // Expanded function close paren
    if (isExpandedFunctionCloseParen && expandedFuncs.current()) {
        needsNewline = true;
        indent = ' '.repeat(indentCalc.getExpandedFunctionCloseIndent(expandedFuncs.current()!.depth));
    }
    
    // Expanded window handling
    if (isExpandedWindowOrderBy && currentExpandedWindow) {
        needsNewline = true;
        indent = ' '.repeat(indentCalc.getWindowContentIndent(currentExpandedWindow.baseDepth));
    }
    if (isExpandedWindowFrame && currentExpandedWindow) {
        needsNewline = true;
        indent = ' '.repeat(indentCalc.getWindowContentIndent(currentExpandedWindow.baseDepth));
    }
    if (isExpandedWindowCloseParen && currentExpandedWindow) {
        needsNewline = true;
        indent = ' '.repeat(indentCalc.getWindowCloseIndent(currentExpandedWindow.baseDepth));
    }
    
    // List comma handling
    if (ctx.isListComma && state.insideFunctionArgs === 0) {
        needsNewline = true;
        indent = indentCalc.getCommaIndent(state.subqueryDepth, state.ddlDepth);
        state.isFirstListItem = false;
        state.justOutputCommaFirstStyle = true;
    }
    
    // CTE comma
    if (ctx.isCteComma) {
        needsNewline = true;
        indent = '';
        state.justOutputCommaFirstStyle = true;
    }
    
    // DDL comma
    if (ctx.isDdlComma) {
        needsNewline = true;
        indent = indentCalc.getCommaIndent(state.subqueryDepth);
        state.justOutputCommaFirstStyle = true;
    }
    
    // VALUES comma
    if (ctx.isValuesComma) {
        needsNewline = true;
        indent = baseIndent;
        state.justOutputCommaFirstStyle = true;
    }
    
    // SET comma
    if (ctx.isSetComma) {
        needsNewline = true;
        indent = indentCalc.getCommaIndent(state.subqueryDepth, state.ddlDepth);
        state.justOutputCommaFirstStyle = true;
    }
    
    // Expanded function comma
    if (isExpandedFunctionComma && expandedFuncs.current()) {
        needsNewline = true;
        indent = ' '.repeat(indentCalc.getExpandedFunctionContentIndent(expandedFuncs.current()!.depth));
        state.justOutputCommaFirstStyle = true;
    }
    
    // Condition operator (AND/OR) - but not BETWEEN's AND
    if (ctx.isConditionOperator && !ctx.isBetweenAnd) {
        needsNewline = true;
        indent = indentCalc.getCommaIndent(state.subqueryDepth, state.ddlDepth);
    }
    
    // First list item after SELECT/GROUP BY/ORDER BY
    if (!ctx.isListComma && (state.afterSelectKeyword || state.afterGroupByKeyword || state.afterOrderByKeyword)) {
        if (symbolicName !== 'SELECT' && symbolicName !== 'GROUP' && symbolicName !== 'ORDER') {
            if ((state.afterGroupByKeyword && symbolicName === 'BY') || 
                (state.afterOrderByKeyword && symbolicName === 'BY') ||
                symbolicName === 'DISTINCT') {
                // Skip BY or DISTINCT
            } else if (state.isFirstListItem && state.currentClauseIsMultiItem) {
                needsNewline = true;
                indent = indentCalc.getFirstItemIndent(state.subqueryDepth, state.ddlDepth);
                state.isFirstListItem = false;
            } else if (state.isFirstListItem) {
                state.isFirstListItem = false;
            }
        }
    }
    
    // First assignment after SET
    if (!ctx.isSetComma && state.afterSetKeyword && symbolicName !== 'SET' && state.isFirstListItem) {
        if (state.currentClauseIsMultiItem) {
            needsNewline = true;
            indent = indentCalc.getFirstItemIndent(state.subqueryDepth, state.ddlDepth);
        }
        state.isFirstListItem = false;
        state.afterSetKeyword = false;
    }
    
    // First tuple after VALUES
    if (!ctx.isValuesComma && state.afterValuesKeyword && symbolicName !== 'VALUES' && state.isFirstListItem) {
        needsNewline = true;
        indent = baseIndent;
        state.isFirstListItem = false;
        state.afterValuesKeyword = false;
    }
    
    // First condition after WHERE/HAVING
    if (!ctx.isConditionOperator && (state.afterWhereKeyword || state.afterHavingKeyword)) {
        if (symbolicName !== 'WHERE' && symbolicName !== 'HAVING') {
            needsNewline = true;
            indent = indentCalc.getCommaIndent(state.subqueryDepth, state.ddlDepth);
            state.afterWhereKeyword = false;
            state.afterHavingKeyword = false;
        }
    }
    
    return { needsNewline, indent };
}

/**
 * Output token with newline handling.
 */
function outputWithNewline(
    builder: OutputBuilder,
    comments: CommentManager,
    indent: string,
    state: ReturnType<typeof createInitialState>
): void {
    const inlineComments = comments.getInlineComments();
    const ownLineComments = comments.getOwnLineComments();
    
    // Output inline comments before newline
    if (inlineComments.length > 0) {
        outputComments(builder, inlineComments);
    }
    
    // Add newline
    builder.ensureNewline();
    
    // Output own-line comments with indent
    for (const comment of ownLineComments) {
        if (indent) builder.push(indent);
        builder.push(comment.text);
        if (comment.type === SqlBaseLexer.BRACKETED_COMMENT && !comment.text.endsWith('\n')) {
            builder.push('\n');
        }
    }
    
    // Add indent for token
    if (indent) builder.push(indent);
    
    comments.clear();
}

/**
 * Output token without newline.
 */
function outputWithoutNewline(
    builder: OutputBuilder,
    comments: CommentManager,
    text: string,
    state: ReturnType<typeof createInitialState>,
    currentTokenIsUnaryOperator: boolean,
    isLateralViewComma: boolean = false
): void {
    if (comments.hasPending()) {
        outputComments(builder, comments.getPending(), !builder.isEmpty());
        comments.clear();
    }
    
    if (!builder.isEmpty()) {
        const lastChar = builder.getLastChar();
        const prevIsDoubleColon = lastChar === ':' && text !== ':';
        
        const skipSpace = shouldSkipSpace(builder, text, {
            prevWasFunctionName: state.prevWasFunctionName,
            prevWasBuiltInFunctionKeyword: state.prevWasBuiltInFunctionKeyword,
            insideParens: state.insideParens,
            justOutputCommaFirstStyle: state.justOutputCommaFirstStyle,
            justOutputMultiArgFunctionNewline: state.justOutputMultiArgFunctionNewline,
            justOutputWindowNewline: state.justOutputWindowNewline,
            afterWhereKeyword: state.afterWhereKeyword,
            afterHavingKeyword: state.afterHavingKeyword,
            prevTokenWasUnaryOperator: state.prevTokenWasUnaryOperator && 
                (state.prevTokenText === '-' || state.prevTokenText === '+'),
            isLateralViewComma,
            prevIsDoubleColon,
        });
        
        const needsCommaSpace = shouldAddCommaSpace(builder, state.insideParens, state.justOutputCommaFirstStyle);
        
        if (!skipSpace || needsCommaSpace) {
            builder.push(' ');
        }
    }
}

/**
 * Handle multi-arg function expansion.
 */
function handleFunctionExpansion(
    builder: OutputBuilder,
    expandedFuncs: ExpandedFunctionStack,
    funcInfo: { closeParenIndex: number; commaIndices: number[]; spanLength: number },
    tokenList: any[],
    currentIndex: number,
    findNextNonWsTokenIndex: (idx: number) => number,
    analysis: AnalyzerResult,
    state: ReturnType<typeof createInitialState>
): void {
    const depth = expandedFuncs.depth;
    
    // Check for chained function pattern
    let firstArgIsChainedFunc = false;
    const shouldConsiderChaining = depth % 2 === 1;
    
    if (shouldConsiderChaining) {
        const nextTokenIdx = findNextNonWsTokenIndex(currentIndex + 1);
        if (nextTokenIdx > 0 && nextTokenIdx < tokenList.length) {
            const nextToken = tokenList[nextTokenIdx];
            const isNextTokenFuncName = analysis.functionCallTokens.has(nextToken.tokenIndex);
            if (isNextTokenFuncName) {
                const parenIdx = findNextNonWsTokenIndex(nextTokenIdx + 1);
                if (parenIdx > 0 && parenIdx < tokenList.length) {
                    const parenToken = tokenList[parenIdx];
                    const nestedFuncInfo = analysis.multiArgFunctionInfo.get(parenToken.tokenIndex);
                    if (nestedFuncInfo) {
                        firstArgIsChainedFunc = true;
                    }
                }
            }
        }
    }
    
    expandedFuncs.push({
        closeParenIndex: funcInfo.closeParenIndex,
        commaIndices: new Set(funcInfo.commaIndices),
        depth,
        openingColumn: builder.getColumn() - 1,
        firstArgIsChainedFunc,
    });
    
    if (!firstArgIsChainedFunc) {
        const contentIndent = indentCalc.getExpandedFunctionContentIndent(depth);
        builder.push('\n' + ' '.repeat(contentIndent));
        state.justOutputMultiArgFunctionNewline = true;
    }
}

/**
 * Update clause tracking flags after processing a token.
 */
function updateClauseFlags(
    symbolicName: string | null,
    ctx: ReturnType<typeof getTokenContext>,
    state: ReturnType<typeof createInitialState>
): void {
    if (symbolicName !== 'SELECT' && symbolicName !== 'DISTINCT' && 
        state.afterSelectKeyword && !ctx.isListComma) {
        state.afterSelectKeyword = false;
    }
    if (symbolicName !== 'GROUP' && symbolicName !== 'BY' && 
        state.afterGroupByKeyword && !ctx.isListComma) {
        state.afterGroupByKeyword = false;
    }
    if (symbolicName !== 'ORDER' && symbolicName !== 'BY' && 
        state.afterOrderByKeyword && !ctx.isListComma) {
        state.afterOrderByKeyword = false;
    }
}
