/**
 * Formatter Types
 *
 * Common interfaces for language formatters.
 * Designed to be extensible for future language support.
 */

/**
 * Context about where formatting is occurring.
 * Used for enriching error messages with location information.
 */
export interface FormattingContext {
  /** 1-based cell index within the notebook */
  cellIndex?: number;
  /** File path or notebook name */
  filePath?: string;
  /** Language being formatted */
  language?: string;
}

/**
 * Create a human-readable location string from context.
 * Example: "cell 5 of notebook.py" or "notebook.py"
 */
export function formatContextLocation(context?: FormattingContext): string {
  if (!context) return '';

  const parts: string[] = [];

  if (context.cellIndex !== undefined) {
    parts.push(`cell ${context.cellIndex}`);
  }

  if (context.filePath) {
    if (parts.length > 0) {
      parts.push(`of ${context.filePath}`);
    } else {
      parts.push(context.filePath);
    }
  }

  return parts.join(' ');
}

/**
 * Create an error message with context information.
 * Example: "Format error in cell 5 of notebook.py: syntax error"
 */
export function formatErrorWithContext(
  baseError: string,
  context?: FormattingContext,
): string {
  const location = formatContextLocation(context);
  if (!location) return baseError;
  return `Format error in ${location}: ${baseError}`;
}

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

  /** Initialize all formatters (parallel) */
  initializeAll(): Promise<void>;

  /** Initialize only the specified languages (parallel, lazy) */
  initializeLanguages(languages: Set<string>): Promise<void>;
}
