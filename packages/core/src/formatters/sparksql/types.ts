/**
 * Type Definitions for Spark SQL Formatter
 *
 * Central location for all TypeScript interfaces used across the formatter.
 * This improves code readability and enables better IDE support.
 */

// ============================================================================
// ANALYZER RESULT TYPES
// ============================================================================

/**
 * Information about a multi-argument function that may need line-width expansion.
 */
export interface MultiArgFunctionInfo {
  closeParenIndex: number;
  commaIndices: number[];
  spanLength: number;
  functionName?: string; // For special handling (e.g., STACK pairs)
  charStart: number; // Character position of the LEFT_PAREN for relative offset calculation
}

/**
 * Nested function position info for expansion checking.
 */
export interface NestedFunctionInfo {
  funcIdx: number; // Token index of the function's LEFT_PAREN
  relativeOffset: number; // Character offset from parent construct's start
}

/**
 * Information about a window definition that may need line-width expansion.
 */
export interface WindowDefInfo {
  closeParenIndex: number;
  orderByTokenIndex: number | null;
  windowFrameTokenIndex: number | null;
  spanLength: number;
  nestedFunctions: NestedFunctionInfo[]; // Nested functions with their relative offsets
}

/**
 * Information about a PIVOT/UNPIVOT clause that may need expansion.
 */
export interface PivotInfo {
  /** Opening LEFT_PAREN token index */
  openParenIndex: number;
  /** Closing RIGHT_PAREN token index */
  closeParenIndex: number;
  /** Comma indices in the aggregates list (before FOR) */
  aggregateCommaIndices: Set<number>;
  /** FOR keyword token index */
  forKeywordIndex: number | null;
  /** IN keyword token index */
  inKeywordIndex: number | null;
  /** Comma indices in the IN list */
  inListCommaIndices: Set<number>;
  /** Total span length for line width calculation */
  spanLength: number;
  /** Whether this is UNPIVOT (vs PIVOT) */
  isUnpivot: boolean;
}

/**
 * Information about an IN list (WHERE IN or PIVOT IN) for wrapping.
 */
export interface InListInfo {
  /** Opening LEFT_PAREN token index (after IN keyword) */
  openParenIndex: number;
  /** Closing RIGHT_PAREN token index */
  closeParenIndex: number;
  /** Comma indices in the IN list */
  commaIndices: Set<number>;
  /** Whether this is inside a PIVOT clause */
  isInPivot: boolean;
  /** Precomputed item lengths: itemLengths[i] = length of item after comma i (or first item if i=-1) */
  itemLengths: Map<number, number>;
}

/**
 * Information about a simple query that can stay compact (on one line).
 * A query is simple if it has single-item clauses and fits within line width.
 */
export interface SimpleQueryInfo {
  /** Token index of the SELECT keyword */
  selectTokenIndex: number;
  /** Total span length of the entire query */
  spanLength: number;
  /** Subquery depth (0 = main query) */
  depth: number;
}

/**
 * Complete result from ParseTreeAnalyzer.
 * Contains all token positions that need special handling during formatting.
 */
export interface AnalyzerResult {
  // Token position sets
  identifierTokens: Set<number>;
  functionCallTokens: Set<number>;
  clauseStartTokens: Set<number>;
  qualifiedNameTokens: Set<number>; // Tokens that are part of qualified names (t.column)

  // List formatting
  listItemCommas: Set<number>;
  listFirstItems: Set<number>;
  multiItemClauses: Set<number>;

  // Condition formatting (WHERE/HAVING)
  conditionOperators: Set<number>;
  multilineConditionClauses: Set<number>;
  betweenAndTokens: Set<number>;

  // Subquery tracking
  tokenDepthMap: Map<number, number>;
  subqueryOpenParens: Set<number>;
  subqueryCloseParens: Set<number>;
  setOperandParens: Set<number>;

  // Alias handling
  aliasInsertPositions: Set<number>;
  tableAliasAsTokens: Set<number>; // AS tokens in table alias context (to be suppressed)

  // JOIN handling
  joinOnTokens: Set<number>;

  // CTE handling
  cteCommas: Set<number>;
  cteMainSelectTokens: Set<number>; // SELECT tokens of main query after CTE block

  // DDL handling
  ddlColumnCommas: Set<number>;
  ddlOpenParens: Set<number>;
  ddlCloseParens: Set<number>;
  ddlFirstColumn: Set<number>;
  ddlMultiColumn: Set<number>;

  // DML handling
  valuesCommas: Set<number>;
  valuesHasTuples: boolean; // true if VALUES contains tuples like (a, b), (c, d)
  setClauseCommas: Set<number>;
  setKeywordToken: number;

  // CASE expression handling
  multiWhenCaseTokens: Set<number>;
  caseWhenTokens: Set<number>;
  caseElseTokens: Set<number>;
  caseEndTokens: Set<number>;
  simpleCaseTokens: Set<number>; // CASE tokens that have value expressions (simpleCase)
  simpleCaseValueEndTokens: Set<number>; // Position after value in CASE x WHEN ...

  // Grouping analytics (ROLLUP/CUBE/GROUPING SETS)
  groupingAnalyticsParens: Set<number>;

  // EXCEPT clause (column exclusion in SELECT)
  exceptClauseTokens: Set<number>;

  // SET configuration
  setConfigTokens: Set<number>;

  // MERGE statement
  mergeUsingTokens: Set<number>;
  mergeOnTokens: Set<number>;
  mergeWhenTokens: Set<number>;

  // LATERAL VIEW
  lateralViewCommas: Set<number>;

  // GROUP BY ALL
  groupByAllTokens: Set<number>;

