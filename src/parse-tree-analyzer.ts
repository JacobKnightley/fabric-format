/**
 * Parse Tree Analyzer - Collects Formatting Context from AST
 * 
 * This visitor walks the ANTLR parse tree and collects information about:
 * - Identifier tokens (preserve casing)
 * - Function call tokens (uppercase)
 * - Clause-starting tokens (newline before)
 * - List item separators (commas in SELECT, GROUP BY, ORDER BY)
 * - Condition separators (AND/OR in WHERE/HAVING)
 * - Subquery boundaries
 * - And many more context-specific positions
 * 
 * This is 100% grammar-driven - no hardcoded keyword lists.
 */

// @ts-ignore - Generated ANTLR code
import SqlBaseLexer from './generated/SqlBaseLexer.js';
// @ts-ignore - Generated ANTLR code
import SqlBaseParser from './generated/SqlBaseParser.js';
// @ts-ignore - Generated ANTLR code
import SqlBaseParserVisitor from './generated/SqlBaseParserVisitor.js';

import { getTokenType } from './token-utils.js';
import type { AnalyzerResult, MultiArgFunctionInfo, WindowDefInfo } from './types.js';

/**
 * Visitor that collects context information from parse tree.
 * After visiting, call getResult() to get the analysis.
 */
export class ParseTreeAnalyzer extends SqlBaseParserVisitor {
    // ========== TOKEN POSITION SETS ==========
    identifierTokens: Set<number> = new Set();
    functionCallTokens: Set<number> = new Set();
    clauseStartTokens: Set<number> = new Set();
    
    // List formatting
    listItemCommas: Set<number> = new Set();
    listFirstItems: Set<number> = new Set();
    multiItemClauses: Set<number> = new Set();
    
    // Condition formatting
    conditionOperators: Set<number> = new Set();
    multilineConditionClauses: Set<number> = new Set();
    betweenAndTokens: Set<number> = new Set();
    
    // Subquery tracking
    subqueryDepth: number = 0;
    tokenDepthMap: Map<number, number> = new Map();
    subqueryOpenParens: Set<number> = new Set();
    subqueryCloseParens: Set<number> = new Set();
    setOperandParens: Set<number> = new Set();
    
    // Alias handling
    aliasInsertPositions: Set<number> = new Set();
    
    // JOIN handling
    joinOnTokens: Set<number> = new Set();
    
    // CTE handling
    cteCommas: Set<number> = new Set();
    
    // DDL handling
    ddlColumnCommas: Set<number> = new Set();
    ddlOpenParens: Set<number> = new Set();
    ddlCloseParens: Set<number> = new Set();
    ddlFirstColumn: Set<number> = new Set();
    ddlMultiColumn: Set<number> = new Set();
    
    // DML handling
    valuesCommas: Set<number> = new Set();
    setClauseCommas: Set<number> = new Set();
    setKeywordToken: number = -1;
    
    // CASE expression handling
    multiWhenCaseTokens: Set<number> = new Set();
    caseWhenTokens: Set<number> = new Set();
    caseElseTokens: Set<number> = new Set();
    caseEndTokens: Set<number> = new Set();
    
    // Grouping analytics
    groupingAnalyticsParens: Set<number> = new Set();
    private insideGroupingAnalytics: boolean = false;
    
    // SET configuration
    setConfigTokens: Set<number> = new Set();
    
    // MERGE statement
    mergeUsingTokens: Set<number> = new Set();
    mergeOnTokens: Set<number> = new Set();
    mergeWhenTokens: Set<number> = new Set();
    
    // LATERAL VIEW
    lateralViewCommas: Set<number> = new Set();
    
    // GROUP BY ALL
    groupByAllTokens: Set<number> = new Set();
    
    // Multi-arg function expansion
    multiArgFunctionInfo: Map<number, MultiArgFunctionInfo> = new Map();
    
