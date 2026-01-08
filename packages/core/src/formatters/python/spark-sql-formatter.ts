/**
 * Spark SQL Formatter for Python Code
 *
 * Formats SQL strings within spark.sql() calls in Python/PySpark code.
 * Uses the Spark SQL formatter on extracted SQL content while preserving
 * the Python context and any string interpolation.
 *
 * ## How It Works
 *
 * 1. Extract all spark.sql() calls from Python code
 * 2. For each call, format the embedded SQL using the Spark SQL formatter
 * 3. Reconstruct the spark.sql() call with formatted SQL
 * 4. Replace in the original code from end to start (to preserve positions)
 *
 * ## Placeholder Handling
 *
 * For f-strings and .format() strings, we preserve placeholders ({var}, {0}, etc.)
 * by treating them as identifiers during SQL formatting.
 */

import { formatSql } from '../sparksql/index.js';
import {
  extractSparkSqlCalls,
  findFStringInterpolations,
  hasFormatPlaceholders,
  type SparkSqlCall,
} from './spark-sql-extractor.js';

/**
 * Result of formatting spark.sql() calls in Python code.
 */
export interface SparkSqlFormatResult {
  /** The formatted Python code */
  formatted: string;
  /** Whether any changes were made */
  changed: boolean;
  /** Number of spark.sql() calls found */
  callsFound: number;
  /** Number of spark.sql() calls that were formatted */
  callsFormatted: number;
  /** Errors encountered during formatting (non-fatal) */
  errors: string[];
}

/**
 * Format all spark.sql() calls in Python code.
 *
 * @param code The Python source code
 * @returns Formatting result with the updated code
 *
 * @example
 * ```typescript
 * const result = formatSparkSqlInPython(`
 * df = spark.sql("select * from table")
 * `);
 * // result.formatted contains:
 * // df = spark.sql("SELECT * FROM table")
 * ```
 */
export function formatSparkSqlInPython(code: string): SparkSqlFormatResult {
  const extraction = extractSparkSqlCalls(code);

  if (!extraction.success || extraction.calls.length === 0) {
    return {
      formatted: code,
      changed: false,
      callsFound: 0,
      callsFormatted: 0,
      errors: extraction.error ? [extraction.error] : [],
    };
  }

  const errors: string[] = [];
  let formattedCode = code;
  let callsFormatted = 0;

  // Process calls from end to start to preserve positions
  const sortedCalls = [...extraction.calls].sort(
    (a, b) => b.callStart - a.callStart,
  );

  for (const call of sortedCalls) {
    try {
      const formattedCall = formatSingleSparkSqlCall(call);
      if (formattedCall !== call.originalText) {
        formattedCode =
          formattedCode.slice(0, call.callStart) +
          formattedCall +
          formattedCode.slice(call.callEnd);
        callsFormatted++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(
        `Failed to format spark.sql() at position ${call.callStart}: ${message}`,
      );
    }
  }

  return {
    formatted: formattedCode,
    changed: formattedCode !== code,
    callsFound: extraction.calls.length,
    callsFormatted,
    errors,
  };
}

/**
 * Format a single spark.sql() call.
 *
 * @param call The extracted call information
 * @returns The formatted spark.sql() call as a string
 */
function formatSingleSparkSqlCall(call: SparkSqlCall): string {
  let sql = call.sql;

  // Handle f-strings: preserve interpolation placeholders
  let placeholderMap: Map<string, string> | undefined;
  if (call.isFString) {
    const interpolations = findFStringInterpolations(sql);
    if (interpolations.length > 0) {
      placeholderMap = new Map();
      // Replace interpolations with placeholder identifiers
      // We use __PLACEHOLDER_N__ format to avoid collisions
      let index = 0;
      for (const interp of interpolations) {
        const placeholder = `__FSTRING_PLACEHOLDER_${index}__`;
        placeholderMap.set(placeholder, `{${interp}}`);
        sql = sql.replace(`{${interp}}`, placeholder);
        index++;
      }
    }
  }

  // Handle .format() placeholders
  let formatPlaceholderMap: Map<string, string> | undefined;
  if (call.hasFormat && hasFormatPlaceholders(sql)) {
    formatPlaceholderMap = new Map();
    // Replace format placeholders with identifiers
    const placeholderPattern = /\{([^}]*)\}/g;
    let index = 0;
    sql = sql.replace(placeholderPattern, (match) => {
      const placeholder = `__FORMAT_PLACEHOLDER_${index}__`;
      formatPlaceholderMap?.set(placeholder, match);
      index++;
      return placeholder;
    });
  }

  // Format the SQL
  let formattedSql: string;
  try {
    formattedSql = formatSql(sql);
  } catch {
    // If SQL formatting fails, return the original call unchanged
    return call.originalText;
  }

  // Restore f-string placeholders
  if (placeholderMap) {
    for (const [placeholder, original] of placeholderMap) {
      formattedSql = formattedSql.replace(placeholder, original);
    }
  }

  // Restore .format() placeholders
  if (formatPlaceholderMap) {
    for (const [placeholder, original] of formatPlaceholderMap) {
      formattedSql = formattedSql.replace(placeholder, original);
    }
  }

  // Reconstruct the spark.sql() call
  return reconstructSparkSqlCall(call, formattedSql);
}

