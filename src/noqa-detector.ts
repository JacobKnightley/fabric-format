/**
 * Noqa Detection - Identifies formatting suppression directives
 * 
 * Supports two types of noqa directives:
 * 1. Statement-level: "-- noqa" or block comment noqa at start of statement
 *    - Bypasses all formatting for the entire statement
 * 2. Line-level expansion: "-- noqa:expansion" or block comment version
 *    - Suppresses multi-line expansion while keeping other formatting
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Information about noqa directives in the SQL.
 */
export interface NoqaInfo {
    /** Set of 1-based line numbers with noqa:expansion directives */
    expansionSuppressedLines: Set<number>;
}

// ============================================================================
// REGEX PATTERNS
// ============================================================================

/**
 * Pattern to detect statement-level noqa at the start of a statement.
 * Matches: "-- noqa" or block comment noqa (case-insensitive, allows whitespace)
 */
const STATEMENT_NOQA_PATTERN = /^\s*(?:--\s*noqa\s*$|--\s*noqa\s+|\/\*\s*noqa\s*\*\/)/i;

/**
 * Pattern to detect line-level noqa:expansion anywhere on a line.
 * Matches: "-- noqa:expansion" or block comment version (case-insensitive)
 */
const EXPANSION_NOQA_PATTERN = /(?:--\s*noqa\s*:\s*expansion|\/\*\s*noqa\s*:\s*expansion\s*\*\/)/i;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a statement starts with a noqa directive (full bypass).
 * 
 * @param statement - The SQL statement to check
 * @returns true if the statement should bypass formatting entirely
 */
export function hasStatementNoqa(statement: string): boolean {
    return STATEMENT_NOQA_PATTERN.test(statement);
}

/**
 * Detect all noqa:expansion directives in a SQL string.
 * 
 * @param sql - The SQL string to scan
 * @returns NoqaInfo with line numbers that have expansion suppression
 */
export function detectNoqaExpansion(sql: string): NoqaInfo {
    const expansionSuppressedLines = new Set<number>();
    
    const lines = sql.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (EXPANSION_NOQA_PATTERN.test(lines[i])) {
            expansionSuppressedLines.add(i + 1); // 1-based line numbers
        }
    }
    
    return { expansionSuppressedLines };
}

/**
 * Check if a specific line has expansion suppression.
 * 
 * @param noqaInfo - The NoqaInfo from detectNoqaExpansion
 * @param lineNumber - 1-based line number to check
 * @returns true if the line has noqa:expansion
 */
export function isExpansionSuppressed(noqaInfo: NoqaInfo, lineNumber: number): boolean {
    return noqaInfo.expansionSuppressedLines.has(lineNumber);
}
