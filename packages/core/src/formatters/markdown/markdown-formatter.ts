/**
 * Markdown Formatter
 *
 * Uses dprint WASM to format Markdown content.
 * Supports both Node.js (CLI) and browser (Chrome extension) environments.
 */

import type {
  FormatResult,
  FormatterOptions,
  LanguageFormatter,
} from '../types.js';
import {
  MARKDOWN_GLOBAL_CONFIG,
  MARKDOWN_PLUGIN_CONFIG,
} from './config.js';

// Type definitions for dprint modules
interface DprintFormatter {
  setConfig(
    globalConfig: Record<string, unknown>,
    pluginConfig: Record<string, unknown>,
  ): void;
  formatText(request: { filePath: string; fileText: string }): string;
}

// Dynamic import for dprint (loaded on demand)
let dprintFormatter: DprintFormatter | null = null;

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
 * Load the WASM file from the @dprint/markdown package in Node.js.
 */
async function loadWasmForNode(): Promise<Uint8Array> {
  // Use Function constructor to create dynamic import that bundlers can't statically analyze
  const dynamicImport = new Function('specifier', 'return import(specifier)');

  const { readFile } = await dynamicImport('fs/promises');
  const dprintMarkdown = await dynamicImport('@dprint/markdown');
  const wasmPath = dprintMarkdown.getPath();
  return readFile(wasmPath);
}

/**
 * Options for initializing the dprint WASM module.
 *
 * Used primarily in browser environments (Chrome extensions) where the WASM
 * binary must be loaded from a specific URL.
 *
 * In Node.js environments, the WASM module is loaded automatically from
 * the @dprint/markdown package, so these options are typically not needed.
 *
 * @example Browser extension with URL
 * ```typescript
 * const formatter = new MarkdownFormatter({
 *   wasmUrl: chrome.runtime.getURL('dist/dprint_markdown.wasm')
 * });
 * ```
 */
export interface WasmInitOptions {
  /**
   * URL to the .wasm file.
   * Use this in browser environments where the WASM file is served from a URL.
   * In Chrome extensions, use `chrome.runtime.getURL('path/to/plugin.wasm')`.
   */
  wasmUrl?: string | URL;
  /**
   * Pre-loaded WASM binary for synchronous initialization.
   * Use this when you've already fetched the WASM file and want to avoid
   * an additional network request during initialization.
   */
  wasmBinary?: ArrayBuffer | Uint8Array;
}

/** Options specific to Markdown formatting */
export interface MarkdownFormatterOptions extends FormatterOptions {
  /** Strip trailing newlines from formatted output */
  stripTrailingNewline?: boolean;
}

/**
 * Markdown formatter using dprint WASM.
 */
export class MarkdownFormatter implements LanguageFormatter {
  readonly language = 'markdown';
  readonly displayName = 'Markdown (dprint)';

  private initialized = false;
  private initError: string | null = null;
  private wasmOptions: WasmInitOptions | undefined;

  /**
   * Create a new Markdown formatter.
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
      // Dynamic import of dprint formatter
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const dprintFormatterModule = await dynamicImport('@dprint/formatter');

      // Load WASM binary
      let wasmBinary: ArrayBuffer | Uint8Array;

      if (this.wasmOptions?.wasmBinary) {
        // Use provided binary directly
        wasmBinary = this.wasmOptions.wasmBinary;
      } else if (this.wasmOptions?.wasmUrl) {
        // Fetch from provided URL (browser)
        const response = await fetch(this.wasmOptions.wasmUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
        }
        wasmBinary = await response.arrayBuffer();
      } else if (isNodeEnvironment()) {
        // Node.js: Load WASM file from @dprint/markdown package
        wasmBinary = await loadWasmForNode();
      } else {
        throw new Error(
          'Markdown formatter requires wasmUrl or wasmBinary option in browser environments',
        );
      }

      // Create formatter from WASM binary
      dprintFormatter = dprintFormatterModule.createFromBuffer(wasmBinary);

      // Configure with our settings
      if (dprintFormatter) {
        dprintFormatter.setConfig(
          MARKDOWN_GLOBAL_CONFIG as Record<string, unknown>,
          MARKDOWN_PLUGIN_CONFIG as Record<string, unknown>,
        );
      }

      this.initialized = true;
    } catch (error) {
      this.initError = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to initialize Markdown formatter: ${this.initError}`,
      );
    }
  }

  format(code: string, options?: MarkdownFormatterOptions): FormatResult {
    if (!this.isReady() || !dprintFormatter) {
      return {
        formatted: code,
        changed: false,
        error: this.initError ?? 'Markdown formatter not initialized',
      };
    }

    try {
      // Handle empty input
      if (!code.trim()) {
        return { formatted: code, changed: false };
      }

      // Format using dprint
      let formatted = dprintFormatter.formatText({
        filePath: 'cell.md', // Virtual filename for dprint
        fileText: code,
      });

      // Strip trailing newline if configured (match Python formatter behavior)
      if (options?.stripTrailingNewline) {
        formatted = formatted.replace(/\n+$/, '');
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

  needsFormatting(code: string, options?: MarkdownFormatterOptions): boolean {
    const result = this.format(code, options);
    return result.changed;
  }
}

/**
 * Detect if a cell/file is Markdown.
 */
export function isMarkdownCode(cellType: string): boolean {
  return cellType === 'markdown' || cellType === 'md';
}

/** Singleton instance */
let markdownFormatterInstance: MarkdownFormatter | null = null;

/**
 * Get the Markdown formatter instance (creates on first call).
 * @param options - Optional WASM initialization options. Only used on first call.
 */
export function getMarkdownFormatter(options?: WasmInitOptions): MarkdownFormatter {
  if (!markdownFormatterInstance) {
    markdownFormatterInstance = new MarkdownFormatter(options);
  }
  return markdownFormatterInstance;
}

/**
 * Reset the Markdown formatter instance (for testing or reinitialization with different options).
 */
export function resetMarkdownFormatter(): void {
  markdownFormatterInstance = null;
  dprintFormatter = null;
}
