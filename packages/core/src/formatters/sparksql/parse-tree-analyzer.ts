/**
 * Parse Tree Analyzer - Collects Formatting Context from AST
 *
 * This visitor walks the ANTLR parse tree and collects information about:
 * - Identifier tokens (preserve casing)
 * - Function call tokens (uppercase)
 * - Clause-starting tokens (newline before)
 * - List item separators (commas in SELECT, GROUP BY, ORDER BY)
 * - Condition separators (AND/OR in WHERE/HAVING)
 * - Subquery boundaries
 * - And many more context-specific positions
 *
 * This is 100% grammar-driven - no hardcoded keyword lists.
 *
 * NOTE: This file intentionally exceeds the 200-400 line guideline (~1800 lines).
 * The ANTLR visitor pattern requires all visit methods to be in one class, and the
 * private helper methods mutate class state (Sets/Maps). Extracting them would require
 * passing all state as parameters, which is invasive. See fabric-format-3e5 for
 * discussion of alternative approaches (composition, multiple analyzer classes).
 */

import SqlBaseLexer from './generated/SqlBaseLexer.js';
import SqlBaseParser from './generated/SqlBaseParser.js';
import SqlBaseParserVisitor from './generated/SqlBaseParserVisitor.js';
import {
  calculateNormalizedSpanLength,
  calculateSpanLength,
} from './span-calculator.js';
import { getTokenType } from './token-utils.js';
import type {
  AnalyzerResult,
  InListInfo,
  MultiArgFunctionInfo,
  PivotInfo,
  SimpleQueryInfo,
  WindowDefInfo,
} from './types.js';

/**
 * Visitor that collects context information from parse tree.
 * After visiting, call getResult() to get the analysis.
 */
export class ParseTreeAnalyzer extends SqlBaseParserVisitor {
  // ========== TOKEN POSITION SETS ==========
  identifierTokens: Set<number> = new Set();
  functionCallTokens: Set<number> = new Set();
  clauseStartTokens: Set<number> = new Set();
  qualifiedNameTokens: Set<number> = new Set(); // Tokens that are part of qualified names (t.column)

  // List formatting
  listItemCommas: Set<number> = new Set();
  listFirstItems: Set<number> = new Set();
  multiItemClauses: Set<number> = new Set();

  // Condition formatting
  conditionOperators: Set<number> = new Set();
  multilineConditionClauses: Set<number> = new Set();
  betweenAndTokens: Set<number> = new Set();

  // Subquery tracking
  subqueryDepth: number = 0;
  tokenDepthMap: Map<number, number> = new Map();
  subqueryOpenParens: Set<number> = new Set();
  subqueryCloseParens: Set<number> = new Set();
  setOperandParens: Set<number> = new Set();

  // Alias handling
  aliasInsertPositions: Set<number> = new Set();
  tableAliasAsTokens: Set<number> = new Set(); // AS tokens in table alias context (to be suppressed)

  // JOIN handling
  joinOnTokens: Set<number> = new Set();

  // CTE handling
  cteCommas: Set<number> = new Set();
  cteMainSelectTokens: Set<number> = new Set(); // SELECT tokens of main query after CTE block

  // DDL handling
  ddlColumnCommas: Set<number> = new Set();
  ddlOpenParens: Set<number> = new Set();
  ddlCloseParens: Set<number> = new Set();
  ddlFirstColumn: Set<number> = new Set();
  ddlMultiColumn: Set<number> = new Set();

  // DML handling
  valuesCommas: Set<number> = new Set();
  valuesHasTuples: boolean = false; // true if VALUES contains tuples like (a, b), (c, d)
  setClauseCommas: Set<number> = new Set();
  setKeywordToken: number = -1;

  // CASE expression handling
  multiWhenCaseTokens: Set<number> = new Set();
  caseWhenTokens: Set<number> = new Set();
  caseElseTokens: Set<number> = new Set();
  caseEndTokens: Set<number> = new Set();
  simpleCaseTokens: Set<number> = new Set(); // CASE tokens that have value expressions (simpleCase)
  simpleCaseValueEndTokens: Set<number> = new Set(); // Tokens after value in CASE x WHEN ...

  // Grouping analytics
  groupingAnalyticsParens: Set<number> = new Set();
  private insideGroupingAnalytics: boolean = false;

  // EXCEPT clause (column exclusion in SELECT)
  exceptClauseTokens: Set<number> = new Set(); // tokens inside EXCEPT (...) for column exclusion

  // SET configuration
  setConfigTokens: Set<number> = new Set();

  // MERGE statement
  mergeUsingTokens: Set<number> = new Set();
  mergeOnTokens: Set<number> = new Set();
  mergeWhenTokens: Set<number> = new Set();

  // LATERAL VIEW
  lateralViewCommas: Set<number> = new Set();

  // GROUP BY ALL
  groupByAllTokens: Set<number> = new Set();

  // Multi-arg function expansion
  multiArgFunctionInfo: Map<number, MultiArgFunctionInfo> = new Map();

  // Window definition expansion
  windowDefInfo: Map<number, WindowDefInfo> = new Map();

  // PIVOT/UNPIVOT expansion
  pivotInfo: Map<number, PivotInfo> = new Map();

  // IN list wrapping
  inListInfo: Map<number, InListInfo> = new Map();

  // Pre-computed set of all IN list comma indices for O(1) lookup
  allInListCommas: Set<number> = new Set();

  // Simple query compaction
  simpleQueries: Map<number, SimpleQueryInfo> = new Map();

  // Internal state
  private currentSelectToken: number = -1;

  // ========== PUBLIC API ==========

  /**
   * Get the complete analysis result after visiting.
   */
  getResult(): AnalyzerResult {
    return {
      identifierTokens: this.identifierTokens,
      functionCallTokens: this.functionCallTokens,
      clauseStartTokens: this.clauseStartTokens,
      qualifiedNameTokens: this.qualifiedNameTokens,
      listItemCommas: this.listItemCommas,
      listFirstItems: this.listFirstItems,
      multiItemClauses: this.multiItemClauses,
      conditionOperators: this.conditionOperators,
      multilineConditionClauses: this.multilineConditionClauses,
      betweenAndTokens: this.betweenAndTokens,
      tokenDepthMap: this.tokenDepthMap,
      subqueryOpenParens: this.subqueryOpenParens,
      subqueryCloseParens: this.subqueryCloseParens,
      setOperandParens: this.setOperandParens,
      aliasInsertPositions: this.aliasInsertPositions,
      tableAliasAsTokens: this.tableAliasAsTokens,
      joinOnTokens: this.joinOnTokens,
      cteCommas: this.cteCommas,
      cteMainSelectTokens: this.cteMainSelectTokens,
      ddlColumnCommas: this.ddlColumnCommas,
      ddlOpenParens: this.ddlOpenParens,
      ddlCloseParens: this.ddlCloseParens,
      ddlFirstColumn: this.ddlFirstColumn,
      ddlMultiColumn: this.ddlMultiColumn,
      valuesCommas: this.valuesCommas,
      valuesHasTuples: this.valuesHasTuples,
      setClauseCommas: this.setClauseCommas,
      setKeywordToken: this.setKeywordToken,
      multiWhenCaseTokens: this.multiWhenCaseTokens,
      caseWhenTokens: this.caseWhenTokens,
      caseElseTokens: this.caseElseTokens,
      caseEndTokens: this.caseEndTokens,
      simpleCaseTokens: this.simpleCaseTokens,
      simpleCaseValueEndTokens: this.simpleCaseValueEndTokens,
      groupingAnalyticsParens: this.groupingAnalyticsParens,
      exceptClauseTokens: this.exceptClauseTokens,
      setConfigTokens: this.setConfigTokens,
      mergeUsingTokens: this.mergeUsingTokens,
      mergeOnTokens: this.mergeOnTokens,
      mergeWhenTokens: this.mergeWhenTokens,
      lateralViewCommas: this.lateralViewCommas,
      groupByAllTokens: this.groupByAllTokens,
      multiArgFunctionInfo: this.multiArgFunctionInfo,
      windowDefInfo: this.windowDefInfo,
      pivotInfo: this.pivotInfo,
      inListInfo: this.inListInfo,
      allInListCommas: this.allInListCommas,
      simpleQueries: this.simpleQueries,
    };
  }

  // ========== VISITOR INFRASTRUCTURE ==========

  visit(ctx: any): any {
    if (!ctx) return null;
    return this.visitChildren(ctx);
  }

  visitChildren(ctx: any): any {
    if (!ctx?.children) return null;
    for (const child of ctx.children) {
      if (child?.accept) child.accept(this);
    }
    return null;
  }

  // ========== IDENTIFIER CONTEXTS ==========

  visitIdentifier(ctx: any): any {
    this._markIdentifier(ctx);
    return this.visitChildren(ctx);
  }

