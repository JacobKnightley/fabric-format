/**
 * Cell Formatter
 *
 * Low-level API for formatting raw cell content by type.
 * Use this when you already know the cell type (e.g., from a Chrome extension
 * that reads the cell metadata directly).
 *
 * ## API Design
 *
 * The cell formatter provides three functions with different async/sync behavior:
 *
 * | Function | Spark SQL | Python/PySpark | Use Case |
 * |----------|-----------|----------------|----------|
 * | `formatCell` | Sync | Sync (needs prior init) | Main API after init |
 * | `formatCellSync` | Sync | N/A (type error) | SQL-only formatting |
 * | `formatCellAsync` | Sync | Async (waits for init) | Safe during init |
 *
 * ### Why Python Cannot Be Synchronous
 *
 * Python formatting uses Ruff compiled to WebAssembly. WASM modules must be
 * loaded asynchronously in both browsers and Node.js. There is no way to
 * synchronously initialize the Python formatter.
 *
 * ### Recommended Usage
 *
 * 1. **Application startup**: Call `await initializePythonFormatter()` once
 * 2. **Runtime**: Use `formatCell()` for all formatting (sync for both languages)
 *
 * If you cannot guarantee initialization order, use `formatCellAsync()` which
 * will wait for any in-progress initialization.
 *
 * @example
 * ```typescript
 * import { formatCell, formatCellSync, initializePythonFormatter } from '@jacobknightley/fabric-format';
 *
 * // Format Spark SQL (synchronous)
 * const result = formatCellSync('select * from table', 'sparksql');
 * console.log(result.formatted); // 'SELECT * FROM table'
 *
 * // Format Python (async - needs initialization)
 * await initializePythonFormatter();
 * const result = formatCell('x=1', 'python');
 * console.log(result.formatted); // 'x = 1'
 * ```
 */

import {
  type FormattingContext,
  formatErrorWithContext,
  getFormatterRegistry,
} from './formatters/index.js';
import {
  getMarkdownFormatter,
  resetMarkdownFormatter,
  type WasmInitOptions as MarkdownWasmInitOptions,
} from './formatters/markdown/index.js';
import {
  getPythonFormatter,
  resetPythonFormatter,
  type WasmInitOptions,
} from './formatters/python/index.js';
import { formatSql as formatSqlDirect } from './formatters/sparksql/index.js';

// ============================================================================
// Types
// ============================================================================

/** Result from formatCell */
export interface FormatCellResult {
  /** The formatted content */
  formatted: string;
  /** Whether the content was changed */
  changed: boolean;
  /** Error message if formatting failed */
  error?: string;
}

/** Supported cell types for formatCell */
export type CellType = 'sparksql' | 'python' | 'pyspark' | 'markdown'; // Includes Markdown

// ============================================================================
// Python Formatter State
// ============================================================================

/** State for Python formatter initialization */
let pythonFormatterReady = false;
let pythonFormatterInitPromise: Promise<void> | null = null;

/**
 * Initialize the Python formatter (must be called before formatting Python cells).
 * This is async because the Ruff WASM module needs to be loaded.
 *
 * This function is idempotent and safe to call concurrently - all callers will
 * wait for the same initialization promise.
 *
 * @param options - Optional WASM initialization options for browser environments.
 *   - wasmUrl: URL to the .wasm file (use this in Chrome extensions with chrome.runtime.getURL)
 *   - wasmBinary: WASM binary as ArrayBuffer or Uint8Array (for sync initialization)
 */
export async function initializePythonFormatter(
  options?: WasmInitOptions,
): Promise<void> {
  // Fast path: already initialized
  if (pythonFormatterReady) return;

  // If initialization is in progress, wait for it
  if (pythonFormatterInitPromise) {
    return pythonFormatterInitPromise;
  }

  // Create the initialization promise and store it IMMEDIATELY (synchronously)
  // This ensures any concurrent calls will see this promise and wait for it
  // rather than starting their own initialization.
  //
  // Note: In JavaScript's single-threaded model, there's no preemption between
  // the check above and this assignment, so this is safe. The promise is stored
  // before any await yields control.
  pythonFormatterInitPromise = (async () => {
    try {
      // If options provided, reset the formatter to use new options
      if (options) {
        resetPythonFormatter();
      }

      // Get or create the formatter with options
      const pythonFormatter = getPythonFormatter(options);

      // Re-register in the registry so formatCell uses the correct instance
      const registry = getFormatterRegistry();
      registry.register(pythonFormatter);

      if (!pythonFormatter.isReady()) {
        await pythonFormatter.initialize();
      }
      pythonFormatterReady = true;
    } catch (error) {
      // Reset promise on failure so retry is possible
      pythonFormatterInitPromise = null;
      throw error;
    }
  })();

  return pythonFormatterInitPromise;
}

