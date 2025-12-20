/**
 * CLI for Spark SQL Formatter
 */
import { formatSql } from './formatter.js';
import * as fs from 'fs';
import * as readline from 'readline';

const args = process.argv.slice(2);

if (args.length === 0) {
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
        console.log(formatted);
    });
} else if (args[0] === '--help' || args[0] === '-h') {
    console.log(`Spark SQL Formatter

Usage:
  sparkfmt [options] [file]
  echo "select * from t" | sparkfmt

Options:
  -h, --help     Show this help message
  -c, --check    Check if file needs formatting (exit 1 if so)
  -i, --inline   Format SQL provided as argument

Examples:
  sparkfmt query.sql              Format file
  sparkfmt -i "select * from t"   Format inline SQL
  sparkfmt -c query.sql           Check if formatting needed
`);
} else if (args[0] === '-i' || args[0] === '--inline') {
    const sql = args.slice(1).join(' ');
    console.log(formatSql(sql));
} else if (args[0] === '-c' || args[0] === '--check') {
    const file = args[1];
    if (!file) {
        console.error('Error: No file specified for --check');
        process.exit(2);
    }
    const sql = fs.readFileSync(file, 'utf-8');
    const formatted = formatSql(sql);
    if (formatted !== sql) {
        console.log(`File ${file} needs formatting`);
        process.exit(1);
    }
    console.log(`File ${file} is properly formatted`);
} else {
    // File argument
    const file = args[0];
    try {
        const sql = fs.readFileSync(file, 'utf-8');
        console.log(formatSql(sql));
    } catch (e: any) {
        console.error(`Error reading file: ${e.message}`);
        process.exit(1);
    }
}
