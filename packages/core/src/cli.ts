#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type CellType,
  formatCell,
  initializePythonFormatter,
} from './cell-formatter.js';
/**
 * CLI for Fabric Notebook Formatter (Spark SQL & Python)
 *
 * Commands:
 *   fabfmt format <files...>       - Format files in-place
 *   fabfmt format --type sparksql  - Format stdin (pipe mode)
 *   fabfmt check <files...>        - Check if files need formatting
 */
import { formatNotebook } from './notebook-formatter.js';

const args = process.argv.slice(2);

/** Supported file extensions for formatting */
const SUPPORTED_EXTENSIONS = ['.sql', '.py', '.scala', '.r'];

/**
 * Read all content from stdin.
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Recursively find all files with supported extensions in a directory.
 */
function findSupportedFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e: any) {
      if (e.code === 'EACCES' || e.code === 'EPERM') {
        console.error(
          `Error: Permission denied reading directory: ${currentDir}`,
        );
      } else if (e.code === 'ENOENT') {
        console.error(`Error: Directory not found: ${currentDir}`);
      } else {
        console.error(
          `Error: Cannot read directory ${currentDir}: ${e.message}`,
        );
      }
      process.exit(2);
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
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
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Expand a list of paths to include files from directories.
 */
function expandPaths(paths: string[]): string[] {
  const files: string[] = [];
  for (const p of paths) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(p);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        console.error(`Error: File or directory not found: ${p}`);
      } else if (e.code === 'EACCES' || e.code === 'EPERM') {
        console.error(`Error: Permission denied accessing: ${p}`);
      } else {
        console.error(`Error: Cannot access ${p}: ${e.message}`);
      }
      process.exit(2);
    }
    if (stat.isDirectory()) {
      files.push(...findSupportedFiles(p));
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
 */
function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

/** Print main help */
function printHelp() {
  console.log(`fabfmt - Fabric Notebook Formatter (Spark SQL & Python)

Usage:
  fabfmt <command> [options] [arguments]

Commands:
  format <files...>    Format files or directories in-place
  check <files...>     Check if files need formatting (exit 1 if so)

Run 'fabfmt <command> --help' for command-specific help.
`);
}

/** Print format command help */
function printFormatHelp() {
  console.log(`fabfmt format - Format files in-place

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
function printCheckHelp() {
  console.log(`fabfmt check - Check if files need formatting

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
function parseType(args: string[]): {
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
          console.error(
            `Error: Invalid type '${cellType}'. Use sparksql, python, or pyspark.`,
          );
          process.exit(2);
        }
      } else {
        console.error(
          'Error: --type requires a value (sparksql, python, or pyspark)',
        );
        process.exit(2);
      }
    } else {
      remaining.push(args[i]);
    }
  }

  return { type, remaining };
}

/** Parse -i argument */
function parseInline(args: string[]): {
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
        console.error('Error: -i requires a string value');
        process.exit(2);
      }
    } else {
      remaining.push(args[i]);
    }
  }

  return { inline, remaining };
}

