# Known Issues - Spark SQL Formatter

This document tracks known formatting issues that still need to be fixed.

**Last Updated:** All HIGH/MEDIUM/LOW priority issues fixed (except comments) - 109/109 tests passing

---

## Remaining Issues

### 1. Complex Inline Comments

**Priority**: LOW

```sql
-- INPUT
select
    x, -- first column
    y  -- second column
from t

-- CURRENT OUTPUT (comments may shift)
-- Needs investigation

-- EXPECTED OUTPUT
SELECT
     x  -- first column
    ,y  -- second column
FROM t
```

---

## Priority Summary

| Priority | Remaining |
|----------|-----------|
| HIGH | 0 ✅ |
| MEDIUM | 0 ✅ |
| LOW | 1 (comments) |

**Overall Progress**: All priority issues resolved except complex inline comments.