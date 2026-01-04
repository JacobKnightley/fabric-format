/**
 * Spark SQL Formatter - Main Entry Point
 *
 * This is the 100% grammar-driven SQL formatter for Apache Spark SQL.
 * NO HARDCODED KEYWORD, FUNCTION, OR CLAUSE LISTS.
 * Everything derived from ANTLR lexer symbolicNames and parse tree context.
 *
 * Architecture:
 * - types.ts: TypeScript interfaces
 * - token-utils.ts: Grammar-derived token detection
 * - parse-tree-analyzer.ts: AST visitor that collects formatting context
 * - formatting-context.ts: State management during formatting
 * - output-builder.ts: Output construction with column tracking
 * - formatter.ts (this file): Main orchestration
 */

import antlr4 from 'antlr4';
import { MAX_LINE_WIDTH } from './constants.js';
import {
  detectCollapseDirectives,
  type FormatDirectiveInfo,
  hasFormatOff,
  isFmtInlineComment,
} from './fmt-detector.js';
import {
  CommentManager,
  createInitialState,
  ExpandedFunctionStack,
  indentCalc,
  isUnaryOperator,
  shouldExpandFunction,
  shouldExpandPivot,
  shouldExpandWindow,
} from './formatting-context.js';
import { handleFunctionExpansion } from './function-expansion.js';
import { SPARK_BUILTIN_FUNCTIONS } from './generated/builtinFunctions.js';
import SqlBaseParser from './generated/SqlBaseParser.js';
import { calculateNewlineAndIndent } from './newline-calculator.js';
import {
  formatHintContent,
  OutputBuilder,
  outputComments,
} from './output-builder.js';
import {
  outputWithNewline,
  outputWithoutNewline,
  updateClauseFlags,
} from './output-helpers.js';
import { ParseTreeAnalyzer } from './parse-tree-analyzer.js';
// Internal modules
import {
  getSymbolicName,
  isFunctionLikeKeyword,
  isKeywordToken,
  SqlBaseLexer,
} from './token-utils.js';
import type { AnalyzerResult, ExpandedPivot, ExpandedWindow } from './types.js';

// ============================================================================
// MODULE-LEVEL CONSTANTS (avoid allocation in hot paths)
// ============================================================================

/**
 * Partition transform functions that should be uppercased when followed by '('.
 * Used in both token loop and determineOutputText.
 */
const PARTITION_TRANSFORM_FUNCTIONS = new Set([
  'BUCKET',
  'TRUNCATE',
  'YEAR',
  'YEARS',
  'MONTH',
  'MONTHS',
  'DAY',
  'DAYS',
  'HOUR',
  'HOURS',
]);

/**
 * Structural keywords that should always be uppercase, even in identifier contexts.
 * These are syntactic markers, not actual identifier names.
 */
const STRUCTURAL_KEYWORDS = new Set([
  'AS',
  'ON',
  'AND',
  'OR',
  'IN',
  'FOR',
  'USING',
]);

/**
 * Extension keywords: Should always be uppercase, even in identifier context.
 * Keywords not in Spark grammar (Delta Lake extensions, etc.).
 */
const EXTENSION_KEYWORDS = new Set([
  'SYSTEM', // SHOW SYSTEM FUNCTIONS
  'NOSCAN', // ANALYZE TABLE ... NOSCAN
  'VACUUM',
  'RETAIN',
  'RESTORE',
  'CLONE',
  'SHALLOW',
  'DEEP',
  'OPTIMIZE',
  'ZORDER',
]);

// ============================================================================
// PARSER INSTANCE POOL
// ============================================================================

/**
 * Reusable parser/lexer instances for performance.
 * Creating ANTLR lexer/parser instances has significant overhead (~6x slower).
 * We maintain a small pool of instances that can be reused across format calls.
 */
interface ParserInstance {
  lexer: InstanceType<typeof SqlBaseLexer>;
  tokens: antlr4.CommonTokenStream;
  parser: InstanceType<typeof SqlBaseParser>;
  inUse: boolean;
}

const parserPool: ParserInstance[] = [];
const POOL_SIZE = 4; // Small pool for concurrent formatting

function getParserInstance(): ParserInstance {
  // Find available instance in pool
  for (const instance of parserPool) {
    if (!instance.inUse) {
      instance.inUse = true;
      return instance;
    }
  }

  // Create new instance if pool not full
  if (parserPool.length < POOL_SIZE) {
    const chars = new antlr4.InputStream('');
    const lexer = new SqlBaseLexer(chars);
    const tokens = new antlr4.CommonTokenStream(lexer);
    const parser = new SqlBaseParser(tokens);
    // @ts-expect-error - ANTLR types incomplete
    parser.removeErrorListeners?.();

    const instance: ParserInstance = { lexer, tokens, parser, inUse: true };
    parserPool.push(instance);
    return instance;
  }

  // Pool exhausted - create temporary instance (rare case)
  const chars = new antlr4.InputStream('');
  const lexer = new SqlBaseLexer(chars);
  const tokens = new antlr4.CommonTokenStream(lexer);
  const parser = new SqlBaseParser(tokens);
  // @ts-expect-error - ANTLR types incomplete
  parser.removeErrorListeners?.();
  return { lexer, tokens, parser, inUse: false }; // Not tracked in pool
}