    // Window definition expansion
    windowDefInfo: Map<number, WindowDefInfo> = new Map();
    
    // Internal state
    private currentSelectToken: number = -1;

    // ========== PUBLIC API ==========
    
    /**
     * Get the complete analysis result after visiting.
     */
    getResult(): AnalyzerResult {
        return {
            identifierTokens: this.identifierTokens,
            functionCallTokens: this.functionCallTokens,
            clauseStartTokens: this.clauseStartTokens,
            listItemCommas: this.listItemCommas,
            listFirstItems: this.listFirstItems,
            multiItemClauses: this.multiItemClauses,
            conditionOperators: this.conditionOperators,
            multilineConditionClauses: this.multilineConditionClauses,
            betweenAndTokens: this.betweenAndTokens,
            tokenDepthMap: this.tokenDepthMap,
            subqueryOpenParens: this.subqueryOpenParens,
            subqueryCloseParens: this.subqueryCloseParens,
            setOperandParens: this.setOperandParens,
            aliasInsertPositions: this.aliasInsertPositions,
            joinOnTokens: this.joinOnTokens,
            cteCommas: this.cteCommas,
            ddlColumnCommas: this.ddlColumnCommas,
            ddlOpenParens: this.ddlOpenParens,
            ddlCloseParens: this.ddlCloseParens,
            ddlFirstColumn: this.ddlFirstColumn,
            ddlMultiColumn: this.ddlMultiColumn,
            valuesCommas: this.valuesCommas,
            setClauseCommas: this.setClauseCommas,
            setKeywordToken: this.setKeywordToken,
            multiWhenCaseTokens: this.multiWhenCaseTokens,
            caseWhenTokens: this.caseWhenTokens,
            caseElseTokens: this.caseElseTokens,
            caseEndTokens: this.caseEndTokens,
            groupingAnalyticsParens: this.groupingAnalyticsParens,
            setConfigTokens: this.setConfigTokens,
            mergeUsingTokens: this.mergeUsingTokens,
            mergeOnTokens: this.mergeOnTokens,
            mergeWhenTokens: this.mergeWhenTokens,
            lateralViewCommas: this.lateralViewCommas,
            groupByAllTokens: this.groupByAllTokens,
            multiArgFunctionInfo: this.multiArgFunctionInfo,
            windowDefInfo: this.windowDefInfo,
        };
    }

    // ========== VISITOR INFRASTRUCTURE ==========
    
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
    
    visitFunctionCall(ctx: any): any {
        if (ctx.start) {
            this.functionCallTokens.add(ctx.start.tokenIndex);
        }
        
        // Check for multi-arg functions
        const args = ctx.argument;
        if (args && args.length >= 2) {
            this._collectMultiArgFunctionInfo(ctx, args.length);
        }
        
        return this.visitChildren(ctx);
    }
    
    visitFunctionName(ctx: any): any {
        if (ctx.start) {
            this.functionCallTokens.add(ctx.start.tokenIndex);
        }
        return this.visitChildren(ctx);
    }
    
    visitFirst(ctx: any): any {
        if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
        return this.visitChildren(ctx);
    }
    
    visitLast(ctx: any): any {
        if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
        return this.visitChildren(ctx);
    }
    
    visitAny_value(ctx: any): any {
        if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
        return this.visitChildren(ctx);
    }
    
    visitStruct(ctx: any): any {
        if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
        return this.visitChildren(ctx);
    }
    
    visitExtract(ctx: any): any {
        if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
        return this.visitChildren(ctx);
    }
    
