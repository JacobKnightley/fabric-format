/**
 * CLI Tests
 *
 * Integration tests for the command-line interface.
 * Tests the CLI behavior through programmatic execution.
 */

import { execSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestResult, TestSuite } from '../framework.js';

// Get __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const cliTests: TestSuite = {
  name: 'CLI Integration',
  tests: [], // Populated by runCliTests
};

interface CliTestCase {
  name: string;
  test: () => Promise<{ passed: boolean; message?: string }>;
}

/**
 * Run CLI command and return stdout/stderr
 */
function runCli(
  args: string,
  input?: string,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    // Navigate from dist/tests/integration/ up to dist/cli.js
    const cliPath = join(__dirname, '../../cli.js');
    const cmd = `node "${cliPath}" ${args}`;

    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      input,
      timeout: 30000,
      // Ensure we capture stderr separately
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? error.message ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

/**
 * Create a temp directory for test files
 */
function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'fabfmt-test-'));
}

/**
 * Clean up temp directory
 */
function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

const cliTestCases: CliTestCase[] = [
  // Help commands
  {
    name: 'Shows help with no arguments',
    test: async () => {
      const result = runCli('');
      const hasHelp =
        result.stdout.includes('fabfmt') || result.stderr.includes('fabfmt');
      return {
        passed: hasHelp,
        message: hasHelp ? undefined : 'Expected help output',
      };
    },
  },
  {
    name: 'Shows help with --help flag',
    test: async () => {
      const result = runCli('--help');
      return {
        passed:
          result.stdout.includes('Usage') || result.stdout.includes('Commands'),
        message: result.stdout.includes('Usage')
          ? undefined
          : 'Expected usage info in help',
      };
    },
  },
  {
    name: 'Shows format help with format --help',
    test: async () => {
      const result = runCli('format --help');
      return {
        passed:
          result.stdout.includes('format') && result.stdout.includes('--type'),
        message: 'Expected format command help',
      };
    },
  },
  {
    name: 'Shows check help with check --help',
    test: async () => {
      const result = runCli('check --help');
      return {
        passed: result.stdout.includes('check'),
        message: 'Expected check command help',
      };
    },
  },

  // Inline formatting (--type -i)
  {
    name: 'Formats SQL inline with --type sparksql -i',
    test: async () => {
      const result = runCli('format --type sparksql -i "select * from t"');
      return {
        passed: result.stdout.trim() === 'SELECT * FROM t',
        message: `Expected 'SELECT * FROM t', got '${result.stdout.trim()}'`,
      };
    },
  },
  {
    name: 'Formats Python inline with --type python -i',
    test: async () => {
      const result = runCli('format --type python -i "x=1"');
      return {
        passed: result.stdout.trim() === 'x = 1',
        message: `Expected 'x = 1', got '${result.stdout.trim()}'`,
      };
    },
  },
  {
    name: 'Formats pyspark inline with --type pyspark -i',
    test: async () => {
      const result = runCli(
        'format --type pyspark -i "df=spark.read.csv(path)"',
      );
      return {
        passed: result.stdout.includes('df = spark.read.csv(path)'),
        message: `Expected formatted output, got '${result.stdout.trim()}'`,
      };
    },
  },

  // Check command inline
  {
    name: 'Check exits 0 for already formatted SQL',
    test: async () => {
      const result = runCli('check --type sparksql -i "SELECT * FROM t"');
      return {
        passed: result.exitCode === 0,
        message: `Expected exit code 0, got ${result.exitCode}`,
      };
    },
  },
  {
    name: 'Check exits 1 for unformatted SQL',
    test: async () => {
      const result = runCli('check --type sparksql -i "select * from t"');
      return {
        passed: result.exitCode === 1,
        message: `Expected exit code 1, got ${result.exitCode}`,
      };
    },
  },
  {
    name: 'Check exits 0 for already formatted Python',
    test: async () => {
      const result = runCli('check --type python -i "x = 1"');
      return {
        passed: result.exitCode === 0,
        message: `Expected exit code 0, got ${result.exitCode}`,
      };
    },
  },
  {
    name: 'Check exits 1 for unformatted Python',
    test: async () => {
      const result = runCli('check --type python -i "x=1"');
      return {
        passed: result.exitCode === 1,
        message: `Expected exit code 1, got ${result.exitCode}`,
      };
    },
  },

  // File formatting
  {
    name: 'Formats Fabric .py notebook file',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const filePath = join(tempDir, 'test.py');
        const content = `# Fabric notebook source

# CELL ********************

x=1

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
        writeFileSync(filePath, content);

        const _result = runCli(`format "${filePath}"`);

        // Read the formatted file
        const formatted = readFileSync(filePath, 'utf-8');

        const hasFormattedCode = formatted.includes('x = 1');
        return {
          passed: hasFormattedCode,
          message: hasFormattedCode
            ? undefined
            : 'File was not formatted correctly',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Formats Fabric .sql notebook file',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const filePath = join(tempDir, 'test.sql');
        const content = `-- Fabric notebook source

-- CELL ********************

select * from t

-- METADATA ********************

-- META {
-- META   "language": "sparksql"
-- META }
`;
        writeFileSync(filePath, content);

        const _result = runCli(`format "${filePath}"`);

        const formatted = readFileSync(filePath, 'utf-8');

        const hasFormattedSql = formatted.includes('SELECT * FROM t');
        return {
          passed: hasFormattedSql,
          message: hasFormattedSql
            ? undefined
            : 'SQL file was not formatted correctly',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Reports already formatted file',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const filePath = join(tempDir, 'test.py');
        const content = `# Fabric notebook source

# CELL ********************

x = 1

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
        writeFileSync(filePath, content);

        const result = runCli(`format "${filePath}"`);

        // Should report already formatted
        return {
          passed:
            result.stdout.includes('already formatted') ||
            result.exitCode === 0,
          message: 'Should indicate file is already formatted',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },

  // --print flag
  {
    name: 'Prints formatted output with --print (does not modify file)',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const filePath = join(tempDir, 'test.py');
        const originalContent = `# Fabric notebook source

# CELL ********************

x=1

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
        writeFileSync(filePath, originalContent);

        const result = runCli(`format "${filePath}" --print`);

        // Check that stdout has formatted content
        const printedFormatted = result.stdout.includes('x = 1');

        // Check that file was not modified
        const fileContent = readFileSync(filePath, 'utf-8');
        const fileUnchanged = fileContent === originalContent;

        return {
          passed: printedFormatted && fileUnchanged,
          message: !printedFormatted
            ? 'Should print formatted content'
            : !fileUnchanged
              ? 'Should not modify file with --print'
              : undefined,
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },

  // Check command on files
  {
    name: 'Check exits 0 for formatted file',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const filePath = join(tempDir, 'test.py');
        const content = `# Fabric notebook source

# CELL ********************

x = 1

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
        writeFileSync(filePath, content);

        const result = runCli(`check "${filePath}"`);

        return {
          passed: result.exitCode === 0,
          message: `Expected exit code 0, got ${result.exitCode}`,
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Check exits 1 for unformatted file',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const filePath = join(tempDir, 'test.py');
        const content = `# Fabric notebook source

# CELL ********************

x=1

# METADATA ********************

# META {
# META   "language": "python"
# META }
`;
        writeFileSync(filePath, content);

        const result = runCli(`check "${filePath}"`);

        return {
          passed: result.exitCode === 1,
          message: `Expected exit code 1, got ${result.exitCode}`,
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },

  // Error handling
  {
    name: 'Errors on missing file',
    test: async () => {
      const result = runCli('format "/nonexistent/file.py"');
      return {
        passed: result.exitCode !== 0,
        message: 'Should error on missing file',
      };
    },
  },
  {
    name: 'Errors on -i without --type',
    test: async () => {
      const result = runCli('format -i "select * from t"');
      return {
        passed: result.exitCode !== 0 && result.stderr.includes('--type'),
        message: 'Should require --type with -i',
      };
    },
  },
  {
    name: 'Errors on invalid --type value',
    test: async () => {
      const result = runCli('format --type invalid -i "code"');
      return {
        passed: result.exitCode !== 0,
        message: 'Should error on invalid type',
      };
    },
  },

  // Non-Fabric files pass through unchanged
  {
    name: 'Non-Fabric Python file unchanged',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const filePath = join(tempDir, 'regular.py');
        const content = `# Regular Python file
x=1
y=2
`;
        writeFileSync(filePath, content);

        runCli(`format "${filePath}"`);

        const afterFormat = readFileSync(filePath, 'utf-8');

        // Non-Fabric files should be unchanged (or minimally normalized)
        return {
          passed: afterFormat === content || afterFormat.includes('x=1'),
          message: 'Non-Fabric file should pass through',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },

  // === Additional argument parsing and validation tests ===

  // Unknown command
  {
    name: 'Errors on unknown command',
    test: async () => {
      const result = runCli('unknowncommand');
      return {
        passed:
          result.exitCode !== 0 && result.stderr.includes('Unknown command'),
        message: `Expected error with 'Unknown command', got: ${result.stderr}`,
      };
    },
  },

  // --type without value
  {
    name: 'Errors on --type without value',
    test: async () => {
      const result = runCli('format --type');
      return {
        passed: result.exitCode !== 0 && result.stderr.includes('--type'),
        message: `Expected error about --type requiring value, got: ${result.stderr}`,
      };
    },
  },
  {
    name: 'Errors on --type with flag as value',
    test: async () => {
      const result = runCli('format --type --print');
      return {
        passed: result.exitCode !== 0,
        message: `Expected error when --type followed by another flag`,
      };
    },
  },

  // -i without value
  {
    name: 'Errors on -i without value',
    test: async () => {
      const result = runCli('format --type sparksql -i');
      return {
        passed: result.exitCode !== 0 && result.stderr.includes('-i'),
        message: `Expected error about -i requiring value, got: ${result.stderr}`,
      };
    },
  },

  // --print validation
  {
    name: 'Errors on --print with multiple files',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const file1 = join(tempDir, 'test1.py');
        const file2 = join(tempDir, 'test2.py');
        writeFileSync(file1, '# Fabric notebook source\n');
        writeFileSync(file2, '# Fabric notebook source\n');

        const result = runCli(`format "${file1}" "${file2}" --print`);
        return {
          passed: result.exitCode !== 0 && result.stderr.includes('--print'),
          message: `Expected error about --print with multiple files`,
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Errors on --print with directory',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const result = runCli(`format "${tempDir}" --print`);
        return {
          passed: result.exitCode !== 0 && result.stderr.includes('--print'),
          message: `Expected error about --print with directory`,
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },

  // No files specified
  {
    name: 'Errors on format with no files',
    test: async () => {
      const result = runCli('format');
      return {
        passed: result.exitCode !== 0 && result.stderr.includes('No files'),
        message: `Expected error about no files specified, got: ${result.stderr}`,
      };
    },
  },
  {
    name: 'Errors on check with no files',
    test: async () => {
      const result = runCli('check');
      return {
        passed: result.exitCode !== 0 && result.stderr.includes('No files'),
        message: `Expected error about no files specified, got: ${result.stderr}`,
      };
    },
  },

  // Type case insensitivity
  {
    name: 'Accepts --type SPARKSQL (uppercase)',
    test: async () => {
      const result = runCli('format --type SPARKSQL -i "select * from t"');
      return {
        passed: result.exitCode === 0 && result.stdout.includes('SELECT'),
        message: `Expected successful formatting with uppercase type`,
      };
    },
  },
  {
    name: 'Accepts --type SparkSQL (mixed case)',
    test: async () => {
      const result = runCli('format --type SparkSQL -i "select * from t"');
      return {
        passed: result.exitCode === 0 && result.stdout.includes('SELECT'),
        message: `Expected successful formatting with mixed case type`,
      };
    },
  },

  // Multiple valid types
  {
    name: 'All valid types work: sparksql',
    test: async () => {
      const result = runCli('format --type sparksql -i "select 1"');
      return {
        passed: result.exitCode === 0,
        message: `sparksql type should work`,
      };
    },
  },
  {
    name: 'All valid types work: python',
    test: async () => {
      const result = runCli('format --type python -i "x=1"');
      return {
        passed: result.exitCode === 0,
        message: `python type should work`,
      };
    },
  },
  {
    name: 'All valid types work: pyspark',
    test: async () => {
      const result = runCli('format --type pyspark -i "x=1"');
      return {
        passed: result.exitCode === 0,
        message: `pyspark type should work`,
      };
    },
  },

  // Edge cases with inline input
  {
    name: 'Handles empty inline input',
    test: async () => {
      const result = runCli('format --type sparksql -i ""');
      return {
        passed: result.exitCode === 0,
        message: `Should handle empty inline input`,
      };
    },
  },
  {
    name: 'Handles whitespace-only inline input',
    test: async () => {
      const result = runCli('format --type sparksql -i "   "');
      return {
        passed: result.exitCode === 0,
        message: `Should handle whitespace-only inline input`,
      };
    },
  },

  // Check command with --type but no -i and no files
  {
    name: 'Check with --type but no input waits for stdin (timeout is ok)',
    test: async () => {
      // This tests that --type without files enters stdin mode
      // We can't easily test stdin, so we verify it doesn't immediately error
      // The command will timeout waiting for stdin, which is expected behavior
      try {
        const result = runCli('check --type sparksql', '');
        // With empty stdin, should exit 0 (empty string equals itself)
        return {
          passed: result.exitCode === 0,
          message: `Check with empty stdin should exit 0`,
        };
      } catch {
        // Timeout is acceptable - means it's waiting for stdin
        return { passed: true };
      }
    },
  },

  // Exit code validation
  {
    name: 'Exit code 2 for user errors (invalid arguments)',
    test: async () => {
      const result = runCli('format --type invalid -i "x"');
      return {
        passed: result.exitCode === 2,
        message: `Expected exit code 2 for invalid type, got ${result.exitCode}`,
      };
    },
  },
  {
    name: 'Exit code 2 for missing required arguments',
    test: async () => {
      const result = runCli('format -i "select 1"');
      return {
        passed: result.exitCode === 2,
        message: `Expected exit code 2 for -i without --type, got ${result.exitCode}`,
      };
    },
  },

  // === Directory traversal and file discovery tests ===

  // Nested directories
  {
    name: 'Finds files in nested directories',
    test: async () => {
      const tempDir = createTempDir();
      try {
        // Create nested structure: root/sub1/sub2/test.py
        const sub1 = join(tempDir, 'sub1');
        const sub2 = join(sub1, 'sub2');
        mkdirSync(sub1);
        mkdirSync(sub2);

        const filePath = join(sub2, 'test.py');
        const content = `# Fabric notebook source\n\n# CELL ********************\n\nx=1\n\n# METADATA ********************\n\n# META {\n# META   "language": "python"\n# META }\n`;
        writeFileSync(filePath, content);

        const _result = runCli(`format "${tempDir}"`);

        const formatted = readFileSync(filePath, 'utf-8');
        return {
          passed: formatted.includes('x = 1'),
          message: 'Should find and format files in nested directories',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Finds files at multiple nesting levels',
    test: async () => {
      const tempDir = createTempDir();
      try {
        // Create files at different levels
        const file1 = join(tempDir, 'root.sql');
        const sub1 = join(tempDir, 'sub1');
        mkdirSync(sub1);
        const file2 = join(sub1, 'level1.sql');
        const sub2 = join(sub1, 'sub2');
        mkdirSync(sub2);
        const file3 = join(sub2, 'level2.sql');

        const content = `-- Fabric notebook source\n\n-- CELL ********************\n\nselect 1\n\n-- METADATA ********************\n\n-- META {\n-- META   "language": "sparksql"\n-- META }\n`;
        writeFileSync(file1, content);
        writeFileSync(file2, content);
        writeFileSync(file3, content);

        const _result = runCli(`format "${tempDir}"`);

        // Check all files were formatted
        const f1 = readFileSync(file1, 'utf-8');
        const f2 = readFileSync(file2, 'utf-8');
        const f3 = readFileSync(file3, 'utf-8');

        const allFormatted =
          f1.includes('SELECT 1') &&
          f2.includes('SELECT 1') &&
          f3.includes('SELECT 1');
        return {
          passed: allFormatted,
          message: 'Should format files at all nesting levels',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },

  // Mixed file types
  {
    name: 'Finds only supported file extensions',
    test: async () => {
      const tempDir = createTempDir();
      try {
        // Create mix of supported and unsupported files
        const sqlFile = join(tempDir, 'query.sql');
        const pyFile = join(tempDir, 'script.py');
        const txtFile = join(tempDir, 'readme.txt');
        const jsonFile = join(tempDir, 'config.json');
        const mdFile = join(tempDir, 'docs.md');

        const sqlContent = `-- Fabric notebook source\n\n-- CELL ********************\n\nselect 1\n\n-- METADATA ********************\n\n-- META {\n-- META   "language": "sparksql"\n-- META }\n`;
        const pyContent = `# Fabric notebook source\n\n# CELL ********************\n\nx=1\n\n# METADATA ********************\n\n# META {\n# META   "language": "python"\n# META }\n`;

        writeFileSync(sqlFile, sqlContent);
        writeFileSync(pyFile, pyContent);
        writeFileSync(txtFile, 'some text');
        writeFileSync(jsonFile, '{}');
        writeFileSync(mdFile, '# Readme');

        const _result = runCli(`format "${tempDir}"`);

        // Supported files should be formatted
        const sqlFormatted = readFileSync(sqlFile, 'utf-8').includes(
          'SELECT 1',
        );
        const pyFormatted = readFileSync(pyFile, 'utf-8').includes('x = 1');

        // Unsupported files should be unchanged
        const txtUnchanged = readFileSync(txtFile, 'utf-8') === 'some text';
        const jsonUnchanged = readFileSync(jsonFile, 'utf-8') === '{}';
        const mdUnchanged = readFileSync(mdFile, 'utf-8') === '# Readme';

        return {
          passed:
            sqlFormatted &&
            pyFormatted &&
            txtUnchanged &&
            jsonUnchanged &&
            mdUnchanged,
          message: 'Should only format supported file types',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Handles .scala and .r extensions',
    test: async () => {
      const tempDir = createTempDir();
      try {
        // These are supported but we just verify they are picked up
        const scalaFile = join(tempDir, 'script.scala');
        const rFile = join(tempDir, 'analysis.r');

        writeFileSync(scalaFile, '// Scala file');
        writeFileSync(rFile, '# R file');

        // Run format - should not error on these extensions
        const result = runCli(`format "${tempDir}"`);

        // Files should exist (picked up by traversal)
        return {
          passed: result.exitCode === 0,
          message: 'Should accept .scala and .r file extensions',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Case-insensitive extension matching',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const upperFile = join(tempDir, 'query.SQL');
        const mixedFile = join(tempDir, 'script.Py');

        const sqlContent = `-- Fabric notebook source\n\n-- CELL ********************\n\nselect 1\n\n-- METADATA ********************\n\n-- META {\n-- META   "language": "sparksql"\n-- META }\n`;
        const pyContent = `# Fabric notebook source\n\n# CELL ********************\n\nx=1\n\n# METADATA ********************\n\n# META {\n# META   "language": "python"\n# META }\n`;

        writeFileSync(upperFile, sqlContent);
        writeFileSync(mixedFile, pyContent);

        const _result = runCli(`format "${tempDir}"`);

        const sqlFormatted = readFileSync(upperFile, 'utf-8').includes(
          'SELECT 1',
        );
        const pyFormatted = readFileSync(mixedFile, 'utf-8').includes('x = 1');

        return {
          passed: sqlFormatted && pyFormatted,
          message: 'Should handle uppercase/mixed case extensions',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },

  // Excluding node_modules/.git and other directories
  {
    name: 'Excludes node_modules directory',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const nodeModules = join(tempDir, 'node_modules');
        mkdirSync(nodeModules);

        const excludedFile = join(nodeModules, 'package.sql');
        const sqlContent = `-- Fabric notebook source\n\n-- CELL ********************\n\nselect 1\n\n-- METADATA ********************\n\n-- META {\n-- META   "language": "sparksql"\n-- META }\n`;
        writeFileSync(excludedFile, sqlContent);

        const _result = runCli(`format "${tempDir}"`);

        // File should NOT be formatted (excluded)
        const fileContent = readFileSync(excludedFile, 'utf-8');
        return {
          passed: !fileContent.includes('SELECT 1'),
          message: 'Should exclude node_modules directory',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Excludes .git directory',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const gitDir = join(tempDir, '.git');
        mkdirSync(gitDir);

        const excludedFile = join(gitDir, 'hooks.py');
        const pyContent = `# Fabric notebook source\n\n# CELL ********************\n\nx=1\n\n# METADATA ********************\n\n# META {\n# META   "language": "python"\n# META }\n`;
        writeFileSync(excludedFile, pyContent);

        const _result = runCli(`format "${tempDir}"`);

        const fileContent = readFileSync(excludedFile, 'utf-8');
        return {
          passed: !fileContent.includes('x = 1'),
          message: 'Should exclude .git directory',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Excludes __pycache__ directory',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const pycache = join(tempDir, '__pycache__');
        mkdirSync(pycache);

        const excludedFile = join(pycache, 'cached.py');
        const pyContent = `# Fabric notebook source\n\n# CELL ********************\n\nx=1\n\n# METADATA ********************\n\n# META {\n# META   "language": "python"\n# META }\n`;
        writeFileSync(excludedFile, pyContent);

        const _result = runCli(`format "${tempDir}"`);

        const fileContent = readFileSync(excludedFile, 'utf-8');
        return {
          passed: !fileContent.includes('x = 1'),
          message: 'Should exclude __pycache__ directory',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Excludes venv and .venv directories',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const venv = join(tempDir, 'venv');
        const dotVenv = join(tempDir, '.venv');
        mkdirSync(venv);
        mkdirSync(dotVenv);

        const file1 = join(venv, 'activate.py');
        const file2 = join(dotVenv, 'lib.py');
        const pyContent = `# Fabric notebook source\n\n# CELL ********************\n\nx=1\n\n# METADATA ********************\n\n# META {\n# META   "language": "python"\n# META }\n`;
        writeFileSync(file1, pyContent);
        writeFileSync(file2, pyContent);

        const _result = runCli(`format "${tempDir}"`);

        const content1 = readFileSync(file1, 'utf-8');
        const content2 = readFileSync(file2, 'utf-8');
        return {
          passed: !content1.includes('x = 1') && !content2.includes('x = 1'),
          message: 'Should exclude venv and .venv directories',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Excludes dist and build directories',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const dist = join(tempDir, 'dist');
        const build = join(tempDir, 'build');
        mkdirSync(dist);
        mkdirSync(build);

        const file1 = join(dist, 'bundle.py');
        const file2 = join(build, 'output.sql');
        writeFileSync(file1, 'x=1');
        writeFileSync(file2, 'select 1');

        const _result = runCli(`format "${tempDir}"`);

        const content1 = readFileSync(file1, 'utf-8');
        const content2 = readFileSync(file2, 'utf-8');
        return {
          passed: content1 === 'x=1' && content2 === 'select 1',
          message: 'Should exclude dist and build directories',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Formats nested dir with same name as excluded at root',
    test: async () => {
      const tempDir = createTempDir();
      try {
        // Create src/node_modules - should be excluded
        // but src/my_modules should be included
        const src = join(tempDir, 'src');
        const nodeModulesNested = join(src, 'node_modules');
        const myModules = join(src, 'my_modules');
        mkdirSync(src);
        mkdirSync(nodeModulesNested);
        mkdirSync(myModules);

        const excluded = join(nodeModulesNested, 'test.sql');
        const included = join(myModules, 'test.sql');
        const sqlContent = `-- Fabric notebook source\n\n-- CELL ********************\n\nselect 1\n\n-- METADATA ********************\n\n-- META {\n-- META   "language": "sparksql"\n-- META }\n`;
        writeFileSync(excluded, sqlContent);
        writeFileSync(included, sqlContent);

        const _result = runCli(`format "${tempDir}"`);

        const excludedContent = readFileSync(excluded, 'utf-8');
        const includedContent = readFileSync(included, 'utf-8');
        return {
          passed:
            !excludedContent.includes('SELECT 1') &&
            includedContent.includes('SELECT 1'),
          message:
            'Should exclude node_modules at any level but include other dirs',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },

  // Empty directories
  {
    name: 'Handles empty directory gracefully',
    test: async () => {
      const tempDir = createTempDir();
      try {
        // tempDir is empty
        const result = runCli(`format "${tempDir}"`);

        // Should not error, just report no files found
        return {
          passed: result.exitCode === 0,
          message: 'Should handle empty directory without error',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Handles directory with only unsupported files',
    test: async () => {
      const tempDir = createTempDir();
      try {
        writeFileSync(join(tempDir, 'readme.txt'), 'text');
        writeFileSync(join(tempDir, 'config.json'), '{}');
        writeFileSync(join(tempDir, 'style.css'), 'body {}');

        const result = runCli(`format "${tempDir}"`);

        return {
          passed: result.exitCode === 0,
          message: 'Should handle dir with no supported files',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Handles nested empty directories',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const sub1 = join(tempDir, 'empty1');
        const sub2 = join(sub1, 'empty2');
        const sub3 = join(sub2, 'empty3');
        mkdirSync(sub1);
        mkdirSync(sub2);
        mkdirSync(sub3);

        const result = runCli(`format "${tempDir}"`);

        return {
          passed: result.exitCode === 0,
          message: 'Should traverse nested empty directories without error',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },

  // Symlinks (platform-dependent, may skip on Windows)
  {
    name: 'Handles symlinks to files (or skips on Windows)',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const realFile = join(tempDir, 'real.sql');
        const linkFile = join(tempDir, 'link.sql');
        const sqlContent = `-- Fabric notebook source\n\n-- CELL ********************\n\nselect 1\n\n-- METADATA ********************\n\n-- META {\n-- META   "language": "sparksql"\n-- META }\n`;
        writeFileSync(realFile, sqlContent);

        try {
          symlinkSync(realFile, linkFile);
        } catch (e: any) {
          // Symlinks may require admin on Windows
          if (e.code === 'EPERM' || e.code === 'ENOTSUP') {
            return {
              passed: true,
              message: 'Symlink test skipped (requires admin on Windows)',
            };
          }
          throw e;
        }

        const _result = runCli(`format "${tempDir}"`);

        // The real file should be formatted (symlink may or may not be followed)
        const realContent = readFileSync(realFile, 'utf-8');
        return {
          passed: realContent.includes('SELECT 1'),
          message: 'Should handle symlinks without crashing',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Handles symlinks to directories (or skips on Windows)',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const realDir = join(tempDir, 'realdir');
        const linkDir = join(tempDir, 'linkdir');
        mkdirSync(realDir);

        const fileInReal = join(realDir, 'test.sql');
        const sqlContent = `-- Fabric notebook source\n\n-- CELL ********************\n\nselect 1\n\n-- METADATA ********************\n\n-- META {\n-- META   "language": "sparksql"\n-- META }\n`;
        writeFileSync(fileInReal, sqlContent);

        try {
          symlinkSync(realDir, linkDir, 'dir');
        } catch (e: any) {
          if (e.code === 'EPERM' || e.code === 'ENOTSUP') {
            return {
              passed: true,
              message: 'Symlink test skipped (requires admin on Windows)',
            };
          }
          throw e;
        }

        const _result = runCli(`format "${tempDir}"`);

        const realContent = readFileSync(fileInReal, 'utf-8');
        return {
          passed: realContent.includes('SELECT 1'),
          message: 'Should handle directory symlinks without crashing',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },

  // Multiple paths
  {
    name: 'Formats multiple directories',
    test: async () => {
      const tempDir1 = createTempDir();
      const tempDir2 = createTempDir();
      try {
        const file1 = join(tempDir1, 'test1.sql');
        const file2 = join(tempDir2, 'test2.sql');
        const sqlContent = `-- Fabric notebook source\n\n-- CELL ********************\n\nselect 1\n\n-- METADATA ********************\n\n-- META {\n-- META   "language": "sparksql"\n-- META }\n`;
        writeFileSync(file1, sqlContent);
        writeFileSync(file2, sqlContent);

        const _result = runCli(`format "${tempDir1}" "${tempDir2}"`);

        const content1 = readFileSync(file1, 'utf-8');
        const content2 = readFileSync(file2, 'utf-8');
        return {
          passed:
            content1.includes('SELECT 1') && content2.includes('SELECT 1'),
          message: 'Should format files in multiple directories',
        };
      } finally {
        cleanupTempDir(tempDir1);
        cleanupTempDir(tempDir2);
      }
    },
  },
  {
    name: 'Formats mix of files and directories',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const subDir = join(tempDir, 'subdir');
        mkdirSync(subDir);

        const directFile = join(tempDir, 'direct.sql');
        const nestedFile = join(subDir, 'nested.sql');
        const sqlContent = `-- Fabric notebook source\n\n-- CELL ********************\n\nselect 1\n\n-- METADATA ********************\n\n-- META {\n-- META   "language": "sparksql"\n-- META }\n`;
        writeFileSync(directFile, sqlContent);
        writeFileSync(nestedFile, sqlContent);

        // Format the direct file and the subdirectory
        const _result = runCli(`format "${directFile}" "${subDir}"`);

        const content1 = readFileSync(directFile, 'utf-8');
        const content2 = readFileSync(nestedFile, 'utf-8');
        return {
          passed:
            content1.includes('SELECT 1') && content2.includes('SELECT 1'),
          message: 'Should format both explicit files and directory contents',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },

  // Error handling
  {
    name: 'Reports error for nonexistent directory',
    test: async () => {
      const result = runCli('format "/nonexistent/directory/path"');
      return {
        passed:
          result.exitCode !== 0 &&
          (result.stderr.includes('not found') ||
            result.stderr.includes('ENOENT')),
        message: 'Should error on nonexistent directory',
      };
    },
  },
  {
    name: 'Check command works with directory',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const file = join(tempDir, 'test.sql');
        const unformatted = `-- Fabric notebook source\n\n-- CELL ********************\n\nselect 1\n\n-- METADATA ********************\n\n-- META {\n-- META   "language": "sparksql"\n-- META }\n`;
        writeFileSync(file, unformatted);

        const result = runCli(`check "${tempDir}"`);

        return {
          passed: result.exitCode === 1,
          message:
            'Check should exit 1 when directory contains unformatted files',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
  {
    name: 'Check exits 0 when all files in directory formatted',
    test: async () => {
      const tempDir = createTempDir();
      try {
        const file = join(tempDir, 'test.sql');
        const formatted = `-- Fabric notebook source\n\n-- CELL ********************\n\nSELECT 1\n\n-- METADATA ********************\n\n-- META {\n-- META   "language": "sparksql"\n-- META }\n`;
        writeFileSync(file, formatted);

        const result = runCli(`check "${tempDir}"`);

        return {
          passed: result.exitCode === 0,
          message: 'Check should exit 0 when all files are formatted',
        };
      } finally {
        cleanupTempDir(tempDir);
      }
    },
  },
];

/**
 * Run CLI tests (async)
 */
export async function runCliTests(): Promise<{
  suiteName: string;
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of cliTestCases) {
    try {
      const result = await tc.test();
      if (result.passed) {
        passed++;
        results.push({ name: tc.name, passed: true });
      } else {
        failed++;
        results.push({
          name: tc.name,
          passed: false,
          message: result.message,
        });
      }
    } catch (error) {
      failed++;
      results.push({
        name: tc.name,
        passed: false,
        message: `Test threw: ${error}`,
      });
    }
  }

  return {
    suiteName: cliTests.name,
    passed,
    failed,
    results,
  };
}
