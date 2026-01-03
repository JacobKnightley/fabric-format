/**
 * Notebook Formatter
 *
 * High-level API for parsing and formatting Microsoft Fabric notebook files.
 * Handles the notebook structure, cell extraction, and comment wrapper management.
 *
 * For low-level cell formatting (when you already know the cell type),
 * use the cell-formatter module directly.
 *
 * File formats:
 * - .py files (Python/PySpark) with `# MAGIC` prefix for Spark SQL cells
 * - .scala files (Scala/Spark) with `// MAGIC` prefix for Spark SQL cells
 * - .r files (R/SparkR) with `# MAGIC` prefix for Spark SQL cells
 * - .sql files (Spark SQL) with `-- MAGIC` prefix OR raw SQL
 *
 * Cell structure (Python example):
 * ```
 * # CELL ********************
 *
 * # MAGIC %%sql
 * # MAGIC SELECT *
 * # MAGIC FROM table
 *
 * # METADATA ********************
 * # META {
 * # META   "language": "sparksql",
 * # META   "language_group": "synapse_pyspark"
 * # META }
 * ```
 */

import { formatCell, initializePythonFormatter } from './cell-formatter.js';

// Re-export cell-formatter types and functions for convenience
export {
  type CellType,
  type FormatCellResult,
  formatCell,
  formatCellSync,
  initializePythonFormatter,
  isPythonFormatterReady,
} from './cell-formatter.js';

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
  /** Default cell language when no magic command present */
  defaultLanguage: string;
}

const PYTHON_CONFIG: LanguageConfig = {
  fabricHeader: '# Fabric notebook source',
  cellMarker: '# CELL ********************',
  metadataMarker: '# METADATA ********************',
  magicPrefix: '# MAGIC ',
  magicSqlCommand: '# MAGIC %%sql',
  emptyMagic: '# MAGIC ',
  supportsRawSql: false,
  defaultLanguage: 'python',
};

const SCALA_CONFIG: LanguageConfig = {
  fabricHeader: '// Fabric notebook source',
  cellMarker: '// CELL ********************',
  metadataMarker: '// METADATA ********************',
  magicPrefix: '// MAGIC ',
  magicSqlCommand: '// MAGIC %%sql',
  emptyMagic: '// MAGIC ',
  supportsRawSql: false,
  defaultLanguage: 'scala',
};

const SPARKSQL_CONFIG: LanguageConfig = {
  fabricHeader: '-- Fabric notebook source',
  cellMarker: '-- CELL ********************',
  metadataMarker: '-- METADATA ********************',
  magicPrefix: '-- MAGIC ',
  magicSqlCommand: '-- MAGIC %%sql',
  emptyMagic: '-- MAGIC ',
  supportsRawSql: true,
  defaultLanguage: 'sparksql',
};

const R_CONFIG: LanguageConfig = {
  ...PYTHON_CONFIG, // R uses same comment syntax as Python
  fabricHeader: '# Fabric notebook source', // Check if R has different header
  defaultLanguage: 'r',
};

/** Represents a cell in a Fabric notebook */
export interface NotebookCell {
  /** Line index (0-based) where the cell content starts (after CELL marker) */
  contentStartLine: number;
  /** Line index (0-based) where the cell content ends (before METADATA) */
  contentEndLine: number;
  /** The extracted content (without MAGIC prefixes) */
  content: string;
  /** Original lines including MAGIC prefixes */
  originalLines: string[];
  /** Detected language of this cell (from METADATA) */
  language: string;
  /** Whether this is a MAGIC-prefixed cell */
  isMagicCell: boolean;
  /** Whether this is a raw cell (no MAGIC prefix) */
  isRawCell: boolean;
  /** The magic command used in the cell (e.g., 'sql', 'pyspark', 'configure'), or null if no magic */
  magicCommand: string | null;
}

/** Represents a parsed Fabric notebook */
export interface FabricNotebook {
  /** Whether this file is a Fabric notebook */
  isFabricNotebook: boolean;
  /** All detected cells */
  cells: NotebookCell[];
  /** Original file content split into lines */
  lines: string[];
  /** The detected language config */
  config: LanguageConfig | null;
}

