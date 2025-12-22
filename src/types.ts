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
}

/**
 * Information about a window definition that may need line-width expansion.
 */
export interface WindowDefInfo {
    closeParenIndex: number;
    orderByTokenIndex: number | null;
    windowFrameTokenIndex: number | null;
    spanLength: number;
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
    
    // JOIN handling
    joinOnTokens: Set<number>;
    
    // CTE handling
    cteCommas: Set<number>;
    
    // DDL handling
    ddlColumnCommas: Set<number>;
    ddlOpenParens: Set<number>;
    ddlCloseParens: Set<number>;
    ddlFirstColumn: Set<number>;
    ddlMultiColumn: Set<number>;
    
    // DML handling
    valuesCommas: Set<number>;
    setClauseCommas: Set<number>;
    setKeywordToken: number;
    
    // CASE expression handling
    multiWhenCaseTokens: Set<number>;
    caseWhenTokens: Set<number>;
    caseElseTokens: Set<number>;
    caseEndTokens: Set<number>;
    
    // Grouping analytics (ROLLUP/CUBE/GROUPING SETS)
    groupingAnalyticsParens: Set<number>;
    
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
 * Represents a pending comment to be output.
 */
export interface PendingComment {
    text: string;
    type: number;
    wasOnOwnLine: boolean;
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
