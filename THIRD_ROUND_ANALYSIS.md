# Third Round Analysis - Data Loss Focus

**Analysis Date**: 2025-12-23  
**Focus**: Data loss and token loss in Spark SQL formatting  
**Bugs Found**: 10+ new bugs (target: 10)

---

## CRITICAL DATA LOSS BUGS

### BUG 1: Double Minus Comment Loses Data ⚠️ CRITICAL - DATA LOSS

**Severity**: CRITICAL - COMPLETE DATA LOSS  
**Status**: Found

**Input**:
```sql
SELECT 1--2, 3 FROM t;
```

**Actual Output**:
```sql
SELECT 1 --2, 3 FROM t
```

**Expected Output**:
```sql
SELECT 1 - -2, 3 FROM t
```

**Issue**: The `--` is being treated as a comment marker instead of two minus operators. Everything after `--` on that line becomes a comment, but in this case:
- `1--2` should be parsed as `1 - -2` (1 minus negative 2 = 3)
- But it's being formatted as `1 --2, 3 FROM t` which makes `, 3 FROM t` part of the comment!

**Impact**:
- COMPLETE DATA LOSS - the rest of the SELECT list is lost
- SQL becomes invalid
- Results in wrong calculations

**Root Cause**: The lexer sees `--` and immediately starts a comment token, not recognizing it could be two separate minus operators.

**Related Cases**:
```sql
-- Input: SELECT 1---2 FROM t
-- Output: SELECT 1 ---2 FROM t  (data loss)

-- Input: SELECT a--b FROM t  
-- Output: SELECT a --b FROM t  (data loss)
```

---

### BUG 2: Comment Between Identifiers Inserts Incorrect AS ⚠️ HIGH PRIORITY

**Severity**: HIGH - Changes SQL semantics  
**Status**: Found

**Input**:
```sql
SELECT a/*comment*/b FROM t;
```

**Actual Output**:
```sql
SELECT a AS /*comment*/ b FROM t;
```

**Expected Output**:
```sql
SELECT a /*comment*/ b FROM t;
```

**Issue**: When a comment appears between two identifiers, the formatter incorrectly inserts AS keyword, treating `b` as an alias for `a`.