function releaseParserInstance(instance: ParserInstance): void {
  instance.inUse = false;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Format SQL - Main entry point.
 * Handles magic commands, semicolon-separated statements, and formatting.
 */
export function formatSql(sql: string): string {
  try {
    // Handle magic commands (%%sql only - %sql is not valid in Fabric)
    // Find magic command anywhere in input - only format SQL after it
    // This allows content before the magic (e.g., Python code) to remain untouched
    let prefix = '';
    let magicCommand = '';
    let sqlToFormat = sql;

    const magicMatch = sql.match(/(%%sql)[ \t]*\n?/);
    if (magicMatch && magicMatch.index !== undefined) {
      prefix = sql.substring(0, magicMatch.index);
      magicCommand = magicMatch[1];
      sqlToFormat = sql.substring(magicMatch.index + magicMatch[0].length);
    }

    // Split on semicolons and format each statement
    const statements = splitOnSemicolons(sqlToFormat);
    const formattedStatements: string[] = [];

    for (const stmt of statements) {
      if (stmt.trim().length === 0) continue;

      // Check for statement-level fmt:off (bypass formatting entirely)
      if (hasFormatOff(stmt.trim())) {
        formattedStatements.push(stmt.trim());
        continue;
      }

      const formatted = formatSingleStatement(stmt.trim());
      formattedStatements.push(formatted);
    }

    let result = formattedStatements.join(';\n\n');

    // Preserve trailing semicolon if original had one
    if (sqlToFormat.trimEnd().endsWith(';')) {
      result += ';';
    }

    // Restore magic command and prefix
    if (magicCommand) {
      result = `${prefix + magicCommand}\n${result}`;
    }

    return result;
  } catch {
    return sql;
  }
}

/**
 * Check if SQL needs formatting.
 */
export function needsFormatting(sql: string): boolean {
  return formatSql(sql) !== sql;
}

// ============================================================================
// STATEMENT SPLITTING
// ============================================================================

/**
 * Split SQL on semicolons, but not semicolons inside string literals.
 */
function splitOnSemicolons(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
    } else if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
      if (current.trim().length > 0) {
        statements.push(current);
      }
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim().length > 0) {
    statements.push(current);
  }

  return statements;
}

// ============================================================================
// VARIABLE SUBSTITUTION HANDLING
// ============================================================================

/**
 * Spark SQL variable substitution pattern: ${variable_name}
 * These must be preserved exactly during formatting.
 */
const VARIABLE_PATTERN = /\$\{([^}]+)\}/g;

interface VariableSubstitution {
  placeholder: string;
  original: string;
}

/**
 * Replace ${variable} patterns with safe placeholders before formatting.
 * Returns the modified SQL and a map to restore later.
 */
function extractVariables(sql: string): {
  sql: string;
  substitutions: VariableSubstitution[];
} {
  const substitutions: VariableSubstitution[] = [];
  let index = 0;

  const modifiedSql = sql.replace(VARIABLE_PATTERN, (match) => {
    // Use a placeholder that won't be modified by formatting
    // _SPARKVAR_N_ looks like an identifier and won't get spaces added
    const placeholder = `_SPARKVAR_${index}_`;
    substitutions.push({ placeholder, original: match });
    index++;
    return placeholder;
  });

  return { sql: modifiedSql, substitutions };
}

/**
 * Restore original ${variable} patterns after formatting.
 */
function restoreVariables(
  sql: string,
  substitutions: VariableSubstitution[],
): string {
  let result = sql;
  for (const sub of substitutions) {
    result = result.replace(sub.placeholder, sub.original);
  }
  return result;
}

// ============================================================================
// SINGLE STATEMENT FORMATTING
// ============================================================================

/**
 * Pre-normalize SQL to fix tokenization mismatches.
 * Some SQL constructs tokenize differently based on case:
 * - Scientific notation: 1.23e10 (lowercase 'e') vs 1.23E10 (uppercase 'E')
 *
 * We normalize these to uppercase before lexing so both streams align.
 */
function normalizeForTokenization(sql: string): string {
  // Normalize scientific notation: replace lowercase 'e' in numbers with uppercase 'E'
  // Pattern matches: integer part (optional decimal), 'e', optional +/-, exponent
  // Examples: 1e10, 1.23e10, .5e-3, 1.e+5
  return sql.replace(
    /(\d+(?:\.\d*)?|\.\d+)e([+-]?\d+)/gi,
    (_match, mantissa, exponent) => {
      return `${mantissa}E${exponent}`;
    },
  );
}

/**
 * Format a single SQL statement.
 *
 * Uses two-stage parsing for performance:
 * 1. Try SLL (Simple LL) mode first - faster but may fail on ambiguous input
 * 2. Fall back to full LL mode only if SLL fails
 *
 * Also uses parser instance pooling to avoid expensive lexer/parser construction.
 *
 * With caseInsensitive lexer grammar, we only need a single parsing pass.
 * The lexer matches keywords regardless of case, and token.text preserves
 * the original casing from the input.
 */
