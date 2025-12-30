#!/usr/bin/env node
/**
 * CLI for Spark SQL Formatter
 */
import { formatSql } from './formatter.js';
import { formatFabricNotebook } from './magic-sql-extractor.js';
import * as fs from 'fs';
import * as readline from 'readline';

const args = process.argv.slice(2);

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
  sparkfmt [options] [file...]
  echo "select * from t" | sparkfmt

Options:
  -h, --help          Show this help message
  -c, --check         Check if file needs formatting (exit 1 if so)
  -i, --inline        Format SQL provided as argument
  --stdout            Print to stdout instead of formatting in-place

Examples:
  sparkfmt query.sql                    Format file in-place
  sparkfmt *.sql                        Format multiple files in-place
  sparkfmt -i "select * from t"         Format inline SQL
  sparkfmt -c query.sql                 Check if formatting needed
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
    const file = remainingArgs[1];
    if (!file) {
        console.error('Error: No file specified for --check');
        process.exit(2);
    }
    const content = fs.readFileSync(file, 'utf-8');
    const formatted = formatContent(content, file);
    if (formatted !== content) {
        console.log(`File ${file} needs formatting`);
        process.exit(1);
    }
    console.log(`File ${file} is properly formatted`);
} else {
    // File argument(s) - format in-place
    const files = remainingArgs;
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
            }
        } catch (e: any) {
            console.error(`Error formatting ${file}: ${e.message}`);
            process.exit(1);
        }
    }
}