/**
 * Check if Python formatter is ready.
 */
export function isPythonFormatterReady(): boolean {
  return pythonFormatterReady;
}

/**
 * Get the current initialization promise (for testing/internal use).
 * Returns null if initialization has not started.
 */
export function getPythonFormatterInitPromise(): Promise<void> | null {
  return pythonFormatterInitPromise;
}

/**
 * Reset the Python formatter state (for testing only).
 * This allows re-initialization with different options.
 */
export function resetPythonFormatterState(): void {
  pythonFormatterReady = false;
  pythonFormatterInitPromise = null;
  resetPythonFormatter();
}

// ============================================================================
// Markdown Formatter State
// ============================================================================

/** State for Markdown formatter initialization */
let markdownFormatterReady = false;
let markdownFormatterInitPromise: Promise<void> | null = null;

/**
 * Initialize the Markdown formatter (must be called before formatting Markdown cells).
 * This is async because the dprint WASM module needs to be loaded.
 *
 * This function is idempotent and safe to call concurrently - all callers will
 * wait for the same initialization promise.
 *
 * @param options - Optional WASM initialization options for browser environments.
 *   - wasmUrl: URL to the .wasm file (use this in Chrome extensions with chrome.runtime.getURL)
 *   - wasmBinary: WASM binary as ArrayBuffer or Uint8Array (for sync initialization)
 */
export async function initializeMarkdownFormatter(
  options?: MarkdownWasmInitOptions,
): Promise<void> {
  // Fast path: already initialized
  if (markdownFormatterReady) return;

  // If initialization is in progress, wait for it
  if (markdownFormatterInitPromise) {
    return markdownFormatterInitPromise;
  }

  // Create the initialization promise and store it IMMEDIATELY (synchronously)
  markdownFormatterInitPromise = (async () => {
    try {
      // If options provided, reset the formatter to use new options
      if (options) {
        resetMarkdownFormatter();
      }

      // Get or create the formatter with options
      const markdownFormatter = getMarkdownFormatter(options);

      // Re-register in the registry so formatCell uses the correct instance
      const registry = getFormatterRegistry();
      registry.register(markdownFormatter);

      if (!markdownFormatter.isReady()) {
        await markdownFormatter.initialize();
      }
      markdownFormatterReady = true;
    } catch (error) {
      // Reset promise on failure so retry is possible
      markdownFormatterInitPromise = null;
      throw error;
    }
  })();

  return markdownFormatterInitPromise;
}

/**
 * Check if Markdown formatter is ready.
 */
export function isMarkdownFormatterReady(): boolean {
  return markdownFormatterReady;
}

/**
 * Get the current Markdown initialization promise (for testing/internal use).
 * Returns null if initialization has not started.
 */
export function getMarkdownFormatterInitPromise(): Promise<void> | null {
  return markdownFormatterInitPromise;
}

/**
 * Reset the Markdown formatter state (for testing only).
 * This allows re-initialization with different options.
 */
export function resetMarkdownFormatterState(): void {
  markdownFormatterReady = false;
  markdownFormatterInitPromise = null;
  resetMarkdownFormatter();
}

// ============================================================================
// Language Detection for Lazy Initialization
// ============================================================================

/**
 * Detect which languages are present in notebook content.
 * Uses fast regex patterns - does NOT parse the full notebook structure.
 *
 * This enables lazy initialization: only load formatters for languages actually used.
 *
 * @param content Raw notebook file content
 * @returns Set of language identifiers that need formatting
 *
 * @example
 * ```typescript
 * const languages = detectLanguagesInContent(notebookContent);
 * // languages might be Set { 'sql', 'python' }
 * await initializeFormatters(languages);
 * ```
 */