function formatSingleStatement(sql: string): string {
  const instance = getParserInstance();
  try {
    // Extract ${variable} substitutions before formatting
    const { sql: sqlWithPlaceholders, substitutions } = extractVariables(sql);

    // Pre-normalize SQL to fix tokenization mismatches (e.g., scientific notation)
    const normalizedSql = normalizeForTokenization(sqlWithPlaceholders);

    // Reset and configure lexer with new input
    const chars = new antlr4.InputStream(normalizedSql);
    (instance.lexer as any).inputStream = chars;
    instance.lexer.reset();

    // Reset token stream - must clear tokens array manually
    const tokenStream = instance.tokens as any;
    tokenStream.tokens = [];
    tokenStream.index = -1;
    tokenStream.fetchedEOF = false;
    instance.tokens.fill();

    // Reset parser
    instance.parser.reset();

    // Two-stage parsing: try SLL first (faster), fall back to LL if needed
    // SLL (Simple LL) avoids full LL(*) lookahead for most inputs
    let tree: any;
    try {
      // Stage 1: SLL mode (faster, handles most SQL)
      (instance.parser as any)._interp.predictionMode = 0; // SLL = 0
      tree = instance.parser.singleStatement();
    } catch {
      // Stage 2: Full LL mode (handles ambiguous constructs)
      (instance.tokens as any).seek(0);
      instance.parser.reset();
      (instance.parser as any)._interp.predictionMode = 1; // LL = 1
      try {
        tree = instance.parser.singleStatement();
      } catch {
        return sql;
      }
    }

    // Analyze parse tree
    const analyzer = new ParseTreeAnalyzer();
    analyzer.visit(tree);
    const analysis = analyzer.getResult();

    // Detect fmt:collapse directives
    const formatDirectives = detectCollapseDirectives(normalizedSql);

    // Format tokens - with caseInsensitive lexer, tokens.tokens contains
    // both correct token types AND original text
    const formatted = formatTokens(
      instance.tokens.tokens,
      analysis,
      formatDirectives,
    );

    // Restore ${variable} substitutions
    return restoreVariables(formatted, substitutions);
  } catch (e: any) {
    console.error('Formatter error:', e.message, e.stack);
    return sql;
  } finally {
    releaseParserInstance(instance);
  }
}

/**
 * Format tokens using the analysis result.
 */