  // Multi-arg function expansion
  multiArgFunctionInfo: Map<number, MultiArgFunctionInfo>;

  // Window definition expansion
  windowDefInfo: Map<number, WindowDefInfo>;

  // PIVOT/UNPIVOT expansion
  pivotInfo: Map<number, PivotInfo>;

  // IN list wrapping (WHERE IN and PIVOT IN)
  inListInfo: Map<number, InListInfo>;

  // Pre-computed set of all IN list comma token indices for O(1) lookup
  allInListCommas: Set<number>;

  // Simple query compaction
  simpleQueries: Map<number, SimpleQueryInfo>;
}

// ============================================================================
// FORMATTING CONTEXT TYPES
// ============================================================================

/**
 * Tracks the current state during token formatting.
 * Used to determine spacing, newlines, and indentation.
 */
export interface FormattingState {
  // Depth tracking
  subqueryDepth: number;
  ddlDepth: number;
  caseDepth: number;
  insideParens: number;
  insideFunctionArgs: number;
  complexTypeDepth: number; // Tracks nesting in ARRAY<>, MAP<>, STRUCT<>

  // Position tracking
  currentColumn: number;
  isFirstNonWsToken: boolean;

  // Clause state
  afterSelectKeyword: boolean;
  afterGroupByKeyword: boolean;
  afterOrderByKeyword: boolean;
  afterWhereKeyword: boolean;
  afterHavingKeyword: boolean;
  afterSetKeyword: boolean;
  afterValuesKeyword: boolean;

  // List state
  currentClauseIsMultiItem: boolean;
  isFirstListItem: boolean;
  justOutputCommaFirstStyle: boolean;

  // Previous token tracking
  prevWasFunctionName: boolean;
  prevWasBuiltInFunctionKeyword: boolean;
  prevTokenText: string;
  prevTokenType: number;
  prevTokenWasUnaryOperator: boolean;

  // Hint handling
  insideHint: boolean;
  hintContent: string[];

  // Multi-arg function expansion state
  justOutputMultiArgFunctionNewline: boolean;

  // Window expansion state
  justOutputWindowNewline: boolean;

  // PIVOT/UNPIVOT expansion state
  justOutputPivotNewline: boolean;

  // IN list wrapping state
  /** Current column where IN list content started (after open paren) */
  inListContentStartColumn: number | null;
  /** Whether we're currently inside an IN list */
  insideInList: boolean;
  /** Just output an IN list wrap newline - skip space before next token */
  justOutputInListWrapNewline: boolean;

  // Simple query compaction state - stack-based for nested queries
  /** Stack of compact query state per subquery level */
  compactQueryStack: Array<{ isCompact: boolean; depth: number }>;
}

/**
 * Represents an expanded multi-arg function on the stack.
 */
export interface ExpandedFunction {
  closeParenIndex: number;
  commaIndices: Set<number>;
  depth: number;
  openingColumn: number;
  firstArgIsChainedFunc: boolean;
  functionName?: string; // For special handling (e.g., STACK pairs)
  /** For STACK: indices of commas that should NOT get newlines (every other comma) */
  skipNewlineCommas?: Set<number>;
}

/**
 * Represents an expanded window definition.
 */
export interface ExpandedWindow {
  closeParenIndex: number;
  orderByTokenIndex: number | null;
  windowFrameTokenIndex: number | null;
  baseDepth: number;
}

/**
 * Represents an expanded PIVOT/UNPIVOT clause.
 */
export interface ExpandedPivot {
  closeParenIndex: number;
  /** Commas in aggregate list */
  aggregateCommaIndices: Set<number>;
  /** FOR keyword index */
  forKeywordIndex: number | null;
  /** IN keyword index */
  inKeywordIndex: number | null;
  /** Commas in IN list */
  inListCommaIndices: Set<number>;
  /** Depth for indentation */
  depth: number;
  /** Column where PIVOT started */
  openingColumn: number;
}

/**
 * Represents a pending comment to be output.
 */
export interface PendingComment {
  text: string;
  type: number;
  wasOnOwnLine: boolean;
  /** True if there was a blank line before this comment (for preserving paragraph breaks) */
  hadBlankLineBefore: boolean;
}

// ============================================================================
// TOKEN TYPES
// ============================================================================

/**
 * Context information for a single token during formatting.
 */
export interface TokenContext {
  tokenIndex: number;
  tokenType: number;
  text: string;
  symbolicName: string | null;

  // Context flags from analyzer
  isInIdentifierContext: boolean;
  isFunctionCall: boolean;
  isClauseStart: boolean;
  isListComma: boolean;
  isConditionOperator: boolean;
  isBetweenAnd: boolean;
  isJoinOn: boolean;
  isSubqueryOpenParen: boolean;
  isSubqueryCloseParen: boolean;
  isSetOperandParen: boolean;
  isCteComma: boolean;
  isDdlComma: boolean;
  isDdlOpenParen: boolean;
  isDdlCloseParen: boolean;
  isDdlMultiColumn: boolean;
  isValuesComma: boolean;
  isSetComma: boolean;
  isSetKeyword: boolean;
  isLateralViewComma: boolean;

  // CASE expression flags
  isMultiWhenCase: boolean;
  isCaseWhen: boolean;
  isCaseElse: boolean;
  isCaseEnd: boolean;

  // MERGE flags
  isMergeUsing: boolean;
  isMergeOn: boolean;
  isMergeWhen: boolean;

  // Multi-arg function info (if this token is opening paren of multi-arg func)
  multiArgFuncInfo: MultiArgFunctionInfo | undefined;

  // Window def info (if this token is opening paren of window def)
  windowDefInfo: WindowDefInfo | undefined;
}
