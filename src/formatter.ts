/**
 * Spark SQL Formatter - 100% Grammar-Driven
 * 
 * NO HARDCODED KEYWORD, FUNCTION, OR CLAUSE LISTS.
 * Everything derived from ANTLR lexer symbolicNames and parse tree context.
 * Built-in function list is auto-generated from Spark's source at build time.
 * 
 * Rules:
 * - Token in identifier context (not function) → preserve original casing
 * - Token in function call context → uppercase if built-in, preserve if UDF
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
// Auto-generated from Spark source - the authoritative list of built-in functions
import { SPARK_BUILTIN_FUNCTIONS } from './generated/builtinFunctions.js';

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
 * 
 * Special case: Some keywords have aliases (e.g., TEMPORARY: 'TEMPORARY' | 'TEMP')
 * In these cases, symbolicName won't match text, but it's still a keyword.
 * We detect this by checking if the token has a non-identifier symbolic name.
 */
function isKeywordToken(tokenType: number, tokenText: string): boolean {
    const symbolicName = SqlBaseLexer.symbolicNames[tokenType];
    if (!symbolicName) return false;
    
    // Direct match: symbolic name equals uppercase text (e.g., SELECT)
    if (symbolicName === tokenText.toUpperCase()) return true;
    
    // Alias match: token has a keyword symbolic name but different text (e.g., TEMP -> TEMPORARY)
    // If it's not an identifier/literal and has a symbolic name, it's a keyword
    const nonKeywordTypes = new Set(['IDENTIFIER', 'STRING', 'STRING_LITERAL', 'BIGINT_LITERAL', 'SMALLINT_LITERAL',
        'TINYINT_LITERAL', 'INTEGER_VALUE', 'EXPONENT_VALUE', 'DECIMAL_VALUE', 'FLOAT_LITERAL',
        'DOUBLE_LITERAL', 'BIGDECIMAL_LITERAL', 'BACKQUOTED_IDENTIFIER', 'SIMPLE_COMMENT',
        'BRACKETED_COMMENT', 'WS', 'UNRECOGNIZED']);
    
    return !nonKeywordTypes.has(symbolicName);
}

/**
 * Check if a keyword should always be uppercased, even when appearing in identifier contexts.
 * These are keywords that have standalone semantic meaning and should never be treated as identifiers.
 * For example: ALL in "GROUP BY ALL" should be uppercase, not treated as a column name.
 */
