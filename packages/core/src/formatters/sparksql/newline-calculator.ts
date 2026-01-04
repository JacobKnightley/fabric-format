/**
 * Newline and Indent Calculator
 *
 * Extracted from formatter.ts to reduce file size and improve maintainability.
 * This module determines when to insert newlines and what indentation to use.
 */

import { indentCalc } from './formatting-context.js';
import type { AnalyzerResult, ExpandedPivot, ExpandedWindow } from './types.js';

/**
 * Interface for expanded function tracking during formatting.
 */
export interface ExpandedFunctionEntry {
  closeParenIndex: number;
  commaIndices: Set<number>;
  depth: number;
  openingColumn: number;
  firstArgIsChainedFunc: boolean;
  functionName?: string;
  skipNewlineCommas?: Set<number>;
}

/**
 * Interface for expanded function stack operations.
 */
export interface ExpandedFunctionStackInterface {
  current(): ExpandedFunctionEntry | undefined;
}

/**
 * Interface for the state object passed to newline calculation.
 */
export interface NewlineCalcState {
  subqueryDepth: number;
  ddlDepth: number;
  afterSelectKeyword: boolean;
  afterGroupByKeyword: boolean;
  afterOrderByKeyword: boolean;
  afterWhereKeyword: boolean;
  afterHavingKeyword: boolean;
  afterSetKeyword: boolean;
  afterValuesKeyword: boolean;
  isFirstListItem: boolean;
  currentClauseIsMultiItem: boolean;
  isFirstNonWsToken: boolean;
  prevTokenText: string;
  caseDepth: number;
  insideFunctionArgs: number;
  complexTypeDepth: number;
  justOutputCommaFirstStyle: boolean;
  justOutputWindowNewline: boolean;
}

/**
 * Interface for token context.
 */
export interface TokenContext {
  isClauseStart: boolean;
  isJoinOn: boolean;
  isMergeUsing: boolean;
  isMergeOn: boolean;
  isMergeWhen: boolean;
  isCteMainSelect: boolean;
  isSetOperandParen: boolean;
  isSubqueryCloseParen: boolean;
  isDdlCloseParen: boolean;
  isDdlComma: boolean;
  isListComma: boolean;
  isCteComma: boolean;
  isValuesComma: boolean;
  isSetComma: boolean;
  isConditionOperator: boolean;
  isBetweenAnd: boolean;
  isSetKeyword: boolean;
  isInIdentifierContext: boolean;
}

/**
 * Check if a token index is an IN list comma using precomputed set (O(1)).
 */
export function isInListComma(
  tokenIndex: number,
  analysis: AnalyzerResult,
): boolean {
  return analysis.allInListCommas.has(tokenIndex);
}

/**
 * Calculate whether a newline is needed and what indent to use.
 * This is the main newline/indent decision function for the formatter.
 */
