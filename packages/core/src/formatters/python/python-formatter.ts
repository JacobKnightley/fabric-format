/**
 * Python Formatter
 *
 * Uses Ruff WASM to format Python/PySpark code.
 * Handles Jupyter/IPython magic commands by preserving them.
 */

import type {
  FormatResult,
  FormatterOptions,
  LanguageFormatter,
} from '../types.js';
import { RUFF_LINT_CONFIG, RUFF_WASM_CONFIG } from './config.js';
import { formatSparkSqlInPython } from './spark-sql-formatter.js';

// Dynamic import for ruff WASM (loaded on demand)
let ruffModule: typeof import('@astral-sh/ruff-wasm-web') | null = null;
let formatWorkspace: InstanceType<
  typeof import('@astral-sh/ruff-wasm-web').Workspace
> | null = null;
let lintWorkspace: InstanceType<
  typeof import('@astral-sh/ruff-wasm-web').Workspace
> | null = null;

/**
 * Detect if we're running in Node.js
 */
function isNodeEnvironment(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null
  );
}

/**
 * Find the WASM file path relative to the ruff-wasm-web package in Node.js.
 * Uses indirect dynamic imports to avoid bundler static analysis.
 */
async function findWasmFileForNode(): Promise<Uint8Array> {
  // Use Function constructor to create dynamic import that bundlers can't statically analyze
  // This is intentional - these modules only exist in Node.js, not in browsers
  const dynamicImport = new Function('specifier', 'return import(specifier)');

  const { createRequire } = await dynamicImport('module');
  const { dirname, join } = await dynamicImport('path');
  const { readFile } = await dynamicImport('fs/promises');

  // Get the path to ruff-wasm-web package
  // We need import.meta.url to create a require function
  // Use a fallback for bundled environments (though this path shouldn't be hit in browsers)
  let ruffWasmDir: string | undefined;
  try {
    const require = createRequire(import.meta.url);
    const ruffWasmPath = require.resolve('@astral-sh/ruff-wasm-web');
    ruffWasmDir = dirname(ruffWasmPath);
  } catch {
    // Fallback: try to find it via node_modules traversal
    const { fileURLToPath } = await dynamicImport('url');
    const currentDir = dirname(fileURLToPath(import.meta.url));
    // Walk up to find node_modules
    let searchDir = currentDir;
    const { existsSync } = await dynamicImport('fs');
    while (searchDir !== dirname(searchDir)) {
      const candidate = join(
        searchDir,
        'node_modules',
        '@astral-sh',
        'ruff-wasm-web',
      );
      if (existsSync(candidate)) {
        ruffWasmDir = candidate;
        break;
      }
      searchDir = dirname(searchDir);
    }
  }
  if (!ruffWasmDir) {
    throw new Error('Could not locate @astral-sh/ruff-wasm-web package');
  }

  const wasmPath = join(ruffWasmDir, 'ruff_wasm_bg.wasm');
  return readFile(wasmPath);
}

/**
 * Ruff diagnostic edit location
 */
interface EditLocation {
  row: number;
  column: number;
}

/**
 * Ruff diagnostic edit
 */
interface DiagnosticEdit {
  location: EditLocation;
  end_location: EditLocation;
  content?: string;
}

/**
 * Ruff diagnostic with optional fix
 */
interface Diagnostic {
  code: string;
  message: string;
  // Note: Ruff returns both 'location'/'end_location' AND 'start_location'/'end_location'
  // depending on the version. We support both.
  location?: EditLocation;
  start_location?: EditLocation;
  end_location: EditLocation;
  fix?: {
    message: string;
    edits: DiagnosticEdit[];
  };
}

/**
 * Apply safe lint auto-fixes to Python code.
 *
 * Runs ruff check with SAFE_LINT_RULES and applies any available fixes.
 * Loops until stable because some fixes (like PLR0402 + I001) interact -
 * PLR0402 changes import form, I001 re-sorts, which may trigger more fixes.
 *
 * @param code - The Python code to lint and fix
 * @returns The code with fixes applied, or original code if no fixes
 */