/** Statistics from formatting operation */
export interface FormatStats {
  sparkSqlCellsFormatted: number;
  pythonCellsFormatted: number;
  cellsSkipped: number;
  errors: string[];
}

/** Error thrown when a notebook cell has invalid structure */
export class NotebookStructureError extends Error {
  constructor(
    message: string,
    public readonly cellIndex: number,
    public readonly lineNumber: number,
    public readonly metadataLanguage: string,
    public readonly fileDefaultLanguage: string,
  ) {
    super(message);
    this.name = 'NotebookStructureError';
  }
}

// ============================================================================
// INTERNAL UTILITIES
// ============================================================================

/**
 * Get the valid raw (uncommented) languages for a file type.
 * Raw cells must match the file's native language - other languages must use MAGIC prefix.
 */
function getValidRawLanguages(defaultLanguage: string): Set<string> {
  switch (defaultLanguage) {
    case 'python':
      // Python files: raw cells can be python or pyspark
      return new Set(['python', 'pyspark']);
    case 'sparksql':
      // SQL files: raw cells must be sparksql
      return new Set(['sparksql']);
    case 'scala':
      // Scala files: raw cells must be scala
      return new Set(['scala']);
    case 'r':
      // R files: raw cells must be r
      return new Set(['r']);
    default:
      return new Set([defaultLanguage]);
  }
}

/**
 * Validate that a raw cell's metadata language matches the file type.
 * Throws NotebookStructureError if there's a mismatch.
 */
function validateRawCellLanguage(
  metadataLanguage: string | null,
  isRawCell: boolean,
  config: LanguageConfig,
  cellIndex: number,
  lineNumber: number,
): void {
  if (!isRawCell || !metadataLanguage) {
    // MAGIC cells can have any language, and cells without metadata are fine
    return;
  }

  const validRawLanguages = getValidRawLanguages(config.defaultLanguage);
  const normalizedLanguage = metadataLanguage.toLowerCase();

  if (!validRawLanguages.has(normalizedLanguage)) {
    const fileType =
      config.defaultLanguage === 'python'
        ? '.py'
        : config.defaultLanguage === 'sparksql'
          ? '.sql'
          : config.defaultLanguage === 'scala'
            ? '.scala'
            : config.defaultLanguage === 'r'
              ? '.r'
              : `.${config.defaultLanguage}`;

    throw new NotebookStructureError(
      `Invalid notebook structure: Cell ${cellIndex + 1} (line ${lineNumber + 1}) has metadata language "${metadataLanguage}" ` +
        `but is not wrapped with MAGIC prefix. In ${fileType} files, only ${config.defaultLanguage} cells can be raw/uncommented. ` +
        `Other languages (like ${metadataLanguage}) must use the "${config.magicPrefix}%%" prefix.`,
      cellIndex,
      lineNumber,
      metadataLanguage,
      config.defaultLanguage,
    );
  }
}

/**
 * Line ending constant - this library standardizes on LF.
 */
const LINE_ENDING = '\n';

/**
 * Get language config based on file extension.
 * The file extension determines the default language and comment syntax.
 */
function getLanguageConfig(fileExtension: string): LanguageConfig | null {
  const ext = fileExtension.toLowerCase();
  switch (ext) {
    case '.py':
      return PYTHON_CONFIG;
    case '.scala':
      return SCALA_CONFIG;
    case '.sql':
      return SPARKSQL_CONFIG;
    case '.r':
      return R_CONFIG;
    default:
      return null;
  }
}

/**
 * Validate that the file content is a Fabric notebook.
 * Checks that the first line matches the expected header for the config.
 */
function isFabricNotebookContent(
  firstLine: string,
  config: LanguageConfig,
): boolean {
  return firstLine.trim().startsWith(config.fabricHeader);
}

/**
 * Extract the magic command from cell lines (e.g., 'sql', 'pyspark', 'configure').
 * Returns null if no magic command is present.
 */
