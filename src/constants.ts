/**
 * Formatting Constants
 * 
 * Central location for configurable formatting thresholds and limits.
 * These values control line-width based expansion decisions.
 * 
 * Line width checks use: currentColumn + expressionSpan > threshold
 * This ensures the FULL LINE (including indentation) stays under the limit,
 * consistent with formatters like ruff, prettier, etc.
 */

/**
 * Maximum desired line width.
 * Expressions are expanded to multiple lines if they would cause the
 * full line (including indentation) to exceed this width.
 */
export const MAX_LINE_WIDTH = 140;