function formatTokens(
  tokens: any[],
  analysis: AnalyzerResult,
  formatDirectives: FormatDirectiveInfo,
): string {
  const builder = new OutputBuilder();
  const state = createInitialState();
  const expandedFuncs = new ExpandedFunctionStack();
  const comments = new CommentManager();

  let currentExpandedWindow: ExpandedWindow | null = null;
  let currentExpandedPivot: ExpandedPivot | null = null;
  let lastProcessedIndex = -1;

  // Populate force-inline ranges from fmt:inline comments (grammar-driven approach)
  const forceInlineRanges = findForceInlineRanges(tokens, analysis);
  formatDirectives.forceInlineRanges = forceInlineRanges;

  // IN list wrapping state
  // Maps open paren index -> { wrapIndent, closeParenIndex, commaIndices, itemLengths }
  interface ActiveInList {
    wrapIndent: number; // Column to wrap to (after open paren)
    closeParenIndex: number;
    commaIndices: Set<number>;
    itemLengths: Map<number, number>; // Precomputed: commaIndex -> length of next item
  }
  let activeInList: ActiveInList | null = null;

  // Track which simple queries are actually compact (fit within line width)
  const compactQueries = new Set<number>();
  for (const [selectToken, info] of analysis.simpleQueries) {
    // For subqueries (depth > 0), apply tighter width constraint to account for
    // surrounding context (CTE prefix, parentheses, outer query continuation).
    // Typical overhead is 20-40 chars for "WITH name AS (" + ") SELECT ..."
    const effectiveMaxWidth =
      info.depth > 0 ? MAX_LINE_WIDTH - 40 : MAX_LINE_WIDTH;
    if (info.spanLength <= effectiveMaxWidth) {
      compactQueries.add(selectToken);
    }
  }

  // Check if set operations should stay inline
  // Only inline if: 1) there are set operation parens, 2) total length is short,
  // 3) ALL queries in the set operation are simple (single-item SELECT)
  let isShortSetOperation = false;
  if (analysis.setOperandParens.size > 0) {
    let estimatedQueryLength = 0;
    for (const tok of tokens) {
      if (tok.type !== SqlBaseLexer.WS && tok.type !== antlr4.Token.EOF) {
        estimatedQueryLength += (tok.text?.length || 0) + 1; // +1 for space
      }
    }
    // Only allow inline if short AND no multi-item clauses exist
    const hasMultiItemClause = analysis.multiItemClauses.size > 0;
    isShortSetOperation =
      estimatedQueryLength <= MAX_LINE_WIDTH && !hasMultiItemClause;
  }

  // Check if VALUES statement should stay inline (simple values list)
  // Only inline if: 1) has values commas, 2) total length is short, 3) NOT tuples (row format)
  // VALUES 1, 2, 3 -> stays inline if short
  // VALUES (1, 'a'), (2, 'b') -> always expands (has tuples)
  let isShortValues = false;
  if (analysis.valuesCommas.size > 0 && !analysis.valuesHasTuples) {
    let estimatedQueryLength = 0;
    for (const tok of tokens) {
      if (tok.type !== SqlBaseLexer.WS && tok.type !== antlr4.Token.EOF) {
        estimatedQueryLength += (tok.text?.length || 0) + 1; // +1 for space
      }
    }
    isShortValues = estimatedQueryLength <= MAX_LINE_WIDTH;
  }

  // Precompute next non-WS token index for every position (O(n) build, O(1) lookup)
  // nextNonWsIndex[i] = index of first significant token at or after position i, or -1 if none
  // This matches the semantics of the original findNextNonWsTokenIndex which starts scanning inclusively
  const nextNonWsIndex = new Int32Array(tokens.length);
  let lastNonWs = -1;
  for (let j = tokens.length - 1; j >= 0; j--) {
    const tok = tokens[j];
    if (
      tok.type !== SqlBaseLexer.WS &&
      tok.type !== antlr4.Token.EOF &&
      tok.type !== SqlBaseLexer.SIMPLE_COMMENT &&
      tok.type !== SqlBaseLexer.BRACKETED_COMMENT
    ) {
      lastNonWs = j;
    }
    nextNonWsIndex[j] = lastNonWs;
  }

  // O(1) lookup for next non-WS token index (inclusive of startIdx)
  const findNextNonWsTokenIndex = (startIdx: number): number => {
    if (startIdx < 0 || startIdx >= tokens.length) return -1;
    return nextNonWsIndex[startIdx];
  };

  // Helper to collect comments from range
  const collectComments = (startIdx: number, endIdx: number): void => {
    for (let j = startIdx; j < endIdx; j++) {
      const hiddenToken = tokens[j];
      if (hiddenToken && hiddenToken.channel === 1) {
        if (
          hiddenToken.type === SqlBaseLexer.SIMPLE_COMMENT ||
          hiddenToken.type === SqlBaseLexer.BRACKETED_COMMENT
        ) {
          const wasOnOwnLine = CommentManager.checkWasOnOwnLine(
            j,
            hiddenToken,
            tokens,
          );
          const hadBlankLineBefore = CommentManager.checkHadBlankLineBefore(
            j,
            tokens,
          );
          comments.add({
            text: hiddenToken.text,
            type: hiddenToken.type,
            wasOnOwnLine,
            hadBlankLineBefore,
          });
        }
      }
    }
  };

  // Reusable token context object to avoid allocating on every iteration
  // Properties are updated in place before each use
  const ctx = {
    isClauseStart: false,
    isJoinOn: false,
    isMergeUsing: false,
    isMergeOn: false,
    isMergeWhen: false,
    isCteMainSelect: false,
    isSetOperandParen: false,
    isSubqueryCloseParen: false,
    isDdlCloseParen: false,
    isDdlComma: false,
    isListComma: false,
    isCteComma: false,
    isValuesComma: false,
    isSetComma: false,
    isConditionOperator: false,
    isBetweenAnd: false,
    isSetKeyword: false,
    isInIdentifierContext: false,
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === antlr4.Token.EOF) continue;

    // Collect hidden tokens (comments)
    const wasAlreadyProcessed = lastProcessedIndex >= i;
    if (!wasAlreadyProcessed) {
      collectComments(lastProcessedIndex + 1, i);
    }
    lastProcessedIndex = Math.max(lastProcessedIndex, i);

    // Skip WS tokens
    if (token.type === SqlBaseLexer.WS) continue;

    // Handle comment tokens directly
    if (
      token.type === SqlBaseLexer.SIMPLE_COMMENT ||
      token.type === SqlBaseLexer.BRACKETED_COMMENT
    ) {
      if (!wasAlreadyProcessed) {
        const wasOnOwnLine = CommentManager.checkWasOnOwnLine(i, token, tokens);
        const hadBlankLineBefore = CommentManager.checkHadBlankLineBefore(
          i,
          tokens,
        );
        comments.add({
          text: token.text,
          type: token.type,
          wasOnOwnLine,
          hadBlankLineBefore,
        });
      }
      continue;
    }

    const text = token.text;
    const tokenType = token.type;
    const tokenIndex = token.tokenIndex;
    const symbolicName = getSymbolicName(tokenType);

    // Handle hints
    if (tokenType === SqlBaseLexer.HENT_START) {
      builder.addSpaceIfNeeded();
      state.insideHint = true;
      state.hintContent = [];
      builder.push('/*+');
      continue;
    }

    if (state.insideHint) {
      if (tokenType === SqlBaseLexer.HENT_END) {
        const formatted = formatHintContent(state.hintContent.join(''));
        builder.push(` ${formatted} `);
        builder.push('*/');
        state.insideHint = false;
        state.hintContent = [];
        state.prevWasFunctionName = false;
        continue;
      } else {
        if (state.hintContent.length > 0) {
          const lastElement = state.hintContent[state.hintContent.length - 1];
          const needsSpace =
            lastElement !== '(' &&
            lastElement !== ' ' &&
            text !== ')' &&
            text !== ',';
          if (needsSpace) state.hintContent.push(' ');
        }
        state.hintContent.push(text);
        continue;
      }
    }

    // Skip AS tokens in table alias context (style: table aliases have no AS)
    if (analysis.tableAliasAsTokens.has(tokenIndex)) {
      continue;
    }

    // Compact query tracking: each subquery level is evaluated independently
    // When we hit a SELECT, check if THAT query is compact and push to stack
    const _simpleQueryInfo = analysis.simpleQueries.get(tokenIndex);
    if (
      symbolicName === 'SELECT' &&
      analysis.clauseStartTokens.has(tokenIndex)
    ) {
      const isThisQueryCompact = compactQueries.has(tokenIndex);
      // Push compact state for this query level
      state.compactQueryStack.push({
        isCompact: isThisQueryCompact,
        depth: state.subqueryDepth,
      });
    }

    // Pop compact query state when we exit a subquery (depth decreases)
    while (
      state.compactQueryStack.length > 0 &&
      state.compactQueryStack[state.compactQueryStack.length - 1].depth >
        state.subqueryDepth
    ) {
      state.compactQueryStack.pop();
    }

    // Also pop on semicolon (statement end at depth 0)
    if (
      text === ';' &&
      state.subqueryDepth === 0 &&
      state.compactQueryStack.length > 0
    ) {
      state.compactQueryStack.pop();
    }

    // Current query is compact if the top of the stack says so
    const inCompactQuery =
      state.compactQueryStack.length > 0 &&
      state.compactQueryStack[state.compactQueryStack.length - 1].isCompact;

    // Get multi-arg function info
    const multiArgFuncInfo = analysis.multiArgFunctionInfo.get(tokenIndex);
    const windowDefInfo = analysis.windowDefInfo.get(tokenIndex);
    const pivotInfoLookup = analysis.pivotInfo.get(tokenIndex);

    // Check expanded function state
    const _currentFunc = expandedFuncs.current();
    const isExpandedFunctionComma = expandedFuncs.isComma(tokenIndex);
    const isExpandedFunctionCloseParen = expandedFuncs.isCloseParen(tokenIndex);

    // Check expanded window state
    // Capture in const to prevent TypeScript's control flow narrowing from
    // incorrectly inferring 'never' type inside this large loop
    const windowState = currentExpandedWindow;
    const isExpandedWindowOrderBy =
      windowState?.orderByTokenIndex === tokenIndex;
    const isExpandedWindowFrame =
      windowState?.windowFrameTokenIndex === tokenIndex;
    const isExpandedWindowCloseParen =
      windowState?.closeParenIndex === tokenIndex;

    // Check expanded pivot state
    const isExpandedPivotAggregateComma =
      currentExpandedPivot?.aggregateCommaIndices.has(tokenIndex) ?? false;
    const isExpandedPivotForKeyword =
      currentExpandedPivot?.forKeywordIndex === tokenIndex;
    const isExpandedPivotInKeyword =
      currentExpandedPivot?.inKeywordIndex === tokenIndex;
    // Don't use comma-first expansion for PIVOT IN lists - let IN list wrapping handle it
    const isExpandedPivotInListComma = false; // Disabled - use IN list wrapping instead
    const isExpandedPivotCloseParen =
      currentExpandedPivot?.closeParenIndex === tokenIndex;

    // Detect unary operator
    const currentTokenIsUnaryOperator = isUnaryOperator(
      text,
      state.prevTokenText,
      state.prevTokenType,
    );

    // Get next token type for lookahead using precomputed index (O(1))
    // We want the next non-WS token AFTER position i, so look up i+1
    const nextNonWsIdx = i + 1 < tokens.length ? nextNonWsIndex[i + 1] : -1;
    const nextTokenType =
      nextNonWsIdx >= 0 && nextNonWsIdx < tokens.length
        ? tokens[nextNonWsIdx].type
        : null;

    // Determine output text
    const outputText = determineOutputText(
      tokenIndex,
      tokenType,
      text,
      symbolicName,
      analysis,
      nextTokenType,
    );

    // Check for function-like keyword
    const isBuiltInFunctionKeyword = isFunctionLikeKeyword(tokenType, text);

    // Track function argument depth
    if (
      text === '(' &&
      (state.prevWasFunctionName || state.prevWasBuiltInFunctionKeyword)
    ) {
      state.insideFunctionArgs++;
    } else if (text === ')' && state.insideFunctionArgs > 0) {
      state.insideFunctionArgs--;
    }

    // Track paren depth
    if (text === '(') state.insideParens++;
    else if (text === ')' && state.insideParens > 0) state.insideParens--;

    // Track complex type depth for ARRAY<>, MAP<>, STRUCT<>
    // These use < and > instead of () for type parameters
    // Note: We increment depth BEFORE processing (for opening <) but decrement AFTER (for closing >)
    const prevSymName =
      state.prevTokenType >= 0 ? getSymbolicName(state.prevTokenType) : null;
    const prevWasComplexTypeKeyword =
      prevSymName === 'ARRAY' ||
      prevSymName === 'MAP' ||
      prevSymName === 'STRUCT';
    const _wasInsideComplexType = state.complexTypeDepth > 0;
    if (
      text === '<' &&
      (prevWasComplexTypeKeyword || state.complexTypeDepth > 0)
    ) {
      state.complexTypeDepth++;
    }
    // Store if we should decrement after output (for closing >)
    const shouldDecrementComplexTypeAfter =
      text === '>' && state.complexTypeDepth > 0;

    // Track IN list wrapping - check if we're entering an IN list
    const inListInfo = analysis.inListInfo.get(tokenIndex);

    // Check if we're exiting an IN list
    if (activeInList && tokenIndex === activeInList.closeParenIndex) {
      // Exiting the IN list
      activeInList = null;
    }

    // Handle AS keyword insertion
    if (analysis.aliasInsertPositions.has(tokenIndex)) {
      builder.addSpaceIfNeeded();
      builder.push('AS');
    }

    // Populate reusable token context object (avoids allocation per token)
    ctx.isClauseStart = analysis.clauseStartTokens.has(tokenIndex);
    ctx.isJoinOn = analysis.joinOnTokens.has(tokenIndex);
    ctx.isMergeUsing = analysis.mergeUsingTokens.has(tokenIndex);
    ctx.isMergeOn = analysis.mergeOnTokens.has(tokenIndex);
    ctx.isMergeWhen = analysis.mergeWhenTokens.has(tokenIndex);
    ctx.isCteMainSelect = analysis.cteMainSelectTokens.has(tokenIndex);
    ctx.isSetOperandParen = analysis.setOperandParens.has(tokenIndex);
    ctx.isSubqueryCloseParen = analysis.subqueryCloseParens.has(tokenIndex);
    ctx.isDdlCloseParen = analysis.ddlCloseParens.has(tokenIndex);
    ctx.isDdlComma = analysis.ddlColumnCommas.has(tokenIndex);
    ctx.isListComma = analysis.listItemCommas.has(tokenIndex);
    ctx.isCteComma = analysis.cteCommas.has(tokenIndex);
    ctx.isValuesComma = analysis.valuesCommas.has(tokenIndex);
    ctx.isSetComma = analysis.setClauseCommas.has(tokenIndex);
    ctx.isConditionOperator = analysis.conditionOperators.has(tokenIndex);
    ctx.isBetweenAnd = analysis.betweenAndTokens.has(tokenIndex);
    ctx.isSetKeyword = tokenIndex === analysis.setKeywordToken;
    ctx.isInIdentifierContext = analysis.identifierTokens.has(tokenIndex);

    // Determine newlines and indent
    const { needsNewline, indent } = calculateNewlineAndIndent(
      tokenIndex,
      symbolicName,
      ctx,
      analysis,
      state,
      expandedFuncs,
      currentExpandedWindow,
      currentExpandedPivot,
      isExpandedFunctionComma,
      isExpandedFunctionCloseParen,
      isExpandedWindowOrderBy,
      isExpandedWindowFrame,
      isExpandedWindowCloseParen,
      isExpandedPivotAggregateComma,
      isExpandedPivotForKeyword,
      isExpandedPivotInKeyword,
      isExpandedPivotInListComma,
      isExpandedPivotCloseParen,
      inCompactQuery,
      isShortSetOperation,
      isShortValues,
    );

    // Handle list commas - look ahead for comments
    const isListComma = analysis.listItemCommas.has(tokenIndex);
    if (isListComma && state.insideFunctionArgs === 0) {
      const nextIdx = findNextNonWsTokenIndex(i + 1);
      if (nextIdx > 0) {
        collectComments(i + 1, nextIdx);
        lastProcessedIndex = nextIdx - 1;
      }
    }

    // Similar look-ahead for other comma types
    const isCteComma = analysis.cteCommas.has(tokenIndex);
    const isDdlComma = analysis.ddlColumnCommas.has(tokenIndex);
    const isValuesComma = analysis.valuesCommas.has(tokenIndex);
    const isSetComma = analysis.setClauseCommas.has(tokenIndex);
    if (
      isCteComma ||
      isDdlComma ||
      isValuesComma ||
      isSetComma ||
      isExpandedFunctionComma
    ) {
      const nextIdx = findNextNonWsTokenIndex(i + 1);
      if (nextIdx > 0) {
        collectComments(i + 1, nextIdx);
        lastProcessedIndex = nextIdx - 1;
      }
    }

    // Apply spacing/newlines
    if (needsNewline) {
      outputWithNewline(builder, comments, indent, state);
    } else {
      outputWithoutNewline(
        builder,
        comments,
        text,
        symbolicName,
        state,
        currentTokenIsUnaryOperator,
        analysis.lateralViewCommas.has(tokenIndex),
      );
    }

    builder.push(outputText);

    // Handle IN list wrapping: after outputting a comma in an IN list,
    // check if the next item would exceed line width
    if (activeInList?.commaIndices.has(tokenIndex) && text === ',') {
      // Use precomputed item length (O(1) lookup instead of O(k) walk)
      const nextItemLength = activeInList.itemLengths.get(tokenIndex) ?? 0;
      const currentCol = builder.getColumn();

      // Add 1 for the space after comma
      if (currentCol + 1 + nextItemLength > MAX_LINE_WIDTH) {
        // Wrap to new line with indent
        builder.push(`\n${' '.repeat(activeInList.wrapIndent)}`);
        state.justOutputInListWrapNewline = true;
      }
    }

    // Activate IN list tracking AFTER we push the opening paren
    if (inListInfo && text === '(') {
      let wrapIndent = builder.getColumn(); // Column right after the (

      // If wrap indent exceeds 60% of line width, fall back to current indent + 4
      const maxWrapIndent = Math.floor(MAX_LINE_WIDTH * 0.6); // 84 chars
      if (wrapIndent > maxWrapIndent) {
        // Find current line's base indent (position of first non-space on this line)
        // Since we just pushed '(', go back to find the line start indent
        const currentOutput = builder.toString();
        const lastNewline = currentOutput.lastIndexOf('\n');
        const lineStart =
          lastNewline >= 0
            ? currentOutput.slice(lastNewline + 1)
            : currentOutput;
        const baseIndentMatch = lineStart.match(/^(\s*)/);
        const baseIndent = baseIndentMatch ? baseIndentMatch[1].length : 0;
        wrapIndent = baseIndent + 4; // Fall back to base indent + 1 indent level
      }

      activeInList = {
        wrapIndent,
        closeParenIndex: inListInfo.closeParenIndex,
        commaIndices: inListInfo.commaIndices, // Already a Set
        itemLengths: inListInfo.itemLengths, // Precomputed lengths
      };
    }

    // Handle multi-WHEN CASE newline after CASE or after value expression
    // For searchedCase (CASE WHEN ...), newline goes after CASE
    // For simpleCase (CASE x WHEN ...), newline goes after value expression
    if (analysis.multiWhenCaseTokens.has(tokenIndex)) {
      // Check if this CASE has a value expression (simpleCase)
      // If so, we'll add the newline after the value, not here
      const isSimpleCase = analysis.simpleCaseTokens?.has(tokenIndex);
      if (!isSimpleCase) {
        // searchedCase - newline right after CASE
        builder.push('\n');
      }
      state.caseDepth++;
    }

    // For simpleCase, add newline after the value expression
    if (analysis.simpleCaseValueEndTokens?.has(tokenIndex)) {
      builder.push('\n');
    }

    // Track subquery depth changes
    if (analysis.subqueryOpenParens.has(tokenIndex)) state.subqueryDepth++;
    else if (
      analysis.subqueryCloseParens.has(tokenIndex) &&
      state.subqueryDepth > 0
    )
      state.subqueryDepth--;

    // Track DDL depth
    if (
      analysis.ddlOpenParens.has(tokenIndex) &&
      analysis.ddlMultiColumn.has(tokenIndex)
    ) {
      builder.push(`\n${'    '.repeat(state.subqueryDepth + 1)}`);
      state.ddlDepth++;
    } else if (ctx.isDdlCloseParen && state.ddlDepth > 0) {
      state.ddlDepth--;
    }

    // Handle multi-arg function expansion
    // Check if this token is force-inline (either line-based legacy or grammar-driven)
    const tokenLine = tokens[i]?.line || 0;
    const lineBasedForceCollapse =
      formatDirectives.collapsedLines.has(tokenLine);
    const grammarBasedForceCollapse = forceInlineRanges.has(tokenIndex);
    // Suppress function expansion when inside IN list - IN list wrapping handles layout
    const insideInList = activeInList !== null;
    const forceCollapse =
      lineBasedForceCollapse || grammarBasedForceCollapse || insideInList;

    if (
      multiArgFuncInfo &&
      !forceCollapse &&
      shouldExpandFunction(builder.getColumn(), multiArgFuncInfo)
    ) {
      handleFunctionExpansion(
        builder,
        expandedFuncs,
        multiArgFuncInfo,
        tokens,
        i,
        findNextNonWsTokenIndex,
        analysis,
        state,
      );
    }

    // Handle window expansion (pass multiArgFunctionInfo to check nested function expansion)
    if (
      windowDefInfo &&
      !forceCollapse &&
      shouldExpandWindow(
        builder.getColumn(),
        windowDefInfo,
        analysis.multiArgFunctionInfo,
      )
    ) {
      currentExpandedWindow = {
        closeParenIndex: windowDefInfo.closeParenIndex,
        orderByTokenIndex: windowDefInfo.orderByTokenIndex,
        windowFrameTokenIndex: windowDefInfo.windowFrameTokenIndex,
        baseDepth: state.subqueryDepth,
      };
      const newIndent =
        '\n' +
        ' '.repeat(indentCalc.getWindowContentIndent(state.subqueryDepth));
      builder.push(newIndent);
      state.justOutputWindowNewline = true;
    }

    // Handle PIVOT/UNPIVOT expansion
    if (
      pivotInfoLookup &&
      !forceCollapse &&
      shouldExpandPivot(builder.getColumn(), pivotInfoLookup)
    ) {
      currentExpandedPivot = {
        closeParenIndex: pivotInfoLookup.closeParenIndex,
        aggregateCommaIndices: pivotInfoLookup.aggregateCommaIndices, // Already a Set
        forKeywordIndex: pivotInfoLookup.forKeywordIndex,
        inKeywordIndex: pivotInfoLookup.inKeywordIndex,
        inListCommaIndices: pivotInfoLookup.inListCommaIndices, // Already a Set
        depth: state.subqueryDepth,
        openingColumn: builder.getColumn() - 1,
      };
      // Output newline after opening paren
      const pivotIndent =
        '\n' +
        ' '.repeat(indentCalc.getPivotContentIndent(state.subqueryDepth));
      builder.push(pivotIndent);
      state.justOutputPivotNewline = true;
    }

    // Pop expanded function on close paren
    if (isExpandedFunctionCloseParen && !expandedFuncs.isEmpty()) {
      expandedFuncs.pop();
    }

    // Clear expanded window on close paren
    if (isExpandedWindowCloseParen && currentExpandedWindow) {
      currentExpandedWindow = null;
    }

    // Clear expanded pivot on close paren
    if (isExpandedPivotCloseParen && currentExpandedPivot) {
      currentExpandedPivot = null;
    }

    // Reset flags
    if (
      state.justOutputMultiArgFunctionNewline &&
      text !== ',' &&
      text !== '('
    ) {
      state.justOutputMultiArgFunctionNewline = false;
    }
    if (state.justOutputWindowNewline && text !== '(' && text !== ',') {
      state.justOutputWindowNewline = false;
    }
    if (state.justOutputPivotNewline && text !== '(' && text !== ',') {
      state.justOutputPivotNewline = false;
    }
    if (state.justOutputInListWrapNewline && text !== ',') {
      state.justOutputInListWrapNewline = false;
    }
    if (state.justOutputCommaFirstStyle && text !== ',') {
      state.justOutputCommaFirstStyle = false;
    }

    // Decrease CASE depth after END
    if (analysis.caseEndTokens.has(tokenIndex) && state.caseDepth > 0) {
      state.caseDepth--;
    }

    // Decrement complex type depth after outputting closing >
    if (shouldDecrementComplexTypeAfter) {
      state.complexTypeDepth--;
    }

    // Reset clause flags
    updateClauseFlags(symbolicName, ctx, state);

    // Check if this token is a partition transform function (followed by paren)
    const isPartitionTransformFunc =
      PARTITION_TRANSFORM_FUNCTIONS.has(text.toUpperCase()) &&
      nextTokenType !== null &&
      getSymbolicName(nextTokenType) === 'LEFT_PAREN';

    // Update previous token tracking
    state.prevWasFunctionName =
      analysis.functionCallTokens.has(tokenIndex) || isPartitionTransformFunc;
    state.prevWasBuiltInFunctionKeyword = isBuiltInFunctionKeyword;
    state.isFirstNonWsToken = false;
    state.prevTokenWasUnaryOperator = currentTokenIsUnaryOperator;
    state.prevTokenText = text;
    state.prevTokenType = tokenType;
  }

  // Output remaining comments
  if (comments.hasPending()) {
    outputComments(builder, comments.getPending());
  }

  return builder.toString();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Scan tokens for fmt:inline comments and find their enclosing expressions.
 * Returns a Set of open token indices for expressions that should not be expanded.
 *
 * The approach:
 * 1. Find all comment tokens that contain fmt:inline
 * 2. For each such comment, find the immediately preceding token (or same position)
 * 3. Check if that token is within any multi-arg function, window def, or pivot
 * 4. If so, add that construct's open token index to the set
 */
