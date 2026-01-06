/**
 * Fabric Formatter - Content Script
 * Formats Python and SparkSQL cells in Microsoft Fabric Notebooks
 * Uses @jacobknightley/fabric-format for all formatting
 */

import {
  formatCell,
  initializePythonFormatter,
} from '@jacobknightley/fabric-format';

// ============================================================================
// Timing Constants
// ============================================================================

/**
 * Delay constants for DOM operations and polling.
 * These values are tuned for Monaco Editor and Fabric's React-based UI.
 *
 * Note on scroll/focus delays: Lower values (50ms/25ms) were validated
 * to work reliably while being faster than the original (100ms/50ms).
 * The stability polling loop is the real safety net for content readiness.
 * See fabric-format-gdkh for performance research details.
 */
const TIMING = {
  /** Short delay for DOM operations to settle (focus, dispatch events) */
  DOM_SETTLE_MS: 25,

  /** Delay after scrolling to ensure virtualized content is rendered */
  SCROLL_SETTLE_MS: 50,

  /** Base delay for initialization retry with exponential backoff */
  INIT_RETRY_BASE_MS: 500,

  /** Delay between editor detection attempts */
  EDITOR_CHECK_INTERVAL_MS: 500,

  /** Maximum delay for exponential backoff */
  MAX_BACKOFF_MS: 500,

  /** Initial delay for exponential backoff */
  INITIAL_BACKOFF_MS: 100,

  /** Button state polling interval */
  BUTTON_POLL_INTERVAL_MS: 500,

  /** Maximum wait time for status bar to appear */
  STATUS_BAR_TIMEOUT_MS: 5000,

  /** Fast polling interval for Monaco editor line stability checks */
  EDITOR_LINE_POLL_MS: 30,
};

// ============================================================================
// Debug Logging
// ============================================================================

/**
 * Debug mode - enabled in development builds, disabled in production.
 * Controlled by esbuild's define of process.env.NODE_ENV.
 */
const DEBUG_MODE = process.env.NODE_ENV === 'development';

const log = {
  /** Always shown - important state changes and results */
  info: (...args) => console.log('[fabric-format]', ...args),

  /** Always shown - warnings */
  warn: (...args) => console.warn('[fabric-format]', ...args),

  /** Always shown - errors */
  error: (...args) => console.error('[fabric-format]', ...args),

  /** Only shown when DEBUG_MODE is true */
  debug: (...args) => {
    if (DEBUG_MODE) {
      console.log('[fabric-format:debug]', ...args);
    }
  },
};

// Expose for testing (will be accessible via window.__fabric_format)
if (typeof window !== 'undefined') {
  window.__fabric_format = { formatCell };
}

// ============================================================================
// Cleanup Management
// ============================================================================

/**
 * Tracks active observers and intervals for proper cleanup on page unload.
 * Prevents memory leaks when the iframe is destroyed and recreated.
 */
const cleanupHandlers = {
  observers: [],
  intervals: [],
  timeouts: [],
};

/**
 * Register a MutationObserver for cleanup on page unload.
 * @param {MutationObserver} observer - The observer to track
 * @returns {MutationObserver} The same observer for chaining
 */
function trackObserver(observer) {
  cleanupHandlers.observers.push(observer);
  return observer;
}

/**
 * Register an interval for cleanup on page unload.
 * @param {number} intervalId - The interval ID from setInterval
 * @returns {number} The same interval ID for chaining
 */
function trackInterval(intervalId) {
  cleanupHandlers.intervals.push(intervalId);
  return intervalId;
}

/**
 * Register a timeout for cleanup on page unload.
 * @param {number} timeoutId - The timeout ID from setTimeout
 * @returns {number} The same timeout ID for chaining
 */
function _trackTimeout(timeoutId) {
  cleanupHandlers.timeouts.push(timeoutId);
  return timeoutId;
}

/**
 * Clean up all tracked resources (observers, intervals, timeouts).
 * Called automatically on page unload.
 */
function cleanup() {
  log.debug('Cleaning up resources...');

  // Disconnect all observers
  for (const observer of cleanupHandlers.observers) {
    try {
      observer.disconnect();
    } catch (_e) {
      // Ignore errors during cleanup
    }
  }
  cleanupHandlers.observers.length = 0;

  // Clear all intervals
  for (const intervalId of cleanupHandlers.intervals) {
    clearInterval(intervalId);
  }
  cleanupHandlers.intervals.length = 0;

  // Clear all timeouts
  for (const timeoutId of cleanupHandlers.timeouts) {
    clearTimeout(timeoutId);
  }
  cleanupHandlers.timeouts.length = 0;

  log.debug('Cleanup complete');
}

// Register cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('unload', cleanup);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Simple debounce function to limit how often a function can be called.
 * @param {Function} fn - The function to debounce
 * @param {number} ms - The debounce delay in milliseconds
 * @returns {Function} The debounced function
 */
function debounce(fn, ms) {
  let timeoutId = null;
  return function (...args) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, ms);
  };
}

// ============================================================================
// State
let pythonInitialized = false;
let initializationFailed = false;
let lastActiveEditor = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the Python formatter with WASM loaded from extension resources.
 * Implements retry logic with exponential backoff for transient failures.
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} baseDelayMs - Initial delay between retries in ms
 * @returns {Promise<boolean>} True if initialization succeeded
 */
