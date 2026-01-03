/**
 * Formatter Types
 *
 * Common interfaces for language formatters.
 * Designed to be extensible for future language support.
 */

/** Options that can be passed to any formatter */
export interface FormatterOptions {
  /** Maximum line width (default: 140) */
  lineWidth?: number;
  /** Additional offset to subtract from line width (e.g., for MAGIC prefixes) */
  lineWidthOffset?: number;
  /** Suppress multiline expansion (noqa:expansion) */
  suppressExpansion?: boolean;
}

/** Result of a format operation */
export interface FormatResult {
  /** The formatted code */
  formatted: string;
  /** Whether the code was changed */
  changed: boolean;
  /** Any errors that occurred (null = success) */
  error?: string;
}

/** Common interface for all language formatters */
export interface LanguageFormatter {
  /** Language identifier (e.g., 'sql', 'python', 'scala') */
  readonly language: string;

  /** Human-readable name */
  readonly displayName: string;

  /** Whether the formatter is initialized and ready */
  isReady(): boolean;

  /** Initialize the formatter (load WASM, etc.) */
  initialize(): Promise<void>;

  /** Format code with optional options */
  format(code: string, options?: FormatterOptions): FormatResult;

  /** Check if code needs formatting without modifying it */
  needsFormatting(code: string, options?: FormatterOptions): boolean;
}

/** Configuration for a language formatter */
export interface FormatterConfig {
  /** Whether this formatter is enabled */
  enabled: boolean;
  /** Formatter-specific options */
  options: Record<string, unknown>;
}

/** Registry of all available formatters */
export interface FormatterRegistry {
  /** Get a formatter by language identifier */
  get(language: string): LanguageFormatter | undefined;

  /** Register a new formatter */
  register(formatter: LanguageFormatter): void;

  /** List all registered language identifiers */
  languages(): string[];

  /** Initialize all formatters */
  initializeAll(): Promise<void>;
}
