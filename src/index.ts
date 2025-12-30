/**
 * Main export for sparkfmt-ts
 * 100% Grammar-Driven - No hardcoded lists
 * 
 * Architecture:
 * - formatter.ts: Main entry point and orchestration
 * - types.ts: TypeScript interfaces
 * - token-utils.ts: Grammar-derived token detection
 * - parse-tree-analyzer.ts: AST visitor that collects formatting context
 * - formatting-context.ts: State management during formatting
 * - output-builder.ts: Output construction with column tracking
 */

// Public API
export { formatSql, needsFormatting } from './formatter.js';

// Types (for library consumers who want type safety)
export type { 
    AnalyzerResult,
    FormattingState,
    MultiArgFunctionInfo,
    WindowDefInfo,
    TokenContext,
    PendingComment,
    ExpandedFunction,
    ExpandedWindow
} from './types.js';

// Noqa utilities (for library consumers who want to detect noqa directives)
export { hasStatementNoqa, detectNoqaExpansion, isExpansionSuppressed, type NoqaInfo } from './noqa-detector.js';

// Magic SQL extractor (for Fabric notebooks saved as .py, .scala, .r files)
export { 
    extractMagicSqlCells, 
    formatFabricNotebook,
    type MagicSqlCell,
    type MagicSqlFile
} from './magic-sql-extractor.js';
