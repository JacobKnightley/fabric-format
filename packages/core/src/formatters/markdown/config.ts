/**
 * Markdown Formatter Configuration
 *
 * Hardcoded dprint configuration - no file loading needed.
 */

/** Global dprint configuration for markdown formatting */
export interface MarkdownGlobalConfig {
  lineWidth?: number;
  indentWidth?: number;
  useTabs?: boolean;
  newLineKind?: 'auto' | 'lf' | 'crlf' | 'system';
}

/** Plugin-specific configuration for dprint-plugin-markdown */
export interface MarkdownPluginConfig {
  textWrap?: 'always' | 'never' | 'maintain';
  emphasisKind?: 'underscores' | 'asterisks';
  strongKind?: 'underscores' | 'asterisks';
}

/** Default global configuration for markdown (140 char lines, match project style) */
export const MARKDOWN_GLOBAL_CONFIG: MarkdownGlobalConfig = {
  lineWidth: 140,
  indentWidth: 2,
  useTabs: false,
  newLineKind: 'lf',
};

/** Default plugin configuration for markdown */
export const MARKDOWN_PLUGIN_CONFIG: MarkdownPluginConfig = {
  textWrap: 'maintain', // Don't reflow prose, just normalize whitespace
  emphasisKind: 'asterisks',
  strongKind: 'asterisks',
};
