# Chromium Extension Performance Research

## Issue: fabric-format-gdkh

This document explored alternative approaches to cell processing to improve performance while maintaining 100% accuracy.

## Conclusion: Current Approach is Near-Optimal

After extensive research, the current DOM-based extraction approach with stability polling is **near-optimal** given browser security constraints.

### Key Findings

1. **Monaco API is inaccessible**: Content Security Policy (CSP) blocks script injection into the page context. We cannot access `window.monaco` or `monaco.editor.getModels()` from content scripts.

2. **Network interception is useless**: Notebook content is loaded before the page renders - by the time we could intercept, the data is already in the DOM.

3. **Direct notebook download is slow**: Takes 10-20 seconds, much slower than DOM extraction.

4. **Pre-scanning approaches all have UX problems**: Any approach that scans ahead visibly disrupts the user's view.

### Validated Improvements

The timing constants were reduced and validated:
- `SCROLL_SETTLE_MS`: 100ms → **50ms** ✅
- `DOM_SETTLE_MS`: 50ms → **25ms** ✅

These values were tested on a 26-cell notebook - all char counts matched the baseline exactly.

### Why CSP Blocks Us

Browser extensions' content scripts run in an "isolated world" - they share DOM with the page but have a separate JavaScript context. To access page globals like `window.monaco`, you must inject a script into the page, but Fabric's CSP blocks:
- Inline scripts (`script-src` doesn't include `'unsafe-inline'`)
- Blob URLs
- Any dynamically created script elements

This is a fundamental browser security limitation that cannot be bypassed.

## Original Analysis (for reference)

| Phase | Time | % of Total | Status |
|-------|------|------------|--------|
| scroll | ~4.3s | 37% | Optimized (50ms delay) |
| focus | ~3.9s | 34% | Optimized (25ms delay) |
| stability | ~2.1s | 18% | Already optimal |
| format | ~1.1s | 9% | Cannot improve (actual work) |

## Approaches Investigated

### 1. Monaco `getModels()` API (fabric-format-v7qf)
**Status:** ❌ Blocked by CSP

Would have been ideal - instant access to all cell content without DOM parsing. But CSP blocks script injection.

### 2. Fabric Notebook State Object (fabric-format-gqf5)
**Status:** ❌ Blocked by CSP

Same issue - cannot access page JavaScript context.

### 3. Network Interception (fabric-format-09sx)
**Status:** ❌ Not viable

Content loads offline from memory. By the time webRequest could intercept, the data is already rendered.

### 4. Download `.ipynb` File (fabric-format-ugr6)
**Status:** ❌ Too slow

Takes 10-20 seconds to download via Fabric API. Much slower than DOM extraction.

### 5. Format-on-Focus Model (fabric-format-23ho)
**Status:** ❌ Bad UX

Only processing visible cells when user scrolls would be confusing and feel broken.

### 6. Parallel Pre-Scanning Cache (fabric-format-8e6o)
**Status:** ❌ UX problems

All pre-scan approaches either:
- Visibly scroll the view (disruptive)
- Create visible artifacts (duplicate elements)
- Require user action (manual trigger worse UX)

## Final Architecture

The current approach is:
1. **Scroll to cell** (50ms settle)
2. **Focus editor** (25ms settle) - triggers Monaco to load content
3. **Poll for stability** (30ms interval, 3 consecutive stable readings required)
4. **Format** (actual CPU work)
5. **Paste result** (25ms settle)

The stability polling loop is the key safety mechanism that ensures we never capture partial content.

## Beads Closed

- v7qf: Monaco getModels() API bypass
- gqf5: Fabric notebook data object
- 09sx: Network interception
- ugr6: Download and parse ipynb
- 23ho: Format-on-focus model
- 8e6o: Parallel pre-scanning cache

All closed as either "blocked by CSP" or "not viable".