async function initializeFormatters(
  maxRetries = 3,
  baseDelayMs = TIMING.INIT_RETRY_BASE_MS,
) {
  if (pythonInitialized) return true;
  if (initializationFailed) {
    // Already failed permanently, don't retry
    return false;
  }

  const wasmUrl = chrome.runtime.getURL('dist/ruff_wasm_bg.wasm');
  log.debug('WASM URL:', wasmUrl);

  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.debug(`Initialization attempt ${attempt}/${maxRetries}`);
      await initializePythonFormatter({ wasmUrl });
      pythonInitialized = true;
      log.info('Formatters initialized successfully');
      return true;
    } catch (error) {
      lastError = error;
      log.warn(
        `Initialization attempt ${attempt} failed:`,
        error.message || error,
      );

      if (attempt < maxRetries) {
        const delay = baseDelayMs * 2 ** (attempt - 1); // Exponential backoff
        log.debug(`Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted
  initializationFailed = true;
  log.error(
    'Failed to initialize formatters after',
    maxRetries,
    'attempts:',
    lastError,
  );
  showNotification(
    `Failed to initialize formatter: ${lastError?.message || 'Unknown error'}. Reload the page to retry.`,
    'error',
  );
  return false;
}

// ============================================================================
// Cell Detection
// ============================================================================

/**
 * Detect the language/type of a Monaco editor cell.
 * Uses multiple fallback strategies for robustness against DOM changes.
 * @param {Element} editor - The Monaco editor element
 * @returns {string} The detected cell type or 'unknown'
 */
function detectCellType(editor) {
  if (!editor) return 'unknown';

  // Strategy 1: data-mode-id attribute (most reliable)
  const modeElement =
    editor.querySelector('[data-mode-id]') || editor.closest('[data-mode-id]');
  if (modeElement) {
    const mode = modeElement.getAttribute('data-mode-id');
    log.debug('detectCellType: found data-mode-id =', mode);
    return mode;
  }

  // Strategy 2: lang- class on editor
  const classList = editor.className || '';
  const langMatch = classList.match(/lang-(\w+)/);
  if (langMatch) {
    log.debug('detectCellType: found lang- class =', langMatch[1]);
    return langMatch[1];
  }

  // Strategy 3: Look for language class patterns in child elements
  const languageClasses = editor.querySelectorAll(
    '[class*="language-"], [class*="mtk"]',
  );
  if (languageClasses.length > 0) {
    for (const el of languageClasses) {
      const classes = el.className || '';
      const match = classes.match(/language-(\w+)/);
      if (match) {
        log.debug('detectCellType: found language- class =', match[1]);
        return match[1];
      }
    }
  }

  // Strategy 4: Check parent cell container for language hints
  const cellContainer = editor.closest('[data-cell-id]');
  if (cellContainer) {
    const cellClasses = cellContainer.className || '';
    const cellLangMatch = cellClasses.match(
      /cell-(python|sql|sparksql|pyspark|scala|r)/i,
    );
    if (cellLangMatch) {
      log.debug(
        'detectCellType: found cell container class =',
        cellLangMatch[1],
      );
      return cellLangMatch[1];
    }
  }

  // Strategy 5: Heuristic detection from content (last resort)
  const codeContent =
    editor.querySelector('.view-lines')?.textContent?.toLowerCase() || '';
  if (
    codeContent.includes('select ') ||
    codeContent.includes('from ') ||
    codeContent.includes('create ')
  ) {
    log.debug('detectCellType: heuristic detection suggests SQL');
    return 'sparksql';
  }
  if (
    codeContent.includes('def ') ||
    codeContent.includes('import ') ||
    codeContent.includes('class ')
  ) {
    log.debug('detectCellType: heuristic detection suggests Python');
    return 'python';
  }

  log.warn(
    'detectCellType: could not determine type using any strategy, returning unknown',
  );
  return 'unknown';
}

/**
 * Map detected cell type to fabric-format language identifier
 */
function mapCellTypeToLanguage(cellType) {
  const type = cellType.toLowerCase();

  // Python/PySpark
  if (type === 'python' || type === 'pyspark' || type.includes('python')) {
    return 'python';
  }

  // SparkSQL/SQL
  if (type === 'sql' || type === 'sparksql' || type.includes('sql')) {
    return 'sparksql';
  }

  return null;
}

// ============================================================================
// Notebook Container Detection
// ============================================================================

function findActiveNotebookContainer() {
  const containers = document.querySelectorAll(
    '[class*="notebook"], [class*="Notebook"], [class*="cell-list"], [class*="cellList"]',
  );

  for (const container of containers) {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const style = window.getComputedStyle(container);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const editors = container.querySelectorAll('.monaco-editor');
    const visibleEditors = Array.from(editors).filter((ed) => {
      const edRect = ed.getBoundingClientRect();
      return edRect.width > 0 && edRect.height > 0;
    });

    if (visibleEditors.length >= 1) {
      return container;
    }
  }

  const allEditors = document.querySelectorAll('.monaco-editor');
  for (const editor of allEditors) {
    const edRect = editor.getBoundingClientRect();
    if (edRect.width === 0 || edRect.height === 0) continue;

    let current = editor.parentElement;
    while (current && current !== document.body) {
      const editors = current.querySelectorAll?.('.monaco-editor');
      const visibleCount = editors
        ? Array.from(editors).filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }).length
        : 0;

      if (visibleCount >= 2) {
        return current;
      }
      current = current.parentElement;
    }
  }

  return document;
}

// ============================================================================
// Editor Focus Tracking
// ============================================================================

function setupEditorFocusTracking() {
  document.addEventListener(
    'focusin',
    (event) => {
      const editor = event.target.closest('.monaco-editor');
      if (editor && editor !== lastActiveEditor) {
        lastActiveEditor = editor;
      }
    },
    true,
  );

  document.addEventListener(
    'mousedown',
    (event) => {
      const editor = event.target.closest('.monaco-editor');
      if (editor && editor !== lastActiveEditor) {
        lastActiveEditor = editor;
      }
    },
    true,
  );
}

// ============================================================================
// Cell Finding
// ============================================================================

function findActiveCell() {
  const activeElement = document.activeElement;

  if (activeElement) {
    if (activeElement.classList?.contains('inputarea')) {
      const editor = activeElement.closest('.monaco-editor');
      if (editor) {
        log.debug('findActiveCell: found via inputarea focus');
        return editor;
      }
    }

    const activeEditor = activeElement.closest('.monaco-editor');
    if (activeEditor) {
      log.debug('findActiveCell: found via closest monaco-editor');
      return activeEditor;
    }
  }

  if (lastActiveEditor && document.contains(lastActiveEditor)) {
    log.debug('findActiveCell: using lastActiveEditor');
    return lastActiveEditor;
  }

  log.debug('findActiveCell: no active cell found');
  return null;
}

function _findCurrentlyVisibleCells() {
  const cells = [];
  const notebookContainer = findActiveNotebookContainer();
  const searchRoot = notebookContainer || document;

  const editors = searchRoot.querySelectorAll('.monaco-editor');
  const skipped = { ownerDoc: 0, zeroSize: 0, hidden: 0, noLanguage: 0 };

  for (const editor of editors) {
    if (editor.ownerDocument !== document) {
      skipped.ownerDoc++;
      continue;
    }

    const rect = editor.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      skipped.zeroSize++;
      continue;
    }

    const style = window.getComputedStyle(editor);
    if (style.display === 'none' || style.visibility === 'hidden') {
      skipped.hidden++;
      continue;
    }

    const cellType = detectCellType(editor);
    const language = mapCellTypeToLanguage(cellType);

    if (language) {
      cells.push({ editor, cellType, language });
    } else {
      skipped.noLanguage++;
    }
  }

  log.debug(
    'findCurrentlyVisibleCells: found',
    cells.length,
    'formattable, skipped:',
    skipped,
  );
  return cells;
}

/**
 * Get the total cell count from Fabric's UI
 */
function _getTotalCellCount() {
  const cellSelectionBtn = document.querySelector(
    'button[name="CellSelection"]',
  );
  if (cellSelectionBtn) {
    const text = cellSelectionBtn.textContent;
    const match = text.match(/of\s+(\d+)\s+cells?/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}

/**
 * Find the scrollable container for the notebook
 * Cached for the duration of a format operation (fabric-format-au2)
 */
let cachedScrollContainer = null;
let scrollContainerCacheTime = 0;
const SCROLL_CONTAINER_CACHE_MS = 5000; // Cache for 5 seconds

function findScrollContainer() {
  // Use cached value if recent (avoids expensive DOM scan)
  if (
    cachedScrollContainer &&
    Date.now() - scrollContainerCacheTime < SCROLL_CONTAINER_CACHE_MS
  ) {
    if (cachedScrollContainer.isConnected) {
      return cachedScrollContainer;
    }
    // Cache is stale, clear it
    cachedScrollContainer = null;
  }

  const knownContainers = [
    '.notebook-container',
    '.notebook-cell-list',
    '.cell-list-container',
    '[class*="notebook-container"]',
    '[class*="notebookContainer"]',
  ];

  for (const selector of knownContainers) {
    const el = document.querySelector(selector);
    if (el && el.scrollHeight > el.clientHeight) {
      cachedScrollContainer = el;
      scrollContainerCacheTime = Date.now();
      return el;
    }
  }

  const scrollables = Array.from(document.querySelectorAll('div')).filter(
    (el) => {
      const style = window.getComputedStyle(el);
      return (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight
      );
    },
  );

  for (const container of scrollables) {
    if (container.querySelector('.monaco-editor')) {
      cachedScrollContainer = container;
      scrollContainerCacheTime = Date.now();
      return container;
    }
  }

  if (scrollables.length > 0) {
    cachedScrollContainer = scrollables[0];
    scrollContainerCacheTime = Date.now();
    return scrollables[0];
  }

  const fallback = document.scrollingElement || document.documentElement;
  cachedScrollContainer = fallback;
  scrollContainerCacheTime = Date.now();
  return fallback;
}

// ============================================================================
// Code Extraction & Insertion
// ============================================================================

/**
 * Extract code from a Monaco editor element.
 * Uses multiple fallback strategies for robustness against DOM structure changes.
 * @param {Element} editorElement - The Monaco editor DOM element
 * @returns {string} The extracted code
 */
function extractCodeFromEditor(editorElement) {
  // Strategy 1: Standard Monaco DOM structure (.view-lines .view-line)
  let lines = editorElement.querySelectorAll('.view-lines .view-line');

  // Strategy 2: Fallback for different Monaco versions (direct .view-line children)
  if (lines.length === 0) {
    lines = editorElement.querySelectorAll('.view-line');
    if (lines.length > 0) {
      log.debug('extractCodeFromEditor: using fallback selector .view-line');
    }
  }

  // Strategy 3: Fallback for even newer Monaco (lines-content container)
  if (lines.length === 0) {
    lines = editorElement.querySelectorAll(
      '[class*="lines-content"] [class*="view-line"]',
    );
    if (lines.length > 0) {
      log.debug('extractCodeFromEditor: using fallback selector lines-content');
    }
  }

  const codeLines = [];
  log.debug('extractCodeFromEditor: found', lines.length, 'view-lines');

  if (lines.length === 0) {
    // Last resort: try to get any text content from the editor
    log.warn(
      'extractCodeFromEditor: no view-lines found, using innerText fallback',
    );
    const inputArea = editorElement.querySelector('.inputarea');
    if (inputArea) {
      return inputArea.textContent?.replace(/\u00a0/g, ' ') || '';
    }
    return editorElement.innerText?.replace(/\u00a0/g, ' ') || '';
  }

  // Optimization: Pre-compute top values and check if already sorted (fabric-format-su3)
  // Monaco doesn't guarantee DOM order = visual order, but often lines ARE in order
  const linesArray = Array.from(lines);
  const topValues = linesArray.map((line) => parseFloat(line.style.top) || 0);

  // Check if already sorted by comparing adjacent pairs
  let needsSort = false;
  for (let i = 1; i < topValues.length; i++) {
    if (topValues[i] < topValues[i - 1]) {
      needsSort = true;
      break;
    }
  }

  let sortedLines;
  if (needsSort) {
    // Create index array and sort by pre-computed top values
    const indices = linesArray.map((_, i) => i);
    indices.sort((a, b) => topValues[a] - topValues[b]);
    sortedLines = indices.map((i) => linesArray[i]);
  } else {
    sortedLines = linesArray;
  }

  // Optimization: Use children iteration instead of querySelectorAll (fabric-format-0vn)
  // and defer nbsp replacement to end (fabric-format-ocr)
  for (const line of sortedLines) {
    let lineText = '';
    let hasSpans = false;

    // Monaco structure is typically: .view-line > span > span (for syntax highlighting)
    for (const child of line.children) {
      if (child.tagName === 'SPAN') {
        for (const span of child.children) {
          if (span.tagName === 'SPAN') {
            lineText += span.textContent;
            hasSpans = true;
          }
        }
        // Also get direct text content from child span if no nested spans
        if (!hasSpans && child.textContent) {
          lineText += child.textContent;
          hasSpans = true;
        }
      }
    }

    // Fallback if no spans found
    if (!hasSpans) {
      lineText = line.textContent;
    }

    codeLines.push(lineText);
  }

  // Single nbsp replacement at the end (fabric-format-ocr)
  const rawCode = codeLines.join('\n');
  const code = rawCode.includes('\u00a0')
    ? rawCode.replaceAll('\u00a0', ' ')
    : rawCode;

  log.debug(
    'extractCodeFromEditor: extracted',
    codeLines.length,
    'lines,',
    code.length,
    'chars',
  );
  return code;
}

async function setCodeViaPaste(editorElement, codeToInsert) {
  log.debug('setCodeViaPaste: inserting', codeToInsert.length, 'chars');
  try {
    // Scroll the editor into view first to ensure it's not virtualized
    editorElement.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((r) => setTimeout(r, TIMING.SCROLL_SETTLE_MS));

    // Verify the editor is still valid after scrolling
    if (!editorElement.isConnected) {
      log.error('Editor element disconnected after scroll');
      return false;
    }

    const textarea = editorElement.querySelector('textarea.inputarea');
    if (!textarea) {
      log.error('No textarea found in editor');
      return false;
    }

    textarea.focus();
    await new Promise((r) => setTimeout(r, TIMING.DOM_SETTLE_MS));

    textarea.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'a',
        code: 'KeyA',
        keyCode: 65,
        which: 65,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await new Promise((r) => setTimeout(r, TIMING.DOM_SETTLE_MS));

    if (
      document.activeElement !== textarea &&
      !editorElement.contains(document.activeElement)
    ) {
      log.error('Focus lost during paste - aborting');
      return false;
    }

    await navigator.clipboard.writeText(codeToInsert);

    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer(),
    });
    pasteEvent.clipboardData.setData('text/plain', codeToInsert);
    textarea.dispatchEvent(pasteEvent);

    log.debug('setCodeViaPaste: paste dispatched successfully');
    return true;
  } catch (error) {
    log.error('Paste failed:', error);
    return false;
  }
}

// ============================================================================
// UI Components
// ============================================================================

let notificationElement = null;

function showOverlay(message) {
  hideOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'fabric-formatter-overlay';
  overlay.innerHTML = `
    <div class="overlay-content">
      <div class="overlay-icon">
        <svg width="64" height="64" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h5.88c.2 0 .39.08.53.22l4.87 4.87c.14.14.22.33.22.53v7.88a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 15.5v-11Zm2.5-1.5A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V8h-3.5A1.5 1.5 0 0 1 11 6.5V3H5.5Zm7 .21V6.5c0 .28.22.5.5.5h3.79L12.5 3.21ZM7 11.5c0-.28.22-.5.5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5Zm.5 1.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z"/>
        </svg>
      </div>
      <div class="overlay-message">${message}</div>
      <div class="overlay-submessage">Please wait...</div>
    </div>
  `;

  document.body.appendChild(overlay);
}

function updateOverlay(message) {
  const overlay = document.getElementById('fabric-formatter-overlay');
  if (overlay) {
    const textDiv = overlay.querySelector('.overlay-message');
    if (textDiv) textDiv.textContent = message;
  }
}

function hideOverlay() {
  const overlay = document.getElementById('fabric-formatter-overlay');
  if (overlay) overlay.remove();
}

function showNotification(message, type = 'success') {
  if (notificationElement) {
    notificationElement.remove();
  }

  const validTypes = ['success', 'warning', 'error'];
  const notificationType = validTypes.includes(type) ? type : 'success';

  notificationElement = document.createElement('div');
  notificationElement.className = `fabric-formatter-notification fabric-formatter-notification--${notificationType}`;

  const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠' : '✕';
  notificationElement.innerHTML = `<span>${icon}</span><span>${message}</span>`;

  document.body.appendChild(notificationElement);

  setTimeout(() => {
    if (notificationElement) {
      notificationElement.remove();
      notificationElement = null;
    }
  }, 4000);
}

// ============================================================================
// Debug: Tabbed Debug Popup (fabric-format-wphq)
// ============================================================================

/**
 * Show a tabbed popup modal with debug output that can be easily copied.
 * @param {Array<{name: string, content: string}>} tabs - Array of tab objects
 */
function showTabbedDebugPopup(tabs) {
  // Remove existing popup if any
  const existing = document.getElementById('fabric-formatter-debug-popup');
  if (existing) existing.remove();
  const existingBackdrop = document.getElementById(
    'fabric-formatter-debug-backdrop',
  );
  if (existingBackdrop) existingBackdrop.remove();

  let activeTabIndex = 0;

  const popup = document.createElement('div');
  popup.id = 'fabric-formatter-debug-popup';
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 700px;
    max-width: 90vw;
    height: 85vh;
    max-height: 900px;
    background: #1e1e1e;
    border: 1px solid #444;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    z-index: 999999;
    display: flex;
    flex-direction: column;
    font-family: 'Consolas', 'Monaco', monospace;
  `;

  // Header with title and close button
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: #2d2d2d;
    border-bottom: 1px solid #444;
    border-radius: 8px 8px 0 0;
  `;

  const title = document.createElement('span');
  title.textContent = 'Fabric Format - Debug';
  title.style.cssText = 'color: #fff; font-weight: bold; font-size: 14px;';

  const headerButtons = document.createElement('div');
  headerButtons.style.cssText = 'display: flex; gap: 8px;';

  const copyBtn = document.createElement('button');
  copyBtn.textContent = '📋 Copy';
  copyBtn.style.cssText = `
    padding: 6px 12px;
    background: #0078d4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    padding: 6px 10px;
    background: #444;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;

  headerButtons.appendChild(copyBtn);
  headerButtons.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(headerButtons);

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.style.cssText = `
    display: flex;
    background: #252526;
    border-bottom: 1px solid #444;
  `;

  const tabButtons = [];
  const contentArea = document.createElement('textarea');
  contentArea.readOnly = true;
  contentArea.style.cssText = `
    flex: 1;
    padding: 16px;
    background: #1e1e1e;
    color: #d4d4d4;
    border: none;
    resize: none;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    line-height: 1.4;
    overflow: auto;
    white-space: pre;
  `;

  function switchTab(index) {
    activeTabIndex = index;
    contentArea.value = tabs[index].content;
    tabButtons.forEach((btn, i) => {
      btn.style.background = i === index ? '#1e1e1e' : '#2d2d2d';
      btn.style.borderBottom =
        i === index ? '2px solid #0078d4' : '2px solid transparent';
      btn.style.color = i === index ? '#fff' : '#888';
    });
  }

  tabs.forEach((tab, index) => {
    const tabBtn = document.createElement('button');
    tabBtn.textContent = tab.name;
    tabBtn.style.cssText = `
      padding: 10px 16px;
      background: #2d2d2d;
      color: #888;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
    `;
    tabBtn.addEventListener('click', () => switchTab(index));
    tabButtons.push(tabBtn);
    tabBar.appendChild(tabBtn);
  });

  // Copy button copies current tab content
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(tabs[activeTabIndex].content);
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => {
        copyBtn.textContent = '📋 Copy';
      }, 2000);
    } catch (_e) {
      copyBtn.textContent = '✕ Failed';
    }
  });

  // Close handlers
  const closePopup = () => {
    popup.remove();
    backdrop.remove();
  };
  closeBtn.addEventListener('click', closePopup);

  popup.appendChild(header);
  popup.appendChild(tabBar);
  popup.appendChild(contentArea);

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'fabric-formatter-debug-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 999998;
  `;
  backdrop.addEventListener('click', closePopup);

  document.body.appendChild(backdrop);
  document.body.appendChild(popup);

  // Initialize first tab
  switchTab(0);
  contentArea.focus();
}

/**
 * Generate cell discovery debug content
 */
function generateCellDiscoveryContent() {
  const lines = [];
  const addLine = (text = '') => lines.push(text);
  const addSection = (title) => {
    addLine('='.repeat(80));
    addLine(title);
    addLine('='.repeat(80));
  };
  const addSubSection = (title) => {
    addLine('-'.repeat(80));
    addLine(title);
    addLine('-'.repeat(80));
  };

  addSection('CELL DISCOVERY DEBUG - fabric-format-wphq');
  addLine(`Timestamp: ${new Date().toISOString()}`);
  addLine();

  // Get all nteract cell containers (what formatAllCells uses)
  const cellContainers = document.querySelectorAll(
    '.nteract-cell-container[data-cell-id]',
  );
  addLine(
    `Total .nteract-cell-container[data-cell-id] found: ${cellContainers.length}`,
  );

  // Get all Monaco editors for comparison
  const allEditors = document.querySelectorAll('.monaco-editor');
  addLine(`Total .monaco-editor elements found: ${allEditors.length}`);
  addLine();

  // Build a map of parent containers to group cells
  const containerGroups = new Map();
  const cellDetails = [];

  for (let i = 0; i < cellContainers.length; i++) {
    const cell = cellContainers[i];
    const cellId = cell.getAttribute('data-cell-id');
    const rect = cell.getBoundingClientRect();
    const style = window.getComputedStyle(cell);

    // Walk up the DOM looking for notebook-level containers
    let parent = cell.parentElement;
    const ancestors = [];
    let notebookContainer = null;

    while (parent && parent !== document.body) {
      const classes = parent.className || '';
      const id = parent.id || '';
      const dataAttrs = Array.from(parent.attributes)
        .filter((a) => a.name.startsWith('data-'))
        .map((a) => `${a.name}="${a.value}"`)
        .join(' ');

      // Look for potential notebook container markers
      const isNotebookContainer =
        classes.includes('notebook') ||
        classes.includes('Notebook') ||
        classes.includes('cell-list') ||
        classes.includes('cellList') ||
        id.includes('notebook') ||
        id.includes('Notebook');

      if (isNotebookContainer && !notebookContainer) {
        notebookContainer = {
          tagName: parent.tagName,
          id: id || '(none)',
          classes:
            classes.substring(0, 100) + (classes.length > 100 ? '...' : ''),
          dataAttrs: dataAttrs || '(none)',
        };
      }

      // Track all ancestors with meaningful identifiers
      if (classes || id || dataAttrs) {
        ancestors.push({
          tagName: parent.tagName,
          id: id || '(none)',
          classes:
            classes.substring(0, 80) + (classes.length > 80 ? '...' : ''),
          dataAttrs:
            dataAttrs.substring(0, 80) + (dataAttrs.length > 80 ? '...' : ''),
        });
      }

      parent = parent.parentElement;
    }

    // Group by the notebook container
    const containerKey = notebookContainer
      ? `${notebookContainer.tagName}#${notebookContainer.id}.${notebookContainer.classes.substring(0, 30)}`
      : 'NO_CONTAINER';

    if (!containerGroups.has(containerKey)) {
      containerGroups.set(containerKey, []);
    }
    containerGroups.get(containerKey).push(i);

    // Get editor inside this cell
    const editor = cell.querySelector('.monaco-editor');
    const cellType = editor ? detectCellType(editor) : 'no-editor';
    const language = editor ? mapCellTypeToLanguage(cellType) : null;

    cellDetails.push({
      index: i,
      cellId,
      visible: rect.width > 0 && rect.height > 0,
      display: style.display,
      visibility: style.visibility,
      hasEditor: !!editor,
      cellType,
      language,
      rect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      notebookContainer,
      ancestors: ancestors.slice(0, 5), // First 5 ancestors
    });
  }

  // Log grouped cells
  addSubSection('CELLS GROUPED BY CONTAINER');
  for (const [containerKey, indices] of containerGroups.entries()) {
    addLine(`Container: ${containerKey}`);
    addLine(`  Cell indices: [${indices.join(', ')}]`);
    addLine(`  Cell count: ${indices.length}`);
    addLine();
  }

  // Log individual cell details
  addSubSection('INDIVIDUAL CELL DETAILS');
  for (const detail of cellDetails) {
    addLine(`Cell ${detail.index}:`);
    addLine(`  cellId: ${detail.cellId}`);
    addLine(
      `  visible: ${detail.visible}, display: ${detail.display}, visibility: ${detail.visibility}`,
    );
    addLine(
      `  hasEditor: ${detail.hasEditor}, cellType: ${detail.cellType}, language: ${detail.language}`,
    );
    addLine(
      `  rect: top=${detail.rect.top}, left=${detail.rect.left}, width=${detail.rect.width}, height=${detail.rect.height}`,
    );
    if (detail.notebookContainer) {
      addLine(
        `  notebookContainer: ${detail.notebookContainer.tagName}#${detail.notebookContainer.id}`,
      );
      addLine(`    classes: ${detail.notebookContainer.classes}`);
      addLine(`    dataAttrs: ${detail.notebookContainer.dataAttrs}`);
    }
    addLine(`  ancestors (first 5):`);
    for (const anc of detail.ancestors) {
      addLine(
        `    ${anc.tagName}#${anc.id} classes="${anc.classes}" ${anc.dataAttrs}`,
      );
    }
    addLine();
  }

  // Look for potential active notebook markers
  addSubSection('POTENTIAL ACTIVE NOTEBOOK MARKERS');

  const potentialActiveMarkers = [
    '[aria-selected="true"]',
    '[data-active="true"]',
    '[data-selected="true"]',
    '.active',
    '.selected',
    '[class*="active"]',
    '[class*="Active"]',
    '[class*="selected"]',
    '[class*="Selected"]',
    '[class*="focus"]',
    '[class*="Focus"]',
  ];

  for (const selector of potentialActiveMarkers) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const relevant = Array.from(elements).filter((el) => {
          return (
            el.querySelector('.monaco-editor') ||
            el.querySelector('.nteract-cell-container') ||
            el.closest('[class*="notebook"]') ||
            el.closest('[class*="Notebook"]')
          );
        });
        if (relevant.length > 0) {
          addLine(`Selector: ${selector}`);
          addLine(
            `  Total matches: ${elements.length}, Notebook-related: ${relevant.length}`,
          );
          for (const el of relevant.slice(0, 3)) {
            addLine(
              `  Element: ${el.tagName}#${el.id || '(none)'} classes="${(el.className || '').substring(0, 80)}"`,
            );
          }
          addLine();
        }
      }
    } catch (_e) {
      // Invalid selector, skip
    }
  }

  // Check document.activeElement and its ancestors
  addSubSection('ACTIVE ELEMENT HIERARCHY');
  let activeEl = document.activeElement;
  let depth = 0;
  while (activeEl && activeEl !== document.body && depth < 15) {
    addLine(
      `Depth ${depth}: ${activeEl.tagName}#${activeEl.id || '(none)'} classes="${(activeEl.className || '').substring(0, 80)}"`,
    );
    activeEl = activeEl.parentElement;
    depth++;
  }
  addLine();

  // Check visibility of iframes if present
  addSubSection('IFRAME/FRAME INFO');
  addLine(`isTop: ${window === window.top}`);
  addLine(`name: ${window.name || '(none)'}`);
  addLine(`location: ${window.location.href.substring(0, 150)}`);
  addLine();

  // Status bar info
  addSubSection('STATUS BAR INFO');
  const statusBar = findStatusBar();
  if (statusBar) {
    const cellSelectionBtn = statusBar.querySelector(
      'button[name="CellSelection"]',
    );
    if (cellSelectionBtn) {
      addLine(`CellSelection button text: "${cellSelectionBtn.textContent}"`);
    }
    addLine(`Status bar tagName: ${statusBar.tagName}`);
    addLine(
      `Status bar classes: ${(statusBar.className || '').substring(0, 80)}`,
    );
  } else {
    addLine('Status bar: NOT FOUND');
  }

  addLine();
  addSection('END CELL DISCOVERY DEBUG');

  return lines.join('\n');
}

