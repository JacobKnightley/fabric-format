# Instructions for AI Agents Working on fabric-format

## Project Overview

A zero-config formatter for **Microsoft Fabric notebooks** supporting Spark SQL and Python.

**Monorepo** with two packages:

- `packages/core` — `@jacobknightley/fabric-format` npm library (TypeScript)
- `packages/chromium` — Chrome/Edge browser extension

**Supported languages:**

- **Spark SQL** — Custom grammar-driven formatter (ANTLR-based)
- **Python** — Uses [Ruff](https://github.com/astral-sh/ruff) WASM for formatting

**Philosophy:** Opinionated by design. One style, no configuration options.

## Issue Tracking

We use bd (beads) for issue tracking instead of Markdown TODOs or external tools.

### Installation

```bash
npm install -g @beads/bd
```

Or via other methods:
- **Homebrew:** `brew install steveyegge/beads/bd`
- **Go:** `go install github.com/steveyegge/beads/cmd/bd@latest`
- **Script:** `curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash`

### Quick Reference

```bash
# Find ready work (no blockers)
bd ready

# Create new issue
bd create "Issue title" -t bug|feature|task -p 0-4

# Update issue status
bd update <id> --status in_progress

# Link discovered work
bd dep add <discovered-id> <parent-id> --type discovered-from

# Complete work
bd close <id> --reason "Done"

# Show dependency tree
bd dep tree <id>

# Get issue details
bd show <id>
```

### Workflow

1. **Check for ready work**: Run `bd ready` to see what's unblocked
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work**: If you find bugs or TODOs, create issues:
   - `bd create "Found bug" -t bug -p 1`
   - Link it: `bd dep add <new-id> <current-id> --type discovered-from`
5. **Complete**: `bd close <id> --reason "Implemented"`
6. **Sync**: `bd sync` before ending session

### Issue Types

- `bug` - Something broken that needs fixing
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (nice-to-have features, minor bugs)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Dependency Types

- `blocks` - Hard dependency (issue X blocks issue Y)
- `related` - Soft relationship (issues are connected)
- `discovered-from` - Track issues discovered during work

Only `blocks` dependencies affect the ready work queue.

## Development Guidelines

### Code Standards

- **TypeScript**: Strict mode enabled
- **Modules**: Keep to ~200-400 lines for maintainability

### Browser Extension Debugging

When debugging `packages/chromium`, remember that content scripts run in an **isolated context**. You cannot execute scripts directly in DevTools console against the extension's context—the page's JavaScript world and the extension's world are separate.

### File Organization

```
packages/core/
├── grammar/                    # ANTLR grammar files (SQL source of truth)
│   ├── SqlBaseLexer.g4
│   └── SqlBaseParser.g4
├── src/
│   ├── formatters/
│   │   ├── sparksql/          # SQL formatter (grammar-driven)
│   │   └── python/            # Python formatter (Ruff-based)
│   ├── cell-formatter.ts      # Language detection & routing
│   ├── notebook-formatter.ts  # Notebook file handling
│   ├── cli.ts                 # CLI entry point
│   └── tests/                 # All test suites
```

### Before Committing

1. **Run tests**: `npm test`
2. **Sync issues**: `bd sync`
3. **Update docs**: If you changed behavior, update README.md or other docs
4. **Git add both**: `git add .beads/ <your-changes>`

### Git Workflow

```bash
# Stage and commit your changes first
git add <files>
git commit -m "Your message"

# Pull remote changes (rebase to keep history clean)
git pull --rebase

# Sync beads issues
bd sync

# Push everything
git push
```

## Spark SQL Formatter

packages\core\src\formatters\sparksql

The SQL formatter is 100% grammar-driven. The ANTLR grammar files are the single source of truth for all keywords, operators, and tokens. **Never hardcode keyword lists in SQL formatting code.**

### Critical Anti-Pattern

```typescript
// FORBIDDEN - hardcoded keyword list
const SQL_KEYWORDS = ['SELECT', 'FROM', 'WHERE', ...];

// REQUIRED - derive from grammar
const symbolicName = SqlBaseLexer.symbolicNames[tokenType];
const isKeyword = symbolicName !== null && symbolicName === text.toUpperCase();
```

### How It Works

- **Keywords:** A token is a keyword if `symbolicName === text.toUpperCase()`
- **Identifiers:** `ParseTreeAnalyzer` walks the parse tree and marks positions inside `identifier`, `functionName`, or `qualifiedName` contexts
- **Clause boundaries:** Visitor methods like `visitFromClause()`, `visitWhereClause()` mark positions for newline insertion

### Dual-Lexing Workaround

ANTLR lexer is case-sensitive. Parse UPPERCASED SQL for correct token types, use original SQL for text, then combine.

## Python Formatter

packages\core\src\formatters\python

Uses Ruff WASM (`@astral-sh/ruff-wasm-web`) for Python formatting. Configuration in `packages/core/src/formatters/python/config.ts`. Magic commands (`%`, `%%`, `!`) are preserved during formatting.

## Test Structure

Tests are organized in `packages/core/src/tests/`:

```
tests/
├── index.ts              # Main test runner
├── framework.ts          # Test utilities (TestCase, TestSuite, runners)
├── sparksql/             # SQL formatter tests (organized by feature)
├── python/               # Python formatter tests
└── integration/          # CLI & notebook parsing tests
```

**Test organization pattern:**

- `sparksql/` — Feature-based modules (e.g., `joins.test.ts`, `expressions.test.ts`, `ddl.test.ts`)
- `python/` — Ruff integration, magic commands, notebook integration
- `integration/` — CLI tests, notebook file parsing

## Important Files

- **README.md** - Main documentation (keep this updated!)
- **SQL_STYLE_GUIDE.md** - SQL formatting style reference
- **CONTRIBUTING.md** - Contribution guidelines

## Pro Tips for Agents

- Check `bd ready` before asking "what next?"
- Link discoveries with `discovered-from` to maintain context
- Use `bd dep tree` to understand complex dependencies
- Priority 0-1 issues are usually more important than 2-4
- Never hardcode keyword lists in SQL code—always derive from grammar
- Test with context-sensitive examples: `select a.order from t order by x`

## Building and Testing

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Build core library only
npm run build:core

# Build extension only
npm run build:chromium

# Run all tests (~335 tests)
npm test

# Run with failure details
npm run test:verbose
```

## Session Completion (Landing the Plane)

**MANDATORY** before ending any work session:

```bash
git add .
git commit -m "Your message"
git pull --rebase
bd sync
git push
git status  # MUST show "up to date with origin"
```

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing—that leaves work stranded locally
- NEVER say "ready to push when you are"—YOU must push
- If push fails, resolve and retry until it succeeds

---

**Remember**: If you find the workflow confusing or have ideas for improvement, create a bd with your feedback.
