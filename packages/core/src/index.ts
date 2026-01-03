/**
 * sparkfmt - Spark SQL & Python Formatter
 *
 * A unified formatter for Spark SQL and Python code, designed for
 * Microsoft Fabric notebooks and CI/CD pipelines.
 *
 * Architecture:
 * - formatters/sql/: Core SQL formatting (ANTLR grammar-driven)
 * - formatters/python/: Python formatting via Ruff WASM
 * - notebook-formatter.ts: Fabric notebook handling
 */

// ============================================================================
// SQL Formatter (Core API)
// ============================================================================

export { formatSql, needsFormatting } from './formatters/sparksql/index.js';

// ============================================================================
// Language Formatters (Extensible)
// ============================================================================

export {
  detectLanguage,
  formatContextLocation,
  formatErrorWithContext,
  type FormatResult,
  type FormatterConfig,
  type FormatterOptions,
  type FormatterRegistry,
  type FormattingContext,
  // Registry
  getFormatterRegistry,
  getPythonFormatter,
  getSqlFormatter,
  isPythonCode,
  isSqlCode,
  // Types
  type LanguageFormatter,
  // Python
  PythonFormatter,
  // SQL
  SqlFormatter,
} from './formatters/index.js';

// ============================================================================
// Cell Formatter (Low-level API)
// ============================================================================

export {
  type CellType,
  type FormatCellResult,
  formatCell,
  formatCellAsync,
  formatCellSync,
  getPythonFormatterInitPromise,
  initializePythonFormatter,
  isPythonFormatterReady,
  resetPythonFormatterState,
} from './cell-formatter.js';

// ============================================================================
// Notebook Formatter (High-level API)
// ============================================================================

export {
  type FabricNotebook,
  type FormatStats,
  formatNotebook,
  type NotebookCell,
  NotebookStructureError,
  parseNotebook,
} from './notebook-formatter.js';

// ============================================================================
// Configuration (Python/Ruff)
// ============================================================================

export {
  DEFAULT_RUFF_CONFIG,
  RUFF_WASM_CONFIG,
  type RuffConfig,
  type RuffFormatConfig,
  type WasmInitOptions,
} from './formatters/python/index.js';

// ============================================================================
// Format Directives (Spark SQL)
// ============================================================================

export {
  detectCollapseDirectives,
  type FormatDirectiveInfo,
  hasCollapseDirective,
  hasFormatOff,
} from './formatters/sparksql/index.js';

// ============================================================================
// Types (for library consumers)
// ============================================================================

export type {
  AnalyzerResult,
  ExpandedFunction,
  ExpandedWindow,
  FormattingState,
  MultiArgFunctionInfo,
  PendingComment,
  TokenContext,
  WindowDefInfo,
} from './formatters/sparksql/types.js';
