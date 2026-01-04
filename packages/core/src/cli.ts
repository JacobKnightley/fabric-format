#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CellType,
  detectLanguagesInContent,
  formatCell,
  initializeFormatters,
  initializePythonFormatter,
} from './cell-formatter.js';
import { isSupportedFile } from './file-utils.js';
/**
 * CLI for Fabric Notebook Formatter (Spark SQL & Python)
 *
 * Commands:
 *   fabfmt format <files...>       - Format files in-place
 *   fabfmt format --type sparksql  - Format stdin (pipe mode)
 *   fabfmt check <files...>        - Check if files need formatting
 */
import { formatNotebook } from './notebook-formatter.js';

/**
 * Result from running CLI programmatically (for testing)
 */
export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Context for CLI execution - allows capturing output and customizing I/O
 */
export interface CliContext {
  stdout: (msg: string) => void;
  stderr: (msg: string) => void;
  exit: (code: number) => void;
  readStdin: () => Promise<string>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  stat: (path: string) => Promise<fs.Stats>;
  readdir: (path: string) => Promise<fs.Dirent[]>;
}

/**
 * Create the default CLI context that uses real process I/O
 */
function createDefaultContext(): CliContext {
  return {
    stdout: (msg: string) => {
      process.stdout.write(msg);
    },
    stderr: (msg: string) => console.error(msg),
    exit: (code: number) => process.exit(code),
    readStdin: async () => {
      return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
          data += chunk;
        });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
      });
    },
    readFile: async (p: string) => fs.promises.readFile(p, 'utf-8'),
    writeFile: async (p: string, content: string) =>
      fs.promises.writeFile(p, content, 'utf-8'),
    stat: async (p: string) => fs.promises.stat(p),
    readdir: async (p: string) =>
      fs.promises.readdir(p, { withFileTypes: true }),
  };
}

/**
 * Recursively find all files with supported extensions in a directory.
 */
async function findSupportedFiles(
  dir: string,
  ctx: CliContext,
): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = await ctx.readdir(currentDir);
    } catch (e: unknown) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        ctx.stderr(`Error: Permission denied reading directory: ${currentDir}`);
      } else if (error.code === 'ENOENT') {
        ctx.stderr(`Error: Directory not found: ${currentDir}`);
      } else {
        ctx.stderr(
          `Error: Cannot read directory ${currentDir}: ${error.message}`,
        );
      }
      ctx.exit(2);
      return; // TypeScript: unreachable but makes control flow analysis happy
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      // Handle symlinks by checking what they point to
      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const stat = await ctx.stat(fullPath);
          isDir = stat.isDirectory();
          isFile = stat.isFile();
        } catch {
          // Broken symlink - skip it
          continue;
        }
      }

      if (isDir) {
        // Skip common non-source directories
        if (
          ![
            'node_modules',
            '.git',
            '__pycache__',
            '.venv',
            'venv',
            'dist',
            'build',
          ].includes(entry.name)
        ) {
          await walk(fullPath);
        }
      } else if (isFile) {
        if (isSupportedFile(fullPath)) {
          files.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return files;
}

/**
 * Expand a list of paths to include files from directories.
 */
async function expandPaths(
  paths: string[],
  ctx: CliContext,
): Promise<string[]> {
  const files: string[] = [];
  for (const p of paths) {
    let stat: fs.Stats;
    try {
      stat = await ctx.stat(p);
    } catch (e: unknown) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        ctx.stderr(`Error: File or directory not found: ${p}`);
      } else if (error.code === 'EACCES' || error.code === 'EPERM') {
        ctx.stderr(`Error: Permission denied accessing: ${p}`);
      } else {
        ctx.stderr(`Error: Cannot access ${p}: ${error.message}`);
      }
      ctx.exit(2);
      return []; // TypeScript: unreachable but makes control flow analysis happy
    }
    if (stat.isDirectory()) {
      files.push(...(await findSupportedFiles(p, ctx)));
    } else {
      files.push(p);
    }
  }
  return files;
}

/**
 * Format a Fabric notebook file.
 */
async function formatFile(content: string, filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const { content: formatted } = await formatNotebook(content, ext, {
    formatPython: true,
    formatSql: true,
    filePath, // Pass file path for error context
  });
  return formatted;
}

