/**
 * Magic SQL Extractor
 *
 * Handles Microsoft Fabric notebook files where SQL cells are stored
 * with MAGIC line prefixes. These files are saved in source control as:
 * - .py files (Python/PySpark) with `# MAGIC` prefix
 * - .scala files (Scala/Spark) with `// MAGIC` prefix
 * - .r files (R/SparkR) with `# MAGIC` prefix
 * - .sql files (SparkSQL) with `-- MAGIC` prefix OR raw SQL
 *
 * Format (Python example):
 * ```
 * # CELL ********************
 *
 * # MAGIC %%sql
 * # MAGIC SELECT *
 * # MAGIC FROM table
 *
 * # METADATA ********************
 * ```
 *
 * Format (Scala example):
 * ```
 * // CELL ********************
 *
 * // MAGIC %%sql
 * // MAGIC SELECT *
 * // MAGIC FROM table
 *
 * // METADATA ********************
 * ```
 *
 * Format (SQL example - raw SQL, default language):
 * ```
 * -- CELL ********************
 *
 * SELECT *
 * FROM table
 *
 * -- METADATA ********************
 * ```
 *
 * Format (SQL example - MAGIC prefixed):
 * ```
 * -- CELL ********************
 *
 * -- MAGIC %%sql
 * -- MAGIC SELECT *
 * -- MAGIC FROM table
 *
 * -- METADATA ********************
 * ```
 */

/** Language-specific comment prefixes */
interface LanguageConfig {
  fabricHeader: string;
  cellMarker: string;
  metadataMarker: string;
  magicPrefix: string;
  magicSqlCommand: string;
  emptyMagic: string;
  /** If true, cells can contain raw SQL without MAGIC prefix */
  supportsRawSql: boolean;
}

const PYTHON_CONFIG: LanguageConfig = {
  fabricHeader: '# Fabric notebook source',
  cellMarker: '# CELL ********************',
  metadataMarker: '# METADATA ********************',
  magicPrefix: '# MAGIC ',
  magicSqlCommand: '# MAGIC %%sql',
  emptyMagic: '# MAGIC',
  supportsRawSql: false,
};

const SCALA_CONFIG: LanguageConfig = {
  fabricHeader: '// Fabric notebook source',
  cellMarker: '// CELL ********************',
  metadataMarker: '// METADATA ********************',
  magicPrefix: '// MAGIC ',
  magicSqlCommand: '// MAGIC %%sql',
  emptyMagic: '// MAGIC',
  supportsRawSql: false,
};

const SQL_CONFIG: LanguageConfig = {
  fabricHeader: '-- Fabric notebook source',
  cellMarker: '-- CELL ********************',
  metadataMarker: '-- METADATA ********************',
  magicPrefix: '-- MAGIC ',
  magicSqlCommand: '-- MAGIC %%sql',
  emptyMagic: '-- MAGIC',
  supportsRawSql: true,  // SQL notebooks can have raw SQL cells
};

// R uses the same syntax as Python
const R_CONFIG: LanguageConfig = PYTHON_CONFIG;

export interface MagicSqlCell {
  /** Line index (0-based) where the cell content starts (after CELL marker) */
  contentStartLine: number;
  /** Line index (0-based) where the cell content ends (before METADATA) */
  contentEndLine: number;
  /** The extracted SQL without MAGIC prefixes (excludes %%sql magic command) */
  sql: string;
  /** Original lines including MAGIC prefixes (for reconstruction reference) */
  originalLines: string[];
  /** Whether this is a raw SQL cell (no MAGIC prefix) - only in .sql notebooks */
  isRawSql: boolean;
}

export interface MagicSqlFile {
  /** Whether this file is a Fabric notebook */
  isFabricNotebook: boolean;
  /** All detected SQL cells */
  sqlCells: MagicSqlCell[];
  /** Original file content split into lines */
  lines: string[];
  /** The detected language config (for reconstruction) */
  config: LanguageConfig | null;
}

/**
 * Detect the line ending style used in content.
 */
function detectLineEnding(content: string): string {
  if (content.includes('\r\n')) {
    return '\r\n';
  }
  return '\n';
}

/**
 * Detects the language config based on the file's first line.
 */
function detectLanguageConfig(firstLine: string): LanguageConfig | null {
  const trimmed = firstLine.trim();
  if (trimmed.startsWith(PYTHON_CONFIG.fabricHeader)) {
    return PYTHON_CONFIG;
  }
  if (trimmed.startsWith(SCALA_CONFIG.fabricHeader)) {
    return SCALA_CONFIG;
  }
  if (trimmed.startsWith(SQL_CONFIG.fabricHeader)) {
    return SQL_CONFIG;
  }
  return null;
}

/**
 * Detects if a file is a Fabric notebook and extracts all SQL cells.
 */
