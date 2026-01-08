/**
 * Spark SQL Extractor
 *
 * Extracts SQL strings from spark.sql() calls in Python/PySpark code.
 * This enables formatting embedded SQL while preserving the Python context.
 *
 * Supported patterns:
 * - spark.sql("SELECT ...") - simple strings
 * - spark.sql('SELECT ...') - single quotes
 * - spark.sql("""SELECT ...""") - triple-quoted strings
 * - spark.sql('''SELECT ...''') - triple single quotes
 * - spark.sql(r"SELECT ...") - raw strings
 * - spark.sql(f"SELECT ... {var}") - f-strings (placeholders preserved)
 * - spark.sql("SELECT ...".format(...)) - .format() strings
 *
 * Out of scope:
 * - spark.sql(query_var) - variable references
 * - spark.sql("a" + "b") - complex concatenation
 * - sqlContext.sql() or session.sql() - aliases
 */

/**
 * Represents an extracted spark.sql() call with its SQL content.
 */
export interface SparkSqlCall {
  /** Start position of the entire spark.sql(...) call in the source */
  callStart: number;
  /** End position of the entire spark.sql(...) call in the source */
  callEnd: number;
  /** Start position of just the SQL string (inside quotes) */
  sqlStart: number;
  /** End position of just the SQL string (inside quotes) */
  sqlEnd: number;
  /** The extracted SQL content (without quotes) */
  sql: string;
  /** The quote style used (', ", ''', """) */
  quoteStyle: string;
  /** Whether this is a raw string (r"...") */
  isRawString: boolean;
  /** Whether this is an f-string (f"...") */
  isFString: boolean;
  /** Whether this uses .format() method */
  hasFormat: boolean;
  /** The full .format(...) suffix if present */
  formatSuffix?: string;
  /** Original full text of the spark.sql(...) call */
  originalText: string;
}

/**
 * Result of extracting spark.sql() calls from Python code.
 */
export interface ExtractionResult {
  /** All extracted spark.sql() calls */
  calls: SparkSqlCall[];
  /** Whether extraction was successful */
  success: boolean;
  /** Error message if extraction failed */
  error?: string;
}

/**
 * Extract all spark.sql() calls from Python code.
 *
 * @param code The Python source code to analyze
 * @returns Extraction result with all found spark.sql() calls
 */
export function extractSparkSqlCalls(code: string): ExtractionResult {
  const calls: SparkSqlCall[] = [];

  // Match spark.sql( - this is our entry point
  // We need to handle: spark.sql("...", spark.sql('..., spark.sql("""..., etc.
  const sparkSqlPattern = /spark\.sql\s*\(/g;

  for (
    let match = sparkSqlPattern.exec(code);
    match !== null;
    match = sparkSqlPattern.exec(code)
  ) {
    const callStart = match.index;
    const openParenPos = match.index + match[0].length - 1;

    try {
      const extracted = extractSqlFromCall(code, callStart, openParenPos);
      if (extracted) {
        calls.push(extracted);
      }
    } catch {
      // Skip malformed spark.sql calls
    }
  }

  return { calls, success: true };
}

/**
 * Extract SQL from a single spark.sql() call starting at the given position.
 *
 * @param code Full Python source code
 * @param callStart Start position of "spark.sql"
 * @param openParenPos Position of the opening parenthesis
 * @returns Extracted call info or null if not a string literal
 */
function extractSqlFromCall(
  code: string,
  callStart: number,
  openParenPos: number,
): SparkSqlCall | null {
  // Skip whitespace after opening paren
  let pos = openParenPos + 1;
  while (pos < code.length && /\s/.test(code[pos])) {
    pos++;
  }

  if (pos >= code.length) {
    return null;
  }

  // Check for string prefix (r, f, rf, fr, R, F, etc.)
  let isRawString = false;
  let isFString = false;

  // Handle string prefixes (case insensitive)
  const prefixMatch = code.slice(pos).match(/^([rRfF]{1,2})/);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toLowerCase();
    isRawString = prefix.includes('r');
    isFString = prefix.includes('f');
    pos += prefixMatch[1].length;
  }

  // Determine quote style
  let quoteStyle: string;
  if (code.slice(pos, pos + 3) === '"""') {
    quoteStyle = '"""';
  } else if (code.slice(pos, pos + 3) === "'''") {
    quoteStyle = "'''";
  } else if (code[pos] === '"') {
    quoteStyle = '"';
  } else if (code[pos] === "'") {
    quoteStyle = "'";
  } else {
    // Not a string literal (could be a variable)
    return null;
  }

  const sqlStart = pos + quoteStyle.length;

  // Find the end of the string
  const sqlEndInfo = findStringEnd(code, sqlStart, quoteStyle, isRawString);
  if (!sqlEndInfo) {
    return null;
  }

  const { endPos: sqlEnd, rawSql } = sqlEndInfo;
  const stringEndPos = sqlEnd + quoteStyle.length;

  // Skip whitespace after the closing quote
  let afterStringPos = stringEndPos;
  while (afterStringPos < code.length && /\s/.test(code[afterStringPos])) {
    afterStringPos++;
  }

  // Check for .format() suffix
  let hasFormat = false;
  let formatSuffix: string | undefined;
  let callEnd = afterStringPos;

  if (code.slice(afterStringPos, afterStringPos + 7) === '.format') {
    hasFormat = true;
    // Find the end of the format call
    const formatStart = afterStringPos;
    const formatParenPos = code.indexOf('(', formatStart);
    if (formatParenPos !== -1) {
      const formatEnd = findMatchingParen(code, formatParenPos);
      if (formatEnd !== -1) {
        formatSuffix = code.slice(formatStart, formatEnd + 1);
        afterStringPos = formatEnd + 1;
      }
    }
  }

  // Skip whitespace before closing paren
  while (afterStringPos < code.length && /\s/.test(code[afterStringPos])) {
    afterStringPos++;
  }

  // Verify we have a closing paren for spark.sql()
  if (code[afterStringPos] !== ')') {
    // Might have additional arguments - not supported
    return null;
  }

  callEnd = afterStringPos + 1;

  return {
    callStart,
    callEnd,
    sqlStart,
    sqlEnd,
    sql: rawSql,
    quoteStyle,
    isRawString,
    isFString,
    hasFormat,
    formatSuffix,
    originalText: code.slice(callStart, callEnd),
  };
}

