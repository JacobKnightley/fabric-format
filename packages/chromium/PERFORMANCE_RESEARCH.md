# Chromium Extension Performance Research

## Issue: fabric-format-gdkh

This document explores alternative approaches to cell processing to improve performance while maintaining 100% accuracy.

## Current State (from fabric-format-xsys analysis)

| Phase | Time | % of Total | Required? |
|-------|------|------------|-----------|
| scroll | ~4.3s | 37% | YES - prevents partial capture |
| focus | ~3.9s | 34% | YES - triggers Monaco content load |
| stability | ~2.1s | 18% | Optimized with early exit |
| format | ~1.1s | 9% | Actual work |

**Current timing constants:**
- `SCROLL_SETTLE_MS`: 100ms
- `DOM_SETTLE_MS`: 50ms (focus delay)
- `EDITOR_LINE_POLL_MS`: 30ms (stability polling)

**Result:** ~370ms/cell average, ~10s for 26 cells

## Implemented: Adaptive Timing System

An experimental adaptive timing system has been added that can be enabled for testing:

```javascript
// In browser console on Fabric notebook page:
window.__fabric_format.enableAdaptiveTiming()   // Enable experimental mode
window.__fabric_format.disableAdaptiveTiming()  // Return to fixed delays
window.__fabric_format.getAdaptiveStats()       // View session statistics
```

### How It Works

When enabled:
- **Scroll delay**: Starts at 50ms (vs 100ms default)
- **Focus delay**: Starts at 25ms (vs 50ms default)

This is a ~50% reduction in fixed delays. The stability loop remains unchanged as the safety net.

### Expected Results

If most cells work with shorter delays:
- Theoretical time savings: ~50ms per cell × 26 cells = ~1.3s
- Best case: ~8.7s instead of ~10s (13% improvement)

### Risk Mitigation

The stability loop (which waits for text to stabilize) remains intact. Even with shorter initial delays, the loop will catch cases where Monaco hasn't finished loading content.

## Research Findings

### 1. Monaco Editor API

Monaco exposes rich APIs that could bypass DOM extraction entirely:

**Key Methods:**
- `editor.getModel().getValue()` - Direct text access, no DOM parsing
- `editor.hasTextFocus()` - Check if editor is ready

**Key Events:**
- `onDidChangeModelContent` - Content changed
- `onDidFocusEditorText` - Focus gained (cursor blinking)
- `onDidContentSizeChange` - Content dimensions changed

**Challenge:** Content scripts run in an isolated world. We cannot access `window.monaco` directly.

**Investigation Script:** See `scripts/investigate-monaco-api.js` - paste this into DevTools console on a Fabric notebook to test if Monaco API is accessible.

### 2. MutationObserver for DOM Readiness

Instead of fixed delays, MutationObserver could detect when:
- `.view-line` elements are created
- Text spans are populated within view-lines

**Risk:** MutationObserver fires frequently during Monaco's render, could be noisy.

### 3. Predictive Pre-loading

**Concept:** While processing cell N, prepare cell N+1 in the background.

**Risk:** Could confuse Monaco's focus state, causing wrong content to be captured.

### 4. Request Animation Frame Batching

Using rAF to sync with browser paint cycles could be more efficient than fixed timeouts.

**Risk:** May not be enough time for Monaco's async text loading.

## Approaches NOT Recommended

1. **Reducing stable checks**: The 3-check requirement is critical for accuracy
2. **Using line count as proxy**: Empty view-lines exist before text loads
3. **Removing focus delay**: Monaco only loads text content on focus

## How to Test

1. Build the extension: `npm run build:chromium`
2. Load in Chrome/Edge as unpacked extension
3. Open a Fabric notebook
4. In console: `window.__fabric_format.enableAdaptiveTiming()`
5. Click "Format All" button
6. Watch performance metrics in console (filter by ⏱️)
7. Compare total time with and without adaptive timing
8. Check for any formatting errors or partial captures

## Success Criteria

- Maintain 100% accuracy (no partial captures)
- Reduce total time by 20%+ (from ~10s to ~8s for 26 cells)
- Or prove current approach is already optimal

## Files Changed

- `content.js`: Added adaptive timing infrastructure
- `PERFORMANCE_RESEARCH.md`: This document
- `scripts/investigate-monaco-api.js`: Monaco API investigation tool