export function detectLanguagesInContent(content: string): Set<string> {
  const languages = new Set<string>();

  // Pattern: "language": "xxx" in METADATA blocks
  const languagePattern = /"language"\s*:\s*"(\w+)"/g;
  let match = languagePattern.exec(content);
  while (match !== null) {
    const lang = match[1].toLowerCase();
    // Normalize language names
    if (lang === 'sparksql' || lang === 'sql') {
      languages.add('sql');
    } else if (lang === 'python' || lang === 'pyspark') {
      languages.add('python');
    } else if (lang === 'scala') {
      languages.add('scala');
    } else if (lang === 'r') {
      languages.add('r');
    } else if (lang === 'markdown' || lang === 'md') {
      languages.add('markdown');
    }
    match = languagePattern.exec(content);
  }

  // Also check for MAGIC commands (in case metadata is missing)
  if (content.includes('%%sql')) {
    languages.add('sql');
  }
  if (content.includes('%%python') || content.includes('%%pyspark')) {
    languages.add('python');
  }
  if (content.includes('%%scala')) {
    languages.add('scala');
  }
  if (content.includes('%%r') || content.includes('%%R')) {
    languages.add('r');
  }
  // Check for MARKDOWN cell markers
  if (
    content.includes('# MARKDOWN') ||
    content.includes('// MARKDOWN') ||
    content.includes('-- MARKDOWN')
  ) {
    languages.add('markdown');
  }

  return languages;
}

/**
 * Initialize formatters for the specified languages in parallel.
 *
 * This is the recommended way to initialize formatters when you know
 * which languages you'll need. Unneeded formatters are not loaded.
 *
 * @param languages Set of language identifiers to initialize
 * @param options Optional WASM options for Python formatter
 *
 * @example
 * ```typescript
 * // Scan files first
 * const languages = detectLanguagesInContent(content);
 *
 * // Initialize only what's needed (parallel)
 * await initializeFormatters(languages);
 *
 * // Now format cells
 * formatCell(code, 'python');
 * ```
 */
export async function initializeFormatters(
  languages: Set<string>,
  options?: WasmInitOptions,
): Promise<void> {
  const promises: Promise<void>[] = [];

  // SQL formatter is synchronous (no init needed)
  // Python formatter needs async WASM loading
  if (languages.has('python') && !pythonFormatterReady) {
    promises.push(initializePythonFormatter(options));
  }

  // Markdown formatter needs async WASM loading
  if (languages.has('markdown') && !markdownFormatterReady) {
    promises.push(initializeMarkdownFormatter(options as MarkdownWasmInitOptions));
  }

  // Future: Add scala, r formatters here
  // if (languages.has('scala')) {
  //   promises.push(initializeScalaFormatter());
  // }
  // if (languages.has('r')) {
  //   promises.push(initializeRFormatter());
  // }

  await Promise.all(promises);
}

// ============================================================================
// Cell Formatting API
// ============================================================================

/**
 * Format a single cell's content based on its type.
 *
 * This is the low-level API for formatting raw code content.
 * Use this when you already know the cell type (e.g., from a Chrome extension
 * that reads the cell metadata directly).
 *
 * @param content Raw cell content (no comment wrappers like `# MAGIC`)
 * @param cellType The cell type from metadata (e.g., 'sparksql', 'python', 'pyspark')
 * @param context Optional context for enriching error messages (cell index, file path)
 * @returns Formatted content and status
 *
 * @example
 * ```typescript
 * // Format Spark SQL
 * const result = formatCell('select * from table', 'sparksql');
 * console.log(result.formatted); // 'SELECT * FROM table'
 *
 * // Format Python (must initialize first)
 * await initializePythonFormatter();
 * const result = formatCell('x=1', 'python');
 * console.log(result.formatted); // 'x = 1'
 *
 * // With context for better error messages
 * const result = formatCell(code, 'python', { cellIndex: 5, filePath: 'notebook.py' });
 * // On error: "Format error in cell 5 of notebook.py: syntax error"
 * ```
 */
