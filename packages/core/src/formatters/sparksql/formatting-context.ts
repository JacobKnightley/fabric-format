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

import { MAX_LINE_WIDTH } from './constants.js';
import { getSymbolicName, SqlBaseLexer } from './token-utils.js';
import type {
  ExpandedFunction,
  FormattingState,
  MultiArgFunctionInfo,
  PendingComment,
  PivotInfo,
  WindowDefInfo,
} from './types.js';

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
    complexTypeDepth: 0, // Tracks nesting in ARRAY<>, MAP<>, STRUCT<>

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

    // PIVOT/UNPIVOT expansion
    justOutputPivotNewline: false,

    // IN list wrapping
    inListContentStartColumn: null,
    insideInList: false,
    justOutputInListWrapNewline: false,

    // Simple query compaction - stack-based for nested queries
    compactQueryStack: [],
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

  current(): ExpandedFunction | undefined {
    return this.stack.length > 0
      ? this.stack[this.stack.length - 1]
      : undefined;
  }

  get depth(): number {
    return this.stack.length;
  }

  isEmpty(): boolean {
    return this.stack.length === 0;
  }

  isCloseParen(tokenIndex: number): boolean {
    const current = this.current();
    return current !== undefined && current.closeParenIndex === tokenIndex;
  }

  /**
   * Check if token is a comma that should trigger a newline.
   * For STACK, some commas are skipped (pair grouping).
   */
  isComma(tokenIndex: number): boolean {
    const current = this.current();
    if (current === undefined || !current.commaIndices.has(tokenIndex)) {
      return false;
    }
    // If this comma is in skipNewlineCommas, don't treat it as expanded comma
    if (current.skipNewlineCommas?.has(tokenIndex)) {
      return false;
    }
    return true;
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
    return this.pending.filter((c) => !c.wasOnOwnLine);
  }

  getOwnLineComments(): PendingComment[] {
    return this.pending.filter((c) => c.wasOnOwnLine);
  }

  clear(): void {
    this.pending = [];
  }

  /**
   * Check if a comment was on its own line in the original input.
   *
   * A comment is on its own line if:
   * 1. It starts at column 0, OR
   * 2. It's preceded by WS that contains a newline, OR
   * 3. It's preceded by WS at column 0 (meaning indent at start of line, the newline
   *    was consumed by the previous token like SIMPLE_COMMENT which includes \n), OR
   * 4. It immediately follows another comment (SIMPLE_COMMENT includes \n, so no WS between)
   */
  static checkWasOnOwnLine(
    commentTokenIndex: number,
    commentToken: any,
    allTokens: any[],
  ): boolean {
    if (commentToken.column === 0) {
      return true;
    }

    for (let k = commentTokenIndex - 1; k >= 0; k--) {
      const prevToken = allTokens[k];
      if (!prevToken) continue;
      if (prevToken.channel !== 1) break;

      // WS with newline means comment is on its own line
      if (
        prevToken.type === SqlBaseLexer.WS &&
        prevToken.text &&
        prevToken.text.includes('\n')
      ) {
        return true;
      }

      // WS at column 0 means it's indent at start of line (newline was in prev token)
      if (prevToken.type === SqlBaseLexer.WS && prevToken.column === 0) {
        return true;
      }

      // If preceded immediately by another comment (SIMPLE_COMMENT includes \n),
      // this comment is on its own line
      if (
        prevToken.type === SqlBaseLexer.SIMPLE_COMMENT ||
        prevToken.type === SqlBaseLexer.BRACKETED_COMMENT
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if there was a blank line before this comment.
   * A blank line means there was whitespace with at least one newline IMMEDIATELY before
   * this comment AND the token before that WS was also a comment (since SIMPLE_COMMENT
   * includes its trailing newline, any additional newline in WS indicates a blank line).
   */
  static checkHadBlankLineBefore(
    commentTokenIndex: number,
    allTokens: any[],
  ): boolean {
    // Only check the immediately preceding token
    if (commentTokenIndex < 1) return false;

    const prevToken = allTokens[commentTokenIndex - 1];
    if (!prevToken) return false;

    // If immediate predecessor is not WS, there's no blank line
    if (prevToken.type !== SqlBaseLexer.WS) return false;

    // Check if the WS has newlines
    if (!prevToken.text || !prevToken.text.includes('\n')) return false;

    // Now check what's before the WS
    if (commentTokenIndex < 2) {
      // WS at start of file with newlines = blank line at top
      return true;
    }

    const tokenBeforeWs = allTokens[commentTokenIndex - 2];
    if (!tokenBeforeWs) return false;

    // If token before WS is a comment, this WS newline represents a blank line
    // (because comments include their trailing newline)
    if (
      tokenBeforeWs.type === SqlBaseLexer.SIMPLE_COMMENT ||
      tokenBeforeWs.type === SqlBaseLexer.BRACKETED_COMMENT
    ) {
      return true;
    }

    // If token before WS is something else (like code), check for 2+ newlines
    // (one newline ends the code line, a second indicates blank line)
    const newlineCount = (prevToken.text.match(/\n/g) || []).length;
    return newlineCount >= 2;
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
    return `${this.getBaseIndent(subqueryDepth, ddlDepth)}     `;
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
    return `${this.getBaseIndent(subqueryDepth, ddlDepth)}        `;
  }

  /**
   * Get indent for END in multi-WHEN CASE (5 spaces from base, matches CASE).
   */
  getCaseEndIndent(subqueryDepth: number, ddlDepth: number = 0): string {
    return `${this.getBaseIndent(subqueryDepth, ddlDepth)}     `;
  }

  /**
   * Get indent for nested CASE content (after THEN CASE).
   * Uses caseDepth to add extra indent for each nesting level.
   */
  getCaseContentIndent(
    subqueryDepth: number,
    ddlDepth: number = 0,
    caseDepth: number = 0,
  ): string {
    const baseIndent = this.getBaseIndent(subqueryDepth, ddlDepth);
    // Each case level adds 8 + 4 spaces (WHEN indent + one level)
    const caseIndent = '            '.repeat(caseDepth); // 12 spaces per case level
    return baseIndent + caseIndent;
  }

  /**
   * Get content indent for expanded multi-arg function's FIRST argument.
   * First arg indent = 8 + (depth * 4) + 1 (for comma-first alignment)
   * The +1 ensures first arg aligns with subsequent ",arg" items
   */
  getExpandedFunctionContentIndent(depth: number): number {
    return 8 + depth * 4 + 1;
  }

  /**
   * Get comma indent for expanded multi-arg function (subsequent args).
   * Comma indent = 8 + (depth * 4) (no +1, comma takes that position)
   */
  getExpandedFunctionCommaIndent(depth: number): number {
    return 8 + depth * 4;
  }

  /**
   * Get close paren indent for expanded multi-arg function.
   * Close paren = 4 + (depth * 4)
   */
  getExpandedFunctionCloseIndent(depth: number): number {
    return 4 + depth * 4;
  }

  /**
   * Get content indent for expanded window definition.
   * Window content = (baseDepth * 4) + 8
   */
  getWindowContentIndent(baseDepth: number): number {
    return baseDepth * 4 + 8;
  }

  /**
   * Get close paren indent for expanded window definition.
   * Window close = (baseDepth * 4) + 4
   */
  getWindowCloseIndent(baseDepth: number): number {
    return baseDepth * 4 + 4;
  }

  /**
   * Get content indent for expanded PIVOT/UNPIVOT clause.
   * PIVOT content = (baseDepth * 4) + 4
   */
  getPivotContentIndent(baseDepth: number): number {
    return baseDepth * 4 + 4;
  }

  /**
   * Get comma indent for expanded PIVOT/UNPIVOT clause.
   * PIVOT comma = (baseDepth * 4) + 4 (same as content, comma-first style)
   */
  getPivotCommaIndent(baseDepth: number): number {
    return baseDepth * 4 + 4;
  }

  /**
   * Get close paren indent for expanded PIVOT/UNPIVOT clause.
   */
  getPivotCloseIndent(baseDepth: number): number {
    return baseDepth * 4;
  }
}

/**
 * Determines if a +/-/~ operator is unary based on previous token.
 * Tilde (~) is always unary (bitwise NOT), while +/- depend on context.
 */

// Module-level Set to avoid allocating on every isUnaryOperator call
const EXPECTS_EXPRESSION = new Set([
  'SELECT',
  'WHERE',
  'HAVING',
  'ON',
  'AND',
  'OR',
  'WHEN',
  'THEN',
  'ELSE',
  'RETURN',
  'CASE',
  'EQ',
  'NEQ',
  'LT',
  'LTE',
  'GT',
  'GTE',
  'NSEQ',
  'PLUS',
  'MINUS',
  'ASTERISK',
  'SLASH',
  'PERCENT',
  'DIV',
  'AS',
  'SET',
]);

export function isUnaryOperator(
  text: string,
  prevTokenText: string,
  prevTokenType: number,
): boolean {
  // Tilde is always unary (bitwise NOT)
  if (text === '~') return true;

  if (text !== '+' && text !== '-') return false;

  // Check if previous token indicates unary context
  if (
    prevTokenText === '' ||
    prevTokenText === '(' ||
    prevTokenText === '[' ||
    prevTokenText === ','
  ) {
    return true;
  }

  // Check if previous token was a keyword/operator that expects an expression
  const prevSymbolic =
    prevTokenType >= 0 ? getSymbolicName(prevTokenType) : null;
  if (!prevSymbolic) return false;

  return EXPECTS_EXPRESSION.has(prevSymbolic);
}

/**
 * Decides if a multi-arg function should be expanded based on line width.
 */
export function shouldExpandFunction(
  currentColumn: number,
  funcInfo: MultiArgFunctionInfo,
): boolean {
  return currentColumn + funcInfo.spanLength > MAX_LINE_WIDTH;
}

/**
 * Decides if a window definition should be expanded based on line width.
 * Also expands if any nested function within would expand.
 *
 * Uses grammar-derived relative offsets to calculate the actual column position
 * of each nested function, ensuring accurate expansion decisions.
 */
export function shouldExpandWindow(
  currentColumn: number,
  windowInfo: WindowDefInfo,
  multiArgFunctionInfo?: Map<number, { spanLength: number }>,
): boolean {
  // Direct span check for window itself
  if (currentColumn + windowInfo.spanLength > MAX_LINE_WIDTH) {
    return true;
  }

  // Check if any nested function would expand at its actual position
  // Use the relative offset to calculate where the nested function actually sits
  if (multiArgFunctionInfo && windowInfo.nestedFunctions.length > 0) {
    for (const { funcIdx, relativeOffset } of windowInfo.nestedFunctions) {
      const funcInfo = multiArgFunctionInfo.get(funcIdx);
      if (funcInfo) {
        // Calculate the actual column where this nested function's content starts
        const nestedFuncColumn = currentColumn + relativeOffset;
        if (nestedFuncColumn + funcInfo.spanLength > MAX_LINE_WIDTH) {
          return true; // Nested function would expand at its position, so expand OVER too
        }
      }
    }
  }

  return false;
}

/**
 * Decides if a PIVOT/UNPIVOT clause should be expanded based on line width.
 */
export function shouldExpandPivot(
  currentColumn: number,
  pivotInfo: PivotInfo,
): boolean {
  return currentColumn + pivotInfo.spanLength > MAX_LINE_WIDTH;
}

// Export singleton indent calculator
export const indentCalc = new IndentCalculator();