/**
 * Normalize line endings to LF (Unix style).
 * This library standardizes on LF for all output.
 * Handles: CRLF (Windows), CR (old Mac), mixed endings.
 */
function normalizeLineEndings(content: string): string {
  // Replace CRLF first (Windows), then standalone CR (old Mac)
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Print main help */
function printHelp(ctx: CliContext) {
  ctx.stdout(`fabfmt - Fabric Notebook Formatter (Spark SQL & Python)

Usage:
  fabfmt <command> [options] [arguments]

Commands:
  format <files...>    Format files or directories in-place
  check <files...>     Check if files need formatting (exit 1 if so)

Run 'fabfmt <command> --help' for command-specific help.
`);
}

/** Print format command help */
function printFormatHelp(ctx: CliContext) {
  ctx.stdout(`fabfmt format - Format files in-place

Usage:
  fabfmt format [options] <file|directory...>
  fabfmt format --type <type> [-i <string>]

Arguments:
  file        A .sql, .py, .scala, or .r Fabric notebook file
  directory   Recursively format all supported files

Options:
  --type <type>  Cell type: sparksql, python, or pyspark
                 Required for stdin or inline input
  -i <string>    Inline string to format (requires --type)
  --print        Print formatted output instead of modifying file
  -h, --help     Show this help message

Examples:
  fabfmt format notebook.py                                Format a single file
  fabfmt format ./src                                      Format all files in directory
  fabfmt format query.sql --print                          Print formatted output
  fabfmt format --type sparksql -i "select * from t"       Format inline string
  echo "select * from t" | fabfmt format --type sparksql   Format from stdin
`);
}

/** Print check command help */
function printCheckHelp(ctx: CliContext) {
  ctx.stdout(`fabfmt check - Check if files need formatting

Usage:
  fabfmt check [options] <file|directory...>
  fabfmt check --type <type> [-i <string>]

Arguments:
  file        A .sql, .py, .scala, or .r Fabric notebook file
  directory   Recursively check all supported files

Options:
  --type <type>  Cell type: sparksql, python, or pyspark
                 Required for stdin or inline input
  -i <string>    Inline string to check (requires --type)
  -h, --help     Show this help message

Exit codes:
  0  All files are properly formatted / input needs no changes
  1  One or more files need formatting / input needs formatting

Examples:
  fabfmt check notebook.py                                Check a single file
  fabfmt check ./src                                      Check all files in directory
  fabfmt check --type sparksql -i "select * from t"       Check inline string
  echo "select * from t" | fabfmt check --type sparksql   Check from stdin
`);
}

/** Parse --type argument */
function parseType(
  args: string[],
  ctx: CliContext,
): {
  type: CellType | null;
  remaining: string[];
} {
  const remaining: string[] = [];
  let type: CellType | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        const cellType = nextArg.toLowerCase();
        if (
          cellType === 'sparksql' ||
          cellType === 'python' ||
          cellType === 'pyspark'
        ) {
          type = cellType as CellType;
          i++; // Skip next arg
        } else {
          ctx.stderr(
            `Error: Invalid type '${cellType}'. Use sparksql, python, or pyspark.`,
          );
          ctx.exit(2);
        }
      } else {
        ctx.stderr(
          'Error: --type requires a value (sparksql, python, or pyspark)',
        );
        ctx.exit(2);
      }
    } else {
      remaining.push(args[i]);
    }
  }

  return { type, remaining };
}

/** Parse -i argument */
function parseInline(
  args: string[],
  ctx: CliContext,
): {
  inline: string | null;
  remaining: string[];
} {
  const remaining: string[] = [];
  let inline: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-i') {
      const nextArg = args[i + 1];
      if (nextArg !== undefined) {
        inline = nextArg;
        i++; // Skip next arg
      } else {
        ctx.stderr('Error: -i requires a string value');
        ctx.exit(2);
      }
    } else {
      remaining.push(args[i]);
    }
  }

  return { inline, remaining };
}