export function calculateNewlineAndIndent(
  tokenIndex: number,
  symbolicName: string | null,
  ctx: TokenContext,
  analysis: AnalyzerResult,
  state: NewlineCalcState,
  expandedFuncs: ExpandedFunctionStackInterface,
  currentExpandedWindow: ExpandedWindow | null,
  currentExpandedPivot: ExpandedPivot | null,
  isExpandedFunctionComma: boolean,
  isExpandedFunctionCloseParen: boolean,
  isExpandedWindowOrderBy: boolean,
  isExpandedWindowFrame: boolean,
  isExpandedWindowCloseParen: boolean,
  isExpandedPivotAggregateComma: boolean,
  isExpandedPivotForKeyword: boolean,
  _isExpandedPivotInKeyword: boolean,
  isExpandedPivotInListComma: boolean,
  isExpandedPivotCloseParen: boolean,
  inCompactQuery: boolean,
  isShortSetOperation: boolean,
  isShortValues: boolean,
): { needsNewline: boolean; indent: string } {
  let needsNewline = false;
  let indent = '';

  const baseIndent = indentCalc.getBaseIndent(
    state.subqueryDepth,
    state.ddlDepth,
  );

  // Clause state updates
  if (symbolicName === 'SELECT' && ctx.isClauseStart) {
    state.afterSelectKeyword = true;
    state.isFirstListItem = true;
    state.currentClauseIsMultiItem = analysis.multiItemClauses.has(tokenIndex);
  } else if (symbolicName === 'GROUP' && ctx.isClauseStart) {
    state.afterGroupByKeyword = true;
    state.isFirstListItem = true;
    state.currentClauseIsMultiItem = analysis.multiItemClauses.has(tokenIndex);
  } else if (symbolicName === 'ORDER' && ctx.isClauseStart) {
    state.afterOrderByKeyword = true;
    state.isFirstListItem = true;
    state.currentClauseIsMultiItem = analysis.multiItemClauses.has(tokenIndex);
  } else if (symbolicName === 'WHERE' && ctx.isClauseStart) {
    if (analysis.multilineConditionClauses.has(tokenIndex)) {
      state.afterWhereKeyword = true;
    }
  } else if (symbolicName === 'HAVING' && ctx.isClauseStart) {
    if (analysis.multilineConditionClauses.has(tokenIndex)) {
      state.afterHavingKeyword = true;
    }
  } else if (
    symbolicName === 'ON' &&
    ctx.isJoinOn &&
    !state.isFirstNonWsToken
  ) {
    needsNewline = true;
    indent = indentCalc.getOnClauseIndent(state.subqueryDepth, state.ddlDepth);
  } else if (symbolicName === 'SET' && ctx.isSetKeyword) {
    state.afterSetKeyword = true;
    state.isFirstListItem = true;
    state.currentClauseIsMultiItem = analysis.multiItemClauses.has(tokenIndex);
  } else if (symbolicName === 'VALUES') {
    state.afterValuesKeyword = true;
    state.isFirstListItem = true;
  }

  // CASE expression handling
  if (
    symbolicName === 'CASE' &&
    analysis.multiWhenCaseTokens.has(tokenIndex) &&
    state.prevTokenText === 'THEN'
  ) {
    needsNewline = true;
    const nestingOffset = state.caseDepth * 4;
    indent =
      indentCalc.getCaseWhenIndent(state.subqueryDepth, state.ddlDepth) +
      ' '.repeat(nestingOffset);
  }

  if (analysis.caseWhenTokens.has(tokenIndex)) {
    needsNewline = true;
    const nestingOffset = state.caseDepth > 0 ? (state.caseDepth - 1) * 4 : 0;
    indent =
      indentCalc.getCaseWhenIndent(state.subqueryDepth, state.ddlDepth) +
      ' '.repeat(nestingOffset);
  } else if (analysis.caseElseTokens.has(tokenIndex)) {
    needsNewline = true;
    const nestingOffset = state.caseDepth > 0 ? (state.caseDepth - 1) * 4 : 0;
    indent =
      indentCalc.getCaseWhenIndent(state.subqueryDepth, state.ddlDepth) +
      ' '.repeat(nestingOffset);
  } else if (analysis.caseEndTokens.has(tokenIndex)) {
    needsNewline = true;
    const nestingOffset = state.caseDepth > 0 ? (state.caseDepth - 1) * 4 : 0;
    indent =
      indentCalc.getCaseEndIndent(state.subqueryDepth, state.ddlDepth) +
      ' '.repeat(nestingOffset);
  }

  // MERGE clause handling
  if (
    (ctx.isMergeUsing || ctx.isMergeOn || ctx.isMergeWhen) &&
    !state.isFirstNonWsToken
  ) {
    needsNewline = true;
    indent = baseIndent;
  }

  // CTE main SELECT
  if (ctx.isCteMainSelect && !state.isFirstNonWsToken) {
    needsNewline = true;
    indent = baseIndent;
  }

  // Clause start newline
  if (
    !state.isFirstNonWsToken &&
    ctx.isClauseStart &&
    !ctx.isInIdentifierContext &&
    !inCompactQuery &&
    !isShortSetOperation
  ) {
    needsNewline = true;
    indent = baseIndent;
  }

  // Set operation operand parens
  if (
    ctx.isSetOperandParen &&
    !state.isFirstNonWsToken &&
    !isShortSetOperation
  ) {
    needsNewline = true;
    indent = baseIndent;
  }

  // Subquery close paren
  if (ctx.isSubqueryCloseParen && !inCompactQuery) {
    needsNewline = true;
    indent = indentCalc.getBaseIndent(state.subqueryDepth - 1);
  }

  // DDL close paren
  if (ctx.isDdlCloseParen && state.ddlDepth > 0) {
    needsNewline = true;
    indent = '    '.repeat(state.subqueryDepth + state.ddlDepth - 1);
  }

  // Expanded function close paren
  const currentFunc = expandedFuncs.current();
  if (isExpandedFunctionCloseParen && currentFunc) {
    needsNewline = true;
    indent = ' '.repeat(
      indentCalc.getExpandedFunctionCloseIndent(currentFunc.depth),
    );
  }

  // Expanded window handling
  if (
    isExpandedWindowOrderBy &&
    currentExpandedWindow &&
    !state.justOutputWindowNewline
  ) {
    needsNewline = true;
    indent = ' '.repeat(
      indentCalc.getWindowContentIndent(currentExpandedWindow.baseDepth),
    );
  }
  if (
    isExpandedWindowFrame &&
    currentExpandedWindow &&
    !state.justOutputWindowNewline
  ) {
    needsNewline = true;
    indent = ' '.repeat(
      indentCalc.getWindowContentIndent(currentExpandedWindow.baseDepth),
    );
  }
  if (isExpandedWindowCloseParen && currentExpandedWindow) {
    needsNewline = true;
    indent = ' '.repeat(
      indentCalc.getWindowCloseIndent(currentExpandedWindow.baseDepth),
    );
  }

  // Expanded PIVOT/UNPIVOT handling
  if (isExpandedPivotAggregateComma && currentExpandedPivot) {
    needsNewline = true;
    indent = ' '.repeat(
      indentCalc.getPivotCommaIndent(currentExpandedPivot.depth),
    );
    state.justOutputCommaFirstStyle = true;
  }
  if (isExpandedPivotForKeyword && currentExpandedPivot) {
    needsNewline = true;
    indent = ' '.repeat(
      indentCalc.getPivotContentIndent(currentExpandedPivot.depth),
    );
  }
  if (isExpandedPivotInListComma && currentExpandedPivot) {
    needsNewline = true;
    indent = ' '.repeat(
      indentCalc.getPivotCommaIndent(currentExpandedPivot.depth) + 4,
    );
    state.justOutputCommaFirstStyle = true;
  }
  if (isExpandedPivotCloseParen && currentExpandedPivot) {
    needsNewline = true;
    indent = ' '.repeat(
      indentCalc.getPivotCloseIndent(currentExpandedPivot.depth),
    );
  }

  // List comma handling
  const isExceptClauseToken = analysis.exceptClauseTokens.has(tokenIndex);
  if (
    ctx.isListComma &&
    state.insideFunctionArgs === 0 &&
    !isInListComma(tokenIndex, analysis) &&
    state.complexTypeDepth === 0 &&
    !isExceptClauseToken
  ) {
    needsNewline = true;
    indent = indentCalc.getCommaIndent(state.subqueryDepth, state.ddlDepth);
    state.isFirstListItem = false;
    state.justOutputCommaFirstStyle = true;
  }

  // CTE comma
  if (ctx.isCteComma) {
    needsNewline = true;
    indent = '';
    state.justOutputCommaFirstStyle = true;
  }

  // DDL comma
  if (ctx.isDdlComma) {
    needsNewline = true;
    indent = indentCalc.getCommaIndent(state.subqueryDepth);
    state.justOutputCommaFirstStyle = true;
  }

  // VALUES comma
  if (ctx.isValuesComma && !isShortValues) {
    needsNewline = true;
    indent = baseIndent;
    state.justOutputCommaFirstStyle = true;
  }

  // SET comma
  if (ctx.isSetComma) {
    needsNewline = true;
    indent = indentCalc.getCommaIndent(state.subqueryDepth, state.ddlDepth);
    state.justOutputCommaFirstStyle = true;
  }

  // Expanded function comma
  if (isExpandedFunctionComma && currentFunc) {
    needsNewline = true;
    indent = ' '.repeat(
      indentCalc.getExpandedFunctionCommaIndent(currentFunc.depth),
    );
    state.justOutputCommaFirstStyle = true;
  }

  // Condition operator (AND/OR)
  if (ctx.isConditionOperator && !ctx.isBetweenAnd) {
    needsNewline = true;
    indent = indentCalc.getCommaIndent(state.subqueryDepth, state.ddlDepth);
  }

  // First list item after SELECT/GROUP BY/ORDER BY
  if (
    !ctx.isListComma &&
    (state.afterSelectKeyword ||
      state.afterGroupByKeyword ||
      state.afterOrderByKeyword)
  ) {
    if (
      symbolicName !== 'SELECT' &&
      symbolicName !== 'GROUP' &&
      symbolicName !== 'ORDER'
    ) {
      if (
        (state.afterGroupByKeyword && symbolicName === 'BY') ||
        (state.afterOrderByKeyword && symbolicName === 'BY') ||
        symbolicName === 'DISTINCT'
      ) {
        // Skip BY or DISTINCT
      } else if (state.isFirstListItem && state.currentClauseIsMultiItem) {
        needsNewline = true;
        indent = indentCalc.getFirstItemIndent(
          state.subqueryDepth,
          state.ddlDepth,
        );
        state.isFirstListItem = false;
      } else if (state.isFirstListItem) {
        state.isFirstListItem = false;
      }
    }
  }

  // First assignment after SET
  if (
    !ctx.isSetComma &&
    state.afterSetKeyword &&
    symbolicName !== 'SET' &&
    state.isFirstListItem
  ) {
    if (state.currentClauseIsMultiItem) {
      needsNewline = true;
      indent = indentCalc.getFirstItemIndent(
        state.subqueryDepth,
        state.ddlDepth,
      );
    }
    state.isFirstListItem = false;
    state.afterSetKeyword = false;
  }

  // First tuple after VALUES
  if (
    !ctx.isValuesComma &&
    state.afterValuesKeyword &&
    symbolicName !== 'VALUES' &&
    state.isFirstListItem
  ) {
    if (!isShortValues) {
      needsNewline = true;
      indent = baseIndent;
    }
    state.isFirstListItem = false;
    state.afterValuesKeyword = false;
  }

  // First condition after WHERE/HAVING
  if (
    !ctx.isConditionOperator &&
    (state.afterWhereKeyword || state.afterHavingKeyword)
  ) {
    if (symbolicName !== 'WHERE' && symbolicName !== 'HAVING') {
      needsNewline = true;
      indent = indentCalc.getCommaIndent(state.subqueryDepth, state.ddlDepth);
      state.afterWhereKeyword = false;
      state.afterHavingKeyword = false;
    }
  }

  return { needsNewline, indent };
}