function applyLintFixes(code: string): string {
  if (!lintWorkspace) return code;

  const MAX_ITERATIONS = 5; // Safety limit to prevent infinite loops
  let current = code;

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const diagnostics: Diagnostic[] = lintWorkspace.check(current);

      // Filter to diagnostics that have fixes
      const fixableDiagnostics = diagnostics.filter(
        (d) => d.fix && d.fix.edits.length > 0,
      );

      if (fixableDiagnostics.length === 0) {
        return current; // No more fixes needed - stable!
      }

      // Sort diagnostics by their start position (bottom to top) so we can
      // apply fixes without position shifts affecting later edits.
      // Use the diagnostic's location, not individual edit locations.
      fixableDiagnostics.sort((a, b) => {
        const aLoc = a.start_location ?? a.location ?? { row: 0, column: 0 };
        const bLoc = b.start_location ?? b.location ?? { row: 0, column: 0 };
        if (aLoc.row !== bLoc.row) {
          return bLoc.row - aLoc.row; // Bottom first
        }
        return bLoc.column - aLoc.column; // Right first
      });

      // Track which ranges have been modified to avoid overlapping fixes
      // from different diagnostics
      const modifiedRanges: Array<{
        startRow: number;
        startCol: number;
        endRow: number;
        endCol: number;
      }> = [];

      // Apply each diagnostic's edits atomically (all edits from one diagnostic together)
      const lines = current.split('\n');

      for (const diagnostic of fixableDiagnostics) {
        if (!diagnostic.fix) continue;

        // Check if this diagnostic overlaps with any already-applied fix
        const diagLoc = diagnostic.start_location ??
          diagnostic.location ?? { row: 1, column: 1 };
        const diagStartRow = diagLoc.row - 1;
        const diagStartCol = diagLoc.column - 1;
        const diagEndRow = diagnostic.end_location.row - 1;
        const diagEndCol = diagnostic.end_location.column - 1;

        const overlapsWithModified = modifiedRanges.some((range) => {
          // Check if diagnostic range overlaps with modified range
          // Two ranges overlap if neither is completely before or after the other
          const diagBeforeRange =
            diagEndRow < range.startRow ||
            (diagEndRow === range.startRow && diagEndCol <= range.startCol);
          const diagAfterRange =
            diagStartRow > range.endRow ||
            (diagStartRow === range.endRow && diagStartCol >= range.endCol);
          return !diagBeforeRange && !diagAfterRange;
        });

        if (overlapsWithModified) {
          // Skip this diagnostic - it overlaps with a fix we already applied
          continue;
        }

        // Sort this diagnostic's edits in reverse order (bottom to top)
        // so applying them doesn't shift positions of earlier edits
        const edits = [...diagnostic.fix.edits].sort((a, b) => {
          if (a.location.row !== b.location.row) {
            return b.location.row - a.location.row;
          }
          return b.location.column - a.location.column;
        });

        // Apply all edits from this diagnostic
        for (const edit of edits) {
          const startRow = edit.location.row - 1;
          const startCol = edit.location.column - 1;
          const endRow = edit.end_location.row - 1;
          const endCol = edit.end_location.column - 1;
          const content = edit.content ?? '';

          if (startRow === endRow) {
            // Single-line edit
            const line = lines[startRow] ?? '';
            lines[startRow] =
              line.slice(0, startCol) + content + line.slice(endCol);
          } else {
            // Multi-line edit
            const startLine = lines[startRow] ?? '';
            const endLine = lines[endRow] ?? '';
            const newContent =
              startLine.slice(0, startCol) + content + endLine.slice(endCol);

            // Replace the affected lines
            lines.splice(startRow, endRow - startRow + 1, newContent);
          }
        }

        // Track the modified range
        modifiedRanges.push({
          startRow: diagStartRow,
          startCol: diagStartCol,
          endRow: diagEndRow,
          endCol: diagEndCol,
        });
      }

      // Update current for next iteration
      current = lines.join('\n');

      // Clean up multiple consecutive blank lines (keep at most 2 for PEP 8)
      current = current.replace(/\n{3,}/g, '\n\n');
    }

    // If we hit MAX_ITERATIONS, return what we have
    return current;
  } catch {
    // If linting fails, return original code
    return code;
  }
}

