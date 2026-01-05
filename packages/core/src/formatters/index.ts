/**
 * Formatter Registry
 *
 * Central registry for all language formatters.
 * Provides a unified interface for formatting any supported language.
 */

import { getMarkdownFormatter, isMarkdownCode } from './markdown/index.js';
import { getPythonFormatter, isPythonCode } from './python/index.js';
import { getSqlFormatter, isSqlCode } from './sparksql/index.js';
import type { FormatterRegistry, LanguageFormatter } from './types.js';

// Re-export Markdown formatter
export {
  getMarkdownFormatter,
  isMarkdownCode,
  MarkdownFormatter,
} from './markdown/index.js';

export {
  getPythonFormatter,
  isPythonCode,
  PythonFormatter,
} from './python/index.js';

// Re-export formatters
export { getSqlFormatter, isSqlCode, SqlFormatter } from './sparksql/index.js';
// Re-export types
export type {
  FormatResult,
  FormatterConfig,
  FormatterOptions,
  FormatterRegistry,
  FormattingContext,
  LanguageFormatter,
} from './types.js';

export { formatContextLocation, formatErrorWithContext } from './types.js';

/**
 * Default formatter registry implementation.
 */
class DefaultFormatterRegistry implements FormatterRegistry {
  private formatters: Map<string, LanguageFormatter> = new Map();

  get(language: string): LanguageFormatter | undefined {
    return this.formatters.get(language.toLowerCase());
  }

  register(formatter: LanguageFormatter): void {
    this.formatters.set(formatter.language.toLowerCase(), formatter);
  }

  languages(): string[] {
    return Array.from(this.formatters.keys());
  }

  async initializeAll(): Promise<void> {
    const promises = Array.from(this.formatters.values()).map((f) =>
      f.initialize(),
    );
    await Promise.all(promises);
  }

  async initializeLanguages(languages: Set<string>): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const lang of languages) {
      const formatter = this.formatters.get(lang.toLowerCase());
      if (formatter && !formatter.isReady()) {
        promises.push(formatter.initialize());
      }
    }
    await Promise.all(promises);
  }
}

/** Global formatter registry */
let registryInstance: FormatterRegistry | null = null;

/**
 * Get the global formatter registry.
 * Registers default formatters on first call.
 */
export function getFormatterRegistry(): FormatterRegistry {
  if (!registryInstance) {
    registryInstance = new DefaultFormatterRegistry();

    // Register built-in formatters
    registryInstance.register(getSqlFormatter());
    registryInstance.register(getPythonFormatter());
    registryInstance.register(getMarkdownFormatter());
  }
  return registryInstance;
}

/**
 * Detect the language of code based on cell type or magic command.
 */
export function detectLanguage(cellType: string, code?: string): string {
  // Check for cell magic commands at the start
  if (code) {
    const firstLine = code.trim().split('\n')[0].trim();
    if (firstLine === '%%sql' || firstLine.startsWith('%%sql ')) {
      return 'sql';
    }
    if (firstLine === '%%python' || firstLine.startsWith('%%python ')) {
      return 'python';
    }
    if (firstLine === '%%pyspark' || firstLine.startsWith('%%pyspark ')) {
      return 'python'; // PySpark is Python
    }
    if (firstLine === '%%scala' || firstLine.startsWith('%%scala ')) {
      return 'scala';
    }
    if (
      firstLine === '%%r' ||
      firstLine.startsWith('%%r ') ||
      firstLine === '%%R'
    ) {
      return 'r';
    }
    if (
      firstLine === '%%markdown' ||
      firstLine.startsWith('%%markdown ') ||
      firstLine === '%%md'
    ) {
      return 'markdown';
    }
  }

  // Fall back to cell type
  const type = cellType.toLowerCase();
  if (isSqlCode(type)) return 'sql';
  if (isPythonCode(type)) return 'python';
  if (isMarkdownCode(type)) return 'markdown';

  return type;
}
