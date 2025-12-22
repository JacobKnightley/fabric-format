/**
 * Formatting Context - State Management During Token Processing
 * 
 * This module manages the mutable state that tracks where we are
 * in the formatting process. It provides a clean interface for:
 * - Depth tracking (subquery, DDL, CASE, parentheses)
 * - Clause state (after SELECT, WHERE, etc.)
 * - Previous token tracking (for spacing decisions)
 * - Multi-arg function and window expansion state
 */

import type { 
    FormattingState, 
    ExpandedFunction, 
    ExpandedWindow, 
    PendingComment,
    AnalyzerResult,
    MultiArgFunctionInfo,
    WindowDefInfo
} from './types.js';
import { SqlBaseLexer, getSymbolicName } from './token-utils.js';
import { MAX_LINE_WIDTH } from './constants.js';

/**
 * Creates a fresh formatting state with default values.
 */
export function createInitialState(): FormattingState {
    return {
        // Depth tracking
        subqueryDepth: 0,
        ddlDepth: 0,
        caseDepth: 0,
        insideParens: 0,
        insideFunctionArgs: 0,
        
        // Position tracking
        currentColumn: 0,
        isFirstNonWsToken: true,
        
        // Clause state
        afterSelectKeyword: false,
        afterGroupByKeyword: false,
        afterOrderByKeyword: false,
        afterWhereKeyword: false,
        afterHavingKeyword: false,
        afterSetKeyword: false,
        afterValuesKeyword: false,
        
        // List state
        currentClauseIsMultiItem: false,
        isFirstListItem: true,
        justOutputCommaFirstStyle: false,
        
        // Previous token tracking
        prevWasFunctionName: false,
        prevWasBuiltInFunctionKeyword: false,
        prevTokenText: '',
        prevTokenType: -1,
        prevTokenWasUnaryOperator: false,
        
        // Hint handling
        insideHint: false,
        hintContent: [],
        
        // Multi-arg function expansion
        justOutputMultiArgFunctionNewline: false,
        
        // Window expansion
        justOutputWindowNewline: false,
    };
}

/**
 * Manages expanded multi-arg functions during formatting.
 */
export class ExpandedFunctionStack {
    private stack: ExpandedFunction[] = [];
    
    push(func: ExpandedFunction): void {
        this.stack.push(func);
    }
    
    pop(): ExpandedFunction | undefined {
        return this.stack.pop();
    }
    
    current(): ExpandedFunction | null {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
    }
    
    get depth(): number {
        return this.stack.length;
    }
    
    isEmpty(): boolean {
        return this.stack.length === 0;
    }
    
    isCloseParen(tokenIndex: number): boolean {
        const current = this.current();
        return current !== null && current.closeParenIndex === tokenIndex;
    }
    
    isComma(tokenIndex: number): boolean {
        const current = this.current();
        return current !== null && current.commaIndices.has(tokenIndex);
    }
}

/**
 * Manages comment collection and output during formatting.
 */
export class CommentManager {
    private pending: PendingComment[] = [];
    
    add(comment: PendingComment): void {
        this.pending.push(comment);
    }
    
    hasPending(): boolean {
        return this.pending.length > 0;
    }
    
    getPending(): PendingComment[] {
        return this.pending;
    }
    
    getInlineComments(): PendingComment[] {
        return this.pending.filter(c => !c.wasOnOwnLine);
    }
    
    getOwnLineComments(): PendingComment[] {
        return this.pending.filter(c => c.wasOnOwnLine);
    }
    
    clear(): void {
        this.pending = [];
    }
    
    /**
     * Check if a comment was on its own line in the original input.
     */
    static checkWasOnOwnLine(
        commentTokenIndex: number, 
        commentToken: any, 
        allTokens: any[]
    ): boolean {
        if (commentToken.column === 0) {
            return true;
        }
        
        for (let k = commentTokenIndex - 1; k >= 0; k--) {
            const prevToken = allTokens[k];
            if (!prevToken) continue;
            if (prevToken.channel !== 1) break;
            if (prevToken.type === SqlBaseLexer.WS && 
                prevToken.text && 
                prevToken.text.includes('\n')) {
                return true;
            }
        }
        return false;
    }
}

/**
 * Indentation calculator - centralizes all indent logic.
 */
export class IndentCalculator {
    private readonly indentUnit = '    '; // 4 spaces
    