/**
 * Scroll to a cell, focus its editor, and wait for Monaco content to stabilize.
 * Monaco virtualizes content, so we must scroll and wait for text to settle.
 *
 * =========================================================================
 * CRITICAL: Monaco Lazy-Loading Text Stabilization
 * =========================================================================
 * DO NOT REMOVE OR SIMPLIFY THIS FUNCTION without understanding fabric-format-ska.
 *
 * Monaco + Fabric lazy-loads cell content in stages:
 *   1. Cell container exists in DOM (but may be virtualized/empty)
 *   2. After scroll: .view-line divs are created (but empty!)
 *   3. After focus: Text spans begin populating ASYNCHRONOUSLY
 *   4. Text content arrives incrementally over multiple frames
 *
 * We MUST wait for text to stabilize because:
 *   - Line count is NOT a reliable proxy (empty divs exist before text)
 *   - Text length changes as spans load (100 chars → 150 → 200...)
 *   - Only full text extraction + comparison detects true completion
 *
 * Previous attempts to "optimize" this by reducing checks or using proxies
 * resulted in partial text capture and corrupted formatting. See:
 *   - fabric-format-ska: Original bug report
 *   - fabric-format-ot3: Performance audit with context
 *
 * SAFE optimizations: Make extractCodeFromEditor() faster (it's called often)
 * UNSAFE: Reducing stableChecks, using line count, shortening timeouts
 * =========================================================================
 *
 * @param {Element} cellContainer - The cell container element
 * @param {number} cellIndex - 0-based cell index (for logging)
 * @returns {Promise<{editor: Element|null, code: string, language: string|null, stabilizationMs: number}>}
 */
