/**
 * Spark SQL Formatter - Module Exports
 *
 * This is the 100% grammar-driven SQL formatter for Apache Spark SQL.
 * All modules in this directory work together to format SQL.
 */

// ============================================================================
// PUBLIC API
// ============================================================================

export { formatSql, needsFormatting } from './formatter.js';

// ============================================================================
// FORMATTER CLASS (LanguageFormatter interface)
// ============================================================================

export { getSqlFormatter, isSqlCode, SqlFormatter } from './sql-formatter.js';

// ============================================================================
// FORMAT DIRECTIVES
// ============================================================================

export {
  detectCollapseDirectives,
  type FormatDirectiveInfo,
  hasCollapseDirective,
  hasFormatOff,
  isFmtInlineComment,
} from './fmt-detector.js';

// ============================================================================
// CONSTANTS
// ============================================================================

export { MAX_LINE_WIDTH } from './constants.js';

// ============================================================================
// TYPES (for library consumers)
// ============================================================================

export type {
  AnalyzerResult,
  ExpandedFunction,
  ExpandedPivot,
  ExpandedWindow,
  FormattingState,
  InListInfo,
  MultiArgFunctionInfo,
  NestedFunctionInfo,
  PendingComment,
  PivotInfo,
  SimpleQueryInfo,
  TokenContext,
  WindowDefInfo,
} from './types.js';
