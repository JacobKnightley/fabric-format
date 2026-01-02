# Repository Audit Summary - fabric-format

**Date:** January 2, 2026  
**Auditor:** GitHub Copilot  
**Tool:** bd (beads) v0.43.0

---

## Executive Summary

Comprehensive audit of the `fabric-format` monorepo identified **46 issues** across four key areas: Architecture, Code Quality, Test Coverage, and Documentation. Issues have been catalogued using `bd` (beads) with appropriate priorities (P0-P4) and dependencies.

### Quick Stats

| Metric | Count |
|--------|-------|
| **Total Issues** | 47 (46 open, 1 closed) |
| **Critical (P0)** | 1 |
| **High Priority (P1)** | 7 |
| **Medium Priority (P2)** | 24 |
| **Low Priority (P3)** | 13 |
| **Backlog (P4)** | 1 |

### Issue Type Breakdown

| Type | Count |
|------|-------|
| **Bugs** | 8 |
| **Tasks** | 37 |
| **Features** | 1 |

---

## Issues by Category

### 1. Architecture (12 issues)

**Key Findings:**
- **Module Size Violations**: 4 files exceed the 200-400 line guideline:
  - `parse-tree-analyzer.ts`: 2076 lines (P2: fabric-format-014)
  - `formatter.ts`: 1531 lines (P2: fabric-format-4qy)
  - `notebook-formatter.ts`: 644 lines (P2: fabric-format-6t4)
  - `cli.ts`: 458 lines (P2: fabric-format-c62)
  - `formatting-context.ts`: 449 lines - approaching limit (P3: fabric-format-nf2)

- **Separation of Concerns**:
  - Cell formatter couples low-level and high-level concerns (P2: fabric-format-6ts)
  - No clear separation between parsing and formatting in notebook-formatter (P2: fabric-format-5m7)
  - Circular import risk between formatters/index.ts and individual formatters (P2: fabric-format-a7u)

- **API Design**:
  - Inconsistent error handling: formatCell returns error, formatNotebook throws (P2: fabric-format-bxc)
  - Inconsistent async/sync API: formatCellSync only for sparksql (P2: fabric-format-acg)
  - Public API exports internal types unnecessarily (P2: fabric-format-txv)
  - Registry pattern may be over-engineered for 2 formatters (P3: fabric-format-r1p)

**Impact**: Medium - Affects maintainability and extensibility but not functionality.

---

### 2. Code Quality & Best Practices (15 issues)

**Key Findings:**

- **Type Safety** (Critical):
  - TypeScript strict mode disabled in tsconfig.base.json (P1: fabric-format-j2o) **BLOCKS 2 issues**
  - Multiple uses of 'any' type in cell-formatter.ts (P2: fabric-format-67h)
  - Inconsistent use of types vs interfaces (P2: fabric-format-ch7)

- **Error Handling**:
  - Missing error handling for fs operations in cli.ts (P1: fabric-format-8qs)
  - No validation for invalid cell types in formatCell (P2: fabric-format-1nk)
  - Python formatter error messages lack context (P2: fabric-format-4gw)

- **Code Organization**:
  - Magic command detection logic duplicated (P2: fabric-format-vwj)
  - File extension validation not centralized (P3: fabric-format-9wz)
  - Naming inconsistency: formatSql vs formatCell vs formatNotebook (P3: fabric-format-xgb)

- **State Management**:
  - Global state in Python formatter initialization is fragile (P1: fabric-format-2b8) **BLOCKS 1 issue**
  - Race condition possible if initializePythonFormatter called multiple times (P1: fabric-format-k2q)

- **Minor Issues**:
  - Comment says 'sparkfmt' but package is 'fabric-format' (P4: fabric-format-jpq)

**Impact**: High - Type safety and error handling issues can lead to runtime failures.

---

### 3. Test Coverage Analysis (11 issues)

**Key Findings:**

- **Critical Gaps**:
  - No tests for CLI argument parsing and validation (P1: fabric-format-5yf)
  - No tests for directory traversal and file discovery (P1: fabric-format-i6u)

- **Missing Test Scenarios**:
  - No tests for formatCell error handling paths (P2: fabric-format-ur0)
  - Missing tests for stdin/stdout in CLI (P2: fabric-format-734)
  - No tests for --print flag in CLI (P2: fabric-format-6je)
  - No integration tests for Python formatter initialization failures (P2: fabric-format-1ys)
  - Missing error path tests for formatNotebook invalid input (P2: fabric-format-vfh)
  - Missing edge case tests for empty files and empty cells (P2: fabric-format-f17)

- **Test Infrastructure**:
  - No tests for concurrent formatting scenarios (P3: fabric-format-ruu)
  - Test framework lacks proper assertion library (P3: fabric-format-xui)

**Impact**: High - CLI has no tests, risking regressions in core functionality.

---

### 4. Documentation Consistency (7 issues)

**Key Findings:**

- **Accuracy Issues**:
  - index.ts comment references 'formatters/sql/' but actual path is 'formatters/sparksql/' (P3: fabric-format-atx)
  - Comment says 'sparkfmt' but package is 'fabric-format' (P4: fabric-format-jpq) [duplicate with Code Quality]
  - SQL_STYLE_GUIDE.md had typo: 'Meanign' → 'Meaning' (P4: fabric-format-hm6) **✅ FIXED**

- **Missing Information**:
  - README.md doesn't mention exit codes for check command (P3: fabric-format-x8w)
  - CONTRIBUTING.md doesn't document how to test chromium package (P3: fabric-format-x9d)
  - No documentation for WasmInitOptions in public API (P2: fabric-format-8s0)
  - Missing JSDoc for public API functions in index.ts (P2: fabric-format-cpr)