async function scrollAndStabilizeCell(cellContainer, cellIndex) {
  const startTime = performance.now();

  // Scroll to cell to ensure content is loaded (Monaco virtualizes)
  cellContainer.scrollIntoView({ block: 'center', behavior: 'instant' });
  await new Promise((r) => setTimeout(r, TIMING.SCROLL_SETTLE_MS));

  // Focus the editor to trigger Monaco to load content
  let editor = cellContainer.querySelector('.monaco-editor');
  if (editor) {
    const textarea = editor.querySelector('textarea.inputarea');
    if (textarea) {
      textarea.focus();
      await new Promise((r) => setTimeout(r, TIMING.DOM_SETTLE_MS));
    }
  }

  // Re-query editor after scroll (Fabric may recreate DOM elements)
  editor = cellContainer.querySelector('.monaco-editor');

  if (!editor) {
    return {
      editor: null,
      code: '',
      language: null,
      stabilizationMs: Math.round(performance.now() - startTime),
    };
  }

  // =========================================================================
  // CRITICAL: Wait for Monaco text to stabilize (3 consecutive stable reads)
  // DO NOT REMOVE OR SIMPLIFY THIS SECTION
  // =========================================================================
  let lastExtractedText = '';
  let stableChecks = 0;

  // Early exit optimization: check if content is already stable
  const initialText = extractCodeFromEditor(editor);
  if (initialText.length > 0) {
    await new Promise((r) => setTimeout(r, TIMING.EDITOR_LINE_POLL_MS));
    const verifyText = editor ? extractCodeFromEditor(editor) : '';
    if (verifyText === initialText && verifyText.length > 0) {
      // Already stable - skip the full loop
      lastExtractedText = verifyText;
      stableChecks = 3;
      log.debug(
        `Cell ${cellIndex + 1}: early exit - already stable at ${verifyText.length} chars`,
      );
    } else {
      // Not stable yet, initialize for the loop
      lastExtractedText = verifyText;
      stableChecks =
        verifyText === initialText && verifyText.length > 0 ? 1 : 0;
    }
  }

  // Adaptive polling: start fast (30ms), slow down after first stable reading
  let pollInterval = TIMING.EDITOR_LINE_POLL_MS;

  for (let attempt = 0; attempt < 100 && stableChecks < 3; attempt++) {
    await new Promise((r) => setTimeout(r, pollInterval));

    // Re-query editor only if disconnected (fabric-format-8hk)
    // Monaco/Fabric may recreate DOM elements during virtualization
    if (!editor?.isConnected) {
      editor = cellContainer.querySelector('.monaco-editor');
    }
    if (editor) {
      const currentText = extractCodeFromEditor(editor);
      const lengthMatch = currentText.length === lastExtractedText.length;
      if (
        currentText.length > 0 &&
        lengthMatch &&
        currentText === lastExtractedText
      ) {
        stableChecks++;
        // Adaptive: slow down after first stable reading
        if (stableChecks === 1) {
          pollInterval = Math.min(pollInterval * 1.5, 100);
        }
        if (stableChecks >= 3) {
          log.debug(
            `Cell ${cellIndex + 1}: stable at ${currentText.length} chars after ${Math.round(performance.now() - startTime)}ms`,
          );
          break;
        }
      } else {
        // Text changed - reset stability counter, go back to fast polling
        stableChecks = 0;
        pollInterval = TIMING.EDITOR_LINE_POLL_MS;
        lastExtractedText = currentText;
      }
    }
  }

  const cellType = detectCellType(editor);
  const language = mapCellTypeToLanguage(cellType);

  return {
    editor,
    code: lastExtractedText,
    language,
    stabilizationMs: Math.round(performance.now() - startTime),
  };
}