export function formatCell(
  content: string,
  cellType: CellType,
  context?: FormattingContext,
): FormatCellResult {
  const type = cellType.toLowerCase() as CellType;
  // Enrich context with language info
  const enrichedContext: FormattingContext | undefined = context
    ? { ...context, language: type }
    : undefined;

  switch (type) {
    case 'sparksql':
      try {
        const formatted = formatSqlDirect(content);
        return {
          formatted,
          changed: formatted !== content,
        };
      } catch (error) {
        const baseError = `Spark SQL format error: ${error}`;
        return {
          formatted: content,
          changed: false,
          error: formatErrorWithContext(baseError, enrichedContext),
        };
      }

    case 'python':
    case 'pyspark': {
      const registry = getFormatterRegistry();
      const pythonFormatter = registry.get('python');

      if (!pythonFormatter?.isReady()) {
        const baseError =
          'Python formatter not initialized. Call initializePythonFormatter() first.';
        return {
          formatted: content,
          changed: false,
          error: formatErrorWithContext(baseError, enrichedContext),
        };
      }

      const result = pythonFormatter.format(content, {
        stripTrailingNewline: true,
      } as any);

      return {
        formatted: result.formatted,
        changed: result.changed,
        error: result.error
          ? formatErrorWithContext(result.error, enrichedContext)
          : undefined,
      };
    }

    case 'markdown': {
      const registry = getFormatterRegistry();
      const markdownFormatter = registry.get('markdown');

      if (!markdownFormatter?.isReady()) {
        const baseError =
          'Markdown formatter not initialized. Call initializeMarkdownFormatter() first.';
        return {
          formatted: content,
          changed: false,
          error: formatErrorWithContext(baseError, enrichedContext),
        };
      }

      const result = markdownFormatter.format(content, {
        stripTrailingNewline: true,
      } as any);

      return {
        formatted: result.formatted,
        changed: result.changed,
        error: result.error
          ? formatErrorWithContext(result.error, enrichedContext)
          : undefined,
      };
    }

    default:
      // Unsupported cell type - return unchanged
      return {
        formatted: content,
        changed: false,
      };
  }
}

/**
 * Synchronous version of formatCell for Spark SQL only.
 *
 * This function provides a type-safe way to format SQL without async.
 * The cellType parameter is restricted to 'sparksql' at the type level,
 * preventing accidental use with Python (which requires async initialization).
 *
 * Note: Python/PySpark cannot be formatted synchronously because the Ruff
 * WASM module requires async initialization. Use `formatCellAsync()` or
 * call `initializePythonFormatter()` before using `formatCell()`.
 *
 * @param content Raw cell content
 * @param cellType The cell type (must be 'sparksql')
 * @param context Optional context for enriching error messages
 */
export function formatCellSync(
  content: string,
  cellType: 'sparksql',
  context?: FormattingContext,
): FormatCellResult {
  return formatCell(content, cellType, context);
}

/**
 * Async version of formatCell that waits for Python formatter initialization.
 *
 * Use this when you're not sure if the Python formatter is initialized yet.
 * It will wait for any in-progress initialization to complete before formatting.
 *
 * @param content Raw cell content
 * @param cellType The cell type from metadata
 * @param context Optional context for enriching error messages
 * @returns Promise resolving to formatted content and status
 *
 * @example
 * ```typescript
 * // Safe to call even if init is in progress
 * initializePythonFormatter(); // Note: not awaited
 * const result = await formatCellAsync('x=1', 'python');
 * console.log(result.formatted); // 'x = 1'
 * ```
 */
export async function formatCellAsync(
  content: string,
  cellType: CellType,
  context?: FormattingContext,
): Promise<FormatCellResult> {
  const type = cellType.toLowerCase() as CellType;
  // Enrich context with language info
  const enrichedContext: FormattingContext | undefined = context
    ? { ...context, language: type }
    : undefined;

  // For Python/PySpark, wait for initialization if in progress
  if (type === 'python' || type === 'pyspark') {
    if (pythonFormatterInitPromise) {
      try {
        await pythonFormatterInitPromise;
      } catch (error) {
        const baseError = `Python formatter initialization failed: ${error}`;
        return {
          formatted: content,
          changed: false,
          error: formatErrorWithContext(baseError, enrichedContext),
        };
      }
    }
  }

  // For Markdown, wait for initialization if in progress
  if (type === 'markdown') {
    if (markdownFormatterInitPromise) {
      try {
        await markdownFormatterInitPromise;
      } catch (error) {
        const baseError = `Markdown formatter initialization failed: ${error}`;
        return {
          formatted: content,
          changed: false,
          error: formatErrorWithContext(baseError, enrichedContext),
        };
      }
    }
  }

  return formatCell(content, cellType, context);
}