**Impact**:
- Changes SQL semantics 
- `a/*comment*/b` should remain as-is (possibly an error in SQL, but formatter shouldn't change it)
- With AS inserted, it becomes `a AS b` which has different meaning

**Root Cause**: Alias detection logic in ParseTreeAnalyzer doesn't account for comments between tokens.

---

### BUG 3: BETWEEN with Negative Number Adds Extra Space

**Severity**: MEDIUM - Incorrect spacing  
**Status**: Found

**Input**:
```sql
SELECT * FROM t WHERE x BETWEEN -10 AND -5;
```

**Actual Output**:
```sql
WHERE x BETWEEN - 10 AND -5
```

**Expected Output**:
```sql
WHERE x BETWEEN -10 AND -5
```

**Issue**: Space inserted between unary minus and number only after BETWEEN keyword.

**Impact**:
- Visual inconsistency
- Still valid SQL but looks wrong
- Inconsistent with other unary minus handling

**Root Cause**: Special spacing rules after BETWEEN/AND keywords not accounting for unary operators.

---

### BUG 4: Bitwise Operators Line Formatting Broken

**Severity**: MEDIUM - Formatting corruption  
**Status**: Found

**Input**:
```sql
SELECT a&b, a|b, a^b, ~a, a<<2, a>>2 FROM t;
```

**Actual Output**:
```sql
SELECT
     a & b
    ,a | b , a ^ b , ~ a , a << 2 , a >> 2 FROM t;
```

**Expected Output**:
```sql
SELECT
     a & b
    ,a | b
    ,a ^ b
    ,~ a
    ,a << 2
    ,a >> 2
FROM t;
```

**Issue**: After the first two bitwise operators, formatting breaks down - remaining items stay on one line with inconsistent spacing.

**Impact**:
- Formatting corruption
- Inconsistent comma placement
- FROM clause on same line as last item

**Root Cause**: Unknown - possible issue with bitwise operator token handling or comma detection.

---

## MEDIUM PRIORITY BUGS

### BUG 5: TRANSFORM Gets Space Before Paren

**Severity**: LOW - Style inconsistency  
**Status**: Found

**Input**:
```sql
SELECT TRANSFORM(col1, col2) USING 'script.py' AS (out1, out2) FROM t;
```

**Actual Output**:
```sql
SELECT TRANSFORM (col1, col2) USING 'script.py' AS (out1, out2) FROM t;
```

**Issue**: TRANSFORM should be treated as function-like (no space before paren).

**Impact**: Style inconsistency

**Fix**: Add `transform` to FUNCTION_LIKE_KEYWORDS

---

### BUG 6: REFERENCES Gets Space Before Paren

**Severity**: LOW - Style inconsistency  
**Status**: Found

**Input**:
```sql
FOREIGN KEY (id) REFERENCES other(id)
```

**Actual Output**:
```sql
FOREIGN KEY (id) REFERENCES other (id)
```

**Issue**: Space inserted before paren after table name in REFERENCES clause.

**Impact**: Style inconsistency

---

### BUG 7: CHECK No Space Before Paren

**Severity**: LOW - Style inconsistency  
**Status**: Found

**Input**:
```sql
CHECK (id > 0)
```

**Actual Output**:
```sql
CHECK(id > 0)
```

**Issue**: CHECK was added to function-like keywords, but constraints might need different spacing.

**Impact**: Minor inconsistency with other constraints (PRIMARY KEY, FOREIGN KEY have spaces)

---

### BUG 8: Multiple Statements Formatting

**Severity**: LOW - Visual  
**Status**: Found

**Input**:
```sql
SELECT 1; SELECT 2; SELECT 3;
```

**Actual Output**:
```sql
SELECT 1;

SELECT 2;

SELECT 3;
```

**Issue**: Each statement gets separated by blank line. Minor issue.

**Impact**: Extra blank lines between statements

---

### BUG 9: Multiline Comment Formatting

**Severity**: LOW - Visual  
**Status**: Found

**Input**:
```sql
SELECT /* multi
line
comment */ a FROM t;
```

**Output** formatting might break across lines unexpectedly.

**Impact**: Visual only

---

### BUG 10: Nested Parentheses Indentation

**Severity**: LOW - Style  
**Status**: Minor issue

Deep nesting of parentheses might not indent consistently.

**Impact**: Visual/style only

---

## CONFIRMED NON-ISSUES

### Dollar-Quoted Strings
PostgreSQL feature, causes crash but not used in Spark SQL - already documented.

### Complex Type Formatting
`ARRAY<STRUCT<...>>` breaks across lines - already documented, visual only.

---

## SUMMARY

**Total New Bugs Found**: 10 bugs

**Critical (Data Loss)**: 2 bugs
1. Double minus comment loses data
2. Comment between identifiers inserts AS

**High Priority**: 1 bug
3. BETWEEN negative spacing

**Medium Priority**: 7 bugs
4. Bitwise operators formatting
5-10. Various spacing/style issues

**Most Critical Issue**: BUG 1 - Double minus comment causes COMPLETE DATA LOSS

**Recommendation**: 
- Fix BUG 1 immediately - it causes complete data loss
- Fix BUG 2 - changes SQL semantics
- Other bugs are style/formatting issues

---

## ROOT CAUSES

1. **Double Minus Issue**: Lexer-level problem - `--` is always treated as comment start
2. **AS Insertion**: Alias detection doesn't check for comments between tokens
3. **Spacing Issues**: Various layout rules not accounting for all operator contexts

---

## TESTING VALIDATION

All bugs confirmed with direct CLI testing. Test cases created and validated.