/**
 * Generate format preview content showing current vs formatted text for each cell.
 * Uses shared scrollAndStabilizeCell for proper Monaco content loading.
 */
async function generateFormatPreviewContent() {
  const lines = [];
  const addLine = (text = '') => lines.push(text);
  const addSection = (title) => {
    addLine('='.repeat(80));
    addLine(title);
    addLine('='.repeat(80));
  };
  const addSubSection = (title) => {
    addLine('-'.repeat(80));
    addLine(title);
    addLine('-'.repeat(80));
  };

  addSection('FORMAT PREVIEW');
  addLine(`Timestamp: ${new Date().toISOString()}`);
  addLine();

  // Ensure formatters are initialized
  if (!pythonInitialized) {
    const initialized = await initializeFormatters();
    if (!initialized) {
      addLine('ERROR: Failed to initialize formatters');
      return lines.join('\n');
    }
  }

  // Get visible cells only (active notebook)
  const allCellContainers = document.querySelectorAll(
    '.nteract-cell-container[data-cell-id]',
  );
  const cellContainers = Array.from(allCellContainers).filter((cell) => {
    const style = window.getComputedStyle(cell);
    return style.visibility !== 'hidden';
  });

  addLine(`Total cells in active notebook: ${cellContainers.length}`);
  addLine();

  // Capture scroll position to restore later
  const scrollContainer = findScrollContainer();
  const originalScroll = scrollContainer?.scrollTop || 0;

  let formattableCount = 0;
  let wouldChangeCount = 0;
  let alreadyFormattedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < cellContainers.length; i++) {
    const cellContainer = cellContainers[i];
    const cellId = cellContainer.getAttribute('data-cell-id');

    addSubSection(`CELL ${i + 1}`);
    addLine(`Cell ID: ${cellId}`);

    // Use shared scroll+stabilize logic
    const { editor, code, language, stabilizationMs } =
      await scrollAndStabilizeCell(cellContainer, i);

    if (!editor) {
      addLine(`Type: no-editor (markdown/output cell)`);
      addLine(`Status: SKIPPED`);
      addLine();
      continue;
    }

    const cellType = detectCellType(editor);
    addLine(`Detected Type: ${cellType}`);
    addLine(`Language: ${language || 'unsupported'}`);
    addLine(`Stabilization: ${stabilizationMs}ms`);

    if (!language) {
      addLine(`Status: SKIPPED (unsupported language)`);
      addLine();
      continue;
    }

    formattableCount++;

    if (!code.trim()) {
      addLine(`Status: SKIPPED (empty cell)`);
      addLine();
      continue;
    }

    addLine(
      `Current Code (${code.length} chars, ${code.split('\n').length} lines):`,
    );
    addLine('```');
    addLine(code);
    addLine('```');
    addLine();

    // Format the code (without applying)
    const context = { cellIndex: i + 1, language };
    const result = formatCell(code, language, context);

    if (result.error) {
      errorCount++;
      addLine(`Status: ERROR`);
      addLine(`Error: ${result.error}`);
    } else if (!result.changed) {
      alreadyFormattedCount++;
      addLine(`Status: ALREADY FORMATTED ✓`);
    } else {
      wouldChangeCount++;
      addLine(`Status: WOULD CHANGE`);
      addLine();
      addLine(
        `Formatted Code (${result.formatted.length} chars, ${result.formatted.split('\n').length} lines):`,
      );
      addLine('```');
      addLine(result.formatted);
      addLine('```');
    }
    addLine();
  }

  // Restore scroll position
  if (scrollContainer) {
    scrollContainer.scrollTop = originalScroll;
  }

  addSection('SUMMARY');
  addLine(`Total cells: ${cellContainers.length}`);
  addLine(`Formattable cells: ${formattableCount}`);
  addLine(`Would change: ${wouldChangeCount}`);
  addLine(`Already formatted: ${alreadyFormattedCount}`);
  addLine(`Errors: ${errorCount}`);
  addLine();
  addSection('END FORMAT PREVIEW');

  return lines.join('\n');
}