/**
 * Options for initializing the Ruff WASM module.
 *
 * Used primarily in browser environments (Chrome extensions) where the WASM
 * binary must be loaded from a specific URL or provided directly.
 *
 * In Node.js environments, the WASM module is loaded automatically from
 * the @astral-sh/ruff-wasm-web package, so these options are typically not needed.
 *
 * @example Browser extension with URL
 * ```typescript
 * const formatter = new PythonFormatter({
 *   wasmUrl: chrome.runtime.getURL('dist/ruff_wasm_bg.wasm')
 * });
 * ```
 *
 * @example Pre-loaded binary
 * ```typescript
 * const wasmBinary = await fetch('/ruff_wasm_bg.wasm').then(r => r.arrayBuffer());
 * const formatter = new PythonFormatter({ wasmBinary });
 * ```
 */
export interface WasmInitOptions {
  /**
   * URL to the .wasm file.
   * Use this in browser environments where the WASM file is served from a URL.
   * In Chrome extensions, use `chrome.runtime.getURL('path/to/ruff_wasm_bg.wasm')`.
   */
  wasmUrl?: string | URL;
  /**
   * Pre-loaded WASM binary for synchronous initialization.
   * Use this when you've already fetched the WASM file and want to avoid
   * an additional network request during initialization.
   */
  wasmBinary?: ArrayBuffer | Uint8Array;
}

/** Options specific to Python formatting */
export interface PythonFormatterOptions extends FormatterOptions {
  /** Strip trailing newlines from formatted output */
  stripTrailingNewline?: boolean;
}

/**
 * Python formatter using Ruff WASM.
 */
export class PythonFormatter implements LanguageFormatter {
  readonly language = 'python';
  readonly displayName = 'Python (Ruff)';

  private initialized = false;
  private initError: string | null = null;
  private wasmOptions: WasmInitOptions | undefined;

  /**
   * Create a new Python formatter.
   * @param options - Optional WASM initialization options for browser environments
   */
  constructor(options?: WasmInitOptions) {
    this.wasmOptions = options;
  }