/** Format command: format files in-place or stdin */
async function cmdFormat(args: string[], ctx: CliContext): Promise<void> {
  if (args.includes('-h') || args.includes('--help')) {
    printFormatHelp(ctx);
    return;
  }

  const toPrint = args.includes('--print');
  const argsWithoutPrint = args.filter((a) => a !== '--print');
  const { type, remaining: argsAfterType } = parseType(argsWithoutPrint, ctx);
  const { inline, remaining: paths } = parseInline(argsAfterType, ctx);

  // Inline mode: -i with --type
  if (inline !== null) {
    if (!type) {
      ctx.stderr('Error: -i requires --type (sparksql, python, or pyspark)');
      ctx.exit(2);
      return; // TypeScript: unreachable but makes control flow analysis happy
    }

    // Initialize Python formatter if needed
    if (type === 'python' || type === 'pyspark') {
      await initializePythonFormatter();
    }

    const result = formatCell(inline, type);

    if (result.error) {
      ctx.stderr(`Error: ${result.error}`);
      ctx.exit(1);
    }

    ctx.stdout(result.formatted);
    return;
  }

  // Stdin mode: --type specified with no files
  if (type && paths.length === 0) {
    // Initialize Python formatter if needed
    if (type === 'python' || type === 'pyspark') {
      await initializePythonFormatter();
    }

    const content = await ctx.readStdin();
    const result = formatCell(content, type);

    if (result.error) {
      ctx.stderr(`Error: ${result.error}`);
      ctx.exit(1);
    }

    ctx.stdout(result.formatted);
    return;
  }

  if (paths.length === 0) {
    ctx.stderr('Error: No files or directories specified');
    ctx.stderr('Run "fabfmt format --help" for usage');
    ctx.exit(2);
  }

  // --print mode: single file to stdout
  if (toPrint) {
    if (paths.length !== 1) {
      ctx.stderr('Error: --print requires exactly one file');
      ctx.exit(2);
    }
    const file = paths[0];
    let stat: fs.Stats;
    try {
      stat = await ctx.stat(file);
    } catch (e: unknown) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        ctx.stderr(`Error: File not found: ${file}`);
      } else if (error.code === 'EACCES' || error.code === 'EPERM') {
        ctx.stderr(`Error: Permission denied accessing: ${file}`);
      } else {
        ctx.stderr(`Error: Cannot access ${file}: ${error.message}`);
      }
      ctx.exit(2);
      return; // TypeScript: unreachable but makes control flow analysis happy
    }
    if (stat.isDirectory()) {
      ctx.stderr('Error: --print cannot be used with directories');
      ctx.exit(2);
    }
    let content: string;
    try {
      content = await ctx.readFile(file);
    } catch (e: unknown) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        ctx.stderr(`Error: Permission denied reading: ${file}`);
      } else if (error.code === 'EBUSY') {
        ctx.stderr(`Error: File is locked or busy: ${file}`);
      } else {
        ctx.stderr(`Error: Cannot read ${file}: ${error.message}`);
      }
      ctx.exit(2);
      return; // TypeScript: unreachable but makes control flow analysis happy
    }
    const formatted = await formatFile(content, file);
    ctx.stdout(formatted);
    return;
  }

  // Expand directories to files
  const files = await expandPaths(paths, ctx);
  if (files.length === 0) {
    ctx.stdout('No supported files found\n');
    return;
  }

  // Scan files to detect which languages need formatting (lazy init)
  const languagesNeeded = new Set<string>();
  const fileContents = new Map<string, string>();

  for (const file of files) {
    let content: string;
    try {
      content = await ctx.readFile(file);
    } catch (e: unknown) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        ctx.stderr(`Error: Permission denied reading: ${file}`);
      } else if (error.code === 'ENOENT') {
        ctx.stderr(`Error: File not found: ${file}`);
      } else if (error.code === 'EBUSY') {
        ctx.stderr(`Error: File is locked or busy: ${file}`);
      } else {
        ctx.stderr(`Error: Cannot read ${file}: ${error.message}`);
      }
      ctx.exit(1);
      return; // TypeScript: unreachable but makes control flow analysis happy
    }

    fileContents.set(file, normalizeLineEndings(content));
    // Detect languages in this file
    for (const lang of detectLanguagesInContent(content)) {
      languagesNeeded.add(lang);
    }
  }

  // Initialize only the formatters we need (parallel)
  await initializeFormatters(languagesNeeded);

  // Format files in-place
  let formattedCount = 0;
  for (const file of files) {
    const normalizedContent = fileContents.get(file);
    if (!normalizedContent) continue; // Should never happen
    let formatted: string;
    try {
      formatted = await formatFile(normalizedContent, file);
    } catch (e: unknown) {
      const error = e as Error;
      ctx.stderr(`Error formatting ${file}: ${error.message}`);
      ctx.exit(1);
      return; // TypeScript: unreachable but makes control flow analysis happy
    }

    if (formatted !== normalizedContent) {
      try {
        await ctx.writeFile(file, formatted);
      } catch (e: unknown) {
        const error = e as NodeJS.ErrnoException;
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          ctx.stderr(`Error: Permission denied writing: ${file}`);
        } else if (error.code === 'EBUSY') {
          ctx.stderr(`Error: File is locked or busy: ${file}`);
        } else if (error.code === 'EROFS') {
          ctx.stderr(`Error: File system is read-only: ${file}`);
        } else {
          ctx.stderr(`Error: Cannot write ${file}: ${error.message}`);
        }
        ctx.exit(1);
      }
      ctx.stdout(`Formatted ${file}\n`);
      formattedCount++;
    }
  }

  if (formattedCount === 0) {
    ctx.stdout(`All ${files.length} file(s) already formatted\n`);
  } else {
    ctx.stdout(`Formatted ${formattedCount} of ${files.length} file(s)\n`);
  }
}