/**
 * Find the end of a string literal, handling escape sequences.
 *
 * @param code Source code
 * @param start Position after the opening quote
 * @param quoteStyle The quote style used
 * @param isRaw Whether this is a raw string
 * @returns End position and the raw SQL content, or null if not found
 */
function findStringEnd(
  code: string,
  start: number,
  quoteStyle: string,
  isRaw: boolean,
): { endPos: number; rawSql: string } | null {
  let pos = start;
  let sql = '';

  while (pos < code.length) {
    // Check for end of string
    if (code.slice(pos, pos + quoteStyle.length) === quoteStyle) {
      return { endPos: pos, rawSql: sql };
    }

    // Handle escape sequences
    if (code[pos] === '\\' && !isRaw) {
      // In non-raw strings, backslash escapes the next character
      if (pos + 1 < code.length) {
        const nextChar = code[pos + 1];
        // Common escape sequences
        switch (nextChar) {
          case 'n':
            sql += '\n';
            break;
          case 't':
            sql += '\t';
            break;
          case 'r':
            sql += '\r';
            break;
          case '\\':
            sql += '\\';
            break;
          case "'":
            sql += "'";
            break;
          case '"':
            sql += '"';
            break;
          default:
            // Keep the escape sequence as-is for unknown escapes
            sql += `\\${nextChar}`;
        }
        pos += 2;
        continue;
      }
    }

    // Handle raw strings - backslashes are literal except before quotes
    if (isRaw && code[pos] === '\\') {
      // In raw strings, \' and \" prevent the string from ending
      // but the backslash is kept in the output
      if (pos + 1 < code.length) {
        const nextChar = code[pos + 1];
        if (nextChar === "'" || nextChar === '"') {
          sql += `\\${nextChar}`;
          pos += 2;
          continue;
        }
      }
    }

    sql += code[pos];
    pos++;
  }

  // Unterminated string
  return null;
}

/**
 * Find the matching closing parenthesis.
 *
 * @param code Source code
 * @param openPos Position of the opening parenthesis
 * @returns Position of the closing parenthesis, or -1 if not found
 */
function findMatchingParen(code: string, openPos: number): number {
  let depth = 1;
  let pos = openPos + 1;
  let inString = false;
  let stringChar = '';
  let isTriple = false;

  while (pos < code.length && depth > 0) {
    const char = code[pos];

    if (inString) {
      // Check for string end
      if (isTriple) {
        const triple = code.slice(pos, pos + 3);
        if (triple === stringChar + stringChar + stringChar) {
          inString = false;
          pos += 3;
          continue;
        }
      } else if (char === stringChar && code[pos - 1] !== '\\') {
        inString = false;
      }
      pos++;
      continue;
    }

    // Check for string start
    if (char === '"' || char === "'") {
      const triple = code.slice(pos, pos + 3);
      if (triple === '"""' || triple === "'''") {
        inString = true;
        isTriple = true;
        stringChar = char;
        pos += 3;
        continue;
      }
      inString = true;
      isTriple = false;
      stringChar = char;
      pos++;
      continue;
    }

    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    }

    pos++;
  }

  return depth === 0 ? pos - 1 : -1;
}

/**
 * Check if a spark.sql() call contains f-string interpolations that would
 * make SQL formatting unsafe. Returns the interpolation expressions if found.
 *
 * @param sql The SQL content from an f-string
 * @returns Array of interpolation expressions, or empty array if none
 */
export function findFStringInterpolations(sql: string): string[] {
  const interpolations: string[] = [];
  const pattern = /\{([^}]+)\}/g;

  for (
    let match = pattern.exec(sql);
    match !== null;
    match = pattern.exec(sql)
  ) {
    interpolations.push(match[1]);
  }

  return interpolations;
}

/**
 * Check if a string contains .format() placeholders.
 *
 * @param sql The SQL string to check
 * @returns True if the string contains format placeholders
 */
export function hasFormatPlaceholders(sql: string): boolean {
  // Named placeholders: {name}, {0}, {}
  return /\{[^}]*\}/.test(sql);
}