export function extractMagicSqlCells(content: string): MagicSqlFile {
  const lines = content.split(/\r?\n/);

  const result: MagicSqlFile = {
    isFabricNotebook: false,
    sqlCells: [],
    lines,
    config: null,
  };

  if (lines.length === 0) {
    return result;
  }

  // Detect language from header
  const config = detectLanguageConfig(lines[0]);
  if (!config) {
    return result;
  }

  result.isFabricNotebook = true;
  result.config = config;

  // Find all SQL cells
  let i = 0;
  while (i < lines.length) {
    // Look for CELL marker
    if (lines[i].trim() === config.cellMarker) {
      const cellStartLine = i + 1;

      // Skip empty lines after CELL marker
      let j = cellStartLine;
      while (j < lines.length && lines[j].trim() === '') {
        j++;
      }

      // Check if this cell starts with %%sql magic (MAGIC-prefixed SQL)
      if (j < lines.length && lines[j].trim() === config.magicSqlCommand) {
        // This is a MAGIC-prefixed SQL cell - find its end
        const sqlStartLine = j + 1; // Line after %%sql
        let cellEndLine = sqlStartLine;

        // Find the end of the cell (next METADATA or CELL marker)
        while (cellEndLine < lines.length) {
          const trimmed = lines[cellEndLine].trim();
          if (trimmed === config.metadataMarker || trimmed === config.cellMarker) {
            break;
          }
          cellEndLine++;
        }

        // Back up past any trailing empty lines
        let actualEndLine = cellEndLine - 1;
        while (actualEndLine >= sqlStartLine && lines[actualEndLine].trim() === '') {
          actualEndLine--;
        }

        if (actualEndLine >= sqlStartLine) {
          // Extract SQL lines (strip MAGIC prefix)
          const originalLines = lines.slice(sqlStartLine, actualEndLine + 1);
          const sqlLines = originalLines.map(line => stripMagicPrefix(line, config));

          result.sqlCells.push({
            contentStartLine: sqlStartLine,
            contentEndLine: actualEndLine,
            sql: sqlLines.join('\n'),
            originalLines,
            isRawSql: false,
          });
        }

        i = cellEndLine;
        continue;
      }
      
      // Check for raw SQL cells (only in SQL notebooks)
      // Raw SQL cells don't start with MAGIC prefix and don't have %%pyspark etc.
      if (config.supportsRawSql && j < lines.length) {
        const firstContentLine = lines[j].trim();
        
        // Skip if it's a MAGIC cell (non-SQL like %%pyspark)
        if (firstContentLine.startsWith(config.magicPrefix)) {
          i++;
          continue;
        }
        
        // This looks like a raw SQL cell - find its end
        const sqlStartLine = j;
        let cellEndLine = sqlStartLine;

        // Find the end of the cell (next METADATA or CELL marker)
        while (cellEndLine < lines.length) {
          const trimmed = lines[cellEndLine].trim();
          if (trimmed === config.metadataMarker || trimmed === config.cellMarker) {
            break;
          }
          cellEndLine++;
        }

        // Back up past any trailing empty lines
        let actualEndLine = cellEndLine - 1;
        while (actualEndLine >= sqlStartLine && lines[actualEndLine].trim() === '') {
          actualEndLine--;
        }

        if (actualEndLine >= sqlStartLine) {
          // Extract SQL lines directly (no prefix to strip)
          const originalLines = lines.slice(sqlStartLine, actualEndLine + 1);

          result.sqlCells.push({
            contentStartLine: sqlStartLine,
            contentEndLine: actualEndLine,
            sql: originalLines.join('\n'),
            originalLines,
            isRawSql: true,
          });
        }

        i = cellEndLine;
        continue;
      }
    }
    i++;
  }

  return result;
}

/**
 * Strips the MAGIC prefix from a line.
 * Handles both "# MAGIC content" and "# MAGIC" (empty line).
 */
function stripMagicPrefix(line: string, config: LanguageConfig): string {
  if (line.startsWith(config.magicPrefix)) {
    return line.slice(config.magicPrefix.length);
  }
  if (line.trim() === config.emptyMagic) {
    return '';
  }
  // Line doesn't have MAGIC prefix - return as-is (shouldn't happen in valid cells)
  return line;
}

/**
 * Adds the MAGIC prefix to each line of SQL.
 */
function addMagicPrefix(sql: string, config: LanguageConfig): string[] {
  return sql.split(/\r?\n/).map(line => {
    if (line === '') {
      return config.emptyMagic;
    }
    return config.magicPrefix + line;
  });
}

/**
 * Replaces a SQL cell's content with formatted SQL.
 * For MAGIC-prefixed cells, adds the appropriate prefix to each line.
 * For raw SQL cells (in .sql notebooks), uses the SQL directly.
 * Returns the updated file content.
 */
export function replaceSqlCell(
  fileContent: string,
  cell: MagicSqlCell,
  formattedSql: string,
  config: LanguageConfig,
  lineEnding: string = '\n'
): string {
  const lines = fileContent.split(/\r?\n/);
  
  // For raw SQL cells, use the formatted SQL directly (no prefix)
  // For MAGIC-prefixed cells, add the appropriate prefix to each line
  const newSqlLines = cell.isRawSql 
    ? formattedSql.split(/\r?\n/)
    : addMagicPrefix(formattedSql, config);

  // Replace the lines in the cell
  const before = lines.slice(0, cell.contentStartLine);
  const after = lines.slice(cell.contentEndLine + 1);

  const newLines = [...before, ...newSqlLines, ...after];
  return newLines.join(lineEnding);
}

/**
 * Formats all SQL cells in a Fabric notebook file.
 * If the file is not a Fabric notebook, returns unchanged.
 * @param content The file content
 * @param formatFn A function that formats SQL (e.g., formatSql from formatter.ts)
 * @returns The updated file content with formatted SQL cells
 */
export function formatFabricNotebook(
  content: string,
  formatFn: (sql: string) => string
): string {
  const extracted = extractMagicSqlCells(content);

  // Not a Fabric notebook or no SQL cells - return unchanged
  if (!extracted.isFabricNotebook || extracted.sqlCells.length === 0 || !extracted.config) {
    return content;
  }

  // Detect and preserve original line endings
  const lineEnding = detectLineEnding(content);

  // Process cells in reverse order so line numbers remain valid
  let result = content;
  const cellsReversed = [...extracted.sqlCells].reverse();

  for (const cell of cellsReversed) {
    const formattedSql = formatFn(cell.sql);
    result = replaceSqlCell(result, cell, formattedSql, extracted.config, lineEnding);
  }

  return result;
}