/** Check command: check if files need formatting */
async function cmdCheck(args: string[], ctx: CliContext): Promise<void> {
  if (args.includes('-h') || args.includes('--help')) {
    printCheckHelp(ctx);
    return;
  }

  const { type, remaining: argsAfterType } = parseType(args, ctx);
  const { inline, remaining: paths } = parseInline(argsAfterType, ctx);

  // Inline mode: -i with --type
  if (inline !== null) {
    if (!type) {
      ctx.stderr('Error: -i requires --type (sparksql, python, or pyspark)');
      ctx.exit(2);
      return; // TypeScript: unreachable but makes control flow analysis happy
    }

    // Initialize Python formatter if needed
    if (type === 'python' || type === 'pyspark') {
      await initializePythonFormatter();
    }

    const result = formatCell(inline, type);

    if (result.error) {
      ctx.stderr(`Error: ${result.error}`);
      ctx.exit(1);
    }

    // Exit 1 if formatting would change the input
    if (result.formatted !== inline) {
      ctx.exit(1);
    }
    return;
  }

  // Stdin mode: --type specified with no files
  if (type && paths.length === 0) {
    // Initialize Python formatter if needed
    if (type === 'python' || type === 'pyspark') {
      await initializePythonFormatter();
    }

    const content = await ctx.readStdin();
    const result = formatCell(content, type);

    if (result.error) {
      ctx.stderr(`Error: ${result.error}`);
      ctx.exit(1);
    }

    // Exit 1 if formatting would change the input
    if (result.formatted !== content) {
      ctx.exit(1);
    }
    return;
  }

  if (paths.length === 0) {
    ctx.stderr('Error: No files or directories specified');
    ctx.stderr('Run "fabfmt check --help" for usage');
    ctx.exit(2);
  }

  // Expand directories to files
  const files = await expandPaths(paths, ctx);
  if (files.length === 0) {
    ctx.stdout('No supported files found\n');
    return;
  }

  // Scan files to detect which languages need formatting (lazy init)
  const languagesNeeded = new Set<string>();
  const fileContents = new Map<string, string>();

  for (const file of files) {
    let content: string;
    try {
      content = await ctx.readFile(file);
    } catch (e: unknown) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        ctx.stderr(`Error: Permission denied reading: ${file}`);
      } else if (error.code === 'ENOENT') {
        ctx.stderr(`Error: File not found: ${file}`);
      } else if (error.code === 'EBUSY') {
        ctx.stderr(`Error: File is locked or busy: ${file}`);
      } else {
        ctx.stderr(`Error: Cannot read ${file}: ${error.message}`);
      }
      ctx.exit(1);
      return; // TypeScript: unreachable but makes control flow analysis happy
    }

    fileContents.set(file, content);
    // Detect languages in this file
    for (const lang of detectLanguagesInContent(content)) {
      languagesNeeded.add(lang);
    }
  }

  // Initialize only the formatters we need (parallel)
  await initializeFormatters(languagesNeeded);

  // Check mode: check without modifying
  let needsFormatting = false;
  for (const file of files) {
    const content = fileContents.get(file);
    if (!content) continue; // Should never happen
    let formatted: string;
    try {
      formatted = await formatFile(content, file);
    } catch (e: unknown) {
      const error = e as Error;
      ctx.stderr(`Error checking ${file}: ${error.message}`);
      ctx.exit(1);
      return; // TypeScript: unreachable but makes control flow analysis happy
    }

    if (formatted !== content) {
      ctx.stdout(`${file}\n`);
      needsFormatting = true;
    }
  }

  if (needsFormatting) {
    ctx.exit(1);
  }
  ctx.stdout(`All ${files.length} file(s) are properly formatted\n`);
}