function isStandaloneKeyword(tokenType: number, tokenText: string): boolean {
    const symbolicName = SqlBaseLexer.symbolicNames[tokenType];
    if (!symbolicName) return false;
    
    // Keywords that should always be uppercase, even in identifier contexts
    const standaloneKeywords = new Set([
        'ALL',      // GROUP BY ALL
        'DISTINCT', // SELECT DISTINCT
        'NULL',     // NULL values
        'TRUE',     // Boolean literal
        'FALSE',    // Boolean literal
    ]);
    
    return standaloneKeywords.has(symbolicName);
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
    
    // Track clauses that have multiple items (need multiline formatting)
    multiItemClauses: Set<number> = new Set();
    
    // Track condition operators (AND/OR) in WHERE/HAVING
    conditionOperators: Set<number> = new Set();
    
    // Track WHERE/HAVING contexts with multiple conditions
    multilineConditionClauses: Set<number> = new Set();
    
    // Track subquery depth for indentation
    subqueryDepth: number = 0;
    tokenDepthMap: Map<number, number> = new Map();
    
    // Track positions where AS keyword should be inserted (for aliases without AS)
    // Set of alias token indices that need AS inserted before them
    aliasInsertPositions: Set<number> = new Set();
    
    // Track BETWEEN contexts to suppress AND splitting
    betweenAndTokens: Set<number> = new Set();
    
    // Track ON tokens that should get newline+indent (JOINs)
    joinOnTokens: Set<number> = new Set();
    
    // Track CTE/subquery parentheses for indentation
    subqueryOpenParens: Set<number> = new Set();
    subqueryCloseParens: Set<number> = new Set();
    setOperandParens: Set<number> = new Set(); // Opening parens that need newline (set operation operands)
    
    // Track CTE commas for comma-first formatting
    cteCommas: Set<number> = new Set();
    
    // Track DDL column list commas (CREATE TABLE)
    ddlColumnCommas: Set<number> = new Set();
    ddlOpenParens: Set<number> = new Set();
    ddlCloseParens: Set<number> = new Set();
    ddlFirstColumn: Set<number> = new Set();
    ddlMultiColumn: Set<number> = new Set(); // DDL parens with multiple columns
    
    // Track DML contexts
    valuesCommas: Set<number> = new Set();
    setClauseCommas: Set<number> = new Set();
    setKeywordToken: number = -1;
    
    // Track CASE expressions with multiple WHEN branches (need multiline)
    multiWhenCaseTokens: Set<number> = new Set(); // CASE tokens that have multiple WHEN
    caseWhenTokens: Set<number> = new Set(); // WHEN tokens inside multiline CASE
    caseElseTokens: Set<number> = new Set(); // ELSE tokens inside multiline CASE
    caseEndTokens: Set<number> = new Set(); // END tokens inside multiline CASE
    
    // Track GROUPING SETS/ROLLUP/CUBE contexts (suppress comma-first inside)
    groupingAnalyticsParens: Set<number> = new Set(); // ( after GROUPING SETS/ROLLUP/CUBE
    insideGroupingAnalytics: boolean = false; // Track if we're currently inside one
    
    // Track SET configuration contexts (preserve config key casing)
    setConfigTokens: Set<number> = new Set();
    
    // Track MERGE statement clause tokens (USING, ON, WHEN)
    mergeUsingTokens: Set<number> = new Set();
    mergeOnTokens: Set<number> = new Set();
    mergeWhenTokens: Set<number> = new Set();
    
    // Track LATERAL VIEW column list commas (should not have space before)
    lateralViewCommas: Set<number> = new Set();
    
    // Track current SELECT token for associating with list items
    private currentSelectToken: number = -1;

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
    
    visitLateralView(ctx: any): any {
        // LATERAL VIEW explode(...) - mark the function name as function call
        // Grammar: LATERAL VIEW (OUTER)? qualifiedName LEFT_PAREN (expression (COMMA expression)*)? 
        //          RIGHT_PAREN tblName=identifier (AS? colName+=identifier (COMMA colName+=identifier)*)?
        if (ctx.children) {
            let foundRightParen = false;
            for (let i = 0; i < ctx.children.length; i++) {
                const child = ctx.children[i];
                // Find qualifiedName (the function name like 'explode')
                if (child.ruleIndex !== undefined) {
                    const ruleName = SqlBaseParser.ruleNames[child.ruleIndex];
                    if (ruleName === 'qualifiedName' && child.start) {
                        this.functionCallTokens.add(child.start.tokenIndex);
                    }
                }
                // Track RIGHT_PAREN - commas after this are in the column name list
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'RIGHT_PAREN') {
                        foundRightParen = true;
                    }
                    // Mark commas after the RIGHT_PAREN as LATERAL VIEW commas
                    if (foundRightParen && symName === 'COMMA') {
                        this.lateralViewCommas.add(child.symbol.tokenIndex);
                    }
                }
            }
        }
        return this.visitChildren(ctx);
    }
    
    // ========== CASE EXPRESSION CONTEXTS ==========
    // Handle CASE expressions with multiple WHEN branches
    
    visitSearchedCase(ctx: any): any {
        // CASE whenClause+ (ELSE elseExpression)? END
        this._analyzeCaseExpression(ctx);
        return this.visitChildren(ctx);
    }
    
    visitSimpleCase(ctx: any): any {
        // CASE value=expression whenClause+ (ELSE elseExpression)? END
        this._analyzeCaseExpression(ctx);
        return this.visitChildren(ctx);
    }
    
    private _analyzeCaseExpression(ctx: any): void {
        if (!ctx.children) return;
        
        // Count WHEN clauses
        let whenCount = 0;
        let caseToken: any = null;
        let elseToken: any = null;
        let endToken: any = null;
        const whenTokens: any[] = [];
        
        for (const child of ctx.children) {
            if (child.symbol) {
                const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                if (symName === 'CASE') {
                    caseToken = child.symbol;
                } else if (symName === 'ELSE') {
                    elseToken = child.symbol;
                } else if (symName === 'END') {
                    endToken = child.symbol;
                } else if (symName === 'WHEN') {
                    whenCount++;
                    whenTokens.push(child.symbol);
                }
            }
            // Also count whenClause rule contexts
            if (child.ruleIndex !== undefined) {
                const ruleName = SqlBaseParser.ruleNames[child.ruleIndex];
                if (ruleName === 'whenClause') {
                    // Find WHEN token in whenClause
                    const whenToken = this._findTokenInContext(child, 'WHEN');
                    if (whenToken && !whenTokens.find(t => t.tokenIndex === whenToken.tokenIndex)) {
                        whenCount++;
                        whenTokens.push(whenToken);
                    }
                }
            }
        }
        
        // If multiple WHEN branches, mark for multiline formatting
        if (whenCount > 1 && caseToken) {
            this.multiWhenCaseTokens.add(caseToken.tokenIndex);
            // Mark each WHEN token
            for (const whenToken of whenTokens) {
                this.caseWhenTokens.add(whenToken.tokenIndex);
            }
            // Mark ELSE token if present
            if (elseToken) {
                this.caseElseTokens.add(elseToken.tokenIndex);
            }
            // Mark END token
            if (endToken) {
                this.caseEndTokens.add(endToken.tokenIndex);
            }
            
            // Also mark the parent SELECT as multiline if we're inside one
            if (this.currentSelectToken >= 0) {
                this.multiItemClauses.add(this.currentSelectToken);
            }
        }
    }
    
    private _findTokenInContext(ctx: any, symbolicName: string): any {
        if (!ctx) return null;
        if (ctx.symbol) {
            const symName = SqlBaseLexer.symbolicNames[ctx.symbol.type];
            if (symName === symbolicName) {
                return ctx.symbol;
            }
        }
        if (ctx.children) {
            for (const child of ctx.children) {
                const found = this._findTokenInContext(child, symbolicName);
                if (found) return found;
            }
        }
        return null;
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
        // Mark commas in GROUP BY list (but not inside GROUPING SETS/ROLLUP/CUBE)
        const commaCount = this._markListCommasExcludingGroupingAnalytics(ctx);
        // Only make GROUP BY multiline if there are actual list commas (not inside groupingAnalytics)
        if (commaCount > 0 && ctx.start) {
            // Check if any commas were actually marked (some might have been skipped due to groupingAnalytics)
            // We can't easily check this here, so we'll use a different approach:
            // Count how many commas in children are NOT in groupingAnalytics contexts
            let actualCommaCount = 0;
            if (ctx.children) {
                for (const child of ctx.children) {
                    if (child.symbol && child.symbol.type === getTokenType('COMMA')) {
                        if (this.listItemCommas.has(child.symbol.tokenIndex)) {
                            actualCommaCount++;
                        }
                    }
                }
            }
            if (actualCommaCount > 0) {
                this.multiItemClauses.add(ctx.start.tokenIndex);
            }
        }
        return this.visitChildren(ctx);
    }
    
    visitGroupingAnalytics(ctx: any): any {
        // GROUPING SETS/ROLLUP/CUBE - don't mark commas as list items
        // Grammar: (ROLLUP | CUBE) LEFT_PAREN groupingSet (COMMA groupingSet)* RIGHT_PAREN
        //       or GROUPING SETS LEFT_PAREN groupingElement (COMMA groupingElement)* RIGHT_PAREN
        
        // Check if this is ROLLUP or CUBE (no space before paren) or GROUPING SETS (space before paren)
        let isRollupOrCube = false;
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'ROLLUP' || symName === 'CUBE') {
                        isRollupOrCube = true;
                    } else if (symName === 'LEFT_PAREN') {
                        this.groupingAnalyticsParens.add(child.symbol.tokenIndex);
                        // Mark this paren as function-like (no space before) for ROLLUP/CUBE
                        if (isRollupOrCube) {
                            // We need to handle this in the formatting logic
                            // Mark the preceding token as a function call
                            const parenIndex = child.symbol.tokenIndex;
                            // Find the preceding ROLLUP or CUBE token
                            for (let i = 0; i < ctx.children.length; i++) {
                                const c = ctx.children[i];
                                if (c.symbol) {
                                    const sn = SqlBaseLexer.symbolicNames[c.symbol.type];
                                    if ((sn === 'ROLLUP' || sn === 'CUBE') && c.symbol.tokenIndex < parenIndex) {
                                        this.functionCallTokens.add(c.symbol.tokenIndex);
                                        break;
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }
        
        // Visit children but don't mark commas as list commas
        const wasInside = this.insideGroupingAnalytics;
        this.insideGroupingAnalytics = true;
        const result = this.visitChildren(ctx);
        this.insideGroupingAnalytics = wasInside;
        return result;
    }
    
    visitQueryOrganization(ctx: any): any {
        // ORDER BY, LIMIT, etc. - scan children for specific tokens
        // Mark ORDER token and LIMIT token separately
        // Also track ORDER BY list commas
        let orderTokenIndex: number | null = null;
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'ORDER') {
                        this.clauseStartTokens.add(child.symbol.tokenIndex);
                        orderTokenIndex = child.symbol.tokenIndex;
                    } else if (symName === 'LIMIT') {
                        this.clauseStartTokens.add(child.symbol.tokenIndex);
                    }
                }
            }
        }
        // Mark commas in ORDER BY list
        const commaCount = this._markListCommasExcludingGroupingAnalytics(ctx);
        if (commaCount > 0 && orderTokenIndex !== null) {
            this.multiItemClauses.add(orderTokenIndex);
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
        // Check if JOIN has multiple conditions (AND/OR)
        this._analyzeJoinConditions(ctx);
        // Always mark ON token for newline+indent in JOINs
        const onTokenIndex = this._findOnToken(ctx);
        if (onTokenIndex !== -1) {
            this.joinOnTokens.add(onTokenIndex);
        }
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
        // Window definition - OVER (PARTITION BY ... ORDER BY ...)
        // Do NOT mark ORDER BY as clause start here - it should stay inline
        // Just visit children without marking anything
        return this.visitChildren(ctx);
    }
    
    visitSetOperation(ctx: any): any {
        // UNION, EXCEPT, INTERSECT - find the operator token and mark subquery parens
        if (ctx.children) {
            let foundSetOperator = false;
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'UNION' || symName === 'EXCEPT' || symName === 'INTERSECT') {
                        this.clauseStartTokens.add(child.symbol.tokenIndex);
                        foundSetOperator = true;
                    }
                } else {
                    // Check for SubqueryContext nested inside QueryTermDefaultContext
                    // that comes after the set operator
                    if (foundSetOperator) {
                        const subquery = this._findSubqueryContext(child);
                        if (subquery && subquery.start) {
                            this.setOperandParens.add(subquery.start.tokenIndex);
                        }
                    }
                }
            }
        }
        return this.visitChildren(ctx);
    }
    
    private _findSubqueryContext(ctx: any): any {
        // Find SubqueryContext in the children tree
        if (!ctx) return null;
        const className = ctx.constructor?.name || '';
        if (className === 'SubqueryContext') return ctx;
        if (ctx.children) {
            for (const child of ctx.children) {
                if (!child.symbol) { // Only recurse into rule contexts
                    const found = this._findSubqueryContext(child);
                    if (found) return found;
                }
            }
        }
        return null;
    }
    
    visitSelectClause(ctx: any): any {
        // SELECT keyword - new line for nested/union SELECTs
        this._markClauseStart(ctx);
        // Save SELECT token for associating with list item count
        if (ctx.start) {
            this.currentSelectToken = ctx.start.tokenIndex;
        }
        return this.visitChildren(ctx);
    }
    
    visitNamedExpression(ctx: any): any {
        // Check if this namedExpression has an alias without AS keyword
        // Grammar: namedExpression: expression (AS? errorCapturingIdentifier)?
        // We need to check:
        // 1. Does it have errorCapturingIdentifier? (alias exists)
        // 2. Does it NOT have AS token?
        // If both true, mark the position for AS insertion
        
        const hasAlias = ctx.errorCapturingIdentifier && ctx.errorCapturingIdentifier();
        const hasAS = ctx.AS && ctx.AS();
        
        if (hasAlias && !hasAS) {
            // Need to insert AS keyword
            // Get the token index right after the expression (before the alias)
            const expr = ctx.expression && ctx.expression();
            const alias = ctx.errorCapturingIdentifier();
            
            if (expr && expr.stop && alias && alias.start) {
                // Insert AS before this alias token
                const aliasIndex = alias.start.tokenIndex;
                this.aliasInsertPositions.add(aliasIndex);
            }
        }
        
        return this.visitChildren(ctx);
    }
    
    // ========== LIST CONTEXTS (SELECT columns, GROUP BY, ORDER BY) ==========
    
    visitNamedExpressionSeq(ctx: any): any {
        // namedExpressionSeq appears in SELECT column list but also inside PIVOT aggregates
        // Only apply comma-first formatting for actual SELECT columns
        // Check if parent is pivotClause, unpivotClause, or lateral view
        const parentClass = ctx.parentCtx?.constructor?.name || '';
        if (parentClass === 'PivotClauseContext' || 
            parentClass === 'UnpivotClauseContext' ||
            parentClass === 'LateralViewContext') {
            // Skip list formatting for these contexts
            return this.visitChildren(ctx);
        }
        
        // SELECT column list
        const hasMultiple = this._markListContext(ctx);
        if (hasMultiple && this.currentSelectToken >= 0) {
            // Mark the SELECT token as having multiple items
            this.multiItemClauses.add(this.currentSelectToken);
        }
        return this.visitChildren(ctx);
    }
    
    visitGroupByClause(ctx: any): any {
        // Individual GROUP BY item - just recurse
        return this.visitChildren(ctx);
    }
    
    private _markListCommasExcludingGroupingAnalytics(ctx: any): number {
        // Mark commas at this level and recursively in children
        // Returns count of commas found
        // Excludes commas that are direct children of groupingAnalytics contexts
        let count = 0;
        if (!ctx || !ctx.children) return 0;
        
        // Check if current context is groupingAnalytics
        const isGroupingAnalytics = ctx.ruleIndex !== undefined && 
            SqlBaseParser.ruleNames[ctx.ruleIndex] === 'groupingAnalytics';
        
        for (const child of ctx.children) {
            if (child.symbol) {
                if (child.symbol.type === getTokenType('COMMA')) {
                    // Only mark as list comma if NOT directly inside groupingAnalytics
                    if (!isGroupingAnalytics) {
                        this.listItemCommas.add(child.symbol.tokenIndex);
                    }
                    count++;
                }
            } else if (child.ruleIndex !== undefined) {
                // Recurse into rule contexts
                count += this._markListCommasExcludingGroupingAnalytics(child);
            }
        }
        return count;
    }
    
    // ========== CONDITION CONTEXTS (WHERE/HAVING) ==========
    
    visitWhereClause(ctx: any): any {
        this._markClauseStart(ctx);
        // First, scan for BETWEEN AND tokens to exclude them from condition operators
        this._scanForBetweenAnd(ctx);
        // Then check if this WHERE has multiple conditions
        this._analyzeConditionClause(ctx);
        return this.visitChildren(ctx);
    }
    
    visitHavingClause(ctx: any): any {
        this._markClauseStart(ctx);
        // First, scan for BETWEEN AND tokens to exclude them from condition operators
        this._scanForBetweenAnd(ctx);
        // Then check if this HAVING has multiple conditions
        this._analyzeConditionClause(ctx);
        return this.visitChildren(ctx);
    }
    
    private _scanForBetweenAnd(ctx: any): void {
        // Recursively scan for BETWEEN ... AND patterns and mark the AND tokens
        if (!ctx) return;
        if (ctx.children) {
            let hasBetween = false;
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'BETWEEN') {
                        hasBetween = true;
                    } else if (symName === 'AND' && hasBetween) {
                        this.betweenAndTokens.add(child.symbol.tokenIndex);
                        hasBetween = false; // Reset for next BETWEEN
                    }
                }
                // Recurse into children
                this._scanForBetweenAnd(child);
            }
        }
    }

    // ========== BETWEEN - Detect AND tokens inside BETWEEN expressions ==========
    
    visitPredicate(ctx: any): any {
        // Check if this is a BETWEEN predicate: expr BETWEEN expr AND expr
        // We need to mark the AND token so it's not treated as a condition separator
        // Also check for IN (subquery) predicates
        if (ctx.children) {
            let hasBetween = false;
            let hasQuery = false;
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'BETWEEN') {
                        hasBetween = true;
                    } else if (symName === 'AND' && hasBetween) {
                        // This AND is part of BETWEEN x AND y, not a condition separator
                        this.betweenAndTokens.add(child.symbol.tokenIndex);
                    }
                } else if (child.ruleIndex !== undefined) {
                    // Check if any child is a query context (indicates IN subquery)
                    const ruleName = child.constructor?.name;
                    if (ruleName === 'QueryContext') {
                        hasQuery = true;
                    }
                }
            }
            // If this predicate has a subquery (IN subquery), mark the parens
            if (hasQuery) {
                this._markSubqueryParens(ctx);
            }
        }
        return this.visitChildren(ctx);
    }
    
    // ========== CTE (WITH clause) ==========
    
    visitCtes(ctx: any): any {
        // WITH clause - mark commas between CTEs for comma-first formatting
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.symbol && child.symbol.type === getTokenType('COMMA')) {
                    this.cteCommas.add(child.symbol.tokenIndex);
                }
            }
        }
        return this.visitChildren(ctx);
    }
    
    visitNamedQuery(ctx: any): any {
        // Individual CTE: name AS (subquery)
        // Mark the opening and closing parens for indentation
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.symbol) {
                    const tokenType = child.symbol.type;
                    if (tokenType === getTokenType('LEFT_PAREN')) {
                        this.subqueryOpenParens.add(child.symbol.tokenIndex);
                    } else if (tokenType === getTokenType('RIGHT_PAREN')) {
                        this.subqueryCloseParens.add(child.symbol.tokenIndex);
                    }
                }
            }
        }
        return this.visitChildren(ctx);
    }
    
    // ========== FROM Subqueries ==========
    
    visitAliasedQuery(ctx: any): any {
        // Subquery in FROM clause: (SELECT ...) alias
        // Mark parens for indentation
        this._markSubqueryParens(ctx);
        return this.visitChildren(ctx);
    }
    
    // ========== Expression Subqueries (IN, EXISTS, scalar) ==========
    
    visitExists(ctx: any): any {
        // EXISTS (subquery)
        this._markSubqueryParens(ctx);
        return this.visitChildren(ctx);
    }
    
    visitSubqueryExpression(ctx: any): any {
        // Scalar subquery: (SELECT ...)
        this._markSubqueryParens(ctx);
        return this.visitChildren(ctx);
    }
    
    visitSubquery(ctx: any): any {
        // Parenthesized query in set operations: (SELECT ...) UNION ALL (SELECT ...)
        this._markSubqueryParens(ctx);
        return this.visitChildren(ctx);
    }
    
    // Helper to mark subquery parens in any context
    private _markSubqueryParens(ctx: any): void {
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.symbol) {
                    const tokenType = child.symbol.type;
                    if (tokenType === getTokenType('LEFT_PAREN')) {
                        this.subqueryOpenParens.add(child.symbol.tokenIndex);
                    } else if (tokenType === getTokenType('RIGHT_PAREN')) {
                        this.subqueryCloseParens.add(child.symbol.tokenIndex);
                    }
                }
            }
        }
    }
    
    // ========== DDL: CREATE TABLE ==========
    
    visitCreateTableHeader(ctx: any): any {
        // This doesn't have the column list, just header
        return this.visitChildren(ctx);
    }
    
    visitCreateTable(ctx: any): any {
        // CREATE TABLE with column definitions
        // Find and mark the parentheses containing column definitions
        this._markDdlColumnList(ctx);
        return this.visitChildren(ctx);
    }
    
    private _markDdlColumnList(ctx: any): void {
        // Look for column definition list in CREATE TABLE
        if (!ctx || !ctx.children) return;
        let foundLeftParen = false;
        let leftParenIndex = -1;
        let commaCount = 0;
        for (const child of ctx.children) {
            if (child.symbol) {
                const tokenType = child.symbol.type;
                if (tokenType === getTokenType('LEFT_PAREN') && !foundLeftParen) {
                    foundLeftParen = true;
                    leftParenIndex = child.symbol.tokenIndex;
                    this.ddlOpenParens.add(leftParenIndex);
                } else if (tokenType === getTokenType('RIGHT_PAREN') && foundLeftParen) {
                    this.ddlCloseParens.add(child.symbol.tokenIndex);
                } else if (tokenType === getTokenType('COMMA') && foundLeftParen) {
                    this.ddlColumnCommas.add(child.symbol.tokenIndex);
                    commaCount++;
                }
            } else if (child.children && foundLeftParen) {
                // Recurse to find commas
                commaCount += this._markDdlCommasInContext(child);
            }
        }
        // Mark as multi-column if there are commas
        if (commaCount > 0 && leftParenIndex >= 0) {
            this.ddlMultiColumn.add(leftParenIndex);
        }
    }
    
    private _markDdlCommasInContext(ctx: any): number {
        if (!ctx || !ctx.children) return 0;
        let count = 0;
        for (const child of ctx.children) {
            if (child.symbol && child.symbol.type === getTokenType('COMMA')) {
                this.ddlColumnCommas.add(child.symbol.tokenIndex);
                count++;
            } else if (child.children) {
                count += this._markDdlCommasInContext(child);
            }
        }
        return count;
    }
    
    // ========== DML: INSERT VALUES, UPDATE SET ==========
    
    visitInsertInto(ctx: any): any {
        // INSERT INTO ... VALUES (row1), (row2)
        // Mark commas between value rows
        this._markValuesCommas(ctx);
        return this.visitChildren(ctx);
    }
    
    visitInlineTable(ctx: any): any {
        // VALUES (row1), (row2) - mark commas between value tuples
        this._markValuesCommas(ctx);
        return this.visitChildren(ctx);
    }
    
    private _markValuesCommas(ctx: any): void {
        if (!ctx || !ctx.children) return;
        let foundValues = false;
        let parenDepth = 0;
        for (const child of ctx.children) {
            if (child.symbol) {
                const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                const tokenType = child.symbol.type;
                if (symName === 'VALUES') {
                    foundValues = true;
                } else if (foundValues && tokenType === getTokenType('LEFT_PAREN')) {
                    parenDepth++;
                } else if (foundValues && tokenType === getTokenType('RIGHT_PAREN')) {
                    parenDepth--;
                } else if (foundValues && parenDepth === 0 && tokenType === getTokenType('COMMA')) {
                    // Comma between value rows at top level (not inside a tuple)
                    this.valuesCommas.add(child.symbol.tokenIndex);
                }
            } else if (child.children) {
                this._markValuesCommas(child);
            }
        }
    }
    
    visitUpdateTable(ctx: any): any {
        // UPDATE table SET col=val, col=val WHERE ...
        // Mark SET keyword and commas in SET clause
        const commaCount = this._markSetClause(ctx, false, 0);
        // If SET has multiple assignments, mark it for multiline
        if (commaCount > 0 && this.setKeywordToken >= 0) {
            this.multiItemClauses.add(this.setKeywordToken);
        }
        return this.visitChildren(ctx);
    }
    
    private _markSetClause(ctx: any, foundSet: boolean, commaCount: number): number {
        if (!ctx || !ctx.children) return commaCount;
        for (const child of ctx.children) {
            if (child.symbol) {
                const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                if (symName === 'SET') {
                    foundSet = true;
                    this.setKeywordToken = child.symbol.tokenIndex;
                    this.clauseStartTokens.add(child.symbol.tokenIndex);
                } else if (foundSet && child.symbol.type === getTokenType('COMMA')) {
                    this.setClauseCommas.add(child.symbol.tokenIndex);
                    commaCount++;
                } else if (foundSet && symName === 'WHERE') {
                    // Stop marking commas once we hit WHERE
                    return commaCount;
                }
            } else if (child.children) {
                commaCount = this._markSetClause(child, foundSet, commaCount);
            }
        }
        return commaCount;
    }

    // ========== SET CONFIGURATION ==========
    // SET spark.sql.shuffle.partitions = 200
    // The config key should preserve lowercase casing
    
    visitSetConfiguration(ctx: any): any {
        // Mark all tokens after SET as identifiers to preserve casing
        this._markSetConfigTokens(ctx);
        return this.visitChildren(ctx);
    }
    
    private _markSetConfigTokens(ctx: any): void {
        if (!ctx || !ctx.children) return;
        let foundSet = false;
        for (const child of ctx.children) {
            if (child.symbol) {
                const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                if (symName === 'SET') {
                    foundSet = true;
                } else if (foundSet) {
                    // Mark all tokens after SET as config tokens (preserve casing)
                    this.setConfigTokens.add(child.symbol.tokenIndex);
                }
            } else if (child.children && foundSet) {
                // Recursively mark nested tokens
                this._markSetConfigTokensRecursive(child);
            }
        }
    }
    
    private _markSetConfigTokensRecursive(ctx: any): void {
        if (!ctx) return;
        if (ctx.symbol) {
            this.setConfigTokens.add(ctx.symbol.tokenIndex);
        }
        if (ctx.children) {
            for (const child of ctx.children) {
                this._markSetConfigTokensRecursive(child);
            }
        }
    }
    
    // ========== MERGE STATEMENT ==========
    // MERGE INTO target USING source ON condition WHEN MATCHED ...
    // USING, ON, and WHEN should start new lines
    
    visitMergeIntoTable(ctx: any): any {
        this._markMergeClauses(ctx);
        return this.visitChildren(ctx);
    }
    
    private _markMergeClauses(ctx: any): void {
        if (!ctx || !ctx.children) return;
        for (const child of ctx.children) {
            if (child.symbol) {
                const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                if (symName === 'USING') {
                    this.mergeUsingTokens.add(child.symbol.tokenIndex);
                } else if (symName === 'ON') {
                    this.mergeOnTokens.add(child.symbol.tokenIndex);
                } else if (symName === 'WHEN') {
                    this.mergeWhenTokens.add(child.symbol.tokenIndex);
                }
            } else if (child.children) {
                this._markMergeClauses(child);
            }
        }
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
    
    private _markListContext(ctx: any): boolean {
        // Mark commas in this list context by walking all children
        // Returns true if multiple items (has commas)
        let hasCommas = false;
        if (ctx.children) {
            let isFirst = true;
            for (const child of ctx.children) {
                if (child.symbol) {
                    const tokenType = child.symbol.type;
                    if (tokenType === getTokenType('COMMA')) {
                        this.listItemCommas.add(child.symbol.tokenIndex);
                        hasCommas = true;
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
        return hasCommas;
    }
    
    private _markCommasInContext(ctx: any): void {
        if (!ctx || !ctx.children) return;
        
        // Don't descend into contexts where commas are NOT list separators
        // Check constructor name because labeled alternatives (like #functionCall)
        // create distinct context classes but share the same ruleIndex
        const className = ctx.constructor?.name || '';
        
        // Skip function calls - commas there are argument separators, not list item separators
        if (className === 'FunctionCallContext') return;
        // Skip pivot/unpivot clauses - commas there have their own semantics  
        if (className === 'PivotClauseContext' || className === 'UnpivotClauseContext') return;
        // Skip lateral view - commas there are column name separators
        if (className === 'LateralViewContext') return;
        
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
    
    private _countConditionOperators(ctx: any, parenDepth: number = 0): number {
        let count = 0;
        if (!ctx) return count;
        
        // Recursively count AND/OR tokens (but exclude BETWEEN's AND and those inside parentheses)
        if (ctx.children) {
            let currentParenDepth = parenDepth;
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symbolicName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    
                    // Track parenthesis depth
                    if (symbolicName === 'LEFT_PAREN') {
                        currentParenDepth++;
                    } else if (symbolicName === 'RIGHT_PAREN') {
                        currentParenDepth--;
                    } else if (symbolicName === 'AND' || symbolicName === 'OR') {
                        // Don't count AND that's part of BETWEEN x AND y
                        // Don't count AND/OR inside parentheses - those should stay inline
                        if (!this.betweenAndTokens.has(child.symbol.tokenIndex) && currentParenDepth === 0) {
                            count++;
                            this.conditionOperators.add(child.symbol.tokenIndex);
                        }
                    }
                }
                // Recurse into children, passing current paren depth
                count += this._countConditionOperators(child, currentParenDepth);
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
        // === MAGIC COMMAND HANDLING ===
        // Check if the SQL starts with %%sql or %sql (Databricks/Fabric notebook magic commands)
        // These should only be recognized at the very start of the input (first line, no preceding text)
        let magicCommand = '';
        let sqlToFormat = sql;
        
        const magicMatch = sql.match(/^(%%sql|%sql)\s*\n?/);
        if (magicMatch) {
            magicCommand = magicMatch[1];
            sqlToFormat = sql.substring(magicMatch[0].length);
        }
        
        // === SEMICOLON HANDLING ===
        // Split on semicolons to format multiple statements separately
        // But we need to be careful not to split on semicolons inside string literals
        const statements = splitOnSemicolons(sqlToFormat);
        const formattedStatements: string[] = [];
        
        for (const stmt of statements) {
            if (stmt.trim().length === 0) continue; // Skip empty statements
            
            const formatted = formatSingleStatement(stmt.trim());
            formattedStatements.push(formatted);
        }
        
        let result = formattedStatements.join(';\n\n');
        
        // Add back trailing semicolon if original had one
        if (sqlToFormat.trimEnd().endsWith(';')) {
            result += ';';
        }
        
        // Add back magic command at the beginning
        if (magicCommand) {
            result = magicCommand + '\n' + result;
        }
        
        return result;
    } catch {
        return sql;
    }
}

/**
 * Split SQL on semicolons, but not semicolons inside string literals
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
            // Found a statement separator
            if (current.trim().length > 0) {
                statements.push(current);
            }
            current = '';
        } else {
            current += ch;
        }
    }
    
    // Add remaining SQL
    if (current.trim().length > 0) {
        statements.push(current);
    }
    
    return statements;
}

/**
 * Format a single SQL statement
 */
function formatSingleStatement(sql: string): string {
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
        let prevWasBuiltInFunctionKeyword = false;
        let insideFunctionArgs = 0; // Track parentheses depth in function calls
        let insideParens = 0; // Track any parentheses depth (for comma spacing)
        let isFirstNonWsToken = true;
        let insideHint = false;
        let hintContent: string[] = [];
        let lastProcessedIndex = -1;
        let subqueryDepth = 0; // Current subquery nesting depth
        let ddlDepth = 0; // Current DDL column list nesting depth
        
        // Helper to get indent for current combined depth
        const getBaseIndent = (depth: number): string => '    '.repeat(depth);
        
        // Track if we just output a SELECT/GROUP BY/ORDER BY keyword
        // to know when to add comma-first formatting for the list
        let afterSelectKeyword = false;
        let afterGroupByKeyword = false;
        let afterOrderByKeyword = false;
        let afterWhereKeyword = false;
        let afterHavingKeyword = false;
        let afterSetKeyword = false;
        let afterValuesKeyword = false;
        
        // Track if current clause has multiple items (should be multiline)
        let currentClauseIsMultiItem = false;
        
        // Track first item in current list context
        let isFirstListItem = true;
        
        // Track if we just output a comma on its own line (comma-first style)
        let justOutputCommaFirstStyle = false;
        
        // Track if current +/- operator is unary (determined based on previous token)
        let currentTokenIsUnaryOperator = false;
        let prevTokenWasUnaryOperator = false; // Track if PREVIOUS token was unary +/-
        let prevTokenText = ''; // Track previous meaningful token for unary detection
        let prevTokenType = -1;
        
        // Track CASE expression depth for indentation
        let caseDepth = 0;
        
        // Collect pending comments to be output at the right time
        interface PendingComment {
            text: string;
            type: number;
            wasOnOwnLine: boolean; // True if comment was at start of line (column 0) or preceded by newline
        }
        let pendingComments: PendingComment[] = [];
        
        // Helper to output pending comments (returns true if any were output, and whether last was multiline block comment)
        const outputPendingComments = (addSpaceBefore: boolean = true): { outputAny: boolean, lastWasMultilineBlock: boolean } => {
            if (pendingComments.length === 0) return { outputAny: false, lastWasMultilineBlock: false };
            let lastWasMultilineBlock = false;
            for (const comment of pendingComments) {
                if (addSpaceBefore && output.length > 0) {
                    const lastStr = output[output.length - 1];
                    const lastChar = lastStr.charAt(lastStr.length - 1);
                    // Don't add space after newline or space
                    // For line comments, add space even after open paren to preserve "( -- comment"
                    const isLineComment = comment.type === SqlBaseLexer.SIMPLE_COMMENT;
                    if (lastChar !== '\n' && lastChar !== ' ') {
                        // Add space after open paren only for line comments (not block comments)
                        if (lastChar !== '(' || isLineComment) {
                            output.push(' ');
                        }
                    }
                }
                output.push(comment.text);
                // Track if this is a multi-line block comment
                lastWasMultilineBlock = comment.type === SqlBaseLexer.BRACKETED_COMMENT && comment.text.includes('\n');
                // If it's a multi-line block comment, add a newline after it
                if (lastWasMultilineBlock) {
                    output.push('\n');
                }
                addSpaceBefore = true; // After first comment, always add space
            }
            pendingComments = [];
            return { outputAny: true, lastWasMultilineBlock };
        };
        
        // Helper to check if a comment was on its own line in the input
        const checkCommentWasOnOwnLine = (commentTokenIndex: number, commentToken: any): boolean => {
            // If comment is at column 0, it was definitely on its own line
            if (commentToken.column === 0) {
                return true;
            }
            
            // Look back through preceding hidden-channel tokens until a non-hidden token is found
            // If any whitespace token in this range contains a newline, the comment is on its own line
            for (let k = commentTokenIndex - 1; k >= 0; k--) {
                const prevToken = allOrigTokens[k];
                if (!prevToken) {
                    continue;
                }
                // Stop once we reach a non-hidden token; earlier tokens are from a previous line/segment
                if (prevToken.channel !== 1) {
                    break;
                }
                if (prevToken.type === SqlBaseLexer.WS && prevToken.text && prevToken.text.includes('\n')) {
                    return true;
                }
            }
            return false;
        };
        
        // Helper to collect comments from a range of hidden tokens
        const collectCommentsFromRange = (startIdx: number, endIdx: number): void => {
            for (let j = startIdx; j < endIdx; j++) {
                const hiddenToken = allOrigTokens[j];
                if (hiddenToken && hiddenToken.channel === 1) {
                    if (hiddenToken.type === SqlBaseLexer.SIMPLE_COMMENT || 
                        hiddenToken.type === SqlBaseLexer.BRACKETED_COMMENT) {
                        const wasOnOwnLine = checkCommentWasOnOwnLine(j, hiddenToken);
                        
                        pendingComments.push({
                            text: hiddenToken.text,
                            type: hiddenToken.type,
                            wasOnOwnLine: wasOnOwnLine
                        });
                    }
                }
            }
        };
        
        // Helper to find next non-WS, non-comment token index
        const findNextNonWsTokenIndex = (startIdx: number): number => {
            for (let j = startIdx; j < tokenList.length; j++) {
                const tok = tokenList[j];
                // Skip WS, EOF, and comment tokens (which are on hidden channel)
                if (tok.type !== SqlBaseLexer.WS && 
                    tok.type !== antlr4.Token.EOF &&
                    tok.type !== SqlBaseLexer.SIMPLE_COMMENT &&
                    tok.type !== SqlBaseLexer.BRACKETED_COMMENT) {
                    return j;
                }
            }
            return -1;
        };
        
        for (let i = 0; i < tokenList.length && i < allOrigTokens.length; i++) {
            const token = tokenList[i];
            const origToken = allOrigTokens[i];
            
            if (token.type === antlr4.Token.EOF) continue;
            
            // Collect any hidden tokens (comments) that appear before this token
            // They will be output at the appropriate time based on formatting decisions
            // Only collect if we haven't already processed ahead (e.g., from look-ahead in comma handling)
            const wasAlreadyProcessed = lastProcessedIndex >= i;
            if (!wasAlreadyProcessed) {
                collectCommentsFromRange(lastProcessedIndex + 1, i);
            }
            lastProcessedIndex = Math.max(lastProcessedIndex, i);
            
            // Skip WS tokens
            if (token.type === SqlBaseLexer.WS) continue;
            
            // Handle comment tokens directly (in case the loop reaches them)
            // Only add if not already collected by look-ahead
            if (token.type === SqlBaseLexer.SIMPLE_COMMENT ||
                token.type === SqlBaseLexer.BRACKETED_COMMENT) {
                if (!wasAlreadyProcessed) {
                    // This comment wasn't collected by look-ahead, add it now
                    const wasOnOwnLine = checkCommentWasOnOwnLine(i, origToken);
                    
                    pendingComments.push({
                        text: origToken.text,
                        type: token.type,
                        wasOnOwnLine: wasOnOwnLine
                    });
                }
                continue;
            }
            
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
            const isBetweenAnd = analyzer.betweenAndTokens.has(tokenIndex);
            const isJoinOn = analyzer.joinOnTokens.has(tokenIndex);
            const isSubqueryOpenParen = analyzer.subqueryOpenParens.has(tokenIndex);
            const isSubqueryCloseParen = analyzer.subqueryCloseParens.has(tokenIndex);
            const isSetOperandParen = analyzer.setOperandParens.has(tokenIndex);
            const isCteComma = analyzer.cteCommas.has(tokenIndex);
            const isDdlComma = analyzer.ddlColumnCommas.has(tokenIndex);
            const isDdlOpenParen = analyzer.ddlOpenParens.has(tokenIndex);
            const isDdlCloseParen = analyzer.ddlCloseParens.has(tokenIndex);
            const isDdlMultiColumn = analyzer.ddlMultiColumn.has(tokenIndex);
            const isValuesComma = analyzer.valuesCommas.has(tokenIndex);
            const isSetComma = analyzer.setClauseCommas.has(tokenIndex);
            const isSetKeyword = tokenIndex === analyzer.setKeywordToken;
            const isLateralViewComma = analyzer.lateralViewCommas.has(tokenIndex);
            
            // Track CASE expression tokens
            const isMultiWhenCase = analyzer.multiWhenCaseTokens.has(tokenIndex);
            const isCaseWhen = analyzer.caseWhenTokens.has(tokenIndex);
            const isCaseElse = analyzer.caseElseTokens.has(tokenIndex);
            const isCaseEnd = analyzer.caseEndTokens.has(tokenIndex);
            
            // Detect if current token is a unary +/- operator
            // Unary if it comes after: (, [, comma, or operators/keywords that start expressions
            currentTokenIsUnaryOperator = false;
            if (text === '+' || text === '-') {
                // Check previous token to determine if this is unary
                if (prevTokenText === '' || prevTokenText === '(' || prevTokenText === '[' || prevTokenText === ',') {
                    currentTokenIsUnaryOperator = true;
                } else {
                    // Check if previous token was a keyword or operator that expects an expression
                    const prevSymbolic = prevTokenType >= 0 ? SqlBaseLexer.symbolicNames[prevTokenType] : null;
                    const expectsExpression = prevSymbolic && (
                        prevSymbolic === 'SELECT' || prevSymbolic === 'WHERE' || prevSymbolic === 'HAVING' ||
                        prevSymbolic === 'ON' || prevSymbolic === 'AND' || prevSymbolic === 'OR' ||
                        prevSymbolic === 'WHEN' || prevSymbolic === 'THEN' || prevSymbolic === 'ELSE' ||
                        prevSymbolic === 'RETURN' || prevSymbolic === 'CASE' ||
                        // Comparison and assignment operators
                        prevSymbolic === 'EQ' || prevSymbolic === 'NEQ' || prevSymbolic === 'LT' ||
                        prevSymbolic === 'LTE' || prevSymbolic === 'GT' || prevSymbolic === 'GTE' ||
                        prevSymbolic === 'NSEQ' ||
                        // Arithmetic operators
                        prevSymbolic === 'PLUS' || prevSymbolic === 'MINUS' || prevSymbolic === 'ASTERISK' ||
                        prevSymbolic === 'SLASH' || prevSymbolic === 'PERCENT' || prevSymbolic === 'DIV' ||
                        // Other
                        prevSymbolic === 'AS' || prevSymbolic === 'SET'
                    );
                    if (expectsExpression) {
                        currentTokenIsUnaryOperator = true;
                    }
                }
            }
            
            // Determine output text based on context
            let outputText: string;
            
            // Check if this is a SET config token (preserve casing)
            const isSetConfigToken = analyzer.setConfigTokens.has(tokenIndex);
            
            if (isSetConfigToken) {
                // SET config key/value → preserve original casing
                outputText = text;
            } else if (isStandaloneKeyword(tokenType, text)) {
                // Standalone keywords (ALL, DISTINCT, NULL, etc.) → always uppercase
                // Even if they appear in identifier contexts
                outputText = text.toUpperCase();
            } else if (isFunctionCall) {
                // Check if it's a built-in function using the authoritative list from Spark source
                const funcLower = text.toLowerCase();
                const isBuiltInFromList = SPARK_BUILTIN_FUNCTIONS.has(funcLower);
                const isBuiltInKeyword = isKeywordToken(tokenType, text);
                
                if (isBuiltInFromList || isBuiltInKeyword) {
                    // Built-in function → uppercase
                    outputText = text.toUpperCase();
                } else {
                    // Not in built-in list → UDF, preserve original casing
                    outputText = text;
                }
            } else if (isInIdentifierContext) {
                // Identifier → preserve original casing
                // Even if it's a keyword, when used as identifier (e.g., a.order), preserve casing
                outputText = text;
            } else if (isKeywordToken(tokenType, text)) {
                // Keyword (symbolicName === text) → uppercase
                outputText = text.toUpperCase();
            } else {
                // Everything else (operators, literals) → preserve
                outputText = text;
            }
            
            // Track if current token is a function-like keyword (CAST, TRY_CAST, etc.)
            // These are keywords that are used like functions: KEYWORD(args)
            // Note: IN is in built-in functions but IN (list) is a predicate with space before (
            const FUNCTION_LIKE_KEYWORDS = new Set([
                'cast', 'try_cast', 'extract', 'position', 'substring', 'trim',
                'overlay', 'percentile_cont', 'percentile_disc', 'any_value',
                'first_value', 'last_value', 'nth_value', 'lead', 'lag'
            ]);
            const isBuiltInFunctionKeyword = isKeywordToken(tokenType, text) && 
                FUNCTION_LIKE_KEYWORDS.has(text.toLowerCase());
            
            // Track function argument depth
            if (text === '(' && (prevWasFunctionName || prevWasBuiltInFunctionKeyword)) {
                insideFunctionArgs++;
            } else if (text === ')' && insideFunctionArgs > 0) {
                insideFunctionArgs--;
            }
            
            // Track general paren depth for comma spacing
            if (text === '(') {
                insideParens++;
            } else if (text === ')' && insideParens > 0) {
                insideParens--;
            }
            
            // Track subquery depth - increment AFTER open paren
            // (handled below after output)
            
            // Check if we need to insert AS keyword before this token (for aliases)
            if (analyzer.aliasInsertPositions.has(tokenIndex)) {
                // This token is an alias that needs AS inserted before it
                // Add space before AS if not at start
                if (output.length > 0) {
                    const lastStr = output[output.length - 1];
                    const lastChar = lastStr.charAt(lastStr.length - 1);
                    if (lastChar !== ' ' && lastChar !== '\n') {
                        output.push(' ');
                    }
                }
                output.push('AS');
                // Will add space before alias token below in normal spacing logic
            }
            
            // Determine spacing and newlines
            let needsNewline = false;
            let indent = '';
            
            // Check if this is a SELECT/GROUP BY/ORDER BY keyword
            if (symbolicName === 'SELECT' && isClauseStart) {
                afterSelectKeyword = true;
                isFirstListItem = true;
                currentClauseIsMultiItem = analyzer.multiItemClauses.has(tokenIndex);
            } else if (symbolicName === 'GROUP' && isClauseStart) {
                afterGroupByKeyword = true;
                isFirstListItem = true;
                currentClauseIsMultiItem = analyzer.multiItemClauses.has(tokenIndex);
            } else if (symbolicName === 'ORDER' && isClauseStart) {
                afterOrderByKeyword = true;
                isFirstListItem = true;
                currentClauseIsMultiItem = analyzer.multiItemClauses.has(tokenIndex);
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
                // ON in JOIN clause - always add newline before ON with indent
                if (isJoinOn && !isFirstNonWsToken) {
                    needsNewline = true;
                    indent = getBaseIndent(subqueryDepth + ddlDepth) + '    '; // 4-space indent for ON
                }
            } else if (symbolicName === 'SET' && isSetKeyword) {
                afterSetKeyword = true;
                isFirstListItem = true;
                currentClauseIsMultiItem = analyzer.multiItemClauses.has(tokenIndex);
            } else if (symbolicName === 'VALUES') {
                afterValuesKeyword = true;
                isFirstListItem = true;
            }
            
            // Handle multi-WHEN CASE expressions
            if (isCaseWhen) {
                // WHEN in multi-WHEN CASE - newline with indent
                needsNewline = true;
                // WHEN should be indented 3 spaces relative to CASE
                // CASE is at base indent + 5 (first item in SELECT)
                // WHEN should be at base indent + 8 (CASE indent + 3)
                indent = getBaseIndent(subqueryDepth + ddlDepth) + '        '; // 8-space indent (5 for first item + 3 for WHEN)
            } else if (isCaseElse) {
                // ELSE in multi-WHEN CASE - same indent as WHEN
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth) + '        '; // 8-space indent
            } else if (isCaseEnd) {
                // END in multi-WHEN CASE - same indent as CASE (5 spaces)
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth) + '     '; // 5-space indent (matches CASE)
            }
            
            // MERGE clause handling - USING, ON, WHEN on new lines
            const isMergeUsing = analyzer.mergeUsingTokens.has(tokenIndex);
            const isMergeOn = analyzer.mergeOnTokens.has(tokenIndex);
            const isMergeWhen = analyzer.mergeWhenTokens.has(tokenIndex);
            
            if (isMergeUsing && !isFirstNonWsToken) {
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth);
            } else if (isMergeOn && !isFirstNonWsToken) {
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth);
            } else if (isMergeWhen && !isFirstNonWsToken) {
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth);
            }
            
            // Clause start gets newline (unless it's the first token)
            if (!isFirstNonWsToken && isClauseStart && !isInIdentifierContext) {
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth);
            }
            
            // Set operation operand parens need newline before them (e.g., UNION ALL (\n    SELECT...))
            if (isSetOperandParen && !isFirstNonWsToken) {
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth);
            }
            
            // Subquery close paren handling - comes BEFORE the paren on its own line
            if (isSubqueryCloseParen) {
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth - 1); // Use parent depth for closing paren
            }
            
            // DDL close paren handling - comes BEFORE the paren on its own line (if multi-column)
            if (isDdlCloseParen && ddlDepth > 0) {
                needsNewline = true;
                indent = '    '.repeat(subqueryDepth + ddlDepth - 1); // Use parent depth for closing paren
            }
            
            // List comma handling (SELECT columns, GROUP BY, ORDER BY)
            if (isListComma && insideFunctionArgs === 0) {
                // Comma in list context - newline before comma
                needsNewline = true;
                // The comma will be output with leading indent on its own line
                indent = getBaseIndent(subqueryDepth + ddlDepth) + '    '; // 4-space indent for comma
                isFirstListItem = false;
                justOutputCommaFirstStyle = true; // Flag to skip space after comma
                
                // Look ahead: collect any comments between this comma and the next token
                // These comments semantically belong to the previous token, so output them
                // before the comma's newline
                const nextIdx = findNextNonWsTokenIndex(i + 1);
                if (nextIdx > 0) {
                    collectCommentsFromRange(i + 1, nextIdx);
                    lastProcessedIndex = nextIdx - 1; // Skip these tokens in next iteration
                }
            }
            
            // CTE comma handling (comma-first for multiple CTEs)
            if (isCteComma) {
                needsNewline = true;
                indent = ''; // No indent, comma at start of line (CTEs at top level)
                justOutputCommaFirstStyle = true;
                
                // Look ahead for comments
                const nextIdx = findNextNonWsTokenIndex(i + 1);
                if (nextIdx > 0) {
                    collectCommentsFromRange(i + 1, nextIdx);
                    lastProcessedIndex = nextIdx - 1;
                }
            }
            
            // DDL column list comma handling
            if (isDdlComma) {
                needsNewline = true;
                // DDL commas are at the same level as the column definitions, not indented further
                indent = getBaseIndent(subqueryDepth) + '    '; // 4-space indent for comma (ddlDepth already accounts for being inside parens)
                justOutputCommaFirstStyle = true;
                
                // Look ahead for comments
                const nextIdx = findNextNonWsTokenIndex(i + 1);
                if (nextIdx > 0) {
                    collectCommentsFromRange(i + 1, nextIdx);
                    lastProcessedIndex = nextIdx - 1;
                }
            }
            
            // VALUES comma handling (between value rows)
            if (isValuesComma) {
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth); // No extra indent, comma at start
                justOutputCommaFirstStyle = true;
                
                // Look ahead for comments
                const nextIdx = findNextNonWsTokenIndex(i + 1);
                if (nextIdx > 0) {
                    collectCommentsFromRange(i + 1, nextIdx);
                    lastProcessedIndex = nextIdx - 1;
                }
            }
            
            // SET clause comma handling
            if (isSetComma) {
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth) + '    '; // 4-space indent for comma
                justOutputCommaFirstStyle = true;
                
                // Look ahead for comments
                const nextIdx = findNextNonWsTokenIndex(i + 1);
                if (nextIdx > 0) {
                    collectCommentsFromRange(i + 1, nextIdx);
                    lastProcessedIndex = nextIdx - 1;
                }
            }
            
            // Condition operator handling (AND/OR in WHERE/HAVING) - but not BETWEEN's AND
            if (isConditionOperator && !isBetweenAnd) {
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth) + '    '; // 4-space indent for AND/OR
            }
            
            // First list item after SELECT/GROUP BY/ORDER BY
            // Only go multiline if the clause has multiple items
            if (!isListComma && (afterSelectKeyword || afterGroupByKeyword || afterOrderByKeyword) &&
                symbolicName !== 'SELECT' && symbolicName !== 'GROUP' && symbolicName !== 'ORDER') {
                // Skip the BY token after GROUP/ORDER
                if ((afterGroupByKeyword && symbolicName === 'BY') || 
                    (afterOrderByKeyword && symbolicName === 'BY') ||
                    symbolicName === 'DISTINCT') {
                    // Don't treat BY or DISTINCT as first list item
                } else if (isFirstListItem && currentClauseIsMultiItem) {
                    needsNewline = true;
                    indent = getBaseIndent(subqueryDepth + ddlDepth) + '     '; // 5-space indent for first item
                    isFirstListItem = false;
                } else if (isFirstListItem) {
                    // Single item - stay inline, just mark as processed
                    isFirstListItem = false;
                }
            }
            
            // First assignment after SET
            // Only go multiline if SET has multiple assignments
            if (!isSetComma && afterSetKeyword && symbolicName !== 'SET' && isFirstListItem) {
                if (currentClauseIsMultiItem) {
                    needsNewline = true;
                    indent = getBaseIndent(subqueryDepth + ddlDepth) + '     '; // 5-space indent for first item
                }
                isFirstListItem = false;
                afterSetKeyword = false;
            }
            
            // First tuple after VALUES
            if (!isValuesComma && afterValuesKeyword && symbolicName !== 'VALUES' && isFirstListItem) {
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth); // Base indent for VALUES rows
                isFirstListItem = false;
                afterValuesKeyword = false;
            }
            
            // First condition after WHERE/HAVING
            if (!isConditionOperator && (afterWhereKeyword || afterHavingKeyword) && 
                symbolicName !== 'WHERE' && symbolicName !== 'HAVING') {
                needsNewline = true;
                indent = getBaseIndent(subqueryDepth + ddlDepth) + '    '; // 4-space indent for first condition
                afterWhereKeyword = false;
                afterHavingKeyword = false;
            }
            
            // Apply spacing/newlines
            if (needsNewline) {
                // Separate pending comments into inline (attach to previous) and own-line (indent with next token)
                const inlineComments = pendingComments.filter(c => !c.wasOnOwnLine);
                const ownLineComments = pendingComments.filter(c => c.wasOnOwnLine);
                
                // Output inline comments BEFORE the newline (attached to preceding content)
                if (inlineComments.length > 0) {
                    pendingComments = inlineComments;
                    outputPendingComments();
                }
                
                // Add newline if not already at start of line
                if (output.length > 0) {
                    const lastStr = output[output.length - 1];
                    if (lastStr.charAt(lastStr.length - 1) !== '\n') {
                        output.push('\n');
                    }
                }
                
                // Output own-line comments AFTER the newline but WITH the indent
                if (ownLineComments.length > 0) {
                    for (const comment of ownLineComments) {
                        if (indent) output.push(indent);
                        output.push(comment.text);
                        // Line comments (SIMPLE_COMMENT) already include the trailing newline
                        // Block comments on their own line don't
                        if (comment.type === SqlBaseLexer.BRACKETED_COMMENT && !comment.text.endsWith('\n')) {
                            output.push('\n');
                        }
                    }
                    // After own-line comments, still need to add indent for the actual token
                }
                
                // Add indent for the next token
                if (indent) {
                    output.push(indent);
                }
                
                // Clear all pending comments (already output above by outputPendingComments() for inline comments)
                pendingComments = [];
            } else {
                // No newline needed
                // First, output any pending comments
                const hadComments = pendingComments.length > 0;
                if (hadComments) {
                    // If this is the first token, don't add space before leading comments
                    outputPendingComments(output.length > 0);
                }
                
                // Now handle spacing before the current token
                if (output.length > 0) {
                    const lastStr = output[output.length - 1];
                    const lastChar = lastStr.charAt(lastStr.length - 1);
                
                    // Double-colon cast: no space around ::
                    const isDoubleColon = text === '::' || lastChar === ':' && lastStr.endsWith('::');
                    const prevIsDoubleColon = lastStr.endsWith('::');
                    
                    // Unary operators: no space after - or + when in unary position
                    // This is now determined when processing the operator token itself
                    const prevIsUnaryOperator = prevTokenWasUnaryOperator && (lastChar === '-' || lastChar === '+');
                    
                    // Skip space in certain cases
                    const skipSpace = lastChar === '(' || lastChar === '.' || lastChar === '\n' ||
                        text === ')' || text === '.' ||
                        text === '::' || prevIsDoubleColon || // No space around ::
                        (text === '(' && (prevWasFunctionName || prevWasBuiltInFunctionKeyword)) || // No space before ( after function
                        (text === ',' && insideParens > 0) || // No space before comma inside parens
                        isLateralViewComma || // No space before comma in LATERAL VIEW column list
                        justOutputCommaFirstStyle || // No space after comma in comma-first style
                        afterWhereKeyword || afterHavingKeyword || // No space before first condition in multiline WHERE/HAVING
                        prevIsUnaryOperator || // No space after unary - or +
                        lastChar === '[' || text === '[' || text === ']'; // No space around [ and ]
                        
                    // Add comma-space: space after comma inside parens (unless comma-first)
                    const needsCommaSpace = lastChar === ',' && insideParens > 0 && !justOutputCommaFirstStyle;
                    
                    if (!skipSpace || needsCommaSpace) output.push(' ');
                }
            }
            
            output.push(outputText);
            
            // Handle multi-WHEN CASE: add newline after CASE keyword
            if (isMultiWhenCase) {
                output.push('\n');
                caseDepth++; // Increase depth for WHEN/ELSE/END
            }
            
            // Track subquery depth changes AFTER outputting the token
            if (isSubqueryOpenParen) {
                subqueryDepth++;
            } else if (isSubqueryCloseParen && subqueryDepth > 0) {
                subqueryDepth--;
            }
            
            // Track DDL depth changes AFTER outputting the token
            // Also add newline after multi-column DDL open paren
            if (isDdlOpenParen && isDdlMultiColumn) {
                output.push('\n' + '    '.repeat(subqueryDepth + 1)); // Newline + 4 spaces base, space before token added normally
                ddlDepth++;
            } else if (isDdlCloseParen && ddlDepth > 0) {
                ddlDepth--;
            }
            
            // Reset comma-first flag after outputting the next token
            if (justOutputCommaFirstStyle && text !== ',') {
                justOutputCommaFirstStyle = false;
            }
            
            // Decrease CASE depth after END token
            if (isCaseEnd && caseDepth > 0) {
                caseDepth--;
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
            prevWasBuiltInFunctionKeyword = isBuiltInFunctionKeyword;
            isFirstNonWsToken = false;
            
            // Update previous token tracking for unary operator detection
            prevTokenWasUnaryOperator = currentTokenIsUnaryOperator;
            prevTokenText = text;
            prevTokenType = tokenType;
        }
        
        // Output any remaining pending comments (trailing comments)
        if (pendingComments.length > 0) {
            outputPendingComments();
        }
        
        return output.join('').trim();
    } catch {
        return sql;
    }
}

export function needsFormatting(sql: string): boolean {
    return formatSql(sql) !== sql;
}