/**
 * Main debug function - shows tabbed popup with all debug info
 */
async function debugLogCellDiscovery() {
  // Generate cell discovery content (sync)
  const cellDiscoveryContent = generateCellDiscoveryContent();

  // Show popup immediately with cell discovery, then load format preview
  const tabs = [
    { name: '📋 Cell Discovery', content: cellDiscoveryContent },
    { name: '🔄 Format Preview', content: 'Loading format preview...' },
  ];

  showTabbedDebugPopup(tabs);

  // Generate format preview async and update tab
  const formatPreviewContent = await generateFormatPreviewContent();
  tabs[1].content = formatPreviewContent;
}

// ============================================================================
// Format Actions
// ============================================================================

/**
 * Format the current cell
 */
async function _formatCurrentCell() {
  const cell = findActiveCell();
  if (!cell) {
    showNotification('No active cell found. Click in a cell first.', 'warning');
    return;
  }

  const cellType = detectCellType(cell);
  const language = mapCellTypeToLanguage(cellType);

  log.debug('formatCurrentCell - cellType:', cellType, 'language:', language);

  if (!language) {
    showNotification(
      `Cell type "${cellType}" not supported. Only Python and SparkSQL are supported.`,
      'warning',
    );
    return;
  }

  // Ensure formatters are initialized
  if (!pythonInitialized) {
    const initialized = await initializeFormatters();
    if (!initialized) {
      // Error notification already shown by initializeFormatters
      return;
    }
  }

  const originalCode = extractCodeFromEditor(cell);
  if (!originalCode.trim()) {
    showNotification('Cell is empty', 'warning');
    return;
  }

  // Determine cell index for error context (only count visible cells from active notebook)
  const cellContainer = cell.closest('.nteract-cell-container[data-cell-id]');
  const allCells = document.querySelectorAll(
    '.nteract-cell-container[data-cell-id]',
  );
  // Filter to visible cells only (active notebook) - fabric-format-wphq
  const visibleCells = Array.from(allCells).filter((c) => {
    const style = window.getComputedStyle(c);
    return style.visibility !== 'hidden';
  });
  const cellIndex = cellContainer
    ? visibleCells.indexOf(cellContainer) + 1
    : undefined;

  log.debug(
    'formatCurrentCell - code length:',
    originalCode.length,
    'pythonInitialized:',
    pythonInitialized,
  );
  log.debug('formatCurrentCell - originalCode:', JSON.stringify(originalCode));

  // Create context for error messages
  const context = { cellIndex, language };

  const result = formatCell(originalCode, language, context);

  log.debug('formatCurrentCell - result:', {
    changed: result.changed,
    error: result.error,
    formattedLength: result.formatted?.length,
  });
  log.debug('formatCurrentCell - formatted:', JSON.stringify(result.formatted));

  if (result.error) {
    showNotification(`Format failed: ${result.error}`, 'error');
    return;
  }

  // Optimization (fabric-format-h6v): use result.changed instead of string comparison
  if (!result.changed) {
    showNotification('Already formatted', 'success');
    return;
  }

  const success = await setCodeViaPaste(cell, result.formatted);
  if (success) {
    showNotification('Formatted!', 'success');
  } else {
    showNotification('Failed to apply changes', 'error');
  }
}

