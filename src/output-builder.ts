/**
 * Output Builder - Token Output and Column Tracking
 * 
 * This module handles the construction of the formatted output string.
 * It tracks column position for line-width decisions and provides
 * utilities for spacing and newline insertion.
 */

import { SqlBaseLexer } from './token-utils.js';
import type { PendingComment } from './types.js';

/**
 * Builds the formatted output string with column tracking.
 */
export class OutputBuilder {
    private output: string[] = [];
    private currentColumn: number = 0;
    
    /**
     * Push text to output and update column tracking.
     */
    push(text: string): void {
        this.output.push(text);
        this.updateColumn(text);
    }
    
    /**
     * Get the current column position.
     */
    getColumn(): number {
        return this.currentColumn;
    }
    
    /**
     * Get the last character that was output.
     */
    getLastChar(): string {
        if (this.output.length === 0) return '';
        const lastStr = this.output[this.output.length - 1];
        return lastStr.charAt(lastStr.length - 1);
    }
    
    /**
     * Check if output is empty.
     */
    isEmpty(): boolean {
        return this.output.length === 0;
    }
    
    /**
     * Check if the last output ends with a newline.
     */
    endsWithNewline(): boolean {
        return this.getLastChar() === '\n';
    }
    
    /**
     * Get the final formatted string.
     */
    toString(): string {
        return this.output.join('').trim();
    }
    
    /**
     * Update column tracking based on text content.
     */
    private updateColumn(text: string): void {
        const lastNewline = text.lastIndexOf('\n');
        if (lastNewline >= 0) {
            this.currentColumn = text.length - lastNewline - 1;
        } else {
            this.currentColumn += text.length;
        }
    }
    
    /**
     * Add a space if needed before the next token.
     */
    addSpaceIfNeeded(): void {
        const lastChar = this.getLastChar();
        if (lastChar !== '' && lastChar !== ' ' && lastChar !== '\n' && 
            lastChar !== '(' && lastChar !== '[') {
            this.push(' ');
        }
    }
    
    /**
     * Ensure we're at the start of a new line.
     */
    ensureNewline(): void {
        if (!this.isEmpty() && !this.endsWithNewline()) {
            this.push('\n');
        }
    }
}

/**
 * Outputs pending comments with proper formatting.
 */
export function outputComments(
    builder: OutputBuilder,
    comments: PendingComment[],
    addSpaceBefore: boolean = true
): { outputAny: boolean; lastWasMultilineBlock: boolean } {
    if (comments.length === 0) {
        return { outputAny: false, lastWasMultilineBlock: false };
    }
    
    let lastWasMultilineBlock = false;
    
    for (const comment of comments) {
        // Preserve blank line before comment if it existed in the original
        if (comment.hadBlankLineBefore && !builder.isEmpty()) {
            builder.ensureNewline();
            builder.push('\n');  // Add extra newline for blank line
        } else if (addSpaceBefore && !builder.isEmpty()) {
            const lastChar = builder.getLastChar();
            // Don't add space after newline or space
            // For line comments, add space even after open paren
            const isLineComment = comment.type === SqlBaseLexer.SIMPLE_COMMENT;
            if (lastChar !== '\n' && lastChar !== ' ') {
                if (lastChar !== '(' || isLineComment) {
                    builder.push(' ');
                }
            }
        }
        
        builder.push(comment.text);
        
        // Track if this is a multi-line block comment
        lastWasMultilineBlock = comment.type === SqlBaseLexer.BRACKETED_COMMENT && 
                                comment.text.includes('\n');
        
        // Add newline after multi-line block comment
        if (lastWasMultilineBlock) {
            builder.push('\n');
        }
        
        addSpaceBefore = true;
    }
    
    return { outputAny: true, lastWasMultilineBlock };
}

/**
 * Determines if a space should be skipped before the current token.
 */