function extractMagicCommand(
  lines: string[],
  config: LanguageConfig,
): string | null {
  for (const line of lines) {
    const trimmed = line.trim();

    // Look for magic command pattern: # MAGIC %%<command>
    const magicPrefix = `${config.magicPrefix}%%`;
    if (trimmed.startsWith(magicPrefix)) {
      // Extract command name (everything after %% until space or end)
      const afterPrefix = trimmed.slice(magicPrefix.length);
      const match = afterPrefix.match(/^(\w+)/);
      if (match) {
        return match[1].toLowerCase();
      }
    }
  }
  return null;
}

/**
 * Parse the METADATA block to extract the language.
 * Returns the language string or null if not found.
 */
function parseMetadataLanguage(
  lines: string[],
  startLine: number,
  config: LanguageConfig,
): string | null {
  // Find the METADATA marker
  let i = startLine;
  while (i < lines.length && lines[i].trim() !== config.metadataMarker) {
    i++;
  }

  if (i >= lines.length) return null;

  // Parse the META JSON block
  // Format: # META { ... "language": "sparksql" ... }
  const metaPrefix = config.magicPrefix.replace('MAGIC', 'META').trim();
  let jsonContent = '';

  i++; // Skip the METADATA marker
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === config.cellMarker || trimmed === config.metadataMarker) {
      break;
    }

    // Extract content after # META prefix
    if (trimmed.startsWith(metaPrefix)) {
      jsonContent += trimmed.slice(metaPrefix.length).trim();
    }
    i++;
  }

  // Try to parse and extract language
  try {
    const meta = JSON.parse(jsonContent);
    if (meta && typeof meta.language === 'string') {
      return meta.language;
    }
  } catch {
    // JSON parsing failed, ignore
  }

  return null;
}

/**
 * Detect the language of a cell based on magic commands.
 * @deprecated Use parseMetadataLanguage instead - kept for backward compatibility
 */
function detectCellLanguage(lines: string[], config: LanguageConfig): string {
  for (const line of lines) {
    const trimmed = line.trim();

    // Check for magic commands
    if (
      trimmed === config.magicSqlCommand ||
      trimmed.startsWith(`${config.magicPrefix}%%sql`)
    ) {
      return 'sparksql';
    }
    if (
      trimmed === `${config.magicPrefix}%%python` ||
      trimmed.startsWith(`${config.magicPrefix}%%python `)
    ) {
      return 'python';
    }
    if (
      trimmed === `${config.magicPrefix}%%pyspark` ||
      trimmed.startsWith(`${config.magicPrefix}%%pyspark `)
    ) {
      return 'python'; // PySpark is Python
    }
    if (
      trimmed === `${config.magicPrefix}%%scala` ||
      trimmed.startsWith(`${config.magicPrefix}%%scala `)
    ) {
      return 'scala';
    }
    if (
      trimmed === `${config.magicPrefix}%%r` ||
      trimmed === `${config.magicPrefix}%%R`
    ) {
      return 'r';
    }

    // First non-empty, non-magic line determines if it's a raw cell
    if (trimmed !== '' && !trimmed.startsWith(config.magicPrefix.trim())) {
      return config.defaultLanguage;
    }
  }

  return config.defaultLanguage;
}

/**
 * Strip MAGIC prefix from a line.
 */
function stripMagicPrefix(line: string, config: LanguageConfig): string {
  if (line.startsWith(config.magicPrefix)) {
    return line.slice(config.magicPrefix.length);
  }
  // Check for empty magic line (with or without trailing space)
  const trimmed = line.trim();
  if (trimmed === config.emptyMagic.trim()) {
    return '';
  }
  return line;
}

/**
 * Add MAGIC prefix to lines.
 */
function addMagicPrefix(content: string, config: LanguageConfig): string[] {
  return content.split(/\r?\n/).map((line) => {
    if (line === '') return config.emptyMagic;
    return config.magicPrefix + line;
  });
}

/**
 * Parse a Fabric notebook file into cells.
 * @param content The file content
 * @param fileExtension The file extension (e.g., '.py', '.sql', '.scala', '.r')
 */
