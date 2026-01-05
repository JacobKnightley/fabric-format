/**
 * Markdown Formatter - Module Exports
 *
 * Markdown formatting using dprint WASM.
 */

// ============================================================================
// FORMATTER CLASS (LanguageFormatter interface)
// ============================================================================

export {
  getMarkdownFormatter,
  isMarkdownCode,
  MarkdownFormatter,
  type MarkdownFormatterOptions,
  resetMarkdownFormatter,
  type WasmInitOptions,
} from './markdown-formatter.js';

// ============================================================================
// CONFIGURATION (types only, no file loading)
// ============================================================================

export {
  MARKDOWN_GLOBAL_CONFIG,
  type MarkdownGlobalConfig,
  MARKDOWN_PLUGIN_CONFIG,
  type MarkdownPluginConfig,
} from './config.js';
