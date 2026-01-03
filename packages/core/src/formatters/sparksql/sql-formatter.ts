/**
 * SQL Formatter Wrapper
 *
 * Wraps the core SQL formatter to implement the LanguageFormatter interface.
 */

import type {
  FormatResult,
  FormatterOptions,
  LanguageFormatter,
} from '../types.js';
import { formatSql, needsFormatting } from './index.js';

/**
 * SQL formatter for Spark SQL.
 */
export class SqlFormatter implements LanguageFormatter {
  readonly language = 'sql';
  readonly displayName = 'Spark SQL';

  isReady(): boolean {
    // SQL formatter is always ready (no async initialization)
    return true;
  }

  async initialize(): Promise<void> {
    // No initialization needed for SQL formatter
  }

  format(code: string, _options?: FormatterOptions): FormatResult {
    try {
      const formatted = formatSql(code);

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

  needsFormatting(code: string, _options?: FormatterOptions): boolean {
    return needsFormatting(code);
  }
}

/**
 * Detect if content is SQL.
 */
export function isSqlCode(cellType: string): boolean {
  return cellType === 'sql' || cellType === 'sparksql';
}

/** Singleton instance */
let sqlFormatterInstance: SqlFormatter | null = null;

/**
 * Get the SQL formatter instance (creates on first call).
 */
export function getSqlFormatter(): SqlFormatter {
  if (!sqlFormatterInstance) {
    sqlFormatterInstance = new SqlFormatter();
  }
  return sqlFormatterInstance;
}