function findForceInlineRanges(
  tokens: any[],
  analysis: AnalyzerResult,
): Set<number> {
  const forceInlineOpenIndices = new Set<number>();

  // Helper to add an open index to the set
  const addRange = (openIdx: number) => {
    forceInlineOpenIndices.add(openIdx);
  };

  // Scan all tokens for fmt:inline comments
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    // Check if this is a comment with fmt:inline
    if (
      token.type === SqlBaseLexer.SIMPLE_COMMENT ||
      token.type === SqlBaseLexer.BRACKETED_COMMENT
    ) {
      if (isFmtInlineComment(token.text || '')) {
        // Found a fmt:inline comment at token index i
        // Find the closest preceding non-WS, non-comment token
        let precedingTokenIdx = i - 1;
        while (precedingTokenIdx >= 0) {
          const prevToken = tokens[precedingTokenIdx];
          if (
            prevToken &&
            prevToken.type !== SqlBaseLexer.WS &&
            prevToken.type !== SqlBaseLexer.SIMPLE_COMMENT &&
            prevToken.type !== SqlBaseLexer.BRACKETED_COMMENT
          ) {
            break;
          }
          precedingTokenIdx--;
        }

        // Now find which expression (if any) contains this position
        // Check multi-arg functions
        for (const [openIdx, info] of analysis.multiArgFunctionInfo) {
          if (
            precedingTokenIdx >= openIdx &&
            precedingTokenIdx <= info.closeParenIndex
          ) {
            addRange(openIdx);
          }
          // Also check if comment is right after close paren (common placement)
          if (precedingTokenIdx === info.closeParenIndex) {
            addRange(openIdx);
          }
        }

        // Check window definitions
        for (const [openIdx, info] of analysis.windowDefInfo) {
          if (
            precedingTokenIdx >= openIdx &&
            precedingTokenIdx <= info.closeParenIndex
          ) {
            addRange(openIdx);
          }
          if (precedingTokenIdx === info.closeParenIndex) {
            addRange(openIdx);
          }
        }

        // Check PIVOT/UNPIVOT
        for (const [openIdx, info] of analysis.pivotInfo) {
          if (
            precedingTokenIdx >= openIdx &&
            precedingTokenIdx <= info.closeParenIndex
          ) {
            addRange(openIdx);
          }
          if (precedingTokenIdx === info.closeParenIndex) {
            addRange(openIdx);
          }
        }
      }
    }
  }

  return forceInlineOpenIndices;
}