  visitStrictIdentifier(ctx: any): any {
    this._markIdentifier(ctx);
    return this.visitChildren(ctx);
  }

  visitQuotedIdentifier(ctx: any): any {
    this._markIdentifier(ctx);
    return this.visitChildren(ctx);
  }

  visitBackQuotedIdentifier(ctx: any): any {
    this._markIdentifier(ctx);
    return this.visitChildren(ctx);
  }

  visitUnquotedIdentifier(ctx: any): any {
    this._markIdentifier(ctx);
    return this.visitChildren(ctx);
  }

  visitErrorCapturingIdentifier(ctx: any): any {
    this._markIdentifier(ctx);
    return this.visitChildren(ctx);
  }

  /**
   * Visit qualified name (e.g., table.column, db.schema.table.column)
   * GRAMMAR-DRIVEN: qualifiedName : identifier (DOT identifier)*
   *
   * Context-sensitive keyword handling: In qualified names, even tokens that are
   * keywords (like USER, TABLE) should be treated as identifiers and preserve casing.
   * This is because the grammar context (qualifiedName rule) makes them identifiers.
   */
  visitQualifiedName(ctx: any): any {
    // Mark all tokens in the qualified name as identifiers, except DOT tokens
    if (ctx.start && ctx.stop) {
      for (let i = ctx.start.tokenIndex; i <= ctx.stop.tokenIndex; i++) {
        this.identifierTokens.add(i);
        this.qualifiedNameTokens.add(i); // Also track as qualified name
      }
    }
    // Still visit children to handle nested contexts
    return this.visitChildren(ctx);
  }

  /**
   * Visit dereference (field access like user.address, table.column)
   * GRAMMAR-DRIVEN: base=primaryExpression DOT fieldName=identifier
   *
   * When a keyword like USER or TABLE appears before DOT, it should be treated
   * as an identifier (table/column alias), not as a keyword.
   * Similarly, keywords appearing as field names (like KEY, ORDER) should preserve casing.
   */
  visitDereference(ctx: any): any {
    // Mark the base token as an identifier when it's being dereferenced
    // This handles cases like: user.address where USER is a keyword but should be preserved
    if (ctx.base?.start) {
      // Mark the base expression tokens as identifiers
      for (
        let i = ctx.base.start.tokenIndex;
        i <= (ctx.base.stop?.tokenIndex ?? ctx.base.start.tokenIndex);
        i++
      ) {
        this.identifierTokens.add(i);
        this.qualifiedNameTokens.add(i); // Also track as qualified name
      }
    }

    // Mark the field name (right side after dot) as an identifier
    // This handles cases like: a.key, a.order where KEY, ORDER are keywords but used as column names
    if (ctx.fieldName?.start) {
      for (
        let i = ctx.fieldName.start.tokenIndex;
        i <= (ctx.fieldName.stop?.tokenIndex ?? ctx.fieldName.start.tokenIndex);
        i++
      ) {
        this.identifierTokens.add(i);
        this.qualifiedNameTokens.add(i); // Also track as qualified name
      }
    }

    return this.visitChildren(ctx);
  }

  // ========== FUNCTION CALL CONTEXTS ==========

  visitFunctionCall(ctx: any): any {
    if (ctx.start) {
      this.functionCallTokens.add(ctx.start.tokenIndex);
    }

    // Check for multi-arg functions
    const args = ctx.argument;
    if (args && args.length >= 2) {
      this._collectMultiArgFunctionInfo(ctx, args.length);
    }

    return this.visitChildren(ctx);
  }

  visitFunctionName(ctx: any): any {
    if (ctx.start) {
      this.functionCallTokens.add(ctx.start.tokenIndex);
    }
    return this.visitChildren(ctx);
  }

  visitFirst(ctx: any): any {
    if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
    return this.visitChildren(ctx);
  }

  visitLast(ctx: any): any {
    if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
    return this.visitChildren(ctx);
  }

  visitAny_value(ctx: any): any {
    if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
    return this.visitChildren(ctx);
  }

  visitStruct(ctx: any): any {
    if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
    return this.visitChildren(ctx);
  }

  visitExtract(ctx: any): any {
    if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
    return this.visitChildren(ctx);
  }

  visitCast(ctx: any): any {
    if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);

    // Collect CAST as potentially expandable
    if (ctx.children) {
      let leftParenTokenIndex: number | null = null;
      let leftParenCharStart: number = 0;
      let rightParenTokenIndex: number | null = null;

      for (const child of ctx.children) {
        if (child.symbol) {
          const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
          if (symName === 'LEFT_PAREN' && leftParenTokenIndex === null) {
            leftParenTokenIndex = child.symbol.tokenIndex;
            leftParenCharStart = child.symbol.start ?? 0;
          } else if (symName === 'RIGHT_PAREN') {
            rightParenTokenIndex = child.symbol.tokenIndex;
          }
        }
      }

      if (leftParenTokenIndex !== null && rightParenTokenIndex !== null) {
        const spanLength = calculateNormalizedSpanLength(ctx);
        this.multiArgFunctionInfo.set(leftParenTokenIndex, {
          closeParenIndex: rightParenTokenIndex,
          commaIndices: [],
          spanLength: spanLength,
          functionName: 'CAST',
          charStart: leftParenCharStart,
        });
      }
    }

