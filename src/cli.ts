#!/usr/bin/env node
/**
 * CLI for Spark SQL Formatter
 */
import { formatSql } from './formatter.js';
import { formatFabricNotebook } from './magic-sql-extractor.js';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const args = process.argv.slice(2);

/** Supported file extensions for formatting */
const SUPPORTED_EXTENSIONS = ['.sql', '.py', '.scala', '.r'];

/**
 * Recursively find all files with supported extensions in a directory.
 */
function findSupportedFiles(dir: string): string[] {
    const files: string[] = [];
    
    function walk(currentDir: string) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                // Skip common non-source directories
                if (!['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build'].includes(entry.name)) {
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
 * If a path is a directory, recursively find all supported files.
 * If a path is a file, include it as-is.
 */
function expandPaths(paths: string[]): string[] {
    const files: string[] = [];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            const stat = fs.statSync(p);
            if (stat.isDirectory()) {
                files.push(...findSupportedFiles(p));
            } else {
                files.push(p);
            }
        } else {
            // Could be a glob pattern handled by shell, just include it
            files.push(p);
        }
    }
    return files;
}

/**
 * Format content based on file extension.
 * .py, .scala, .r, and .sql files are treated as potential Fabric notebooks.
 * If a .sql file is not a Fabric notebook, it's formatted as standard SQL.
 */
function formatContent(content: string, filePath?: string): string {
    const notebookExtensions = ['.py', '.scala', '.r', '.sql'];
    if (filePath && notebookExtensions.some(ext => filePath.endsWith(ext))) {
        const result = formatFabricNotebook(content, formatSql);
        // If unchanged and it's a .sql file, format as standard SQL
        if (result === content && filePath.endsWith('.sql')) {
            return formatSql(content);
        }
        return result;
    }
    return formatSql(content);
}

// Helper to output formatted SQL
function output(formatted: string) {
    console.log(formatted);
}

/**
 * Detect the line ending style used in content.
 * Returns '\r\n' for Windows or '\n' for Unix.
 */
function detectLineEnding(content: string): '\r\n' | '\n' {
    // Check for CRLF first (Windows)
    if (content.includes('\r\n')) {
        return '\r\n';
    }
    return '\n';
}

/**
 * Normalize line endings in content to Unix style (\n).
 */
function normalizeLineEndings(content: string): string {
    return content.replace(/\r\n/g, '\n');
}

/**
 * Convert line endings in content to the specified style.
 */
function convertLineEndings(content: string, lineEnding: '\r\n' | '\n'): string {
    // First normalize to \n, then convert to target
    const normalized = normalizeLineEndings(content);
    if (lineEnding === '\r\n') {
        return normalized.replace(/\n/g, '\r\n');
    }
    return normalized;
}

const remainingArgs = args;

if (remainingArgs.length === 0) {
    // Interactive mode - read from stdin
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    
    let sql = '';
    
    rl.on('line', (line) => {
        sql += line + '\n';
    });
    
    rl.on('close', () => {
        const formatted = formatSql(sql.trim());
        output(formatted);
    });
} else if (remainingArgs[0] === '--help' || remainingArgs[0] === '-h') {
    console.log(`Spark SQL Formatter

Usage:
  sparkfmt [options] [file|directory...]
  echo "select * from t" | sparkfmt

Arguments:
  file                A SQL, Python, Scala, or R file to format
  directory           A directory to recursively format (finds .sql, .py, .scala, .r)

Options:
  -h, --help          Show this help message
  -c, --check         Check if files need formatting (exit 1 if so)
  -i, --inline        Format SQL provided as argument
  --stdout            Print to stdout instead of formatting in-place

Examples:
  sparkfmt query.sql                    Format file in-place
  sparkfmt ./src                        Format all supported files in directory
  sparkfmt *.sql                        Format multiple files in-place
  sparkfmt -i "select * from t"         Format inline SQL
  sparkfmt -c ./src                     Check if any files need formatting
  sparkfmt --stdout query.sql           Print formatted SQL to stdout
`);
} else if (remainingArgs[0] === '--stdout') {
    // Print to stdout instead of in-place
    const file = remainingArgs[1];
    if (!file) {
        console.error('Error: No file specified for --stdout');
        process.exit(2);
    }
    const content = fs.readFileSync(file, 'utf-8');
    console.log(formatContent(content, file));
} else if (remainingArgs[0] === '-i' || remainingArgs[0] === '--inline') {
    const sql = remainingArgs.slice(1).join(' ');
    output(formatSql(sql));
} else if (remainingArgs[0] === '-c' || remainingArgs[0] === '--check') {
    const paths = remainingArgs.slice(1);
    if (paths.length === 0) {
        console.error('Error: No file or directory specified for --check');
        process.exit(2);
    }
    const files = expandPaths(paths);
    if (files.length === 0) {
        console.log('No supported files found');
        process.exit(0);
    }
    let needsFormatting = false;
    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf-8');
            const formatted = formatContent(content, file);
            if (formatted !== content) {
                console.log(`File ${file} needs formatting`);
                needsFormatting = true;
            }
        } catch (e: any) {
            console.error(`Error checking ${file}: ${e.message}`);
        }
    }
    if (needsFormatting) {
        process.exit(1);
    }
    console.log(`All ${files.length} file(s) are properly formatted`);
} else {
    // File/directory argument(s) - format in-place
    const files = expandPaths(remainingArgs);
    if (files.length === 0) {
        console.log('No supported files found');
        process.exit(0);
    }
    let formattedCount = 0;
    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf-8');
            const originalLineEnding = detectLineEnding(content);
            const normalizedContent = normalizeLineEndings(content);
            const formatted = formatContent(normalizedContent, file);
            const formattedWithOriginalEndings = convertLineEndings(formatted, originalLineEnding);
            
            if (formattedWithOriginalEndings !== content) {
                fs.writeFileSync(file, formattedWithOriginalEndings, 'utf-8');
                console.log(`Formatted ${file}`);
                formattedCount++;
            }
        } catch (e: any) {
            console.error(`Error formatting ${file}: ${e.message}`);
            process.exit(1);
        }
    }
    if (formattedCount === 0) {
        console.log(`All ${files.length} file(s) already formatted`);
    } else {
        console.log(`Formatted ${formattedCount} of ${files.length} file(s)`);
    }
}