/**
 * Run CLI with the given arguments and context.
 * Returns a CliResult with captured stdout, stderr, and exit code.
 * This is the main entry point for in-process testing.
 */
export async function runCli(
  cliArgs: string[],
  ctx?: Partial<CliContext>,
): Promise<CliResult> {
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let exitCode = 0;
  let _exited = false;

  // Create a test context that captures output
  const testCtx: CliContext = {
    stdout: (msg: string) => {
      stdoutBuffer += msg;
    },
    stderr: (msg: string) => {
      stderrBuffer += `${msg}\n`;
    },
    exit: (code: number) => {
      exitCode = code;
      _exited = true;
      // Throw to stop execution - will be caught below
      throw new CliExitError(code);
    },
    readStdin: ctx?.readStdin ?? (async () => ''),
    readFile: ctx?.readFile ?? (async (p) => fs.promises.readFile(p, 'utf-8')),
    writeFile:
      ctx?.writeFile ?? (async (p, c) => fs.promises.writeFile(p, c, 'utf-8')),
    stat: ctx?.stat ?? (async (p) => fs.promises.stat(p)),
    readdir:
      ctx?.readdir ??
      (async (p) => fs.promises.readdir(p, { withFileTypes: true })),
  };

  // Override with any provided context methods
  if (ctx?.stdout) testCtx.stdout = ctx.stdout;
  if (ctx?.stderr) testCtx.stderr = ctx.stderr;
  if (ctx?.exit) testCtx.exit = ctx.exit;

  try {
    const command = cliArgs[0];
    const commandArgs = cliArgs.slice(1);

    if (!command || command === '-h' || command === '--help') {
      printHelp(testCtx);
    } else {
      switch (command) {
        case 'format':
          await cmdFormat(commandArgs, testCtx);
          break;
        case 'check':
          await cmdCheck(commandArgs, testCtx);
          break;
        default:
          testCtx.stderr(`Error: Unknown command '${command}'`);
          testCtx.stderr('Run "fabfmt --help" for usage');
          testCtx.exit(2);
      }
    }
  } catch (e: unknown) {
    if (e instanceof CliExitError) {
      // Expected - exit was called
    } else {
      const error = e as Error;
      stderrBuffer += `Error: ${error.message}\n`;
      exitCode = 1;
    }
  }

  return { stdout: stdoutBuffer, stderr: stderrBuffer, exitCode };
}

/** Error thrown when ctx.exit() is called to stop execution */
class CliExitError extends Error {
  constructor(public code: number) {
    super(`CLI exit with code ${code}`);
    this.name = 'CliExitError';
  }
}

/** Main entry point */
async function main() {
  const ctx = createDefaultContext();
  const args = process.argv.slice(2); // Skip node and script path
  const command = args[0];
  const commandArgs = args.slice(1);

  if (!command || command === '-h' || command === '--help') {
    printHelp(ctx);
    return;
  }

  switch (command) {
    case 'format':
      await cmdFormat(commandArgs, ctx);
      break;
    case 'check':
      await cmdCheck(commandArgs, ctx);
      break;
    default:
      ctx.stderr(`Error: Unknown command '${command}'`);
      ctx.stderr('Run "fabfmt --help" for usage');
      ctx.exit(2);
  }
}

// Run main only when executed directly (not when imported)
// Check if this module was run directly by comparing import.meta.url with process.argv[1]
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  main().catch((e) => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