    /**
     * Get base indent for current depth (subquery + DDL depth).
     */
    getBaseIndent(subqueryDepth: number, ddlDepth: number = 0): string {
        return this.indentUnit.repeat(subqueryDepth + ddlDepth);
    }
    
    /**
     * Get indent for SELECT/GROUP BY/ORDER BY first item (5 spaces from base).
     */
    getFirstItemIndent(subqueryDepth: number, ddlDepth: number = 0): string {
        return this.getBaseIndent(subqueryDepth, ddlDepth) + '     ';
    }
    
    /**
     * Get indent for list comma (4 spaces from base).
     */
    getCommaIndent(subqueryDepth: number, ddlDepth: number = 0): string {
        return this.getBaseIndent(subqueryDepth, ddlDepth) + this.indentUnit;
    }
    
    /**
     * Get indent for ON clause in JOIN (4 spaces from base).
     */
    getOnClauseIndent(subqueryDepth: number, ddlDepth: number = 0): string {
        return this.getBaseIndent(subqueryDepth, ddlDepth) + this.indentUnit;
    }
    
    /**
     * Get indent for WHEN/ELSE in multi-WHEN CASE (8 spaces from base).
     */
    getCaseWhenIndent(subqueryDepth: number, ddlDepth: number = 0): string {
        return this.getBaseIndent(subqueryDepth, ddlDepth) + '        ';
    }
    
    /**
     * Get indent for END in multi-WHEN CASE (5 spaces from base, matches CASE).
     */
    getCaseEndIndent(subqueryDepth: number, ddlDepth: number = 0): string {
        return this.getBaseIndent(subqueryDepth, ddlDepth) + '     ';
    }
    
    /**
     * Get content indent for expanded multi-arg function.
     * Content base = 8 + (depth * 4)
     */
    getExpandedFunctionContentIndent(depth: number): number {
        return 8 + (depth * 4);
    }
    
    /**
     * Get close paren indent for expanded multi-arg function.
     * Close paren = 4 + (depth * 4)
     */
    getExpandedFunctionCloseIndent(depth: number): number {
        return 4 + (depth * 4);
    }
    
    /**
     * Get content indent for expanded window definition.
     * Window content = (baseDepth * 4) + 8
     */
    getWindowContentIndent(baseDepth: number): number {
        return (baseDepth * 4) + 8;
    }
    
    /**
     * Get close paren indent for expanded window definition.
     * Window close = (baseDepth * 4) + 4
     */
    getWindowCloseIndent(baseDepth: number): number {
        return (baseDepth * 4) + 4;
    }
}

/**
 * Determines if a +/- operator is unary based on previous token.
 */
export function isUnaryOperator(
    text: string, 
    prevTokenText: string, 
    prevTokenType: number
): boolean {
    if (text !== '+' && text !== '-') return false;
    
    // Check if previous token indicates unary context
    if (prevTokenText === '' || prevTokenText === '(' || 
        prevTokenText === '[' || prevTokenText === ',') {
        return true;
    }
    
    // Check if previous token was a keyword/operator that expects an expression
    const prevSymbolic = prevTokenType >= 0 ? getSymbolicName(prevTokenType) : null;
    if (!prevSymbolic) return false;
    
    const expectsExpression = new Set([
        'SELECT', 'WHERE', 'HAVING', 'ON', 'AND', 'OR',
        'WHEN', 'THEN', 'ELSE', 'RETURN', 'CASE',
        'EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE', 'NSEQ',
        'PLUS', 'MINUS', 'ASTERISK', 'SLASH', 'PERCENT', 'DIV',
        'AS', 'SET'
    ]);
    
    return expectsExpression.has(prevSymbolic);
}

/**
 * Decides if a multi-arg function should be expanded based on line width.
 */
export function shouldExpandFunction(
    currentColumn: number,
    funcInfo: MultiArgFunctionInfo
): boolean {
    return currentColumn + funcInfo.spanLength > MAX_LINE_WIDTH;
}

/**
 * Decides if a window definition should be expanded based on line width.
 */
export function shouldExpandWindow(
    currentColumn: number,
    windowInfo: WindowDefInfo
): boolean {
    return currentColumn + windowInfo.spanLength > MAX_LINE_WIDTH;
}

// Export singleton indent calculator
export const indentCalc = new IndentCalculator();