    visitCast(ctx: any): any {
        if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
        
        // Collect CAST as potentially expandable
        if (ctx.children) {
            let leftParenTokenIndex: number | null = null;
            let rightParenTokenIndex: number | null = null;
            
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'LEFT_PAREN' && leftParenTokenIndex === null) {
                        leftParenTokenIndex = child.symbol.tokenIndex;
                    } else if (symName === 'RIGHT_PAREN') {
                        rightParenTokenIndex = child.symbol.tokenIndex;
                    }
                }
            }
            
            if (leftParenTokenIndex !== null && rightParenTokenIndex !== null) {
                const spanLength = this._calculateSpanLength(ctx);
                this.multiArgFunctionInfo.set(leftParenTokenIndex, {
                    closeParenIndex: rightParenTokenIndex,
                    commaIndices: [],
                    spanLength: spanLength
                });
            }
        }
        
        return this.visitChildren(ctx);
    }
    
    visitPosition(ctx: any): any {
        if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
        return this.visitChildren(ctx);
    }
    
    visitTimestampadd(ctx: any): any {
        if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
        return this.visitChildren(ctx);
    }
    
    visitTimestampdiff(ctx: any): any {
        if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
        return this.visitChildren(ctx);
    }
    
    visitLateralView(ctx: any): any {
        if (ctx.children) {
            let foundRightParen = false;
            for (const child of ctx.children) {
                if (child.ruleIndex !== undefined) {
                    const ruleName = SqlBaseParser.ruleNames[child.ruleIndex];
                    if (ruleName === 'qualifiedName' && child.start) {
                        this.functionCallTokens.add(child.start.tokenIndex);
                    }
                }
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'RIGHT_PAREN') {
                        foundRightParen = true;
                    }
                    if (foundRightParen && symName === 'COMMA') {
                        this.lateralViewCommas.add(child.symbol.tokenIndex);
                    }
                }
            }
        }
        return this.visitChildren(ctx);
    }
    
    // ========== CASE EXPRESSION CONTEXTS ==========
    
    visitSearchedCase(ctx: any): any {
        this._analyzeCaseExpression(ctx);
        return this.visitChildren(ctx);
    }
    
    visitSimpleCase(ctx: any): any {
        this._analyzeCaseExpression(ctx);
        return this.visitChildren(ctx);
    }
    
    // ========== CLAUSE-STARTING CONTEXTS ==========
    
    visitFromClause(ctx: any): any {
        this._markClauseStart(ctx);
        return this.visitChildren(ctx);
    }
    
    visitAggregationClause(ctx: any): any {
        this._markClauseStart(ctx);
        this._markGroupByAllToken(ctx);
        
        const commaCount = this._markListCommasExcludingGroupingAnalytics(ctx);
        if (commaCount > 0 && ctx.start) {
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
        let isRollupOrCube = false;
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'ROLLUP' || symName === 'CUBE') {
                        isRollupOrCube = true;
                    } else if (symName === 'LEFT_PAREN') {
                        this.groupingAnalyticsParens.add(child.symbol.tokenIndex);
                        if (isRollupOrCube) {
                            const parenIndex = child.symbol.tokenIndex;
                            for (const c of ctx.children) {
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
        
        const wasInside = this.insideGroupingAnalytics;
        this.insideGroupingAnalytics = true;
        const result = this.visitChildren(ctx);
        this.insideGroupingAnalytics = wasInside;
        return result;
    }
    
    visitQueryOrganization(ctx: any): any {
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
        const commaCount = this._markListCommasExcludingGroupingAnalytics(ctx);
        if (commaCount > 0 && orderTokenIndex !== null) {
            this.multiItemClauses.add(orderTokenIndex);
        }
        return this.visitChildren(ctx);
    }
    
    visitSortItem(ctx: any): any {
        return this.visitChildren(ctx);
    }
    
    visitLimitClause(ctx: any): any {
        this._markClauseStart(ctx);
        return this.visitChildren(ctx);
    }
    
    visitJoinRelation(ctx: any): any {
        this._markClauseStart(ctx);
        this._analyzeJoinConditions(ctx);
        const onTokenIndex = this._findOnToken(ctx);
        if (onTokenIndex !== -1) {
            this.joinOnTokens.add(onTokenIndex);
        }
        return this.visitChildren(ctx);
    }
    
    visitWindowDef(ctx: any): any {
        this._collectWindowDefInfo(ctx);
        return this.visitChildren(ctx);
    }
    
    visitSetOperation(ctx: any): any {
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
    
    visitSelectClause(ctx: any): any {
        this._markClauseStart(ctx);
        if (ctx.start) {
            this.currentSelectToken = ctx.start.tokenIndex;
        }
        return this.visitChildren(ctx);
    }
    
    visitNamedExpression(ctx: any): any {
        const hasAlias = ctx.errorCapturingIdentifier && ctx.errorCapturingIdentifier();
        const hasAS = ctx.AS && ctx.AS();
        
        if (hasAlias && !hasAS) {
            const expr = ctx.expression && ctx.expression();
            const alias = ctx.errorCapturingIdentifier();
            
            if (expr && expr.stop && alias && alias.start) {
                const aliasIndex = alias.start.tokenIndex;
                this.aliasInsertPositions.add(aliasIndex);
            }
        }
        
        return this.visitChildren(ctx);
    }
    
    // ========== LIST CONTEXTS ==========
    
    visitNamedExpressionSeq(ctx: any): any {
        const parentClass = ctx.parentCtx?.constructor?.name || '';
        if (parentClass === 'PivotClauseContext' || 
            parentClass === 'UnpivotClauseContext' ||
            parentClass === 'LateralViewContext') {
            return this.visitChildren(ctx);
        }
        
        const hasMultiple = this._markListContext(ctx);
        if (hasMultiple && this.currentSelectToken >= 0) {
            this.multiItemClauses.add(this.currentSelectToken);
        }
        return this.visitChildren(ctx);
    }
    
    visitGroupByClause(ctx: any): any {
        return this.visitChildren(ctx);
    }
    
    // ========== CONDITION CONTEXTS ==========
    
    visitWhereClause(ctx: any): any {
        this._markClauseStart(ctx);
        this._scanForBetweenAnd(ctx);
        this._analyzeConditionClause(ctx);
        return this.visitChildren(ctx);
    }
    
    visitHavingClause(ctx: any): any {
        this._markClauseStart(ctx);
        this._scanForBetweenAnd(ctx);
        this._analyzeConditionClause(ctx);
        return this.visitChildren(ctx);
    }
    
    visitPredicate(ctx: any): any {
        if (ctx.children) {
            let hasBetween = false;
            let hasQuery = false;
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    if (symName === 'BETWEEN') {
                        hasBetween = true;
                    } else if (symName === 'AND' && hasBetween) {
                        this.betweenAndTokens.add(child.symbol.tokenIndex);
                    }
                } else if (child.ruleIndex !== undefined) {
                    const ruleName = child.constructor?.name;
                    if (ruleName === 'QueryContext') {
                        hasQuery = true;
                    }
                }
            }
            if (hasQuery) {
                this._markSubqueryParens(ctx);
            }
        }
        return this.visitChildren(ctx);
    }
    
    // ========== CTE CONTEXTS ==========
    
    visitCtes(ctx: any): any {
        this._markClauseStart(ctx);
        
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
    
    // ========== SUBQUERY CONTEXTS ==========
    
    visitAliasedQuery(ctx: any): any {
        this._markSubqueryParens(ctx);
        return this.visitChildren(ctx);
    }
    
    visitExists(ctx: any): any {
        this._markSubqueryParens(ctx);
        return this.visitChildren(ctx);
    }
    
    visitSubqueryExpression(ctx: any): any {
        this._markSubqueryParens(ctx);
        return this.visitChildren(ctx);
    }
    
    visitSubquery(ctx: any): any {
        this._markSubqueryParens(ctx);
        return this.visitChildren(ctx);
    }
    
    // ========== DDL CONTEXTS ==========
    
    visitCreateTableHeader(ctx: any): any {
        return this.visitChildren(ctx);
    }
    
    visitCreateTable(ctx: any): any {
        this._markDdlColumnList(ctx);
        return this.visitChildren(ctx);
    }
    
    // ========== DML CONTEXTS ==========
    
    visitInsertInto(ctx: any): any {
        this._markValuesCommas(ctx);
        return this.visitChildren(ctx);
    }
    
    visitInlineTable(ctx: any): any {
        this._markValuesCommas(ctx);
        return this.visitChildren(ctx);
    }
    
    visitUpdateTable(ctx: any): any {
        const commaCount = this._markSetClause(ctx, false, 0);
        if (commaCount > 0 && this.setKeywordToken >= 0) {
            this.multiItemClauses.add(this.setKeywordToken);
        }
        return this.visitChildren(ctx);
    }
    
    // ========== SET CONFIGURATION ==========
    
    visitSetConfiguration(ctx: any): any {
        this._markSetConfigTokens(ctx);
        return this.visitChildren(ctx);
    }
    
    // ========== MERGE STATEMENT ==========
    
    visitMergeIntoTable(ctx: any): any {
        this._markMergeClauses(ctx);
        return this.visitChildren(ctx);
    }
    
    // ========== QUERY DEPTH TRACKING ==========
    
    visitQuerySpecification(ctx: any): any {
        this.subqueryDepth++;
        this._markDepthForContext(ctx);
        const result = this.visitChildren(ctx);
        this.subqueryDepth--;
        return result;
    }
    
    // ========== PRIVATE HELPER METHODS ==========
    
    private _calculateSpanLength(ctx: any): number {
        if (!ctx || !ctx.start || !ctx.stop) return 0;
        const startIdx = ctx.start.start;
        const stopIdx = ctx.stop.stop;
        if (startIdx === undefined || stopIdx === undefined) return 0;
        return stopIdx - startIdx + 1;
    }
    
    private _collectMultiArgFunctionInfo(ctx: any, argCount: number): void {
        if (!ctx.children) return;
        
        let leftParenTokenIndex: number | null = null;
        let rightParenTokenIndex: number | null = null;
        const commaTokenIndices: number[] = [];
        
        for (const child of ctx.children) {
            if (child.symbol) {
                const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                if (symName === 'LEFT_PAREN' && leftParenTokenIndex === null) {
                    leftParenTokenIndex = child.symbol.tokenIndex;
                } else if (symName === 'RIGHT_PAREN') {
                    rightParenTokenIndex = child.symbol.tokenIndex;
                    break;
                } else if (symName === 'COMMA') {
                    commaTokenIndices.push(child.symbol.tokenIndex);
                }
            }
        }
        
        if (leftParenTokenIndex !== null && rightParenTokenIndex !== null && 
            commaTokenIndices.length === argCount - 1) {
            const spanLength = this._calculateSpanLength(ctx);
            this.multiArgFunctionInfo.set(leftParenTokenIndex, {
                closeParenIndex: rightParenTokenIndex,
                commaIndices: commaTokenIndices,
                spanLength: spanLength
            });
        }
    }
    
    private _collectWindowDefInfo(ctx: any): void {
        if (!ctx.children) return;
        
        let leftParenTokenIndex: number | null = null;
        let rightParenTokenIndex: number | null = null;
        let orderByTokenIndex: number | null = null;
        let windowFrameTokenIndex: number | null = null;
        
        for (const child of ctx.children) {
            if (child.symbol) {
                const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                if (symName === 'LEFT_PAREN' && leftParenTokenIndex === null) {
                    leftParenTokenIndex = child.symbol.tokenIndex;
                } else if (symName === 'RIGHT_PAREN') {
                    rightParenTokenIndex = child.symbol.tokenIndex;
                } else if (symName === 'ORDER' || symName === 'SORT') {
                    orderByTokenIndex = child.symbol.tokenIndex;
                }
            } else if (child.ruleIndex !== undefined) {
                const ruleName = SqlBaseParser.ruleNames[child.ruleIndex];
                if (ruleName === 'windowFrame' && child.children?.[0]?.symbol) {
                    windowFrameTokenIndex = child.children[0].symbol.tokenIndex;
                }
            }
        }
        
        if (leftParenTokenIndex !== null && rightParenTokenIndex !== null) {
            const spanLength = this._calculateSpanLength(ctx);
            this.windowDefInfo.set(leftParenTokenIndex, {
                closeParenIndex: rightParenTokenIndex,
                orderByTokenIndex: orderByTokenIndex,
                windowFrameTokenIndex: windowFrameTokenIndex,
                spanLength: spanLength
            });
        }
    }
    
    private _analyzeCaseExpression(ctx: any): void {
        if (!ctx.children) return;
        
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
            if (child.ruleIndex !== undefined) {
                const ruleName = SqlBaseParser.ruleNames[child.ruleIndex];
                if (ruleName === 'whenClause') {
                    const whenToken = this._findTokenInContext(child, 'WHEN');
                    if (whenToken && !whenTokens.find((t: any) => t.tokenIndex === whenToken.tokenIndex)) {
                        whenCount++;
                        whenTokens.push(whenToken);
                    }
                }
            }
        }
        
        if (whenCount > 1 && caseToken) {
            this.multiWhenCaseTokens.add(caseToken.tokenIndex);
            for (const whenToken of whenTokens) {
                this.caseWhenTokens.add(whenToken.tokenIndex);
            }
            if (elseToken) {
                this.caseElseTokens.add(elseToken.tokenIndex);
            }
            if (endToken) {
                this.caseEndTokens.add(endToken.tokenIndex);
            }
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
    
    private _analyzeJoinConditions(ctx: any): void {
        const operators = this._countConditionOperators(ctx);
        if (operators > 0) {
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
    
    private _findSubqueryContext(ctx: any): any {
        if (!ctx) return null;
        const className = ctx.constructor?.name || '';
        if (className === 'SubqueryContext') return ctx;
        if (ctx.children) {
            for (const child of ctx.children) {
                if (!child.symbol) {
                    const found = this._findSubqueryContext(child);
                    if (found) return found;
                }
            }
        }
        return null;
    }
    
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
                        this.listFirstItems.add(child.symbol.tokenIndex);
                        isFirst = false;
                    }
                } else if (child.children) {
                    this._markCommasInContext(child);
                }
            }
        }
        return hasCommas;
    }
    
    private _markCommasInContext(ctx: any): void {
        if (!ctx || !ctx.children) return;
        
        const className = ctx.constructor?.name || '';
        if (className === 'FunctionCallContext') return;
        if (className === 'PivotClauseContext' || className === 'UnpivotClauseContext') return;
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
    
    private _markListCommasExcludingGroupingAnalytics(ctx: any): number {
        let count = 0;
        if (!ctx || !ctx.children) return 0;
        
        const isGroupingAnalytics = ctx.ruleIndex !== undefined && 
            SqlBaseParser.ruleNames[ctx.ruleIndex] === 'groupingAnalytics';
        
        for (const child of ctx.children) {
            if (child.symbol) {
                if (child.symbol.type === getTokenType('COMMA')) {
                    if (!isGroupingAnalytics) {
                        this.listItemCommas.add(child.symbol.tokenIndex);
                    }
                    count++;
                }
            } else if (child.ruleIndex !== undefined) {
                count += this._markListCommasExcludingGroupingAnalytics(child);
            }
        }
        return count;
    }
    
    private _markGroupByAllToken(ctx: any): void {
        if (!ctx || !ctx.children) return;
        
        let foundGroupBy = false;
        
        for (const child of ctx.children) {
            if (child.symbol) {
                const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
                if (symName === 'BY') {
                    foundGroupBy = true;
                } else if (foundGroupBy && symName === 'ALL') {
                    this.groupByAllTokens.add(child.symbol.tokenIndex);
                    return;
                }
            } else if (foundGroupBy && child.ruleIndex !== undefined) {
                const allToken = this._findAllTokenInGroupByExpression(child);
                if (allToken) {
                    this.groupByAllTokens.add(allToken.tokenIndex);
                    return;
                }
            }
        }
    }
    
    private _findAllTokenInGroupByExpression(ctx: any): any {
        if (!ctx) return null;
        
        if (ctx.symbol) {
            const symName = SqlBaseLexer.symbolicNames[ctx.symbol.type];
            if (symName === 'ALL') {
                return ctx.symbol;
            }
            return null;
        }
        
        if (!ctx.children) return null;
        
        const ruleName = ctx.ruleIndex !== undefined ? SqlBaseParser.ruleNames[ctx.ruleIndex] : null;
        
        const identifierPathRules = new Set([
            'groupByClause', 'expression', 'booleanExpression', 'valueExpression',
            'primaryExpression', 'columnReference', 'identifier', 'strictIdentifier',
            'nonReserved', 'namedExpression'
        ]);
        
        if (ruleName && identifierPathRules.has(ruleName)) {
            const meaningfulChildren = ctx.children.filter((c: any) => 
                c.symbol || (c.ruleIndex !== undefined)
            );
            
            if (meaningfulChildren.length === 1) {
                return this._findAllTokenInGroupByExpression(meaningfulChildren[0]);
            }
        }
        
        return null;
    }
    
    private _analyzeConditionClause(ctx: any): void {
        const operators = this._countConditionOperators(ctx);
        if (operators > 0) {
            if (ctx.start) {
                this.multilineConditionClauses.add(ctx.start.tokenIndex);
            }
        }
    }
    
    private _countConditionOperators(ctx: any, parenDepth: number = 0): number {
        let count = 0;
        if (!ctx) return count;
        
        if (ctx.children) {
            let currentParenDepth = parenDepth;
            for (const child of ctx.children) {
                if (child.symbol) {
                    const symbolicName = SqlBaseLexer.symbolicNames[child.symbol.type];
                    
                    if (symbolicName === 'LEFT_PAREN') {
                        currentParenDepth++;
                    } else if (symbolicName === 'RIGHT_PAREN') {
                        currentParenDepth--;
                    } else if (symbolicName === 'AND' || symbolicName === 'OR') {
                        if (!this.betweenAndTokens.has(child.symbol.tokenIndex) && currentParenDepth === 0) {
                            count++;
                            this.conditionOperators.add(child.symbol.tokenIndex);
                        }
                    }
                }
                count += this._countConditionOperators(child, currentParenDepth);
            }
        }
        return count;
    }
    
    private _scanForBetweenAnd(ctx: any): void {
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
                        hasBetween = false;
                    }
                }
                this._scanForBetweenAnd(child);
            }
        }
    }
    
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
    
    private _markDdlColumnList(ctx: any): void {
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
                commaCount += this._markDdlCommasInContext(child);
            }
        }
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
                    this.valuesCommas.add(child.symbol.tokenIndex);
                }
            } else if (child.children) {
                this._markValuesCommas(child);
            }
        }
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
                    return commaCount;
                }
            } else if (child.children) {
                commaCount = this._markSetClause(child, foundSet, commaCount);
            }
        }
        return commaCount;
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
                    this.setConfigTokens.add(child.symbol.tokenIndex);
                }
            } else if (child.children && foundSet) {
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
    
    private _markDepthForContext(ctx: any): void {
        if (ctx.start && ctx.stop) {
            for (let i = ctx.start.tokenIndex; i <= ctx.stop.tokenIndex; i++) {
                if (!this.tokenDepthMap.has(i)) {
                    this.tokenDepthMap.set(i, this.subqueryDepth);
                }
            }
        }
    }
}
