/**
 * Token Utilities - Grammar-Derived Token Detection
 * 
 * This module provides utilities for detecting token types based on the ANTLR grammar.
 * All detection is grammar-driven - NO hardcoded keyword lists.
 * 
 * Key Functions:
 * - getTokenType(): Get token type number from symbolic name
 * - isKeywordToken(): Check if a token is a keyword (grammar-derived)
 */

// @ts-ignore - Generated ANTLR code
import SqlBaseLexer from './generated/SqlBaseLexer.js';

// ============================================================================
// SYMBOLIC NAME MAPPING (Built from grammar at runtime)
// ============================================================================

/**
 * Map from symbolic name to token type number.
 * Built once at module load time from the ANTLR lexer.
 */
const SYMBOLIC_NAME_TO_TYPE: Map<string, number> = new Map();

// Initialize the map from lexer's symbolic names
for (let i = 0; i < SqlBaseLexer.symbolicNames.length; i++) {
    const name = SqlBaseLexer.symbolicNames[i];
    if (name) {
        SYMBOLIC_NAME_TO_TYPE.set(name, i);
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get token type number by symbolic name.
 * Returns -1 if the name is not found.
 * 
 * @param name - The symbolic name (e.g., 'SELECT', 'COMMA')
 * @returns Token type number or -1
 */
export function getTokenType(name: string): number {
    return SYMBOLIC_NAME_TO_TYPE.get(name) ?? -1;
}

/**
 * Get symbolic name for a token type.
 * Returns null if no symbolic name exists.
 * 
 * @param tokenType - The token type number
 * @returns Symbolic name or null
 */
export function getSymbolicName(tokenType: number): string | null {
    return SqlBaseLexer.symbolicNames[tokenType] ?? null;
}

/**
 * Check if a token is a keyword based on grammar rules.
 * 
 * Keywords in ANTLR are defined like: SELECT: 'SELECT';
 * So symbolicNames[tokenType] === tokenText for keywords.
 * 
 * Special case: Some keywords have aliases (e.g., TEMPORARY: 'TEMPORARY' | 'TEMP')
 * In these cases, symbolicName won't match text, but it's still a keyword.
 * We detect this by checking if the token has a non-identifier symbolic name.
 * 
 * @param tokenType - The token type number
 * @param tokenText - The original token text
 * @returns true if the token is a keyword
 */
export function isKeywordToken(tokenType: number, tokenText: string): boolean {
    const symbolicName = SqlBaseLexer.symbolicNames[tokenType];
    if (!symbolicName) return false;
    
    // Direct match: symbolic name equals uppercase text (e.g., SELECT)
    if (symbolicName === tokenText.toUpperCase()) return true;
    
    // Alias match: token has a keyword symbolic name but different text (e.g., TEMP -> TEMPORARY)
    // If it's not an identifier/literal and has a symbolic name, it's a keyword
    const nonKeywordTypes = new Set([
        'IDENTIFIER', 'STRING', 'STRING_LITERAL', 'BIGINT_LITERAL', 'SMALLINT_LITERAL',
        'TINYINT_LITERAL', 'INTEGER_VALUE', 'EXPONENT_VALUE', 'DECIMAL_VALUE', 'FLOAT_LITERAL',
        'DOUBLE_LITERAL', 'BIGDECIMAL_LITERAL', 'BACKQUOTED_IDENTIFIER', 'SIMPLE_COMMENT',
        'BRACKETED_COMMENT', 'WS', 'UNRECOGNIZED'
    ]);
    
    return !nonKeywordTypes.has(symbolicName);
}

/**
 * Check if a token type represents a comment.
 * 
 * @param tokenType - The token type number
 * @returns true if the token is a comment
 */
export function isCommentToken(tokenType: number): boolean {
    return tokenType === SqlBaseLexer.SIMPLE_COMMENT || 
           tokenType === SqlBaseLexer.BRACKETED_COMMENT;
}

/**
 * Check if a token type represents whitespace.
 * 
 * @param tokenType - The token type number
 * @returns true if the token is whitespace
 */
export function isWhitespaceToken(tokenType: number): boolean {
    return tokenType === SqlBaseLexer.WS;
}

// ============================================================================
// FUNCTION-LIKE KEYWORDS
// ============================================================================

/**
 * Keywords that are used like functions: KEYWORD(args)
 * These need special handling for spacing (no space before opening paren).
 * 
 * Note: This is a style choice, not grammar-derived.
 * IN is in built-in functions but IN (list) is a predicate with space before (.
 */
const FUNCTION_LIKE_KEYWORDS = new Set([
    'cast', 'try_cast', 'extract', 'position', 'substring', 'trim',
    'overlay', 'percentile_cont', 'percentile_disc', 'any_value',
    'first_value', 'last_value', 'nth_value', 'lead', 'lag'
]);

/**
 * Check if a keyword should be treated like a function (no space before paren).
 * 
 * @param tokenType - The token type number
 * @param tokenText - The original token text
 * @returns true if this is a function-like keyword
 */
export function isFunctionLikeKeyword(tokenType: number, tokenText: string): boolean {
    return isKeywordToken(tokenType, tokenText) && 
           FUNCTION_LIKE_KEYWORDS.has(tokenText.toLowerCase());
}

// Re-export the lexer for use in other modules
export { SqlBaseLexer };