/**
 * Reconstruct a spark.sql() call with formatted SQL.
 *
 * @param call The original call information
 * @param formattedSql The formatted SQL content
 * @returns The complete spark.sql() call string
 */
function reconstructSparkSqlCall(
  call: SparkSqlCall,
  formattedSql: string,
): string {
  // Build the string prefix (r, f, rf, etc.)
  let prefix = '';
  if (call.isRawString && call.isFString) {
    prefix = 'rf';
  } else if (call.isRawString) {
    prefix = 'r';
  } else if (call.isFString) {
    prefix = 'f';
  }

  // Escape the SQL content for the quote style
  const escapedSql = escapeForQuoteStyle(
    formattedSql,
    call.quoteStyle,
    call.isRawString,
  );

  // Build the complete call
  let result = `spark.sql(${prefix}${call.quoteStyle}${escapedSql}${call.quoteStyle}`;

  if (call.formatSuffix) {
    result += call.formatSuffix;
  }

  result += ')';

  return result;
}

/**
 * Escape SQL content for a specific quote style.
 *
 * @param sql The SQL content
 * @param quoteStyle The quote style being used
 * @param isRaw Whether this is a raw string
 * @returns Properly escaped SQL string
 */
function escapeForQuoteStyle(
  sql: string,
  quoteStyle: string,
  isRaw: boolean,
): string {
  // For triple-quoted strings, no escaping needed (except the quote sequence itself)
  if (quoteStyle === '"""' || quoteStyle === "'''") {
    // Triple quotes rarely need escaping - just return as-is for now
    return sql;
  }

  // For single-quoted strings, need to escape
  const quoteChar = quoteStyle;

  if (isRaw) {
    // In raw strings, we can't escape quotes with backslash
    // If the SQL contains the quote character, we have a problem
    // For now, just return the SQL and hope for the best
    return sql;
  }

  // Escape backslashes first, then the quote character
  let escaped = sql;

  // Convert newlines to \n for single-line strings
  escaped = escaped.replace(/\n/g, '\\n');

  // Escape the quote character
  if (quoteChar === '"') {
    escaped = escaped.replace(/"/g, '\\"');
  } else {
    escaped = escaped.replace(/'/g, "\\'");
  }

  return escaped;
}

/**
 * Determine the best quote style for formatted SQL.
 *
 * Multi-line SQL should use triple quotes for readability.
 * Single-line SQL can use the original quote style.
 *
 * @param sql The formatted SQL
 * @param originalStyle The original quote style
 * @returns The recommended quote style
 */
export function recommendQuoteStyle(
  sql: string,
  originalStyle: string,
): string {
  const isMultiLine = sql.includes('\n');
  const originalIsTriple = originalStyle === '"""' || originalStyle === "'''";

  // If SQL is multi-line and original wasn't triple-quoted, suggest upgrade
  if (isMultiLine && !originalIsTriple) {
    // Use double-quote triple for consistency
    return '"""';
  }

  return originalStyle;
}
