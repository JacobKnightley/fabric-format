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
 * IMPORTANT: Due to dual-lexing (uppercase for token types, original for text),
 * we must be careful not to uppercase non-keywords. The tokenType comes from
 * the uppercase stream, which may misclassify single letters (e.g., X -> BINARY_HEX).
 * 
 * We ONLY return true if the symbolic name MATCHES the text (case-insensitive).
 * This ensures we don't uppercase identifiers like 'x' just because X is BINARY_HEX.
 * 
 * @param tokenType - The token type number
 * @param tokenText - The original token text
 * @returns true if the token is a keyword
 */
export function isKeywordToken(tokenType: number, tokenText: string): boolean {
    const symbolicName = SqlBaseLexer.symbolicNames[tokenType];
    if (!symbolicName) return false;
    
    const textUpper = tokenText.toUpperCase();
    
    // Direct match: symbolic name equals uppercase text (e.g., SELECT)
    // This is the ONLY reliable way to detect keywords with dual-lexing
    if (symbolicName === textUpper) return true;
    
    // Handle token name mismatches where the symbolic name differs from the keyword text
    // These are defined in the grammar like: PERCENTLIT: 'PERCENT';
    // Maps: keyword text -> symbolic name
    const tokenNameMismatches: Record<string, string> = {
        'PERCENT': 'PERCENTLIT',    // PERCENTLIT: 'PERCENT';
        'MINUS': 'SETMINUS',        // SETMINUS: 'MINUS';
        'IDENTIFIER': 'IDENTIFIER_KW',  // IDENTIFIER_KW: 'IDENTIFIER';
    };
    if (tokenNameMismatches[textUpper] === symbolicName) {
        return true;
    }
    
    // Handle keyword aliases where the grammar defines multiple literals for one token.
    // Example: TEMPORARY: 'TEMPORARY' | 'TEMP'; - when user types 'temp', tokenType is TEMPORARY
    // Note: DEC, INT, CHAR are separate tokens in the grammar (not aliases), so they're not listed here.
    const aliasKeywords: Record<string, string> = {
        'TEMP': 'TEMPORARY',     // TEMPORARY: 'TEMPORARY' | 'TEMP';
        'REGEXP': 'RLIKE',       // RLIKE: 'RLIKE' | 'REGEXP';
    };
    if (aliasKeywords[textUpper] && symbolicName === aliasKeywords[textUpper]) {
        return true;
    }
    
    return false;
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
 * Note: This is a style choice for layout, not grammar-derived.
 * These keywords take arguments in parentheses like functions do.
 */
const FUNCTION_LIKE_KEYWORDS = new Set([
    'cast', 'try_cast', 'extract', 'position', 'substring', 'trim',
    'overlay', 'percentile_cont', 'percentile_disc', 'any_value',
    'first_value', 'last_value', 'nth_value', 'lead', 'lag',
    'decimal', 'array', 'map', 'struct',
    // Type constructors
    'varchar', 'char',
    // Constraints
    'unique', 'primary', 'foreign', 'check',
    // Hive streaming (SELECT TRANSFORM(...) USING ...)
    'transform',
    // DDL (CREATE FUNCTION name(...))
    'function'
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
