import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// Ensure dist directory exists
if (!existsSync('dist')) {
  mkdirSync('dist');
}

// Copy WASM file to dist
// The WASM file is in the workspace root node_modules (npm workspaces hoists dependencies)
const wasmPaths = [
  // Workspace hoisted (most common)
  join(
    __dirname,
    '../../node_modules/@astral-sh/ruff-wasm-web/ruff_wasm_bg.wasm',
  ),
  // Local package node_modules (fallback)
  join(__dirname, 'node_modules/@astral-sh/ruff-wasm-web/ruff_wasm_bg.wasm'),
  // Nested under fabric-format (rare)
  join(
    __dirname,
    '../core/node_modules/@astral-sh/ruff-wasm-web/ruff_wasm_bg.wasm',
  ),
];

const wasmDistPath = join(__dirname, 'dist/ruff_wasm_bg.wasm');
let wasmCopied = false;
for (const wasmSourcePath of wasmPaths) {
  if (existsSync(wasmSourcePath)) {
    copyFileSync(wasmSourcePath, wasmDistPath);
    console.log('✓ Copied ruff_wasm_bg.wasm to dist/');
    wasmCopied = true;
    break;
  }
}
if (!wasmCopied) {
  console.warn(
    '⚠ Could not find ruff_wasm_bg.wasm - Python formatting will not work',
  );
}

// Build configuration for main content script
const buildOptions = {
  entryPoints: ['src/content.js'],
  bundle: true,
  outfile: 'dist/content.js',
  format: 'iife',
  target: ['chrome100', 'firefox100', 'edge100'],
  minify: true,
  keepNames: true, // CRITICAL: Preserve constructor.name for ANTLR context class checks
  sourcemap: isWatch,
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
  },
  // Handle WASM files - exclude from bundle, load at runtime
  external: [],
  loader: {
    '.wasm': 'file',
  },
};

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('👀 Watching for changes...');
    } else {
      await esbuild.build(buildOptions);
      console.log('✓ Build complete! Output in dist/');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