/**
 * Format all cells in the notebook
 */
async function formatAllCells() {
  showOverlay('Initializing...');

  // Initialize formatters
  const initialized = await initializeFormatters();
  if (!initialized) {
    hideOverlay();
    // Error notification already shown by initializeFormatters
    return;
  }

  // Get all cell containers from the ACTIVE notebook only (fabric-format-wphq)
  // When multiple notebooks are open, inactive notebooks have visibility: hidden
  const allCellContainers = document.querySelectorAll(
    '.nteract-cell-container[data-cell-id]',
  );
  const cellContainers = Array.from(allCellContainers).filter((cell) => {
    const style = window.getComputedStyle(cell);
    return style.visibility !== 'hidden';
  });
  const totalCells = cellContainers.length;

  log.debug(
    `formatAllCells: found ${allCellContainers.length} total cells, ${totalCells} visible (active notebook)`,
  );

  if (totalCells === 0) {
    hideOverlay();
    showNotification('No cells found', 'warning');
    return;
  }

  // Capture scroll position using the same function we use elsewhere
  const scrollContainer = findScrollContainer();
  const originalScroll = scrollContainer?.scrollTop || 0;
  log.debug('formatAllCells: captured scroll position', originalScroll);

  let formatted = 0;
  let alreadyFormatted = 0;
  let failed = 0;
  let _skipped = 0;
  const failedCells = []; // Track which cells failed for user feedback

  // Single pass: scroll to each cell, extract, format, apply
  for (let i = 0; i < cellContainers.length; i++) {
    const cellContainer = cellContainers[i];
    updateOverlay(`Processing cell ${i + 1}/${totalCells}...`);

    // Use shared scroll+stabilize logic to get stable cell content
    const {
      editor,
      code: originalCode,
      language,
    } = await scrollAndStabilizeCell(cellContainer, i);

    if (!editor) {
      _skipped++;
      continue;
    }

    if (!language) {
      _skipped++;
      continue;
    }

    if (!originalCode.trim()) {
      _skipped++;
      continue;
    }

    // Create context for error messages (1-based cell index)
    const context = { cellIndex: i + 1, language };

    // Format with context
    const result = formatCell(originalCode, language, context);

    if (result.error) {
      log.warn(`Format error on cell ${i + 1}:`, result.error);
      failedCells.push(i + 1);
      failed++;
      continue;
    }

    // Optimization (fabric-format-h6v): use result.changed instead of string comparison
    if (!result.changed) {
      alreadyFormatted++;
      continue;
    }

    // Apply the formatted code
    const success = await setCodeViaPaste(editor, result.formatted);
    if (!success) {
      failedCells.push(i + 1);
      failed++;
      continue;
    }

    formatted++;
    await new Promise((r) => setTimeout(r, TIMING.DOM_SETTLE_MS));
  }

  // Restore scroll position
  if (scrollContainer) {
    scrollContainer.scrollTop = originalScroll;
    log.debug('formatAllCells: restored scroll position to', originalScroll);
  }

  hideOverlay();

  // Small delay to let scroll settle before showing notification
  await new Promise((r) => setTimeout(r, TIMING.SCROLL_SETTLE_MS));

  // Show summary with failed cell numbers if any
  const parts = [];
  if (formatted > 0) parts.push(`${formatted} formatted`);
  if (alreadyFormatted > 0) parts.push(`${alreadyFormatted} already clean`);
  if (failed > 0) {
    const cellList =
      failedCells.length <= 3
        ? failedCells.join(', ')
        : `${failedCells.slice(0, 3).join(', ')}...`;
    parts.push(`${failed} failed (cells: ${cellList})`);
  }

  const message = parts.join(', ') || 'No changes needed';
  const type = failed > 0 ? 'warning' : 'success';
  showNotification(message, type);
}

// ============================================================================
// Floating Button
// ============================================================================

function isIframeActive() {
  if (document.hidden || document.visibilityState === 'hidden') {
    return false;
  }

  const body = document.body;
  if (!body || body.offsetWidth === 0 || body.offsetHeight === 0) {
    return false;
  }

  const style = window.getComputedStyle(body);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  // Check if this iframe is actually visible (not a background notebook tab)
  // Look for the status bar which only appears in the active notebook view
  const statusBar = findStatusBar();
  if (!statusBar) {
    return false;
  }

  return true;
}

/**
 * Find the Fabric status bar element
 * Returns null if not found
 */