/** Format command: format files in-place or stdin */
async function cmdFormat(args: string[]): Promise<void> {
  if (args.includes('-h') || args.includes('--help')) {
    printFormatHelp();
    return;
  }

  const toPrint = args.includes('--print');
  const argsWithoutPrint = args.filter((a) => a !== '--print');
  const { type, remaining: argsAfterType } = parseType(argsWithoutPrint);
  const { inline, remaining: paths } = parseInline(argsAfterType);

  // Inline mode: -i with --type
  if (inline !== null) {
    if (!type) {
      console.error('Error: -i requires --type (sparksql, python, or pyspark)');
      process.exit(2);
    }

    // Initialize Python formatter if needed
    if (type === 'python' || type === 'pyspark') {
      await initializePythonFormatter();
    }

    const result = formatCell(inline, type);

    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    process.stdout.write(result.formatted);
    return;
  }

  // Stdin mode: --type specified with no files
  if (type && paths.length === 0) {
    // Initialize Python formatter if needed
    if (type === 'python' || type === 'pyspark') {
      await initializePythonFormatter();
    }

    const content = await readStdin();
    const result = formatCell(content, type);

    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    process.stdout.write(result.formatted);
    return;
  }

  if (paths.length === 0) {
    console.error('Error: No files or directories specified');
    console.error('Run "fabfmt format --help" for usage');
    process.exit(2);
  }

  // --print mode: single file to stdout
  if (toPrint) {
    if (paths.length !== 1) {
      console.error('Error: --print requires exactly one file');
      process.exit(2);
    }
    const file = paths[0];
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        console.error(`Error: File not found: ${file}`);
      } else if (e.code === 'EACCES' || e.code === 'EPERM') {
        console.error(`Error: Permission denied accessing: ${file}`);
      } else {
        console.error(`Error: Cannot access ${file}: ${e.message}`);
      }
      process.exit(2);
    }
    if (stat.isDirectory()) {
      console.error('Error: --print cannot be used with directories');
      process.exit(2);
    }
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch (e: any) {
      if (e.code === 'EACCES' || e.code === 'EPERM') {
        console.error(`Error: Permission denied reading: ${file}`);
      } else if (e.code === 'EBUSY') {
        console.error(`Error: File is locked or busy: ${file}`);
      } else {
        console.error(`Error: Cannot read ${file}: ${e.message}`);
      }
      process.exit(2);
    }
    const formatted = await formatFile(content, file);
    process.stdout.write(formatted);
    return;
  }

  // Expand directories to files
  const files = expandPaths(paths);
  if (files.length === 0) {
    console.log('No supported files found');
    return;
  }

  // Format files in-place
  let formattedCount = 0;
  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch (e: any) {
      if (e.code === 'EACCES' || e.code === 'EPERM') {
        console.error(`Error: Permission denied reading: ${file}`);
      } else if (e.code === 'ENOENT') {
        console.error(`Error: File not found: ${file}`);
      } else if (e.code === 'EBUSY') {
        console.error(`Error: File is locked or busy: ${file}`);
      } else {
        console.error(`Error: Cannot read ${file}: ${e.message}`);
      }
      process.exit(1);
    }

    const normalizedContent = normalizeLineEndings(content);
    let formatted: string;
    try {
      formatted = await formatFile(normalizedContent, file);
    } catch (e: any) {
      console.error(`Error formatting ${file}: ${e.message}`);
      process.exit(1);
    }

    if (formatted !== normalizedContent) {
      try {
        fs.writeFileSync(file, formatted, 'utf-8');
      } catch (e: any) {
        if (e.code === 'EACCES' || e.code === 'EPERM') {
          console.error(`Error: Permission denied writing: ${file}`);
        } else if (e.code === 'EBUSY') {
          console.error(`Error: File is locked or busy: ${file}`);
        } else if (e.code === 'EROFS') {
          console.error(`Error: File system is read-only: ${file}`);
        } else {
          console.error(`Error: Cannot write ${file}: ${e.message}`);
        }
        process.exit(1);
      }
      console.log(`Formatted ${file}`);
      formattedCount++;
    }
  }

  if (formattedCount === 0) {
    console.log(`All ${files.length} file(s) already formatted`);
  } else {
    console.log(`Formatted ${formattedCount} of ${files.length} file(s)`);
  }
}

/** Check command: check if files need formatting */
async function cmdCheck(args: string[]): Promise<void> {
  if (args.includes('-h') || args.includes('--help')) {
    printCheckHelp();
    return;
  }

  const { type, remaining: argsAfterType } = parseType(args);
  const { inline, remaining: paths } = parseInline(argsAfterType);

  // Inline mode: -i with --type
  if (inline !== null) {
    if (!type) {
      console.error('Error: -i requires --type (sparksql, python, or pyspark)');
      process.exit(2);
    }

    // Initialize Python formatter if needed
    if (type === 'python' || type === 'pyspark') {
      await initializePythonFormatter();
    }

    const result = formatCell(inline, type);

    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    // Exit 1 if formatting would change the input
    if (result.formatted !== inline) {
      process.exit(1);
    }
    return;
  }

  // Stdin mode: --type specified with no files
  if (type && paths.length === 0) {
    // Initialize Python formatter if needed
    if (type === 'python' || type === 'pyspark') {
      await initializePythonFormatter();
    }

    const content = await readStdin();
    const result = formatCell(content, type);

    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    // Exit 1 if formatting would change the input
    if (result.formatted !== content) {
      process.exit(1);
    }
    return;
  }

  if (paths.length === 0) {
    console.error('Error: No files or directories specified');
    console.error('Run "fabfmt check --help" for usage');
    process.exit(2);
  }

  // Expand directories to files
  const files = expandPaths(paths);
  if (files.length === 0) {
    console.log('No supported files found');
    return;
  }

  // Check mode: check without modifying
  let needsFormatting = false;
  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch (e: any) {
      if (e.code === 'EACCES' || e.code === 'EPERM') {
        console.error(`Error: Permission denied reading: ${file}`);
      } else if (e.code === 'ENOENT') {
        console.error(`Error: File not found: ${file}`);
      } else if (e.code === 'EBUSY') {
        console.error(`Error: File is locked or busy: ${file}`);
      } else {
        console.error(`Error: Cannot read ${file}: ${e.message}`);
      }
      process.exit(1);
    }

    let formatted: string;
    try {
      formatted = await formatFile(content, file);
    } catch (e: any) {
      console.error(`Error checking ${file}: ${e.message}`);
      process.exit(1);
    }

    if (formatted !== content) {
      console.log(file);
      needsFormatting = true;
    }
  }

  if (needsFormatting) {
    process.exit(1);
  }
  console.log(`All ${files.length} file(s) are properly formatted`);
}

/** Main entry point */
async function main() {
  const command = args[0];
  const commandArgs = args.slice(1);

  if (!command || command === '-h' || command === '--help') {
    printHelp();
    return;
  }

  switch (command) {
    case 'format':
      await cmdFormat(commandArgs);
      break;
    case 'check':
      await cmdCheck(commandArgs);
      break;
    default:
      console.error(`Error: Unknown command '${command}'`);
      console.error('Run "fabfmt --help" for usage');
      process.exit(2);
  }
}

// Run main
main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