/**
 * Determine the output text for a token (casing rules).
 */
function determineOutputText(
  tokenIndex: number,
  tokenType: number,
  text: string,
  symbolicName: string | null,
  analysis: AnalyzerResult,
  nextTokenType: number | null,
): string {
  // SET config tokens - preserve casing
  if (analysis.setConfigTokens.has(tokenIndex)) {
    return text;
  }

  // GROUP BY ALL - uppercase
  if (analysis.groupByAllTokens.has(tokenIndex)) {
    return text.toUpperCase();
  }

  // Function call context
  if (analysis.functionCallTokens.has(tokenIndex)) {
    const funcLower = text.toLowerCase();
    const isBuiltIn =
      SPARK_BUILTIN_FUNCTIONS.has(funcLower) || isKeywordToken(tokenType, text);
    return isBuiltIn ? text.toUpperCase() : text;
  }

  // Structural keywords that should always be uppercase, even in identifier contexts.
  // These are syntactic markers, not actual identifier names.
  // e.g., "LATERAL VIEW EXPLODE(arr) AS item" - AS is a keyword, not an identifier.
  if (symbolicName && STRUCTURAL_KEYWORDS.has(symbolicName)) {
    return text.toUpperCase();
  }

  // Extension keywords: Should always be uppercase, even in identifier context.
  // Keywords not in Spark grammar (Delta Lake extensions).
  const textUpper = text.toUpperCase();
  if (EXTENSION_KEYWORDS.has(textUpper)) {
    return textUpper;
  }

  // Partition transform functions: uppercase only when followed by '('
  // These are grammar keywords but appear as transformName=identifier in grammar.
  // When used as column names (not followed by '('), they should preserve casing.
  // e.g., "PARTITIONED BY (bucket(3, col))" - BUCKET uppercase
  // e.g., "SELECT year FROM t" - year lowercase (it's a column name)
  if (PARTITION_TRANSFORM_FUNCTIONS.has(textUpper)) {
    // Check if next token is '(' (function call context)
    const isFollowedByParen =
      nextTokenType !== null && getSymbolicName(nextTokenType) === 'LEFT_PAREN';
    if (isFollowedByParen) {
      return textUpper;
    }
    // Not followed by paren - treat as regular identifier, preserve casing
  }

  // Identifier context - preserve casing
  // When a token is marked as identifier by the parse tree, it means the grammar
  // is using it as an identifier (column name, table name, etc.), so preserve casing.
  if (analysis.identifierTokens.has(tokenIndex)) {
    return text;
  }

  // Keyword - uppercase
  if (isKeywordToken(tokenType, text)) {
    return text.toUpperCase();
  }

  // Default - preserve
  return text;
}