export function parseNotebook(
  content: string,
  fileExtension: string,
): FabricNotebook {
  const lines = content.split(/\r?\n/);
  const result: FabricNotebook = {
    isFabricNotebook: false,
    cells: [],
    lines,
    config: null,
  };

  if (lines.length === 0) return result;

  const config = getLanguageConfig(fileExtension);
  if (!config) return result;

  // Validate it's actually a Fabric notebook
  if (!isFabricNotebookContent(lines[0], config)) return result;

  result.isFabricNotebook = true;
  result.config = config;

  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === config.cellMarker) {
      const cellStartLine = i + 1;

      // Skip empty lines after CELL marker
      let j = cellStartLine;
      while (j < lines.length && lines[j].trim() === '') {
        j++;
      }

      // Find end of cell
      let cellEndLine = j;
      while (cellEndLine < lines.length) {
        const trimmed = lines[cellEndLine].trim();
        if (
          trimmed === config.metadataMarker ||
          trimmed === config.cellMarker
        ) {
          break;
        }
        cellEndLine++;
      }

      // Back up past trailing empty lines
      let actualEndLine = cellEndLine - 1;
      while (actualEndLine >= j && lines[actualEndLine].trim() === '') {
        actualEndLine--;
      }

      if (actualEndLine >= j) {
        const originalLines = lines.slice(j, actualEndLine + 1);

        // Get language from METADATA block (authoritative source)
        const metadataLanguage = parseMetadataLanguage(
          lines,
          cellEndLine,
          config,
        );

        // Map metadata language to our internal language names
        let language: string;
        if (metadataLanguage === 'sparksql') {
          language = 'sparksql';
        } else if (
          metadataLanguage === 'python' ||
          metadataLanguage === 'pyspark'
        ) {
          language = 'python';
        } else if (metadataLanguage === 'scala') {
          language = 'scala';
        } else if (metadataLanguage === 'r' || metadataLanguage === 'R') {
          language = 'r';
        } else if (metadataLanguage) {
          language = metadataLanguage;
        } else {
          // Fallback to magic-based detection if no metadata
          language = detectCellLanguage(originalLines, config);
        }

        // Extract magic command (e.g., 'sql', 'pyspark', 'configure')
        const magicCommand = extractMagicCommand(originalLines, config);

        // Check if it's a MAGIC cell
        const isMagicCell = originalLines.some((l) =>
          l.trim().startsWith(config.magicPrefix.trim()),
        );

        // Validate that raw cells have a language matching the file type
        const cellIndex = result.cells.length;
        validateRawCellLanguage(
          metadataLanguage,
          !isMagicCell,
          config,
          cellIndex,
          j,
        );

        // Extract content
        let content: string;
        let contentStartLine = j;

        if (isMagicCell) {
          // Skip the magic command line (%%sql, %%python, etc.)
          const magicCommandIndex = originalLines.findIndex((l) =>
            l.trim().startsWith(`${config.magicPrefix}%%`),
          );

          if (magicCommandIndex >= 0) {
            const contentLines = originalLines.slice(magicCommandIndex + 1);
            content = contentLines
              .map((l) => stripMagicPrefix(l, config))
              .join('\n');
            contentStartLine = j + magicCommandIndex + 1;
          } else {
            content = originalLines
              .map((l) => stripMagicPrefix(l, config))
              .join('\n');
          }
        } else {
          content = originalLines.join('\n');
        }

        result.cells.push({
          contentStartLine: contentStartLine,
          contentEndLine: actualEndLine,
          content,
          originalLines,
          language,
          isMagicCell,
          isRawCell: !isMagicCell,
          magicCommand,
        });
      }

      i = cellEndLine;
      continue;
    }
    i++;
  }

  return result;
}

/**
 * Replace a cell's content in the file.
 */