export function shouldSkipSpace(
    builder: OutputBuilder,
    text: string,
    context: {
        prevWasFunctionName: boolean;
        prevWasBuiltInFunctionKeyword: boolean;
        insideParens: number;
        justOutputCommaFirstStyle: boolean;
        justOutputMultiArgFunctionNewline: boolean;
        justOutputWindowNewline: boolean;
        justOutputInListWrapNewline: boolean;
        afterWhereKeyword: boolean;
        afterHavingKeyword: boolean;
        prevTokenWasUnaryOperator: boolean;
        currentTokenIsUnaryOperator: boolean;  // Whether current token is also unary
        isLateralViewComma: boolean;
        prevIsDoubleColon: boolean;
        prevTokenText: string;
        currentTokenIsStringLiteral: boolean;
        prevWasDotToken: boolean;  // True if previous token was actually a DOT, not a decimal ending with .
        complexTypeDepth: number;  // Depth inside ARRAY<>, MAP<>, STRUCT<>
    }
): boolean {
    const lastChar = builder.getLastChar();
    
    // Check for hex/binary literals: X'...' or B'...' (case-insensitive)
    const prevWasHexBinaryPrefix = (context.prevTokenText.toUpperCase() === 'X' || 
                                     context.prevTokenText.toUpperCase() === 'B') && 
                                    context.currentTokenIsStringLiteral;
    
    // Skip space after dot ONLY if previous token was actually a DOT token (member access)
    // Not if it's a decimal literal ending with . like "1."
    const prevWasMemberAccessDot = lastChar === '.' && context.prevWasDotToken;
    
    // IMPORTANT: Don't skip space between consecutive unary operators like "- -5"
    // Otherwise it becomes "--5" which is a line comment!
    const prevWasUnaryAndCurrentIsUnary = context.prevTokenWasUnaryOperator && context.currentTokenIsUnaryOperator;
    
    // Inside complex types (ARRAY<INT>, MAP<STRING, INT>, STRUCT<a:INT>)
    // Skip spaces around angle brackets and before commas
    const inComplexType = context.complexTypeDepth > 0;
    const isComplexTypeBracket = text === '<' || text === '>';
    const prevWasComplexTypeBracket = lastChar === '<' || lastChar === '>';
    
    // If prev was unary and current is also unary (like "- -5"), don't skip space!
    if (prevWasUnaryAndCurrentIsUnary) {
        return false;  // Need space to avoid "--" becoming a comment
    }
    
    return (
        lastChar === '(' || 
        prevWasMemberAccessDot || 
        lastChar === '\n' ||
        text === ')' || 
        text === '.' ||
        text === ',' ||  // Never add space before comma
        text === '::' || 
        context.prevIsDoubleColon ||
        (text === '(' && (context.prevWasFunctionName || context.prevWasBuiltInFunctionKeyword)) ||
        context.isLateralViewComma ||
        context.justOutputCommaFirstStyle ||
        context.justOutputMultiArgFunctionNewline ||
        context.justOutputWindowNewline ||
        context.justOutputInListWrapNewline ||
        context.afterWhereKeyword || 
        context.afterHavingKeyword ||
        context.prevTokenWasUnaryOperator ||
        lastChar === '[' || 
        text === '[' || 
        text === ']' ||
        prevWasHexBinaryPrefix ||
        // Complex type handling: no spaces around < and > and : (for struct fields like a:INT)
        (inComplexType && isComplexTypeBracket) ||
        (inComplexType && prevWasComplexTypeBracket) ||
        (text === ':' && inComplexType) ||  // No space before : in struct field (a:INT)
        (lastChar === ':' && inComplexType)  // No space after : in struct field
    );
}

/**
 * Determines if a comma-space should be added.
 */
export function shouldAddCommaSpace(
    builder: OutputBuilder,
    insideParens: number,
    justOutputCommaFirstStyle: boolean
): boolean {
    return builder.getLastChar() === ',' && 
           insideParens > 0 && 
           !justOutputCommaFirstStyle;
}

/**
 * Format hint content: uppercase hint names, preserve table names.
 * Example: "broadcast(t1), merge(t2)" → "BROADCAST(t1), MERGE(t2)"
 */
export function formatHintContent(content: string): string {
    return content.replace(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(\()/g, (match, name, paren) => {
        return name.toUpperCase() + paren;
    });
}
