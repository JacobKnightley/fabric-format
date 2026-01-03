/**
 * Python Formatter Configuration
 *
 * Hardcoded ruff configuration - no file loading needed.
 */

/** Ruff format-specific configuration */
export interface RuffFormatConfig {
  'quote-style'?: 'single' | 'double' | 'preserve';
  'indent-style'?: 'space' | 'tab';
  'skip-magic-trailing-comma'?: boolean;
  'line-ending'?: 'auto' | 'lf' | 'cr-lf' | 'native';
  'docstring-code-format'?: boolean;
  'docstring-code-line-length'?: number | 'dynamic';
}

/** Full ruff configuration (subset relevant to formatting) */
export interface RuffConfig {
  'line-length'?: number;
  'indent-width'?: number;
  format?: RuffFormatConfig;
}

/** Default ruff configuration matching our style (140 char lines, 4 space indent) */
export const DEFAULT_RUFF_CONFIG: RuffConfig = {
  'line-length': 140,
  'indent-width': 4,
  format: {
    'quote-style': 'double',
    'indent-style': 'space',
    'skip-magic-trailing-comma': false,
    'line-ending': 'lf',
    'docstring-code-format': true,
    'docstring-code-line-length': 'dynamic',
  },
};

/** Ruff WASM config format (kebab-case keys as per the Ruff WASM API) */
export const RUFF_WASM_CONFIG = {
  'line-length': DEFAULT_RUFF_CONFIG['line-length'],
  'indent-width': DEFAULT_RUFF_CONFIG['indent-width'],
  format: {
    'quote-style': DEFAULT_RUFF_CONFIG.format?.['quote-style'],
    'indent-style': DEFAULT_RUFF_CONFIG.format?.['indent-style'],
    'skip-magic-trailing-comma':
      DEFAULT_RUFF_CONFIG.format?.['skip-magic-trailing-comma'],
    'line-ending': DEFAULT_RUFF_CONFIG.format?.['line-ending'],
  },
};