function replaceCell(
  fileContent: string,
  cell: NotebookCell,
  formattedContent: string,
  config: LanguageConfig,
): string {
  const lines = fileContent.split(/\r?\n/);

  let newLines: string[];
  if (cell.isMagicCell && cell.magicCommand) {
    // For magic cells, prepend the magic command (without trailing whitespace)
    const magicCommandLine = `${config.magicPrefix}%%${cell.magicCommand}`;
    newLines = [magicCommandLine, ...addMagicPrefix(formattedContent, config)];

    // Find where the magic command line starts (search backwards from contentStartLine)
    let magicLineIndex = cell.contentStartLine - 1;
    while (
      magicLineIndex >= 0 &&
      !lines[magicLineIndex].trim().startsWith(`${config.magicPrefix}%%`)
    ) {
      magicLineIndex--;
    }

    const before = lines.slice(
      0,
      magicLineIndex >= 0 ? magicLineIndex : cell.contentStartLine,
    );
    const after = lines.slice(cell.contentEndLine + 1);

    return [...before, ...newLines, ...after].join(LINE_ENDING);
  } else {
    newLines = cell.isMagicCell
      ? addMagicPrefix(formattedContent, config)
      : formattedContent.split(/\r?\n/);

    const before = lines.slice(0, cell.contentStartLine);
    const after = lines.slice(cell.contentEndLine + 1);

    return [...before, ...newLines, ...after].join(LINE_ENDING);
  }
}

/**
 * Format all cells in a Fabric notebook.
 *
 * This is the high-level API for formatting entire notebook files.
 * It parses the notebook structure, extracts cells, formats them using
 * the low-level formatCell API, and reassembles with proper comment wrappers.
 *
 * @param content The file content
 * @param fileExtension The file extension (e.g., '.py', '.sql', '.scala', '.r')
 * @param options Formatting options
 * @returns Object with formatted content and statistics
 */
export async function formatNotebook(
  content: string,
  fileExtension: string,
  options?: {
    formatSql?: boolean;
    formatPython?: boolean;
    configPath?: string;
  },
): Promise<{ content: string; stats: FormatStats }> {
  const formatSparkSqlCells = options?.formatSql ?? true;
  const formatPythonCells = options?.formatPython ?? true;

  const stats: FormatStats = {
    sparkSqlCellsFormatted: 0,
    pythonCellsFormatted: 0,
    cellsSkipped: 0,
    errors: [],
  };

  const notebook = parseNotebook(content, fileExtension);

  if (
    !notebook.isFabricNotebook ||
    notebook.cells.length === 0 ||
    !notebook.config
  ) {
    return { content, stats };
  }

  // Initialize Python formatter if needed
  if (formatPythonCells) {
    try {
      await initializePythonFormatter();
    } catch (error) {
      stats.errors.push(`Python formatter init failed: ${error}`);
    }
  }

  // Process cells in reverse order (to preserve line numbers)
  let result = content;
  const cellsReversed = [...notebook.cells].reverse();

  for (const cell of cellsReversed) {
    // Determine if this cell should be formatted based on language and magic command
    // Spark SQL cells: format only if %%sql magic or no magic command
    // Python cells: format only if %%pyspark magic or no magic command
    const magicCmd = cell.magicCommand;

    const shouldFormatSparkSql =
      cell.language === 'sparksql' &&
      formatSparkSqlCells &&
      (magicCmd === null || magicCmd === 'sql');

    const shouldFormatPython =
      cell.language === 'python' &&
      formatPythonCells &&
      (magicCmd === null || magicCmd === 'pyspark');

    if (shouldFormatSparkSql) {
      // Format using low-level API (cell.content is already stripped of MAGIC prefixes)
      const formatResult = formatCell(cell.content, 'sparksql');

      if (formatResult.changed) {
        // replaceCell will add back MAGIC prefixes if needed
        result = replaceCell(
          result,
          cell,
          formatResult.formatted,
          notebook.config,
        );
        stats.sparkSqlCellsFormatted++;
      }

      if (formatResult.error) {
        stats.errors.push(formatResult.error);
      }
    } else if (shouldFormatPython) {
      // Format using low-level API (cell.content is already stripped of MAGIC prefixes)
      const formatResult = formatCell(cell.content, 'python');

      if (formatResult.changed) {
        // replaceCell will add back MAGIC prefixes if needed
        result = replaceCell(
          result,
          cell,
          formatResult.formatted,
          notebook.config,
        );
        stats.pythonCellsFormatted++;
      }

      if (formatResult.error) {
        stats.errors.push(formatResult.error);
      }
    } else {
      stats.cellsSkipped++;
    }
  }

  return { content: result, stats };
}
