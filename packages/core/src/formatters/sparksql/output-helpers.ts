/**
 * Output Helpers
 *
 * Extracted from formatter.ts to reduce file size and improve maintainability.
 * This module handles outputting tokens with and without newlines.
 */

import type { CommentManager } from './formatting-context.js';
import {
  type OutputBuilder,
  outputComments,
  shouldAddCommaSpace,
  shouldSkipSpace,
} from './output-builder.js';
import { getSymbolicName, SqlBaseLexer } from './token-utils.js';

/**
 * Interface for state required by output functions.
 */
export interface OutputState {
  prevWasFunctionName: boolean;
  prevWasBuiltInFunctionKeyword: boolean;
  insideParens: number;
  justOutputCommaFirstStyle: boolean;
  justOutputMultiArgFunctionNewline: boolean;
  justOutputWindowNewline: boolean;
  justOutputInListWrapNewline: boolean;
  afterWhereKeyword: boolean;
  afterHavingKeyword: boolean;
  prevTokenWasUnaryOperator: boolean;
  prevTokenText: string;
  prevTokenType: number;
  complexTypeDepth: number;
}

/**
 * Output token with newline handling.
 */
export function outputWithNewline(
  builder: OutputBuilder,
  comments: CommentManager,
  indent: string,
  _state: OutputState,
): void {
  const inlineComments = comments.getInlineComments();
  const ownLineComments = comments.getOwnLineComments();

  // Output inline comments before newline
  if (inlineComments.length > 0) {
    outputComments(builder, inlineComments);
  }

  // Add newline
  builder.ensureNewline();

  // Output own-line comments with indent
  for (const comment of ownLineComments) {
    // Preserve blank line before comment if it existed in the original
    if (comment.hadBlankLineBefore && !builder.isEmpty()) {
      builder.push('\n');
    }
    if (indent) builder.push(indent);
    builder.push(comment.text);
    if (
      comment.type === SqlBaseLexer.BRACKETED_COMMENT &&
      !comment.text.endsWith('\n')
    ) {
      builder.push('\n');
    }
  }

  // Add indent for token
  if (indent) builder.push(indent);

  comments.clear();
}

/**
 * Output token without newline.
 */
export function outputWithoutNewline(
  builder: OutputBuilder,
  comments: CommentManager,
  text: string,
  symbolicName: string | null,
  state: OutputState,
  currentTokenIsUnaryOperator: boolean,
  isLateralViewComma: boolean = false,
): void {
  if (comments.hasPending()) {
    outputComments(builder, comments.getPending(), !builder.isEmpty());
    comments.clear();
  }

  if (!builder.isEmpty()) {
    const lastChar = builder.getLastChar();
    const prevIsDoubleColon = lastChar === ':' && text !== ':';

    // Check if previous token was actually a DOT token (member access), not a decimal like "1."
    const prevSymbolicName =
      state.prevTokenType >= 0 ? getSymbolicName(state.prevTokenType) : null;
    const prevWasDotToken = prevSymbolicName === 'DOT';

    const skipSpace = shouldSkipSpace(builder, text, {
      prevWasFunctionName: state.prevWasFunctionName,
      prevWasBuiltInFunctionKeyword: state.prevWasBuiltInFunctionKeyword,
      insideParens: state.insideParens,
      justOutputCommaFirstStyle: state.justOutputCommaFirstStyle,
      justOutputMultiArgFunctionNewline:
        state.justOutputMultiArgFunctionNewline,
      justOutputWindowNewline: state.justOutputWindowNewline,
      justOutputInListWrapNewline: state.justOutputInListWrapNewline,
      afterWhereKeyword: state.afterWhereKeyword,
      afterHavingKeyword: state.afterHavingKeyword,
      prevTokenWasUnaryOperator:
        state.prevTokenWasUnaryOperator &&
        (state.prevTokenText === '-' ||
          state.prevTokenText === '+' ||
          state.prevTokenText === '~'),
      currentTokenIsUnaryOperator,
      isLateralViewComma,
      prevIsDoubleColon,
      prevTokenText: state.prevTokenText,
      currentTokenIsStringLiteral: symbolicName === 'STRING_LITERAL',
      prevWasDotToken,
      complexTypeDepth: state.complexTypeDepth,
    });

    const needsCommaSpace = shouldAddCommaSpace(
      builder,
      state.insideParens,
      state.justOutputCommaFirstStyle,
    );

    if (!skipSpace || needsCommaSpace) {
      builder.push(' ');
    }
  }
}

/**
 * Update clause tracking flags after processing a token.
 */
export function updateClauseFlags(
  symbolicName: string | null,
  ctx: { isListComma: boolean },
  state: {
    afterSelectKeyword: boolean;
    afterGroupByKeyword: boolean;
    afterOrderByKeyword: boolean;
  },
): void {
  if (
    symbolicName !== 'SELECT' &&
    symbolicName !== 'DISTINCT' &&
    state.afterSelectKeyword &&
    !ctx.isListComma
  ) {
    state.afterSelectKeyword = false;
  }
  if (
    symbolicName !== 'GROUP' &&
    symbolicName !== 'BY' &&
    state.afterGroupByKeyword &&
    !ctx.isListComma
  ) {
    state.afterGroupByKeyword = false;
  }
  if (
    symbolicName !== 'ORDER' &&
    symbolicName !== 'BY' &&
    state.afterOrderByKeyword &&
    !ctx.isListComma
  ) {
    state.afterOrderByKeyword = false;
  }
}
