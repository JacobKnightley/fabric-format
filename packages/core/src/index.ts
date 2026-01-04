/**
 * @jacobknightley/fabric-format - Spark SQL & Python Formatter
 *
 * A zero-config formatter for Microsoft Fabric notebooks supporting
 * Spark SQL and Python. Designed for use in CI/CD pipelines and
 * browser extensions.
 *
 * Architecture:
 * - formatters/sparksql/: Core SQL formatting (ANTLR grammar-driven)
 * - formatters/python/: Python formatting via Ruff WASM
 * - cell-formatter.ts: Language detection & routing
 * - notebook-formatter.ts: Fabric notebook file handling
 *
 * @packageDocumentation
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
  type FormatResult,
  type FormatterConfig,
  type FormatterOptions,
  type FormatterRegistry,
  type FormattingContext,
  formatContextLocation,
  formatErrorWithContext,
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
  detectLanguagesInContent,
  type FormatCellResult,
  formatCell,
  formatCellAsync,
  formatCellSync,
  getPythonFormatterInitPromise,
  initializeFormatters,
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
// File Utilities
// ============================================================================

export { isSupportedFile, SUPPORTED_EXTENSIONS } from './file-utils.js';
