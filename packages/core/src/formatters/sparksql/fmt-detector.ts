/**
 * Format Directive Detection - Identifies formatting suppression directives
 *
 * Supports two types of format directives:
 * 1. Statement-level: "-- fmt: off" or block comment at start of statement
 *    - Bypasses all formatting for the entire statement
 * 2. Line-level inline: "-- fmt: inline" or block comment version
 *    - Suppresses multi-line expansion while keeping other formatting
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * A token range that should be forced inline (no expansion).
 * Used for fmt:inline directive processing.
 */
export interface ForceInlineRange {
  /** Opening token index (e.g., LEFT_PAREN of function) */
  openTokenIndex: number;
  /** Closing token index (e.g., RIGHT_PAREN of function) */
  closeTokenIndex: number;
}

/**
 * Information about format directives in the SQL.
 */
export interface FormatDirectiveInfo {
  /** Set of 1-based line numbers with fmt:inline directives (legacy, for backward compat) */
  collapsedLines: Set<number>;
  /** Token ranges that should be forced inline (grammar-driven approach) */
  forceInlineRanges: ForceInlineRange[];
}

// ============================================================================
// REGEX PATTERNS
// ============================================================================

/**
 * Pattern to detect statement-level fmt:off at the start of a statement.
 * Matches: "-- fmt: off" or "-- fmt:off" or block comment version (case-insensitive)
 */
const STATEMENT_OFF_PATTERN =
  /^\s*(?:--\s*fmt\s*:\s*off\s*$|--\s*fmt\s*:\s*off\s+|\/\*\s*fmt\s*:\s*off\s*\*\/)/i;

/**
 * Pattern to detect line-level fmt:inline anywhere on a line.
 * Matches: "-- fmt: inline" or "-- fmt:inline" or block comment version (case-insensitive)
 */
const COLLAPSE_PATTERN =
  /(?:--\s*fmt\s*:\s*inline|\/\*\s*fmt\s*:\s*inline\s*\*\/)/i;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a statement starts with a fmt:off directive (full bypass).
 *
 * @param statement - The SQL statement to check
 * @returns true if the statement should bypass formatting entirely
 */
export function hasFormatOff(statement: string): boolean {
  return STATEMENT_OFF_PATTERN.test(statement);
}

/**
 * Detect all fmt:inline directives in a SQL string.
 *
 * @param sql - The SQL string to scan
 * @returns FormatDirectiveInfo with line numbers that have inline directives
 */
export function detectCollapseDirectives(sql: string): FormatDirectiveInfo {
  const collapsedLines = new Set<number>();

  const lines = sql.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (COLLAPSE_PATTERN.test(lines[i])) {
      collapsedLines.add(i + 1); // 1-based line numbers
    }
  }

  return { collapsedLines, forceInlineRanges: [] };
}

/**
 * Check if a specific line has an inline directive.
 *
 * @param formatDirectives - The FormatDirectiveInfo from detectCollapseDirectives
 * @param lineNumber - 1-based line number to check
 * @returns true if the line has fmt:inline
 */
export function hasCollapseDirective(
  formatDirectives: FormatDirectiveInfo,
  lineNumber: number,
): boolean {
  return formatDirectives.collapsedLines.has(lineNumber);
}

/**
 * Check if a comment text contains a fmt:inline directive.
 *
 * @param commentText - The comment text to check (including -- or /* markers)
 * @returns true if the comment contains fmt:inline
 */
export function isFmtInlineComment(commentText: string): boolean {
  return COLLAPSE_PATTERN.test(commentText);
}

/**
 * Check if a token index falls within any force-inline range.
 *
 * @param tokenIndex - The token index to check
 * @param ranges - Array of force-inline ranges
 * @returns true if the token is within a force-inline range
 */
export function isInForceInlineRange(
  tokenIndex: number,
  ranges: ForceInlineRange[],
): boolean {
  for (const range of ranges) {
    if (
      tokenIndex >= range.openTokenIndex &&
      tokenIndex <= range.closeTokenIndex
    ) {
      return true;
    }
  }
  return false;
}