- **Verification Needed**:
  - AGENTS.md references ~335 tests but should be verified (P3: fabric-format-33r)
  - AGENTS.md says tests are in packages/core/src/tests/ but structure unclear (P3: fabric-format-njt)

**Impact**: Low - Documentation issues don't affect functionality but impact usability.

---

## Critical Issues (Immediate Action Required)

### 1. Security: npm audit vulnerability (P0: fabric-format-2yv)
**Issue:** esbuild <=0.24.2 has moderate severity vulnerability (GHSA-67mh-4wv8-2f99)  
**Fix:** Update esbuild to 0.27.2 (breaking change, needs testing)  
**Status:** READY

### 2. Build: ANTLR download failure (P1: fabric-format-r3t)
**Issue:** Build fails when ANTLR download is blocked by network  
**Related:** No offline build support or caching (P2: fabric-format-44r)  
**Impact:** Prevents builds in restricted environments  
**Status:** READY

---

## Dependency Chains

### TypeScript Strict Mode (fabric-format-j2o)
```
fabric-format-j2o (P1) BLOCKS:
├── fabric-format-67h (P2): Fix 'any' types
└── fabric-format-ch7 (P2): Standardize types vs interfaces
```
**Action:** Enable strict mode first, then fix type issues.

### Python Formatter State (fabric-format-2b8)
```
fabric-format-2b8 (P1) BLOCKS:
└── fabric-format-k2q (P1): Fix race condition
```
**Action:** Refactor global state management before addressing race conditions.

### CLI Test Coverage (fabric-format-5yf)
```
fabric-format-5yf (P1) Related to:
├── fabric-format-i6u (P1): Directory traversal tests
├── fabric-format-734 (P2): stdin/stdout tests
└── fabric-format-6je (P2): --print flag tests
```
**Action:** Implement comprehensive CLI test suite.

---

## Ready Work (No Blockers)

Run `bd ready` to see the 10 issues ready for immediate work:

1. **[P0]** npm audit vulnerability
2. **[P1]** Missing error handling in CLI
3. **[P1]** No CLI tests (argument parsing)
4. **[P1]** No CLI tests (directory traversal)
5. **[P1]** Build fails without network
6. **[P1]** Race condition in Python formatter
7. **[P2]** parse-tree-analyzer.ts too large
8. **[P2]** formatter.ts too large
9. **[P2]** notebook-formatter.ts too large
10. **[P2]** cli.ts too large

---

## Issue Distribution by Priority

### Priority 0 (Critical) - 1 issue
- Security vulnerability in esbuild dependency

### Priority 1 (High) - 7 issues
- TypeScript strict mode disabled
- Missing error handling in CLI
- No CLI tests (2 issues)
- Build system fragility
- Python formatter state management (2 issues)

### Priority 2 (Medium) - 24 issues
- Module size violations (4 issues)
- Code quality improvements (7 issues)
- Test coverage gaps (7 issues)
- API/Architecture improvements (4 issues)
- Documentation gaps (2 issues)

### Priority 3 (Low) - 13 issues
- Minor bugs and edge cases (3 issues)
- Documentation accuracy (5 issues)
- Code organization polish (5 issues)

### Priority 4 (Backlog) - 1 issue
- Comment cleanup

---

## Recommendations

### Immediate (This Sprint)
1. **Fix esbuild vulnerability** (P0) - Security risk
2. **Add error handling to CLI** (P1) - Prevent crashes
3. **Add CLI tests** (P1) - No coverage for critical path
4. **Fix build system** (P1) - Blocks development in restricted environments

### Short Term (Next Sprint)
1. **Enable TypeScript strict mode** (P1) - Improves type safety
2. **Refactor Python formatter state** (P1) - Fix race condition
3. **Split large files** (P2) - Improve maintainability
   - Start with parse-tree-analyzer.ts (2076 lines)
4. **Improve API consistency** (P2) - Better developer experience

### Long Term (Backlog)
1. **Enhance test coverage** - Add edge case and error path tests
2. **Improve documentation** - Add JSDoc, fix outdated references
3. **Code quality polish** - Naming consistency, reduce duplication

---

## Methodology

### Tools Used
- **bd (beads) v0.43.0** - Issue tracking
- Manual code review of all TypeScript source files
- Static analysis of module sizes and dependencies
- Documentation cross-referencing
- npm audit for security vulnerabilities

### Scope
- ✅ packages/core/src/ (7,004 lines of TypeScript)
- ✅ Documentation (README.md, AGENTS.md, CONTRIBUTING.md, SQL_STYLE_GUIDE.md)
- ✅ Build configuration (package.json, tsconfig.base.json)
- ✅ Test structure (27 test files)
- ⚠️ packages/chromium/ (not audited - outside scope)

### Out of Scope
- Functional testing (build failed due to ANTLR download)
- Performance analysis
- Browser extension code review
- Grammar files (ANTLR generated code)

---

## Next Steps

1. **Review this audit** with the team
2. **Prioritize issues** based on business needs
3. **Run `bd ready`** to see actionable work
4. **Use `bd dep tree <id>`** to understand dependencies
5. **Start with P0/P1 issues** for maximum impact

---

## Commands Reference

```bash
# View all issues
bd list

# View ready work (no blockers)
bd ready

# Show dependency tree
bd dep tree fabric-format-j2o

# View specific issue
bd show fabric-format-2yv

# Claim and start work
bd update fabric-format-2yv --status in_progress

# Close completed work
bd close fabric-format-2yv --reason "Fixed vulnerability"

# Sync changes
bd sync
```

---

**End of Audit Report**