  isReady(): boolean {
    return this.initialized && !this.initError;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import of ruff WASM
      ruffModule = await import('@astral-sh/ruff-wasm-web');

      // Initialize WASM module - this must be called before using any classes
      // The default export is the init function that loads the .wasm binary
      if (this.wasmOptions?.wasmBinary) {
        // Use synchronous initialization with provided binary
        ruffModule.initSync({ module: this.wasmOptions.wasmBinary });
      } else if (this.wasmOptions?.wasmUrl) {
        // Use async initialization with provided URL
        await ruffModule.default({ module_or_path: this.wasmOptions.wasmUrl });
      } else if (isNodeEnvironment()) {
        // Node.js: Load WASM file from disk
        const wasmBinary = await findWasmFileForNode();
        ruffModule.initSync({ module: wasmBinary });
      } else {
        // Browser: let ruff-wasm-web use import.meta.url to find the WASM file
        await ruffModule.default();
      }

      // Create workspaces with config
      // Note: ruff WASM prints debug info to stdout during Workspace creation
      // We suppress this by temporarily replacing stdout.write (Node.js only)
      const hasProcess =
        typeof process !== 'undefined' && process.stdout?.write;
      const originalWrite = hasProcess
        ? process.stdout.write.bind(process.stdout)
        : null;
      if (originalWrite) {
        process.stdout.write = () => true; // Suppress output
      }
      try {
        // Format workspace for code formatting
        formatWorkspace = new ruffModule.Workspace(
          RUFF_WASM_CONFIG,
          ruffModule.PositionEncoding.Utf32,
        );
        // Lint workspace for safe auto-fixes
        lintWorkspace = new ruffModule.Workspace(
          { ...RUFF_WASM_CONFIG, ...RUFF_LINT_CONFIG },
          ruffModule.PositionEncoding.Utf32,
        );
      } finally {
        if (originalWrite) {
          process.stdout.write = originalWrite; // Restore output
        }
      }

      this.initialized = true;
    } catch (error) {
      this.initError = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to initialize Python formatter: ${this.initError}`,
      );
    }
  }

  format(code: string, options?: PythonFormatterOptions): FormatResult {
    if (!this.isReady() || !formatWorkspace) {
      return {
        formatted: code,
        changed: false,
        error: this.initError ?? 'Python formatter not initialized',
      };
    }

    try {
      // Check if the cell starts with a cell magic (%%magic)
      // %%pyspark and %%python contain Python code - format everything after the magic line
      // Other cell magics (%%sql, %%scala, %%r, %%sh, etc.) are not Python - return as-is
      const cellMagicMatch = code.match(/^(%%(\w+).*)\n?/);
      if (cellMagicMatch) {
        const magicLine = cellMagicMatch[1];
        const magicType = cellMagicMatch[2].toLowerCase();

        // Only format Python-based cell magics
        if (magicType === 'pyspark' || magicType === 'python') {
          // Extract the code after the magic line
          let codeAfterMagic = code.slice(cellMagicMatch[0].length);
          if (!codeAfterMagic.trim()) {
            return { formatted: code, changed: false };
          }

          // Apply safe lint fixes first, then format
          codeAfterMagic = applyLintFixes(codeAfterMagic);
          let formatted = formatWorkspace.format(codeAfterMagic);

          // Step 2: Format SQL inside spark.sql() calls (after Ruff to preserve quote style)
          const sparkSqlResult = formatSparkSqlInPython(formatted);
          formatted = sparkSqlResult.formatted;

          // Strip trailing newline if configured
          if (options?.stripTrailingNewline) {
            formatted = formatted.replace(/\n+$/, '');
          }

          // Recombine with magic line
          const result = `${magicLine}\n${formatted}`;
          return { formatted: result, changed: result !== code };
        }

        // Non-Python cell magics - return as-is
        return { formatted: code, changed: false };
      }

      // Handle line magics (%magic) at the start of lines
      const lines = code.split('\n');
      const magicPrefix: string[] = [];
      let pythonStartIndex = 0;

      // Collect leading line magics and comments
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (
          trimmed.startsWith('%') ||
          trimmed.startsWith('#') ||
          trimmed === ''
        ) {
          magicPrefix.push(lines[i]);
          pythonStartIndex = i + 1;
        } else {
          break;
        }
      }

      // If entire code is magics/comments, return as-is
      if (pythonStartIndex >= lines.length) {
        return { formatted: code, changed: false };
      }

      // Extract Python code to format
      let pythonCode = lines.slice(pythonStartIndex).join('\n');

      // Apply safe lint fixes first, then format
      pythonCode = applyLintFixes(pythonCode);
      let formatted = formatWorkspace.format(pythonCode);

      // Step 2: Format SQL inside spark.sql() calls (after Ruff to preserve quote style)
      const sparkSqlResult = formatSparkSqlInPython(formatted);
      formatted = sparkSqlResult.formatted;

      // Post-processing: Strip trailing newline if configured
      if (options?.stripTrailingNewline) {
        formatted = formatted.replace(/\n+$/, '');
      }

      // Recombine with magic prefix
      if (magicPrefix.length > 0) {
        formatted = `${magicPrefix.join('\n')}\n${formatted}`;
      }

      const changed = formatted !== code;
      return { formatted, changed };
    } catch (error) {
      return {
        formatted: code,
        changed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  needsFormatting(code: string, options?: PythonFormatterOptions): boolean {
    const result = this.format(code, options);
    return result.changed;
  }
}

/**
 * Detect if a cell/file is Python/PySpark.
 */
export function isPythonCode(cellType: string): boolean {
  return cellType === 'python' || cellType === 'pyspark';
}

/** Singleton instance */
let pythonFormatterInstance: PythonFormatter | null = null;

/**
 * Get the Python formatter instance (creates on first call).
 * @param options - Optional WASM initialization options. Only used on first call.
 */
export function getPythonFormatter(options?: WasmInitOptions): PythonFormatter {
  if (!pythonFormatterInstance) {
    pythonFormatterInstance = new PythonFormatter(options);
  }
  return pythonFormatterInstance;
}

/**
 * Reset the Python formatter instance (for testing or reinitialization with different options).
 */
export function resetPythonFormatter(): void {
  pythonFormatterInstance = null;
}