function findStatusBar() {
  // Try multiple selectors - Fabric's class names can change
  return (
    document.querySelector('div[class*="___fr9w3r0"]') ||
    document.querySelector('div.f1pha7fy.f1ewtqcl.f5ogflp') ||
    document.querySelector('div[class*="f1pha7fy"][class*="f1ewtqcl"]') ||
    // Additional fallback: look for the status bar by structure (contains CellSelection button)
    document.querySelector('button[name="CellSelection"]')?.parentElement
  );
}

function createFloatingButton() {
  if (!isIframeActive()) {
    return false;
  }

  const existing = document.getElementById('fabric-formatter-button');
  if (existing) {
    if (existing.isConnected && existing.offsetParent !== null) {
      return true; // Already exists and is valid
    }
    existing.remove();
  }

  const statusBar = findStatusBar();

  if (statusBar) {
    if (statusBar.querySelector('button[name="FormatCells"]')) {
      return true; // Already has our button
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.name = 'FormatCells';
    button.id = 'fabric-formatter-button';
    button.className = 'fui-Button r1alrhcs';
    button.setAttribute('aria-label', 'Format all cells');
    button.title = 'Format all cells';

    button.innerHTML = `
      <span class="fui-Button__icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h5.88c.2 0 .39.08.53.22l3.87 3.87c.14.14.22.33.22.53v6.88A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-10Zm1.5-.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V7h-2.5A1.5 1.5 0 0 1 9 5.5V3H3.5ZM10 3.2V5.5a.5.5 0 0 0 .5.5h2.3L10 3.2ZM5 9.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5Zm.5 1.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z"/>
        </svg>
      </span>
      <span>Format</span>`;

    // Ctrl+click shows debug info, normal click formats (fabric-format-wphq)
    button.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        debugLogCellDiscovery();
      } else {
        formatAllCells();
      }
    });

    const cellSelectionButton = statusBar.querySelector(
      'button[name="CellSelection"]',
    );
    if (cellSelectionButton) {
      statusBar.insertBefore(button, cellSelectionButton);
    } else {
      statusBar.appendChild(button);
    }

    log.info('Button injected into status bar');
    return true;
  }

  log.debug('Status bar not found, will retry later');
  return false;
}

/**
 * Wait for status bar to appear with exponential backoff
 * Short timeout for iframes - if no status bar quickly, this isn't the active notebook
 */
async function waitForStatusBarAndInject(
  maxWaitMs = TIMING.STATUS_BAR_TIMEOUT_MS,
) {
  const startTime = Date.now();
  let delay = TIMING.INITIAL_BACKOFF_MS;
  const maxDelay = TIMING.MAX_BACKOFF_MS;

  while (Date.now() - startTime < maxWaitMs) {
    if (createFloatingButton()) {
      return true;
    }

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, maxDelay);
  }

  log.debug('No status bar found - this iframe is not the active notebook');
  return false;
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Gather all distinguishing details about this frame for debugging
 */
function getFrameDetails() {
  const url = new URL(window.location.href);
  return {
    // URL info
    hostname: url.hostname,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    // URL params
    urlParams: Object.fromEntries(url.searchParams.entries()),
    // Frame info
    isTop: window === window.top,
    frameDepth: (() => {
      let depth = 0;
      let win = window;
      while (win !== win.top) {
        depth++;
        win = win.parent;
      }
      return depth;
    })(),
    frameName: window.name || '(none)',
    // Document info
    readyState: document.readyState,
    title: document.title || '(none)',
    bodyClasses: document.body?.className || '(none)',
    // Key elements
    hasMonacoEditors: document.querySelectorAll('.monaco-editor').length,
    hasStatusBar: !!document.querySelector(
      '[class*="status-bar"], [class*="statusbar"], [class*="StatusBar"]',
    ),
    hasNotebookContainer: !!document.querySelector(
      '[class*="notebook"], [class*="Notebook"]',
    ),
    // Dimensions
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    // Visibility
    documentHidden: document.hidden,
    visibilityState: document.visibilityState,
  };
}

function init() {
  const hostname = window.location.hostname;
  const isTop = window === window.top;
  const urlParams = new URLSearchParams(window.location.search);
  const iframeType = urlParams.get('__iframeType');

  // Log entry point for debugging
  log.info('Content script loaded:', { hostname, isTop, iframeType });

  // Only run in the "page" iframe - that's where the notebook UI lives
  // Skip: top frame, worker iframes, non-pbides iframes
  if (isTop) {
    log.debug('Skipping top frame');
    return;
  }

  if (!hostname.includes('pbides')) {
    log.debug('Skipping non-pbides iframe:', hostname);
    return;
  }

  if (iframeType === 'worker') {
    log.debug('Skipping worker iframe');
    return;
  }

  log.debug('Init starting:', getFrameDetails());

  setupEditorFocusTracking();

  // Quick check: does this iframe have editors? Check a few times with short delays.
  // If no editors after ~3 seconds, this isn't the notebook iframe - give up.
  const checkForEditors = async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const editorCount = document.querySelectorAll('.monaco-editor').length;
      if (editorCount > 0) {
        log.debug(
          '✓ WINNER - Found',
          editorCount,
          'editors on attempt',
          attempt,
        );
        log.debug('✓ WINNER frame details:', getFrameDetails());

        const success = await waitForStatusBarAndInject();
        log.info('Ready - button injected:', success);
        return;
      }
      // Wait between checks (total ~2.5 seconds)
      await new Promise((r) => setTimeout(r, TIMING.EDITOR_CHECK_INTERVAL_MS));
    }
    log.debug(
      '✗ LOSER - No editors found, giving up. Frame details:',
      getFrameDetails(),
    );
  };

  // Start checking once document is ready
  if (document.readyState === 'complete') {
    checkForEditors();
  } else {
    window.addEventListener('load', checkForEditors);
  }

  document.addEventListener('visibilitychange', () => {
    const button = document.getElementById('fabric-formatter-button');
    const active = isIframeActive();
    const editorCount = document.querySelectorAll('.monaco-editor').length;

    if (active) {
      if (!button && editorCount > 0) {
        createFloatingButton();
      }
    } else {
      if (button) {
        button.remove();
      }
    }
  });

  let lastActiveState = null;
  trackInterval(
    setInterval(() => {
      const button = document.getElementById('fabric-formatter-button');
      const active = isIframeActive();
      const editorCount = document.querySelectorAll('.monaco-editor').length;

      const buttonIsValid = button?.isConnected && button.offsetParent !== null;

      if (active !== lastActiveState) {
        lastActiveState = active;
      }

      if (active && !buttonIsValid && editorCount > 0) {
        createFloatingButton();
      } else if (!active && button) {
        button.remove();
      }
    }, TIMING.BUTTON_POLL_INTERVAL_MS),
  );

  // Debounced handler for mutation observer - prevents excessive DOM queries
  const handleMutations = debounce(() => {
    const button = document.getElementById('fabric-formatter-button');
    const buttonIsValid = button?.isConnected && button.offsetParent !== null;

    if (!buttonIsValid && isIframeActive()) {
      const editorCount = document.querySelectorAll('.monaco-editor').length;
      if (editorCount > 0) {
        // Check if status bar was just added
        const statusBar = findStatusBar();
        if (
          statusBar &&
          !statusBar.querySelector('button[name="FormatCells"]')
        ) {
          createFloatingButton();
        }
      }
    }
  }, 250); // 250ms debounce delay

  const observer = trackObserver(new MutationObserver(handleMutations));

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Pre-initialize formatters in background
  initializeFormatters();
}

// Start
init();
