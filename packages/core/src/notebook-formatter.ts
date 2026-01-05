/**
 * Notebook Formatter
 *
 * High-level API for parsing and formatting Microsoft Fabric notebook files.
 * Handles the notebook structure, cell extraction, and comment wrapper management.
 *
 * For low-level cell formatting (when you already know the cell type),
 * use the cell-formatter module directly.
 *
 * ## Error Handling Design
 *
 * This module uses two distinct error patterns based on error recoverability:
 *
 * | Error Type | Handling | When |
 * |------------|----------|------|
 * | Structural errors | Throws exception | File has invalid format (cannot proceed) |
 * | Formatting errors | Returns in stats.errors | Individual cell failed (other cells still processed) |
 *
 * **Why the difference?**
 *
 * - `NotebookStructureError` (thrown): Fatal errors that prevent processing.
 *   Examples: wrong language in raw cell, malformed metadata. The file cannot
 *   be safely formatted when structure is invalid.
 *
 * - `stats.errors` (returned): Non-fatal errors where formatting continues.
 *   Examples: syntax errors in individual cells. The cell content is preserved
 *   unchanged, and other cells are still formatted.
 *
 * @example
 * ```typescript
 * try {
 *   const { formatted, stats } = formatNotebook(content, '.py');
 *   if (stats.errors.length > 0) {
 *     console.warn('Some cells had errors:', stats.errors);
 *   }
 * } catch (e) {
 *   if (e instanceof NotebookStructureError) {
 *     console.error('Invalid notebook structure:', e.message);
 *   }
 * }
 * ```
 *
 * ## File formats
 *
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

import { formatCell, initializeMarkdownFormatter, initializePythonFormatter } from './cell-formatter.js';

// Re-export cell-formatter types and functions for convenience
export {
  type CellType,
  type FormatCellResult,
  formatCell,
  formatCellSync,
  initializeMarkdownFormatter,
  initializePythonFormatter,
  isMarkdownFormatterReady,
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
  /** Markdown cell header marker */
  markdownMarker: string;
  /** Comment prefix for markdown content lines */
  markdownContentPrefix: string;
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
  markdownMarker: '# MARKDOWN ********************',
  markdownContentPrefix: '# ',
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
  markdownMarker: '// MARKDOWN ********************',
  markdownContentPrefix: '// ',
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
  markdownMarker: '-- MARKDOWN ********************',
  markdownContentPrefix: '-- ',
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
  /** Whether this is a markdown cell (MARKDOWN header) */
  isMarkdownCell: boolean;
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
/**
 * Statistics from a notebook formatting operation.
 *
 * The `errors` array contains non-fatal formatting errors from individual cells.
 * These are formatting failures that don't prevent the overall operation from
 * completing - the cell content is preserved unchanged, and other cells continue
 * to be formatted.
 *
 * Note: Fatal structural errors (invalid notebook format, wrong language in raw
 * cells) throw `NotebookStructureError` instead of being added to this array.
 */