    return this.visitChildren(ctx);
  }

  visitPosition(ctx: any): any {
    if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
    return this.visitChildren(ctx);
  }

  visitTimestampadd(ctx: any): any {
    if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
    return this.visitChildren(ctx);
  }

  visitTimestampdiff(ctx: any): any {
    if (ctx.start) this.functionCallTokens.add(ctx.start.tokenIndex);
    return this.visitChildren(ctx);
  }

  visitLateralView(ctx: any): any {
    if (ctx.children) {
      let foundRightParen = false;
      for (const child of ctx.children) {
        if (child.ruleIndex !== undefined) {
          const ruleName = SqlBaseParser.ruleNames[child.ruleIndex];
          if (ruleName === 'qualifiedName' && child.start) {
            this.functionCallTokens.add(child.start.tokenIndex);
          }
        }
        if (child.symbol) {
          const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
          if (symName === 'RIGHT_PAREN') {
            foundRightParen = true;
          }
          if (foundRightParen && symName === 'COMMA') {
            this.lateralViewCommas.add(child.symbol.tokenIndex);
          }
        }
      }
    }
    return this.visitChildren(ctx);
  }

  // ========== CASE EXPRESSION CONTEXTS ==========

  visitSearchedCase(ctx: any): any {
    this._analyzeCaseExpression(ctx);
    return this.visitChildren(ctx);
  }

  visitSimpleCase(ctx: any): any {
    this._analyzeCaseExpression(ctx);
    return this.visitChildren(ctx);
  }

  // ========== CLAUSE-STARTING CONTEXTS ==========

  visitExceptClause(ctx: any): any {
    // Mark all tokens inside EXCEPT (...) clause for column exclusion
    // These tokens should not trigger expansion
    this._markAllDescendantTokens(ctx, this.exceptClauseTokens);
    return this.visitChildren(ctx);
  }

  visitFromClause(ctx: any): any {
    this._markClauseStart(ctx);
    return this.visitChildren(ctx);
  }

  /**
   * Visit table alias context and mark AS tokens for suppression.
   * Style guide says table aliases should NOT have AS keyword.
   * Grammar: tableAlias: (AS? strictIdentifier identifierList?)?
   */
  visitTableAlias(ctx: any): any {
    // Check if this table alias has an AS keyword
    if (ctx.AS && typeof ctx.AS === 'function') {
      const asToken = ctx.AS();
      if (asToken?.symbol) {
        this.tableAliasAsTokens.add(asToken.symbol.tokenIndex);
      }
    }
    return this.visitChildren(ctx);
  }

  visitAggregationClause(ctx: any): any {
    this._markClauseStart(ctx);
    this._markGroupByAllToken(ctx);

    const commaCount = this._markListCommasExcludingGroupingAnalytics(ctx);
    if (commaCount > 0 && ctx.start) {
      let actualCommaCount = 0;
      if (ctx.children) {
        for (const child of ctx.children) {
          if (child.symbol && child.symbol.type === getTokenType('COMMA')) {
            if (this.listItemCommas.has(child.symbol.tokenIndex)) {
              actualCommaCount++;
            }
          }
        }
      }
      if (actualCommaCount > 0) {
        this.multiItemClauses.add(ctx.start.tokenIndex);
      }
    }
    return this.visitChildren(ctx);
  }

  visitGroupingAnalytics(ctx: any): any {
    let isRollupOrCube = false;
    if (ctx.children) {
      for (const child of ctx.children) {
        if (child.symbol) {
          const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
          if (symName === 'ROLLUP' || symName === 'CUBE') {
            isRollupOrCube = true;
          } else if (symName === 'LEFT_PAREN') {
            this.groupingAnalyticsParens.add(child.symbol.tokenIndex);
            if (isRollupOrCube) {
              const parenIndex = child.symbol.tokenIndex;
              for (const c of ctx.children) {
                if (c.symbol) {
                  const sn = SqlBaseLexer.symbolicNames[c.symbol.type];
                  if (
                    (sn === 'ROLLUP' || sn === 'CUBE') &&
                    c.symbol.tokenIndex < parenIndex
                  ) {
                    this.functionCallTokens.add(c.symbol.tokenIndex);
                    break;
                  }
                }
              }
            }
            break;
          }
        }
      }
    }

    const wasInside = this.insideGroupingAnalytics;
    this.insideGroupingAnalytics = true;
    const result = this.visitChildren(ctx);
    this.insideGroupingAnalytics = wasInside;
    return result;
  }

  visitQueryOrganization(ctx: any): any {
    let orderTokenIndex: number | null = null;
    if (ctx.children) {
      for (const child of ctx.children) {
        if (child.symbol) {
          const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
          if (symName === 'ORDER') {
            this.clauseStartTokens.add(child.symbol.tokenIndex);
            orderTokenIndex = child.symbol.tokenIndex;
          } else if (symName === 'LIMIT') {
            this.clauseStartTokens.add(child.symbol.tokenIndex);
          }
        }
      }
    }
    const commaCount = this._markListCommasExcludingGroupingAnalytics(ctx);
    if (commaCount > 0 && orderTokenIndex !== null) {
      this.multiItemClauses.add(orderTokenIndex);
    }
    return this.visitChildren(ctx);
  }

  visitSortItem(ctx: any): any {
    return this.visitChildren(ctx);
  }

  visitLimitClause(ctx: any): any {
    this._markClauseStart(ctx);
    return this.visitChildren(ctx);
  }

  visitJoinRelation(ctx: any): any {
    this._markClauseStart(ctx);
    this._analyzeJoinConditions(ctx);
    const onTokenIndex = this._findOnToken(ctx);
    if (onTokenIndex !== -1) {
      this.joinOnTokens.add(onTokenIndex);
    }
    return this.visitChildren(ctx);
  }

  visitWindowDef(ctx: any): any {
    // Visit children FIRST so nested functions are collected before we check them
    const result = this.visitChildren(ctx);
    this._collectWindowDefInfo(ctx);
    return result;
  }

  // ========== PIVOT/UNPIVOT CONTEXTS ==========

  visitPivotClause(ctx: any): any {
    this._collectPivotInfo(ctx, false);
    return this.visitChildren(ctx);
  }

  visitUnpivotClause(ctx: any): any {
    this._collectPivotInfo(ctx, true);
    return this.visitChildren(ctx);
  }

  visitSetOperation(ctx: any): any {
    if (ctx.children) {
      let foundSetOperator = false;
      for (const child of ctx.children) {
        if (child.symbol) {
          const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
          if (
            symName === 'UNION' ||
            symName === 'EXCEPT' ||
            symName === 'INTERSECT'
          ) {
            this.clauseStartTokens.add(child.symbol.tokenIndex);
            foundSetOperator = true;
          }
        } else {
          if (foundSetOperator) {
            const subquery = this._findSubqueryContext(child);
            if (subquery?.start) {
              this.setOperandParens.add(subquery.start.tokenIndex);
            }
          }
        }
      }
    }
    return this.visitChildren(ctx);
  }

  visitSelectClause(ctx: any): any {
    this._markClauseStart(ctx);
    if (ctx.start) {
      this.currentSelectToken = ctx.start.tokenIndex;
    }
    return this.visitChildren(ctx);
  }

  visitNamedExpression(ctx: any): any {
    const hasAlias = ctx.errorCapturingIdentifier?.();
    const hasAS = ctx.AS?.();

    if (hasAlias && !hasAS) {
      const expr = ctx.expression?.();
      const alias = ctx.errorCapturingIdentifier();

      if (expr?.stop && alias && alias.start) {
        const aliasIndex = alias.start.tokenIndex;
        this.aliasInsertPositions.add(aliasIndex);
      }
    }

    return this.visitChildren(ctx);
  }

  // ========== LIST CONTEXTS ==========

  visitNamedExpressionSeq(ctx: any): any {
    const parentClass = ctx.parentCtx?.constructor?.name || '';
    if (
      parentClass === 'PivotClauseContext' ||
      parentClass === 'UnpivotClauseContext' ||
      parentClass === 'LateralViewContext'
    ) {
      return this.visitChildren(ctx);
    }

    const hasMultiple = this._markListContext(ctx);
    if (hasMultiple && this.currentSelectToken >= 0) {
      this.multiItemClauses.add(this.currentSelectToken);
    }
    return this.visitChildren(ctx);
  }

  visitGroupByClause(ctx: any): any {
    return this.visitChildren(ctx);
  }

  // ========== CONDITION CONTEXTS ==========

  visitWhereClause(ctx: any): any {
    this._markClauseStart(ctx);
    this._scanForBetweenAnd(ctx);
    this._analyzeConditionClause(ctx);
    return this.visitChildren(ctx);
  }

  visitHavingClause(ctx: any): any {
    this._markClauseStart(ctx);
    this._scanForBetweenAnd(ctx);
    this._analyzeConditionClause(ctx);
    return this.visitChildren(ctx);
  }

  visitPredicate(ctx: any): any {
    if (ctx.children) {
      let hasBetween = false;
      let hasQuery = false;
      for (const child of ctx.children) {
        if (child.symbol) {
          const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
          if (symName === 'BETWEEN') {
            hasBetween = true;
          } else if (symName === 'AND' && hasBetween) {
            this.betweenAndTokens.add(child.symbol.tokenIndex);
          }
        } else if (child.ruleIndex !== undefined) {
          const ruleName = child.constructor?.name;
          if (ruleName === 'QueryContext') {
            hasQuery = true;
          }
        }
      }
      if (hasQuery) {
        this._markSubqueryParens(ctx);
      }
    }

    // Also collect IN list info for wrapping
    this._collectInListInfo(ctx);

    return this.visitChildren(ctx);
  }

  // ========== CTE CONTEXTS ==========

  // Handle the top-level query rule: query = ctes? queryTerm queryOrganization
  // This marks the main SELECT after CTE definitions
  visitQuery(ctx: any): any {
    // Check if this query has CTEs
    let hasCtes = false;
    let queryTermChild: any = null;

    if (ctx.children) {
      for (const child of ctx.children) {
        if (child.ruleIndex !== undefined) {
          const ruleName = SqlBaseParser.ruleNames[child.ruleIndex];
          if (ruleName === 'ctes') {
            hasCtes = true;
          } else if (ruleName === 'queryTerm') {
            queryTermChild = child;
          }
        }
      }
    }

    // If CTEs exist, find and mark the first SELECT token of the main query
    if (hasCtes && queryTermChild) {
      const selectToken = this._findFirstSelectToken(queryTermChild);
      if (selectToken !== null) {
        this.cteMainSelectTokens.add(selectToken);
      }
    }

    return this.visitChildren(ctx);
  }

  // Helper to find the first SELECT token in a queryTerm subtree
  private _findFirstSelectToken(ctx: any): number | null {
    if (!ctx) return null;

    // Check if this node has a SELECT token
    if (ctx.symbol && ctx.symbol.type === getTokenType('SELECT')) {
      return ctx.symbol.tokenIndex;
    }

    // Recurse into children
    if (ctx.children) {
      for (const child of ctx.children) {
        const result = this._findFirstSelectToken(child);
        if (result !== null) return result;
      }
    }

    return null;
  }

  visitCtes(ctx: any): any {
    this._markClauseStart(ctx);

    if (ctx.children) {
      for (const child of ctx.children) {
        if (child.symbol && child.symbol.type === getTokenType('COMMA')) {
          this.cteCommas.add(child.symbol.tokenIndex);
        }
      }
    }
    return this.visitChildren(ctx);
  }

  visitNamedQuery(ctx: any): any {
    // Increment depth for CTE body - it's effectively a subquery
    this.subqueryDepth++;

    if (ctx.children) {
      for (const child of ctx.children) {
        if (child.symbol) {
          const tokenType = child.symbol.type;
          if (tokenType === getTokenType('LEFT_PAREN')) {
            this.subqueryOpenParens.add(child.symbol.tokenIndex);
          } else if (tokenType === getTokenType('RIGHT_PAREN')) {
            this.subqueryCloseParens.add(child.symbol.tokenIndex);
          }
        }
      }
    }
    const result = this.visitChildren(ctx);
    this.subqueryDepth--;
    return result;
  }

  // ========== SUBQUERY CONTEXTS ==========

  visitAliasedQuery(ctx: any): any {
    this._markSubqueryParens(ctx);
    return this.visitChildren(ctx);
  }

  visitExists(ctx: any): any {
    this._markSubqueryParens(ctx);
    return this.visitChildren(ctx);
  }

  visitSubqueryExpression(ctx: any): any {
    this._markSubqueryParens(ctx);
    return this.visitChildren(ctx);
  }

  visitSubquery(ctx: any): any {
    this._markSubqueryParens(ctx);
    return this.visitChildren(ctx);
  }

  // ========== DDL CONTEXTS ==========

  visitCreateTableHeader(ctx: any): any {
    return this.visitChildren(ctx);
  }

  visitCreateTable(ctx: any): any {
    this._markDdlColumnList(ctx);
    return this.visitChildren(ctx);
  }

  visitCreateUserDefinedFunction(ctx: any): any {
    // Mark the function name (identifierReference) as a function call
    // so there's no space before the opening paren: CREATE FUNCTION f(...) not f (...)
    if (ctx.children) {
      for (const child of ctx.children) {
        if (child.ruleIndex !== undefined) {
          const ruleName = SqlBaseParser.ruleNames[child.ruleIndex];
          if (ruleName === 'identifierReference' && child.start) {
            this.functionCallTokens.add(child.start.tokenIndex);
            break; // Only mark the first one (function name)
          }
        }
      }
    }
    return this.visitChildren(ctx);
  }

  // ========== DML CONTEXTS ==========

  visitInsertInto(ctx: any): any {
    this._markValuesCommas(ctx);
    return this.visitChildren(ctx);
  }

  visitInlineTable(ctx: any): any {
    this._markValuesCommas(ctx);
    return this.visitChildren(ctx);
  }

  visitUpdateTable(ctx: any): any {
    const commaCount = this._markSetClause(ctx, false, 0);
    if (commaCount > 0 && this.setKeywordToken >= 0) {
      this.multiItemClauses.add(this.setKeywordToken);
    }
    return this.visitChildren(ctx);
  }

  // ========== SET CONFIGURATION ==========

  visitSetConfiguration(ctx: any): any {
    this._markSetConfigTokens(ctx);
    return this.visitChildren(ctx);
  }

  visitResetConfiguration(ctx: any): any {
    // GRAMMAR-DRIVEN: RESET .*?
    // Mark all tokens after RESET as configuration tokens to preserve casing
    this._markResetConfigTokens(ctx);
    return this.visitChildren(ctx);
  }

  // ========== MERGE STATEMENT ==========

  visitMergeIntoTable(ctx: any): any {
    this._markMergeClauses(ctx);
    return this.visitChildren(ctx);
  }

  // ========== QUERY DEPTH TRACKING ==========

  visitQuerySpecification(ctx: any): any {
    return this._visitQuerySpec(ctx);
  }

  visitRegularQuerySpecification(ctx: any): any {
    return this._visitQuerySpec(ctx);
  }

  private _visitQuerySpec(ctx: any): any {
    const currentDepth = this.subqueryDepth;
    this.subqueryDepth++;
    this._markDepthForContext(ctx);

    // Analyze if this query is simple enough to stay compact
    this._analyzeSimpleQuery(ctx, currentDepth);

    const result = this.visitChildren(ctx);
    this.subqueryDepth--;
    return result;
  }

  /**
   * Check if a context is inside a CREATE VIEW/TABLE statement at the top level.
   * Queries inside these DDL statements should never be compacted.
   */
  private _isInsideCreateStatement(ctx: any): boolean {
    let node = ctx?.parentCtx;
    while (node) {
      const className = node.constructor?.name || '';
      // Check for CREATE VIEW variants
      if (
        className === 'CreateViewContext' ||
        className === 'CreateTempViewUsingContext'
      ) {
        return true;
      }
      node = node.parentCtx;
    }
    return false;
  }

  /**
   * Analyze if a query is simple enough to stay on one line.
   * Simple query criteria:
   * - SELECT has 1 item (including *, t.*)
   * - FROM has 1 table (no JOINs)
   * - WHERE has 0 or 1 condition (no AND/OR at top level)
   * - No GROUP BY, ORDER BY, HAVING, or single-item versions
   * - No LIMIT/OFFSET or simple LIMIT
   * - NOT inside a CREATE VIEW/TABLE statement (those always expand)
   */
  private _analyzeSimpleQuery(ctx: any, depth: number): void {
    if (!ctx || !ctx.children) return;

    // Never compact queries inside CREATE statements
    if (depth === 0 && this._isInsideCreateStatement(ctx)) return;

    let selectClause: any = null;
    let _fromClause: any = null;
    let whereClause: any = null;
    let hasJoin = false;
    let hasGroupBy = false;
    const _hasOrderBy = false;
    let hasHaving = false;
    const _hasLimit = false;
    let selectToken: any = null;

    // Scan children to find clauses
    for (const child of ctx.children) {
      if (!child) continue;
      const ruleName =
        child.ruleIndex !== undefined
          ? SqlBaseParser.ruleNames[child.ruleIndex]
          : null;
      const className = child.constructor?.name || '';

      if (className === 'SelectClauseContext' || ruleName === 'selectClause') {
        selectClause = child;
        if (child.start) {
          selectToken = child.start;
        }
      } else if (
        className === 'FromClauseContext' ||
        ruleName === 'fromClause'
      ) {
        _fromClause = child;
        // Check for JOINs in FROM clause
        hasJoin = this._hasJoinInFromClause(child);
        // Also check for PIVOT/UNPIVOT in FROM clause
        if (this._hasPivotUnpivotInFromClause(child)) {
          hasJoin = true; // Treat PIVOT/UNPIVOT like a JOIN for simplicity
        }
      } else if (
        className === 'WhereClauseContext' ||
        ruleName === 'whereClause'
      ) {
        whereClause = child;
      } else if (
        className === 'AggregationClauseContext' ||
        ruleName === 'aggregationClause'
      ) {
        hasGroupBy = true;
      } else if (
        className === 'HavingClauseContext' ||
        ruleName === 'havingClause'
      ) {
        hasHaving = true;
      }
    }

    // Check parent for ORDER BY / LIMIT (they're in queryOrganization, not querySpecification)
    // For now, we'll handle this by checking if ORDER BY/LIMIT tokens are in our range

    // Can't be simple if has JOINs
    if (hasJoin) return;

    // Can't be simple if has GROUP BY or HAVING (for now - could relax for single-item)
    if (hasGroupBy || hasHaving) return;

    // Check SELECT clause - must have single item
    if (!selectClause || !this._hasSingleSelectItem(selectClause)) return;

    // Check for multi-WHEN CASE expressions (which force expansion)
    if (selectClause && this._hasMultiWhenCase(selectClause)) return;

    // Check WHERE clause - must have 0 or 1 condition (no AND/OR)
    if (whereClause && this._hasMultipleConditions(whereClause)) return;

    // This query qualifies as simple
    // Use forExpansion=false to get actual span regardless of input layout
    if (selectToken) {
      const spanLength = calculateSpanLength(ctx, false);
      this.simpleQueries.set(selectToken.tokenIndex, {
        selectTokenIndex: selectToken.tokenIndex,
        spanLength: spanLength,
        depth: depth,
      });
    }
  }

  /**
   * Check if FROM clause contains any JOINs.
   */
  private _hasJoinInFromClause(fromClause: any): boolean {
    if (!fromClause || !fromClause.children) return false;

    const checkForJoin = (node: any): boolean => {
      if (!node) return false;

      const className = node.constructor?.name || '';
      if (className === 'JoinRelationContext') return true;

      if (node.symbol) {
        const symName = SqlBaseLexer.symbolicNames[node.symbol.type];
        if (
          symName === 'JOIN' ||
          symName === 'CROSS' ||
          symName === 'NATURAL'
        ) {
          return true;
        }
      }

      if (node.children) {
        for (const child of node.children) {
          if (checkForJoin(child)) return true;
        }
      }
      return false;
    };

    return checkForJoin(fromClause);
  }

  /**
   * Check if FROM clause contains PIVOT or UNPIVOT with many items.
   * Simple PIVOT with few items can stay compact.
   */
  private _hasPivotUnpivotInFromClause(fromClause: any): boolean {
    if (!fromClause || !fromClause.children) return false;

    const checkForComplexPivot = (node: any): boolean => {
      if (!node) return false;

      const className = node.constructor?.name || '';
      if (
        className === 'PivotClauseContext' ||
        className === 'UnpivotClauseContext'
      ) {
        // Count commas to estimate complexity
        let commaCount = 0;
        const countCommas = (n: any): void => {
          if (!n) return;
          if (n.symbol && n.symbol.type === getTokenType('COMMA')) {
            commaCount++;
          }
          if (n.children) {
            for (const c of n.children) countCommas(c);
          }
        };
        countCommas(node);
        // If more than ~6 commas, it's complex (multiple aggregates + many IN items)
        return commaCount > 6;
      }

      if (node.children) {
        for (const child of node.children) {
          if (checkForComplexPivot(child)) return true;
        }
      }
      return false;
    };

    return checkForComplexPivot(fromClause);
  }

  /**
   * Check if SELECT clause has a single item (*, t.*, or one expression).
   */
  private _hasSingleSelectItem(selectClause: any): boolean {
    if (!selectClause || !selectClause.children) return false;

    // Look for namedExpressionSeq
    for (const child of selectClause.children) {
      const className = child.constructor?.name || '';
      if (className === 'NamedExpressionSeqContext') {
        // Count items by looking for commas that are DIRECT children of namedExpressionSeq
        // Commas inside function calls, type parameters, etc. should not be counted
        let commaCount = 0;
        if (child.children) {
          for (const seqChild of child.children) {
            if (
              seqChild.symbol &&
              seqChild.symbol.type === getTokenType('COMMA')
            ) {
              commaCount++;
            }
          }
        }
        return commaCount === 0; // Single item means no commas
      }
    }

    return true; // Default to true if no namedExpressionSeq (like SELECT *)
  }

  /**
   * Check if a clause contains a CASE expression with multiple WHEN clauses.
   * Such CASE expressions force expansion and make the query non-compact.
   */
  private _hasMultiWhenCase(clause: any): boolean {
    if (!clause) return false;

    const checkForMultiWhenCase = (node: any): boolean => {
      if (!node) return false;

      const className = node.constructor?.name || '';
      // Check for simpleCase or searchedCase contexts
      if (
        className === 'SimpleCaseContext' ||
        className === 'SearchedCaseContext'
      ) {
        // Count WHEN tokens
        let whenCount = 0;
        if (node.children) {
          for (const child of node.children) {
            if (child.symbol) {
              const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
              if (symName === 'WHEN') whenCount++;
            }
            // Also check whenClause contexts
            const childClassName = child.constructor?.name || '';
            if (childClassName === 'WhenClauseContext') whenCount++;
          }
        }
        if (whenCount > 1) return true;
      }

      // Recurse into children
      if (node.children) {
        for (const child of node.children) {
          if (checkForMultiWhenCase(child)) return true;
        }
      }

      return false;
    };

    return checkForMultiWhenCase(clause);
  }

  /**
   * Check if WHERE/HAVING clause has multiple conditions (AND/OR at top level).
   */
  private _hasMultipleConditions(clause: any): boolean {
    if (!clause || !clause.children) return false;

    // Find the predicated expression and check for AND/OR
    const checkForAndOr = (node: any, depth: number): boolean => {
      if (!node) return false;
      if (depth > 3) return false; // Don't go too deep

      if (node.symbol) {
        const symName = SqlBaseLexer.symbolicNames[node.symbol.type];
        if (symName === 'AND' || symName === 'OR') {
          return true;
        }
      }

      // Check for logicalBinary rule which indicates AND/OR
      const className = node.constructor?.name || '';
      if (className === 'LogicalBinaryContext') {
        return true;
      }

      if (node.children) {
        for (const child of node.children) {
          if (checkForAndOr(child, depth + 1)) return true;
        }
      }
      return false;
    };

    return checkForAndOr(clause, 0);
  }

  // ========== PRIVATE HELPER METHODS ==========

  private _collectMultiArgFunctionInfo(ctx: any, argCount: number): void {
    if (!ctx.children) return;

    let leftParenTokenIndex: number | null = null;
    let leftParenCharStart: number = 0;
    let rightParenTokenIndex: number | null = null;
    const commaTokenIndices: number[] = [];

    // Try to get function name from functionName child
    let functionName: string | undefined;
    if (ctx.functionName) {
      const fnCtx = ctx.functionName();
      if (fnCtx?.getText) {
        functionName = fnCtx.getText().toUpperCase();
      }
    }

    for (const child of ctx.children) {
      if (child.symbol) {
        const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
        if (symName === 'LEFT_PAREN' && leftParenTokenIndex === null) {
          leftParenTokenIndex = child.symbol.tokenIndex;
          leftParenCharStart = child.symbol.start ?? 0;
        } else if (symName === 'RIGHT_PAREN') {
          rightParenTokenIndex = child.symbol.tokenIndex;
          break;
        } else if (symName === 'COMMA') {
          commaTokenIndices.push(child.symbol.tokenIndex);
        }
      }
    }

    if (
      leftParenTokenIndex !== null &&
      rightParenTokenIndex !== null &&
      commaTokenIndices.length === argCount - 1
    ) {
      const spanLength = calculateNormalizedSpanLength(ctx);
      this.multiArgFunctionInfo.set(leftParenTokenIndex, {
        closeParenIndex: rightParenTokenIndex,
        commaIndices: commaTokenIndices,
        spanLength: spanLength,
        functionName: functionName,
        charStart: leftParenCharStart,
      });
    }
  }

  private _collectWindowDefInfo(ctx: any): void {
    if (!ctx.children) return;

    let leftParenTokenIndex: number | null = null;
    let rightParenTokenIndex: number | null = null;
    let orderByTokenIndex: number | null = null;
    let windowFrameTokenIndex: number | null = null;

    // Get window's start character position for calculating relative offsets
    const windowStartChar = ctx.start?.start ?? 0;

    for (const child of ctx.children) {
      if (child.symbol) {
        const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
        if (symName === 'LEFT_PAREN' && leftParenTokenIndex === null) {
          leftParenTokenIndex = child.symbol.tokenIndex;
        } else if (symName === 'RIGHT_PAREN') {
          rightParenTokenIndex = child.symbol.tokenIndex;
        } else if (symName === 'ORDER' || symName === 'SORT') {
          orderByTokenIndex = child.symbol.tokenIndex;
        }
      } else if (child.ruleIndex !== undefined) {
        const ruleName = SqlBaseParser.ruleNames[child.ruleIndex];
        if (ruleName === 'windowFrame' && child.children?.[0]?.symbol) {
          windowFrameTokenIndex = child.children[0].symbol.tokenIndex;
        }
      }
    }

    // Collect nested multi-arg functions with their relative character offsets
    const nestedFunctions: { funcIdx: number; relativeOffset: number }[] = [];
    if (leftParenTokenIndex !== null && rightParenTokenIndex !== null) {
      for (const [funcIdx, funcInfo] of this.multiArgFunctionInfo) {
        if (funcIdx > leftParenTokenIndex && funcIdx < rightParenTokenIndex) {
          // Use the charStart from the function info to calculate relative offset
          const relativeOffset = funcInfo.charStart - windowStartChar;
          nestedFunctions.push({ funcIdx, relativeOffset });
        }
      }
    }

    if (leftParenTokenIndex !== null && rightParenTokenIndex !== null) {
      const spanLength = calculateNormalizedSpanLength(ctx);
      this.windowDefInfo.set(leftParenTokenIndex, {
        closeParenIndex: rightParenTokenIndex,
        orderByTokenIndex: orderByTokenIndex,
        windowFrameTokenIndex: windowFrameTokenIndex,
        spanLength: spanLength,
        nestedFunctions: nestedFunctions,
      });
    }
  }

  /**
   * Collect IN list information for potential wrapping.
   * Structure: expr IN (value1, value2, value3, ...)
   * We want to track the IN list so we can wrap it at max line width.
   */
  private _collectInListInfo(ctx: any): void {
    if (!ctx.children) return;

    // Check if this is an IN predicate (kind=IN)
    let isInPredicate = false;
    let inKeywordIndex: number | null = null;

    for (const child of ctx.children) {
      if (child.symbol) {
        const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
        if (symName === 'IN') {
          isInPredicate = true;
          inKeywordIndex = child.symbol.tokenIndex;
          break;
        }
      }
    }

    if (!isInPredicate || inKeywordIndex === null) return;

    // Check if there's a subquery inside - if so, don't treat as IN list
    // Subquery IN: IN (SELECT ...)
    let hasSubquery = false;
    for (const child of ctx.children) {
      if (child.ruleIndex !== undefined) {
        const ruleName = SqlBaseParser.ruleNames[child.ruleIndex];
        if (ruleName === 'query') {
          hasSubquery = true;
          break;
        }
      }
    }

    if (hasSubquery) return; // Don't track IN (SELECT ...) as an IN list

    // Now find the open paren, close paren, and commas using recursive walk
    let openParenIndex: number | null = null;
    let closeParenIndex: number | null = null;
    const commaIndices: Set<number> = new Set();
    let depth = 0;
    let foundOpenParen = false;

    const walkForTokens = (node: any): void => {
      if (!node) return;

      if (node.symbol) {
        const symName = SqlBaseLexer.symbolicNames[node.symbol.type];
        const tokenIndex = node.symbol.tokenIndex;

        if (inKeywordIndex !== undefined && tokenIndex <= inKeywordIndex)
          return; // Skip tokens before/at IN

        if (symName === 'LEFT_PAREN') {
          if (!foundOpenParen) {
            openParenIndex = tokenIndex;
            foundOpenParen = true;
          } else {
            depth++;
          }
        } else if (symName === 'RIGHT_PAREN') {
          if (depth > 0) {
            depth--;
          } else if (foundOpenParen && closeParenIndex === null) {
            closeParenIndex = tokenIndex;
            return; // Found the closing paren, stop
          }
        } else if (symName === 'COMMA' && depth === 0 && foundOpenParen) {
          commaIndices.add(tokenIndex);
        }
      }

      if (node.children) {
        for (const child of node.children) {
          if (closeParenIndex !== null) return; // Stop if we found close paren
          walkForTokens(child);
        }
      }
    };

    walkForTokens(ctx);

    if (openParenIndex !== null && closeParenIndex !== null) {
      // Compute item lengths: we need to walk tokens again to calculate lengths
      // itemLengths maps commaIndex -> length of item AFTER that comma
      // Special key -1 = length of first item (before first comma or entire list if no commas)
      const itemLengths = new Map<number, number>();

      // Collect all tokens in the list with their positions and text lengths
      interface TokenInfo {
        tokenIndex: number;
        textLength: number;
        isComma: boolean;
      }
      const listTokens: TokenInfo[] = [];
      // Cache non-null values for use in closure
      const openIdx = openParenIndex;
      const closeIdx = closeParenIndex;

      // Track paren depth to only mark top-level commas as item separators
      let collectDepth = 0;
      const collectTokens = (node: any): void => {
        if (!node) return;
        if (node.symbol) {
          const tokenIndex = node.symbol.tokenIndex;
          // Only include tokens between open and close paren
          if (tokenIndex > openIdx && tokenIndex < closeIdx) {
            const symName = SqlBaseLexer.symbolicNames[node.symbol.type];
            // Track nesting depth
            if (symName === 'LEFT_PAREN') {
              collectDepth++;
            } else if (symName === 'RIGHT_PAREN') {
              collectDepth--;
            }
            // Skip whitespace
            if (symName !== 'WS') {
              listTokens.push({
                tokenIndex,
                textLength: (node.symbol.text || '').length,
                // Only mark commas at depth 0 as IN list item separators
                isComma: symName === 'COMMA' && collectDepth === 0,
              });
            }
          }
        }
        if (node.children) {
          for (const child of node.children) {
            collectTokens(child);
          }
        }
      };
      collectTokens(ctx);

      // Sort by token index
      listTokens.sort((a, b) => a.tokenIndex - b.tokenIndex);

      // Calculate item lengths by grouping tokens between commas
      let currentItemLength = 0;
      let currentItemStart = -1; // -1 means first item
      let tokenCount = 0;

      for (const tok of listTokens) {
        if (tok.isComma) {
          // Store length for the item that just ended
          // Account for spaces between tokens (tokenCount - 1 spaces)
          itemLengths.set(
            currentItemStart,
            currentItemLength + Math.max(0, tokenCount - 1),
          );
          // Start new item after this comma
          currentItemStart = tok.tokenIndex;
          currentItemLength = 0;
          tokenCount = 0;
        } else {
          currentItemLength += tok.textLength;
          tokenCount++;
        }
      }

      // Store length of final item
      if (tokenCount > 0 || currentItemStart !== -1) {
        itemLengths.set(
          currentItemStart,
          currentItemLength + Math.max(0, tokenCount - 1),
        );
      }

      this.inListInfo.set(openParenIndex, {
        openParenIndex,
        closeParenIndex,
        commaIndices,
        isInPivot: false, // WHERE IN, not PIVOT IN
        itemLengths,
      });
      // Add commas to the pre-computed set for O(1) lookup
      for (const idx of commaIndices) {
        this.allInListCommas.add(idx);
      }
    }
  }

  /**
   * Collect PIVOT/UNPIVOT clause information for potential expansion.
   * Structure: PIVOT (aggregates FOR column IN (values))
   */
  private _collectPivotInfo(ctx: any, isUnpivot: boolean): void {
    if (!ctx.children) return;

    let openParenIndex: number | null = null;
    let closeParenIndex: number | null = null;
    let forKeywordIndex: number | null = null;
    let inKeywordIndex: number | null = null;
    let inListOpenParen: number | null = null;
    const aggregateCommaIndices: Set<number> = new Set();
    const inListCommaIndices: Set<number> = new Set();

    let foundFor = false;
    let foundIn = false;
    let inListDepth = 0; // Depth within IN list parens (0 = top level of IN list)

    // Walk through children to find structure
    const walkForTokens = (node: any): void => {
      if (!node) return;

      if (node.symbol) {
        const symName = SqlBaseLexer.symbolicNames[node.symbol.type];
        const tokenIndex = node.symbol.tokenIndex;

        if (symName === 'LEFT_PAREN') {
          if (openParenIndex === null) {
            // First paren is the PIVOT open paren
            openParenIndex = tokenIndex;
          } else if (foundIn && inListOpenParen === null) {
            // First paren after IN is the IN list open paren
            inListOpenParen = tokenIndex;
          } else if (foundIn) {
            // Nested paren within IN list items
            inListDepth++;
          }
        } else if (symName === 'RIGHT_PAREN') {
          if (foundIn && inListDepth > 0) {
            // Closing a nested paren within IN list
            inListDepth--;
          } else if (foundIn && inListOpenParen !== null) {
            // Closing the IN list paren - this is also close of PIVOT
            closeParenIndex = tokenIndex;
          } else {
            // Outer PIVOT close paren
            closeParenIndex = tokenIndex;
          }
        } else if (symName === 'FOR') {
          foundFor = true;
          forKeywordIndex = tokenIndex;
        } else if (symName === 'IN') {
          foundIn = true;
          inKeywordIndex = tokenIndex;
        } else if (symName === 'COMMA') {
          if (foundIn && inListOpenParen !== null && inListDepth === 0) {
            // Comma in IN list at top level
            inListCommaIndices.add(tokenIndex);
          } else if (!foundFor) {
            // Comma before FOR - aggregate list
            aggregateCommaIndices.add(tokenIndex);
          }
        }
      }

      if (node.children) {
        for (const child of node.children) {
          walkForTokens(child);
        }
      }
    };

    walkForTokens(ctx);

    if (openParenIndex !== null && closeParenIndex !== null) {
      const spanLength = calculateNormalizedSpanLength(ctx);
      this.pivotInfo.set(openParenIndex, {
        openParenIndex,
        closeParenIndex,
        aggregateCommaIndices,
        forKeywordIndex,
        inKeywordIndex,
        inListCommaIndices,
        spanLength,
        isUnpivot,
      });

      // Also store the PIVOT IN list in inListInfo for consistent wrapping
      if (inListOpenParen !== null) {
        // Find the IN list close paren (it's one before the PIVOT close paren)
        // We need to find the actual IN list close paren
        const inListCloseParen = closeParenIndex; // Default to same as PIVOT close

        // Compute item lengths for PIVOT IN list
        const itemLengths = new Map<number, number>();
        interface TokenInfo {
          tokenIndex: number;
          textLength: number;
          isComma: boolean;
        }
        const listTokens: TokenInfo[] = [];
        // Cache non-null values for use in closure
        const pivotOpenIdx = inListOpenParen;
        const pivotCloseIdx = inListCloseParen;

        const collectPivotTokens = (node: any): void => {
          if (!node) return;
          if (node.symbol) {
            const tokenIndex = node.symbol.tokenIndex;
            // Only include tokens between IN list open and close paren
            if (tokenIndex > pivotOpenIdx && tokenIndex < pivotCloseIdx) {
              const symName = SqlBaseLexer.symbolicNames[node.symbol.type];
              // Skip whitespace
              if (symName !== 'WS') {
                listTokens.push({
                  tokenIndex,
                  textLength: (node.symbol.text || '').length,
                  isComma: symName === 'COMMA',
                });
              }
            }
          }
          if (node.children) {
            for (const child of node.children) {
              collectPivotTokens(child);
            }
          }
        };
        collectPivotTokens(ctx);
        listTokens.sort((a, b) => a.tokenIndex - b.tokenIndex);

        let currentItemLength = 0;
        let currentItemStart = -1;
        let tokenCount = 0;

        for (const tok of listTokens) {
          if (tok.isComma) {
            itemLengths.set(
              currentItemStart,
              currentItemLength + Math.max(0, tokenCount - 1),
            );
            currentItemStart = tok.tokenIndex;
            currentItemLength = 0;
            tokenCount = 0;
          } else {
            currentItemLength += tok.textLength;
            tokenCount++;
          }
        }
        if (tokenCount > 0 || currentItemStart !== -1) {
          itemLengths.set(
            currentItemStart,
            currentItemLength + Math.max(0, tokenCount - 1),
          );
        }

        this.inListInfo.set(inListOpenParen, {
          openParenIndex: inListOpenParen,
          closeParenIndex: inListCloseParen,
          commaIndices: inListCommaIndices,
          isInPivot: true,
          itemLengths,
        });
        // Add commas to the pre-computed set for O(1) lookup
        for (const idx of inListCommaIndices) {
          this.allInListCommas.add(idx);
        }
      }
    }
  }

  private _analyzeCaseExpression(ctx: any): void {
    if (!ctx.children) return;

    let whenCount = 0;
    let caseToken: any = null;
    let elseToken: any = null;
    let endToken: any = null;
    let valueExpression: any = null;
    const whenTokens: any[] = [];

    // Check if this is a simpleCase (has 'value' property) vs searchedCase
    // simpleCase: CASE value=expression whenClause+ ELSE? END
    // searchedCase: CASE whenClause+ ELSE? END
    const isSimpleCase = ctx.value !== undefined;
    if (isSimpleCase && ctx.value) {
      valueExpression = ctx.value;
    }

    for (const child of ctx.children) {
      if (child.symbol) {
        const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
        if (symName === 'CASE') {
          caseToken = child.symbol;
        } else if (symName === 'ELSE') {
          elseToken = child.symbol;
        } else if (symName === 'END') {
          endToken = child.symbol;
        } else if (symName === 'WHEN') {
          whenCount++;
          whenTokens.push(child.symbol);
        }
      }
      if (child.ruleIndex !== undefined) {
        const ruleName = SqlBaseParser.ruleNames[child.ruleIndex];
        if (ruleName === 'whenClause') {
          const whenToken = this._findTokenInContext(child, 'WHEN');
          if (
            whenToken &&
            !whenTokens.find((t: any) => t.tokenIndex === whenToken.tokenIndex)
          ) {
            whenCount++;
            whenTokens.push(whenToken);
          }
        }
      }
    }

    if (whenCount > 1 && caseToken) {
      this.multiWhenCaseTokens.add(caseToken.tokenIndex);

      // For simpleCase with value, mark the CASE token and the position after value expression
      // So the newline goes after "CASE x" not after "CASE"
      if (isSimpleCase && valueExpression && valueExpression.stop) {
        this.simpleCaseTokens.add(caseToken.tokenIndex);
        this.simpleCaseValueEndTokens.add(valueExpression.stop.tokenIndex);
      }

      for (const whenToken of whenTokens) {
        this.caseWhenTokens.add(whenToken.tokenIndex);
      }
      if (elseToken) {
        this.caseElseTokens.add(elseToken.tokenIndex);
      }
      if (endToken) {
        this.caseEndTokens.add(endToken.tokenIndex);
      }
      if (this.currentSelectToken >= 0) {
        this.multiItemClauses.add(this.currentSelectToken);
      }
    }
  }

  private _findTokenInContext(ctx: any, symbolicName: string): any {
    if (!ctx) return null;
    if (ctx.symbol) {
      const symName = SqlBaseLexer.symbolicNames[ctx.symbol.type];
      if (symName === symbolicName) {
        return ctx.symbol;
      }
    }
    if (ctx.children) {
      for (const child of ctx.children) {
        const found = this._findTokenInContext(child, symbolicName);
        if (found) return found;
      }
    }
    return null;
  }

  private _analyzeJoinConditions(ctx: any): void {
    const operators = this._countConditionOperators(ctx);
    if (operators > 0) {
      const onTokenIndex = this._findOnToken(ctx);
      if (onTokenIndex !== -1) {
        this.multilineConditionClauses.add(onTokenIndex);
      }
    }
  }

  private _findOnToken(ctx: any): number {
    if (!ctx) return -1;
    if (ctx.symbol) {
      const symName = SqlBaseLexer.symbolicNames[ctx.symbol.type];
      if (symName === 'ON') {
        return ctx.symbol.tokenIndex;
      }
    }
    if (ctx.children) {
      for (const child of ctx.children) {
        const result = this._findOnToken(child);
        if (result !== -1) return result;
      }
    }
    return -1;
  }

  private _findSubqueryContext(ctx: any): any {
    if (!ctx) return null;
    const className = ctx.constructor?.name || '';
    if (className === 'SubqueryContext') return ctx;
    if (ctx.children) {
      for (const child of ctx.children) {
        if (!child.symbol) {
          const found = this._findSubqueryContext(child);
          if (found) return found;
        }
      }
    }
    return null;
  }

  private _markAllDescendantTokens(ctx: any, targetSet: Set<number>): void {
    // Mark all tokens in this context and its descendants
    if (!ctx) return;
    if (ctx.symbol) {
      targetSet.add(ctx.symbol.tokenIndex);
    } else if (ctx.children) {
      for (const child of ctx.children) {
        this._markAllDescendantTokens(child, targetSet);
      }
    }
  }

  private _markIdentifier(ctx: any): void {
    if (ctx.start) {
      for (
        let i = ctx.start.tokenIndex;
        i <= (ctx.stop?.tokenIndex ?? ctx.start.tokenIndex);
        i++
      ) {
        this.identifierTokens.add(i);
      }
    }
  }

  private _markClauseStart(ctx: any): void {
    if (ctx.start) {
      this.clauseStartTokens.add(ctx.start.tokenIndex);
    }
  }

  private _markListContext(ctx: any): boolean {
    let hasCommas = false;
    if (ctx.children) {
      let isFirst = true;
      for (const child of ctx.children) {
        if (child.symbol) {
          const tokenType = child.symbol.type;
          if (tokenType === getTokenType('COMMA')) {
            this.listItemCommas.add(child.symbol.tokenIndex);
            hasCommas = true;
          } else if (
            isFirst &&
            tokenType !== getTokenType('COMMA') &&
            child.symbol.tokenIndex >= 0
          ) {
            this.listFirstItems.add(child.symbol.tokenIndex);
            isFirst = false;
          }
        } else if (child.children) {
          this._markCommasInContext(child);
        }
      }
    }
    return hasCommas;
  }

  private _markCommasInContext(ctx: any): void {
    if (!ctx || !ctx.children) return;

    const className = ctx.constructor?.name || '';
    if (className === 'FunctionCallContext') return;
    if (
      className === 'PivotClauseContext' ||
      className === 'UnpivotClauseContext'
    )
      return;
    if (className === 'LateralViewContext') return;

    for (const child of ctx.children) {
      if (child.symbol) {
        if (child.symbol.type === getTokenType('COMMA')) {
          this.listItemCommas.add(child.symbol.tokenIndex);
        }
      } else if (child.children) {
        this._markCommasInContext(child);
      }
    }
  }

  private _markListCommasExcludingGroupingAnalytics(ctx: any): number {
    let count = 0;
    if (!ctx || !ctx.children) return 0;

    const isGroupingAnalytics =
      ctx.ruleIndex !== undefined &&
      SqlBaseParser.ruleNames[ctx.ruleIndex] === 'groupingAnalytics';

    for (const child of ctx.children) {
      if (child.symbol) {
        if (child.symbol.type === getTokenType('COMMA')) {
          if (!isGroupingAnalytics) {
            this.listItemCommas.add(child.symbol.tokenIndex);
          }
          count++;
        }
      } else if (child.ruleIndex !== undefined) {
        count += this._markListCommasExcludingGroupingAnalytics(child);
      }
    }
    return count;
  }

  private _markGroupByAllToken(ctx: any): void {
    if (!ctx || !ctx.children) return;

    let foundGroupBy = false;

    for (const child of ctx.children) {
      if (child.symbol) {
        const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
        if (symName === 'BY') {
          foundGroupBy = true;
        } else if (foundGroupBy && symName === 'ALL') {
          this.groupByAllTokens.add(child.symbol.tokenIndex);
          return;
        }
      } else if (foundGroupBy && child.ruleIndex !== undefined) {
        const allToken = this._findAllTokenInGroupByExpression(child);
        if (allToken) {
          this.groupByAllTokens.add(allToken.tokenIndex);
          return;
        }
      }
    }
  }

  private _findAllTokenInGroupByExpression(ctx: any): any {
    if (!ctx) return null;

    if (ctx.symbol) {
      const symName = SqlBaseLexer.symbolicNames[ctx.symbol.type];
      if (symName === 'ALL') {
        return ctx.symbol;
      }
      return null;
    }

    if (!ctx.children) return null;

    const ruleName =
      ctx.ruleIndex !== undefined
        ? SqlBaseParser.ruleNames[ctx.ruleIndex]
        : null;

    const identifierPathRules = new Set([
      'groupByClause',
      'expression',
      'booleanExpression',
      'valueExpression',
      'primaryExpression',
      'columnReference',
      'identifier',
      'strictIdentifier',
      'nonReserved',
      'namedExpression',
    ]);

    if (ruleName && identifierPathRules.has(ruleName)) {
      const meaningfulChildren = ctx.children.filter(
        (c: any) => c.symbol || c.ruleIndex !== undefined,
      );

      if (meaningfulChildren.length === 1) {
        return this._findAllTokenInGroupByExpression(meaningfulChildren[0]);
      }
    }

    return null;
  }

  private _analyzeConditionClause(ctx: any): void {
    const operators = this._countConditionOperators(ctx);
    if (operators > 0) {
      if (ctx.start) {
        this.multilineConditionClauses.add(ctx.start.tokenIndex);
      }
    }
  }

  private _countConditionOperators(ctx: any, parenDepth: number = 0): number {
    let count = 0;
    if (!ctx) return count;

    if (ctx.children) {
      let currentParenDepth = parenDepth;
      for (const child of ctx.children) {
        if (child.symbol) {
          const symbolicName = SqlBaseLexer.symbolicNames[child.symbol.type];

          if (symbolicName === 'LEFT_PAREN') {
            currentParenDepth++;
          } else if (symbolicName === 'RIGHT_PAREN') {
            currentParenDepth--;
          } else if (symbolicName === 'AND' || symbolicName === 'OR') {
            if (
              !this.betweenAndTokens.has(child.symbol.tokenIndex) &&
              currentParenDepth === 0
            ) {
              count++;
              this.conditionOperators.add(child.symbol.tokenIndex);
            }
          }
        }
        count += this._countConditionOperators(child, currentParenDepth);
      }
    }
    return count;
  }

  private _scanForBetweenAnd(ctx: any): void {
    if (!ctx) return;
    if (ctx.children) {
      let hasBetween = false;
      for (const child of ctx.children) {
        if (child.symbol) {
          const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
          if (symName === 'BETWEEN') {
            hasBetween = true;
          } else if (symName === 'AND' && hasBetween) {
            this.betweenAndTokens.add(child.symbol.tokenIndex);
            hasBetween = false;
          }
        }
        this._scanForBetweenAnd(child);
      }
    }
  }

  private _markSubqueryParens(ctx: any): void {
    if (ctx.children) {
      for (const child of ctx.children) {
        if (child.symbol) {
          const tokenType = child.symbol.type;
          if (tokenType === getTokenType('LEFT_PAREN')) {
            this.subqueryOpenParens.add(child.symbol.tokenIndex);
          } else if (tokenType === getTokenType('RIGHT_PAREN')) {
            this.subqueryCloseParens.add(child.symbol.tokenIndex);
          }
        }
      }
    }
  }

  private _markDdlColumnList(ctx: any): void {
    if (!ctx || !ctx.children) return;
    let foundLeftParen = false;
    let leftParenIndex = -1;
    let commaCount = 0;
    for (const child of ctx.children) {
      if (child.symbol) {
        const tokenType = child.symbol.type;
        if (tokenType === getTokenType('LEFT_PAREN') && !foundLeftParen) {
          foundLeftParen = true;
          leftParenIndex = child.symbol.tokenIndex;
          this.ddlOpenParens.add(leftParenIndex);
        } else if (
          tokenType === getTokenType('RIGHT_PAREN') &&
          foundLeftParen
        ) {
          this.ddlCloseParens.add(child.symbol.tokenIndex);
        } else if (tokenType === getTokenType('COMMA') && foundLeftParen) {
          this.ddlColumnCommas.add(child.symbol.tokenIndex);
          commaCount++;
        }
      } else if (child.children && foundLeftParen) {
        commaCount += this._markDdlCommasInContext(child);
      }
    }
    if (commaCount > 0 && leftParenIndex >= 0) {
      this.ddlMultiColumn.add(leftParenIndex);
    }
  }

  private _markDdlCommasInContext(ctx: any, angleDepth: number = 0): number {
    if (!ctx || !ctx.children) return 0;
    let count = 0;
    for (const child of ctx.children) {
      if (child.symbol) {
        const tokenType = child.symbol.type;
        if (tokenType === getTokenType('LT')) {
          // Entering complex type like ARRAY<...> or MAP<...>
          angleDepth++;
        } else if (tokenType === getTokenType('GT')) {
          // Exiting complex type
          if (angleDepth > 0) angleDepth--;
        } else if (tokenType === getTokenType('COMMA') && angleDepth === 0) {
          // Only mark as DDL comma if not inside angle brackets (complex type)
          this.ddlColumnCommas.add(child.symbol.tokenIndex);
          count++;
        }
      } else if (child.children) {
        count += this._markDdlCommasInContext(child, angleDepth);
      }
    }
    return count;
  }

  private _markValuesCommas(ctx: any, foundValues: boolean = false): void {
    if (!ctx || !ctx.children) return;
    let parenDepth = 0;
    for (const child of ctx.children) {
      if (child.symbol) {
        const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
        const tokenType = child.symbol.type;
        if (symName === 'VALUES') {
          foundValues = true;
        } else if (foundValues && tokenType === getTokenType('LEFT_PAREN')) {
          parenDepth++;
          // If we see a paren right after VALUES, we have tuples
          if (parenDepth === 1) {
            this.valuesHasTuples = true;
          }
        } else if (foundValues && tokenType === getTokenType('RIGHT_PAREN')) {
          parenDepth--;
        } else if (
          foundValues &&
          parenDepth === 0 &&
          tokenType === getTokenType('COMMA')
        ) {
          this.valuesCommas.add(child.symbol.tokenIndex);
        }
      } else if (child.children) {
        this._markValuesCommas(child, foundValues);
      }
    }
  }

  private _markSetClause(
    ctx: any,
    foundSet: boolean,
    commaCount: number,
  ): number {
    if (!ctx || !ctx.children) return commaCount;
    for (const child of ctx.children) {
      if (child.symbol) {
        const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
        if (symName === 'SET') {
          foundSet = true;
          this.setKeywordToken = child.symbol.tokenIndex;
          this.clauseStartTokens.add(child.symbol.tokenIndex);
        } else if (foundSet && child.symbol.type === getTokenType('COMMA')) {
          this.setClauseCommas.add(child.symbol.tokenIndex);
          commaCount++;
        } else if (foundSet && symName === 'WHERE') {
          return commaCount;
        }
      } else if (child.children) {
        commaCount = this._markSetClause(child, foundSet, commaCount);
      }
    }
    return commaCount;
  }

  private _markSetConfigTokens(ctx: any): void {
    if (!ctx || !ctx.children) return;
    let foundSet = false;
    for (const child of ctx.children) {
      if (child.symbol) {
        const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
        if (symName === 'SET') {
          foundSet = true;
        } else if (foundSet) {
          this.setConfigTokens.add(child.symbol.tokenIndex);
        }
      } else if (child.children && foundSet) {
        this._markSetConfigTokensRecursive(child);
      }
    }
  }

  private _markResetConfigTokens(ctx: any): void {
    // Similar to SET, mark all tokens after RESET keyword
    if (!ctx || !ctx.children) return;
    let foundReset = false;
    for (const child of ctx.children) {
      if (child.symbol) {
        const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
        if (symName === 'RESET') {
          foundReset = true;
        } else if (foundReset) {
          this.setConfigTokens.add(child.symbol.tokenIndex);
        }
      } else if (child.children && foundReset) {
        this._markSetConfigTokensRecursive(child);
      }
    }
  }

  private _markSetConfigTokensRecursive(ctx: any): void {
    if (!ctx) return;
    if (ctx.symbol) {
      this.setConfigTokens.add(ctx.symbol.tokenIndex);
    }
    if (ctx.children) {
      for (const child of ctx.children) {
        this._markSetConfigTokensRecursive(child);
      }
    }
  }

  private _markMergeClauses(ctx: any): void {
    if (!ctx || !ctx.children) return;
    for (const child of ctx.children) {
      if (child.symbol) {
        const symName = SqlBaseLexer.symbolicNames[child.symbol.type];
        if (symName === 'USING') {
          this.mergeUsingTokens.add(child.symbol.tokenIndex);
        } else if (symName === 'ON') {
          this.mergeOnTokens.add(child.symbol.tokenIndex);
        } else if (symName === 'WHEN') {
          this.mergeWhenTokens.add(child.symbol.tokenIndex);
        }
      } else if (child.children) {
        this._markMergeClauses(child);
      }
    }
  }

  private _markDepthForContext(ctx: any): void {
    if (ctx.start && ctx.stop) {
      for (let i = ctx.start.tokenIndex; i <= ctx.stop.tokenIndex; i++) {
        if (!this.tokenDepthMap.has(i)) {
          this.tokenDepthMap.set(i, this.subqueryDepth);
        }
      }
    }
  }
}
