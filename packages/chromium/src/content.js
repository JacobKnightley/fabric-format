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
 * @param {number} baseDelayMs - Initial delay between retries in ms (default: 500)
 * @returns {Promise<boolean>} True if initialization succeeded
 */
async function initializeFormatters(maxRetries = 3, baseDelayMs = 500) {
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
 */
function findScrollContainer() {
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
      return container;
    }
  }

  if (scrollables.length > 0) {
    return scrollables[0];
  }

  return document.scrollingElement || document.documentElement;
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

  const sortedLines = Array.from(lines).sort((a, b) => {
    const topA = parseFloat(a.style.top) || 0;
    const topB = parseFloat(b.style.top) || 0;
    return topA - topB;
  });

  for (const line of sortedLines) {
    let lineText = '';
    const spans = line.querySelectorAll('span > span');

    if (spans.length > 0) {
      for (const span of spans) {
        lineText += span.textContent.replace(/\u00a0/g, ' ');
      }
    } else {
      lineText = line.textContent.replace(/\u00a0/g, ' ');
    }

    codeLines.push(lineText);
  }

  const code = codeLines.join('\n');
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
    await new Promise((r) => setTimeout(r, 100));

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
    await new Promise((r) => setTimeout(r, 50));

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
    await new Promise((r) => setTimeout(r, 50));

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
    <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
      <div style="color: #a78bfa;">
        <svg width="64" height="64" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h5.88c.2 0 .39.08.53.22l4.87 4.87c.14.14.22.33.22.53v7.88a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 15.5v-11Zm2.5-1.5A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V8h-3.5A1.5 1.5 0 0 1 11 6.5V3H5.5Zm7 .21V6.5c0 .28.22.5.5.5h3.79L12.5 3.21ZM7 11.5c0-.28.22-.5.5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5Zm.5 1.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z"/>
        </svg>
      </div>
      <div style="font-size: 18px; font-weight: 500;">${message}</div>
      <div style="font-size: 13px; opacity: 0.7;">Please wait...</div>
    </div>
  `;

  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999999;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    backdrop-filter: blur(2px);
  `;

  document.body.appendChild(overlay);
}

function updateOverlay(message) {
  const overlay = document.getElementById('fabric-formatter-overlay');
  if (overlay) {
    const textDiv = overlay.querySelector('div > div:nth-child(2)');
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

  const colors = {
    success: { bg: '#0e4429', border: '#238636', text: '#ffffff' },
    warning: { bg: '#4a3800', border: '#9e6a03', text: '#ffffff' },
    error: { bg: '#4a0e0e', border: '#f85149', text: '#ffffff' },
  };
  const color = colors[type] || colors.success;

  notificationElement = document.createElement('div');
  notificationElement.style.cssText = `
    position: fixed; bottom: 50px; right: 20px; z-index: 1000000;
    background: ${color.bg}; border: 1px solid ${color.border};
    color: ${color.text}; padding: 12px 20px; border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: flex; align-items: center; gap: 8px;
  `;

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

  // Determine cell index for error context
  const cellContainer = cell.closest('.nteract-cell-container[data-cell-id]');
  const allCells = document.querySelectorAll(
    '.nteract-cell-container[data-cell-id]',
  );
  const cellIndex = cellContainer
    ? Array.from(allCells).indexOf(cellContainer) + 1
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

  if (result.formatted === originalCode) {
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

  // Get all cell containers
  const cellContainers = document.querySelectorAll(
    '.nteract-cell-container[data-cell-id]',
  );
  const totalCells = cellContainers.length;

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

    // Always scroll to ensure full content is rendered (Monaco virtualizes tall cells)
    cellContainer.scrollIntoView({ block: 'center', behavior: 'instant' });

    // Wait for editor content to appear (lines render in one shot, not progressively)
    let editor = null;
    let lastLineCount = -1;
    let stableChecks = 0;
    const startTime = performance.now();

    for (let attempt = 0; attempt < 60; attempt++) {
      // Up to 1.8s total
      await new Promise((r) => setTimeout(r, 30)); // Faster polling
      editor = cellContainer.querySelector('.monaco-editor');
      if (editor) {
        const viewLines = editor.querySelectorAll('.view-lines .view-line');
        const currentCount = viewLines.length;

        if (currentCount > 0 && currentCount === lastLineCount) {
          stableChecks++;
          if (stableChecks >= 2) {
            // Only need 2 checks since lines don't change progressively
            log.debug(
              `Cell ${i + 1}: stable at ${currentCount} lines after ${Math.round(performance.now() - startTime)}ms`,
            );
            break;
          }
        } else {
          stableChecks = 0;
          lastLineCount = currentCount;
        }
      }
    }

    if (!editor) {
      _skipped++;
      continue;
    }

    // Use proper language detection
    const cellType = detectCellType(editor);
    const language = mapCellTypeToLanguage(cellType);

    if (!language) {
      _skipped++;
      continue;
    }

    // Extract code
    const originalCode = extractCodeFromEditor(editor);
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

    if (result.formatted === originalCode) {
      alreadyFormatted++;
      continue;
    }

    // Apply the formatted code
    const success = await setCodeViaPaste(editor, result.formatted);
    if (success) {
      formatted++;
    } else {
      failedCells.push(i + 1);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 50));
  }

  // Restore scroll position
  if (scrollContainer) {
    scrollContainer.scrollTop = originalScroll;
    log.debug('formatAllCells: restored scroll position to', originalScroll);
  }

  hideOverlay();

  // Small delay to let scroll settle before showing notification
  await new Promise((r) => setTimeout(r, 100));

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
    button.setAttribute('aria-label', 'Format all Python and SQL cells');
    button.title = 'Format all cells (Python & SQL)';
    button.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 0 8px;
      height: 26px;
      border: none;
      border-radius: 4px;
      background-color: transparent;
      color: #242424;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      font-weight: 400;
      cursor: pointer;
      transition: background-color 0.1s ease;
      margin-left: auto;
    `;

    button.innerHTML = `
      <span class="fui-Button__icon" style="display: flex; align-items: center; color: #881798;">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h5.88c.2 0 .39.08.53.22l3.87 3.87c.14.14.22.33.22.53v6.88A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-10Zm1.5-.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V7h-2.5A1.5 1.5 0 0 1 9 5.5V3H3.5ZM10 3.2V5.5a.5.5 0 0 0 .5.5h2.3L10 3.2ZM5 9.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5Zm.5 1.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z"/>
        </svg>
      </span>
      <span>Format</span>`;

    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = 'transparent';
    });

    button.addEventListener('click', formatAllCells);

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
async function waitForStatusBarAndInject(maxWaitMs = 5000) {
  const startTime = Date.now();
  let delay = 100;
  const maxDelay = 500;

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
      // Wait 500ms between checks (total ~2.5 seconds)
      await new Promise((r) => setTimeout(r, 500));
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
    }, 500),
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
