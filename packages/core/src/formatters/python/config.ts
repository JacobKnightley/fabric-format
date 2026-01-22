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

/**
 * Safe lint rules for notebook cell-by-cell analysis.
 *
 * IMPORTANT: These rules are carefully curated to be safe for notebooks where
 * each cell is analyzed independently without cross-cell context.
 *
 * Excluded categories:
 * - Cross-cell context rules (F401 unused imports, F841 unused variables, F821 undefined names)
 *   These would incorrectly flag code that's used in other cells.
 * - Import-adding rules (RUF017, SIM105, PLR1722, PTH*)
 *   These would add imports without knowing if they're already imported elsewhere.
 *
 * All included rules perform in-cell syntactic transformations only.
 */
export const SAFE_LINT_RULES: string[] = [
  // I - isort (import sorting within cell)
  'I001', // unsorted-imports

  // UP - pyupgrade (modern Python syntax)
  'UP003', // type-of-primitive
  'UP004', // useless-object-inheritance
  'UP008', // super-call-with-parameters
  'UP011', // unnecessary-lru-cache-params
  'UP012', // unnecessary-encode-utf8
  'UP015', // redundant-open-modes
  'UP018', // native-literals
  'UP030', // format-literals
  'UP032', // f-string
  'UP034', // extraneous-parentheses
  'UP039', // unnecessary-class-parentheses

  // C4 - flake8-comprehensions
  'C400', // unnecessary-generator-list
  'C401', // unnecessary-generator-set
  'C402', // unnecessary-generator-dict
  'C403', // unnecessary-list-comprehension-set
  'C404', // unnecessary-list-comprehension-dict
  'C405', // unnecessary-literal-set
  'C406', // unnecessary-literal-dict
  'C408', // unnecessary-collection-call
  'C409', // unnecessary-literal-within-tuple-call
  'C410', // unnecessary-literal-within-list-call
  'C411', // unnecessary-list-call
  'C413', // unnecessary-call-around-sorted
  'C414', // unnecessary-double-cast-or-process
  'C415', // unnecessary-subscript-reversal
  'C416', // unnecessary-comprehension
  'C417', // unnecessary-map
  'C418', // unnecessary-literal-within-dict-call
  'C419', // unnecessary-comprehension-in-call

  // SIM - flake8-simplify (code simplification)
  'SIM101', // duplicate-isinstance-call
  'SIM102', // collapsible-if
  'SIM108', // if-else-block-instead-of-if-exp
  'SIM112', // uncapitalized-environment-variables
  'SIM117', // multiple-with-statements
  'SIM118', // in-dict-keys
  'SIM201', // negate-equal-op
  // NOTE: SIM202 (negate-not-equal-op) is excluded because it transforms
  // `x != True` to `not x` and `x == False` to `not x`, which doesn't work
  // with PySpark Column objects that need explicit comparison operators.
  'SIM208', // double-negation
  // NOTE: SIM210/SIM211 (if-expr-with-true/false-true) are excluded for similar
  // reasons - they may transform boolean comparisons in ways incompatible with PySpark.
  // 'SIM210', // if-expr-with-true-false
  // 'SIM211', // if-expr-with-false-true
  'SIM212', // if-expr-with-twisted-arms
  'SIM220', // expr-and-not-expr
  'SIM221', // expr-or-not-expr
  'SIM300', // yoda-conditions
  'SIM910', // dict-get-with-none-default
  'SIM911', // zip-dict-keys-and-values

  // B - flake8-bugbear (bug detection with safe fixes)
  'B004', // unreliable-callable-check
  'B007', // unused-loop-control-variable
  'B009', // get-attr-with-constant
  'B010', // set-attr-with-constant
  'B011', // assert-false
  'B013', // redundant-tuple-in-exception-handler
  'B033', // duplicate-value

  // E - pycodestyle errors
  'E401', // multiple-imports-on-one-line
  'E703', // useless-semicolon
  'E711', // none-comparison
  // NOTE: E712 (true-false-comparison) is excluded because even though it's
  // documented as not having a fix, it may interact with other rules or
  // Ruff's formatter to cause unwanted transformations with PySpark.
  // 'E712', // true-false-comparison
  'E713', // not-in-test
  'E714', // not-is-test

  // F - Pyflakes (only cell-safe rules)
  'F541', // f-string-missing-placeholders
  'F632', // is-literal
  'F901', // raise-not-implemented

  // PIE - flake8-pie
  'PIE790', // unnecessary-placeholder
  'PIE800', // unnecessary-spread
  'PIE804', // unnecessary-dict-kwargs
  'PIE807', // reimplemented-container-builtin
  'PIE808', // unnecessary-range-start
  'PIE810', // multiple-starts-ends-with

  // RET - flake8-return
  // Note: RET504 (unnecessary-assign) excluded - it removes intermediate variables
  // which changes code structure, not just formatting
  'RET505', // superfluous-else-return

  // RUF - Ruff-specific rules (excluding import-adding ones)
  'RUF005', // collection-literal-concatenation
  'RUF010', // explicit-f-string-type-conversion
  'RUF015', // unnecessary-iterable-allocation-for-first-element
  'RUF100', // unused-noqa

  // PL - Pylint
  'PLR0402', // manual-from-import
  'PLR1711', // useless-return
  'PLR1714', // repeated-equality-comparison
  'PLR5501', // collapsible-else-if
  'PLC0208', // iteration-over-set
  'PLW0120', // useless-else-on-loop
  'PLW3301', // nested-min-max

  // FURB - refurb (safe subset)
  'FURB105', // print-empty-string
  'FURB136', // if-expr-min-max
  'FURB157', // verbose-decimal-constructor
  'FURB163', // redundant-log-base
  'FURB168', // isinstance-type-none

  // FLY - flynt (string formatting)
  'FLY002', // static-join-to-fstring

  // LOG - logging
  'LOG009', // undocumented-warn

  // G - flake8-logging-format
  'G010', // logging-warn
];

/** Ruff WASM lint config for safe auto-fixes */
export const RUFF_LINT_CONFIG = {
  lint: {
    select: SAFE_LINT_RULES,
  },
};