export interface FormatStats {
  /** Number of Spark SQL cells that were formatted */
  sparkSqlCellsFormatted: number;
  /** Number of Python cells that were formatted */
  pythonCellsFormatted: number;
  /** Number of Markdown cells that were formatted */
  markdownCellsFormatted: number;
  /** Number of cells skipped (unsupported languages like Scala, R) */
  cellsSkipped: number;
  /** Non-fatal errors from individual cell formatting (cell content preserved) */
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
 * Strip markdown content prefix from a line.
 * For Python: '# ' -> '', '#' (empty line marker) -> ''
 */
function stripMarkdownContentPrefix(
  line: string,
  config: LanguageConfig,
): string {
  // Handle lines with content prefix followed by text
  if (line.startsWith(config.markdownContentPrefix)) {
    return line.slice(config.markdownContentPrefix.length);
  }
  // Handle empty markdown lines (just the comment character)
  const trimmed = line.trim();
  if (trimmed === config.markdownContentPrefix.trim()) {
    return '';
  }
  return line;
}

/**
 * Add markdown content prefix to lines.
 */
function addMarkdownContentPrefix(
  content: string,
  config: LanguageConfig,
): string[] {
  return content.split(/\r?\n/).map((line) => {
    if (line === '') return config.markdownContentPrefix.trim();
    return config.markdownContentPrefix + line;
  });
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

        // Check if this is a markdown cell (starts with MARKDOWN marker)
        const isMarkdownCell =
          originalLines.length > 0 &&
          originalLines[0].trim() === config.markdownMarker;

        // Get language from METADATA block (authoritative source)
        const metadataLanguage = parseMetadataLanguage(
          lines,
          cellEndLine,
          config,
        );

        // Map metadata language to our internal language names
        let language: string;
        if (isMarkdownCell) {
          // Markdown cells override metadata
          language = 'markdown';
        } else if (metadataLanguage === 'sparksql') {
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
        } else if (metadataLanguage === 'markdown') {
          language = 'markdown';
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
        // Skip validation for markdown cells (they always use comment prefix)
        const cellIndex = result.cells.length;
        if (!isMarkdownCell) {
          validateRawCellLanguage(
            metadataLanguage,
            !isMagicCell,
            config,
            cellIndex,
            j,
          );
        }

        // Extract content
        let content: string;
        let contentStartLine = j;

        if (isMarkdownCell) {
          // Markdown cell: skip header line and strip content prefix
          const contentLines = originalLines.slice(1); // Skip MARKDOWN header
          content = contentLines
            .map((l) => stripMarkdownContentPrefix(l, config))
            .join('\n');
          contentStartLine = j + 1;
        } else if (isMagicCell) {
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
          isRawCell: !isMagicCell && !isMarkdownCell,
          isMarkdownCell,
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
 * Represents a cell replacement to be applied.
 */
interface CellReplacement {
  /** Start line index (0-based) of the range to replace */
  startLine: number;
  /** End line index (0-based, inclusive) of the range to replace */
  endLine: number;
  /** New lines to insert in place of the original range */
  newLines: string[];
}

/**
 * Compute new lines for a cell replacement (handles MAGIC prefixes).
 */
function computeReplacementLines(
  cell: NotebookCell,
  formattedContent: string,
  config: LanguageConfig,
  originalLines: string[],
): { startLine: number; newLines: string[] } {
  let newLines: string[];
  let startLine = cell.contentStartLine;

  if (cell.isMagicCell && cell.magicCommand) {
    // For magic cells, prepend the magic command (without trailing whitespace)
    const magicCommandLine = `${config.magicPrefix}%%${cell.magicCommand}`;
    newLines = [magicCommandLine, ...addMagicPrefix(formattedContent, config)];

    // Find where the magic command line starts (search backwards from contentStartLine)
    let magicLineIndex = cell.contentStartLine - 1;
    while (
      magicLineIndex >= 0 &&
      !originalLines[magicLineIndex]
        .trim()
        .startsWith(`${config.magicPrefix}%%`)
    ) {
      magicLineIndex--;
    }
    if (magicLineIndex >= 0) {
      startLine = magicLineIndex;
    }
  } else {
    newLines = cell.isMagicCell
      ? addMagicPrefix(formattedContent, config)
      : formattedContent.split(/\r?\n/);
  }

  return { startLine, newLines };
}

/**
 * Compute new lines for a markdown cell replacement.
 * Markdown cells have a MARKDOWN header followed by content with comment prefix.
 */
function computeMarkdownReplacementLines(
  cell: NotebookCell,
  formattedContent: string,
  config: LanguageConfig,
  originalLines: string[],
): { startLine: number; newLines: string[] } {
  // For markdown cells, we need to:
  // 1. Keep the MARKDOWN header
  // 2. Add content prefix to each formatted line
  let startLine = cell.contentStartLine;

  // Find where the MARKDOWN header is (should be at cell start before content)
  let markdownHeaderLine = cell.contentStartLine - 1;
  while (
    markdownHeaderLine >= 0 &&
    originalLines[markdownHeaderLine].trim() !== config.markdownMarker
  ) {
    markdownHeaderLine--;
  }

  if (markdownHeaderLine >= 0) {
    startLine = markdownHeaderLine;
  }

  // Build new lines: MARKDOWN header + content with prefix
  const newLines = [
    config.markdownMarker,
    ...addMarkdownContentPrefix(formattedContent, config),
  ];

  return { startLine, newLines };
}

/**
 * Apply all cell replacements to the lines array in one pass.
 * Replacements must be sorted by startLine in descending order.
 */
function applyReplacements(
  lines: string[],
  replacements: CellReplacement[],
): string[] {
  // Work on a copy to avoid mutation
  const result = [...lines];

  // Apply replacements in reverse order (already sorted descending)
  // This preserves line indices for later replacements
  for (const { startLine, endLine, newLines } of replacements) {
    result.splice(startLine, endLine - startLine + 1, ...newLines);
  }

  return result;
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
    formatMarkdown?: boolean;
    configPath?: string;
    /** File path for error context (optional) */
    filePath?: string;
  },
): Promise<{ content: string; stats: FormatStats }> {
  const formatSparkSqlCells = options?.formatSql ?? true;
  const formatPythonCells = options?.formatPython ?? true;
  const formatMarkdownCells = options?.formatMarkdown ?? true;
  const filePath = options?.filePath;

  const stats: FormatStats = {
    sparkSqlCellsFormatted: 0,
    pythonCellsFormatted: 0,
    markdownCellsFormatted: 0,
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

  // Initialize Markdown formatter if needed
  if (formatMarkdownCells) {
    try {
      await initializeMarkdownFormatter();
    } catch (error) {
      stats.errors.push(`Markdown formatter init failed: ${error}`);
    }
  }

  // Collect all cell replacements (format cells and gather changes)
  // Process in reverse order so we can apply replacements without recalculating indices
  const replacements: CellReplacement[] = [];
  const totalCells = notebook.cells.length;

  for (let reverseIdx = 0; reverseIdx < totalCells; reverseIdx++) {
    const originalIdx = totalCells - 1 - reverseIdx;
    const cell = notebook.cells[originalIdx];

    // Create context for error messages (1-based cell index for user-friendliness)
    const context = {
      cellIndex: originalIdx + 1,
      filePath,
      language: cell.language,
    };

    // Determine if this cell should be formatted based on language and magic command
    // Spark SQL cells: format only if %%sql magic or no magic command
    // Python cells: format only if %%pyspark magic or no magic command
    // Markdown cells: format if language is markdown
    const magicCmd = cell.magicCommand;

    const shouldFormatSparkSql =
      cell.language === 'sparksql' &&
      formatSparkSqlCells &&
      (magicCmd === null || magicCmd === 'sql');

    const shouldFormatPython =
      cell.language === 'python' &&
      formatPythonCells &&
      (magicCmd === null || magicCmd === 'pyspark');

    const shouldFormatMarkdown =
      cell.language === 'markdown' && formatMarkdownCells;

    if (shouldFormatSparkSql) {
      // Format using low-level API (cell.content is already stripped of MAGIC prefixes)
      const formatResult = formatCell(cell.content, 'sparksql', context);

      if (formatResult.changed) {
        // Compute replacement lines (handles MAGIC prefixes)
        const { startLine, newLines } = computeReplacementLines(
          cell,
          formatResult.formatted,
          notebook.config,
          notebook.lines,
        );
        replacements.push({
          startLine,
          endLine: cell.contentEndLine,
          newLines,
        });
        stats.sparkSqlCellsFormatted++;
      }

      if (formatResult.error) {
        stats.errors.push(formatResult.error);
      }
    } else if (shouldFormatPython) {
      // Format using low-level API (cell.content is already stripped of MAGIC prefixes)
      const formatResult = formatCell(cell.content, 'python', context);

      if (formatResult.changed) {
        // Compute replacement lines (handles MAGIC prefixes)
        const { startLine, newLines } = computeReplacementLines(
          cell,
          formatResult.formatted,
          notebook.config,
          notebook.lines,
        );
        replacements.push({
          startLine,
          endLine: cell.contentEndLine,
          newLines,
        });
        stats.pythonCellsFormatted++;
      }

      if (formatResult.error) {
        stats.errors.push(formatResult.error);
      }
    } else if (shouldFormatMarkdown) {
      // Format using low-level API (cell.content is already stripped of comment prefixes)
      const formatResult = formatCell(cell.content, 'markdown', context);

      if (formatResult.changed) {
        // Compute replacement lines for markdown (uses comment prefix, not MAGIC)
        const { startLine, newLines } = computeMarkdownReplacementLines(
          cell,
          formatResult.formatted,
          notebook.config,
          notebook.lines,
        );
        replacements.push({
          startLine,
          endLine: cell.contentEndLine,
          newLines,
        });
        stats.markdownCellsFormatted++;
      }

      if (formatResult.error) {
        stats.errors.push(formatResult.error);
      }
    } else {
      stats.cellsSkipped++;
    }
  }

  // Apply all replacements in one pass (already sorted descending by startLine)
  if (replacements.length > 0) {
    const resultLines = applyReplacements(notebook.lines, replacements);
    return { content: resultLines.join(LINE_ENDING), stats };
  }

  return { content, stats };
}
