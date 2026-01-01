/**
 * Fabric Formatter - Content Script
 * Formats Python and SparkSQL cells in Microsoft Fabric Notebooks
 * Uses @jacobknightley/fabric-format for all formatting
 */

import { formatCell, initializePythonFormatter } from '@jacobknightley/fabric-format';

// ============================================================================
// Debug Logging
// ============================================================================

/**
 * Runtime debug flag - toggle in DevTools console:
 *   window.__fabric_format_debug__ = true   // Enable debug logging
 *   window.__fabric_format_debug__ = false  // Disable debug logging
 */
if (typeof window !== 'undefined' && window.__fabric_format_debug__ === undefined) {
  window.__fabric_format_debug__ = false;
}

const log = {
  /** Always shown - important state changes and results */
  info: (...args) => console.log('[fabric-format]', ...args),
  
  /** Always shown - warnings */
  warn: (...args) => console.warn('[fabric-format]', ...args),
  
  /** Always shown - errors */
  error: (...args) => console.error('[fabric-format]', ...args),
  
  /** Only shown when debug enabled - detailed tracing */
  debug: (...args) => {
    if (window.__fabric_format_debug__) {
      console.log('[fabric-format:debug]', ...args);
    }
  },
};

// Expose for testing (will be accessible via window.__fabric_format)
if (typeof window !== 'undefined') {
  window.__fabric_format = { formatCell };
}

// State
let pythonInitialized = false;
let lastActiveEditor = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the Python formatter with WASM loaded from extension resources
 */
async function initializeFormatters() {
  if (pythonInitialized) return true;
  
  try {
    // Get the WASM URL from extension resources
    const wasmUrl = chrome.runtime.getURL('dist/ruff_wasm_bg.wasm');
    log.debug('WASM URL:', wasmUrl);
    
    await initializePythonFormatter({ wasmUrl });
    pythonInitialized = true;
    log.info('Formatters initialized successfully');
    return true;
  } catch (error) {
    log.error('Failed to initialize formatters:', error);
    return false;
  }
}

// ============================================================================
// Cell Detection
// ============================================================================

/**
 * Detect the language/type of a Monaco editor cell
 */
function detectCellType(editor) {
  if (!editor) return 'unknown';
  
  const modeElement = editor.querySelector('[data-mode-id]') || editor.closest('[data-mode-id]');
  if (modeElement) {
    const mode = modeElement.getAttribute('data-mode-id');
    log.debug('detectCellType: found data-mode-id =', mode);
    return mode;
  }
  
  const classList = editor.className || '';
  const langMatch = classList.match(/lang-(\w+)/);
  if (langMatch) {
    log.debug('detectCellType: found lang- class =', langMatch[1]);
    return langMatch[1];
  }
  
  log.debug('detectCellType: could not determine type, returning unknown');
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
  const containers = document.querySelectorAll('[class*="notebook"], [class*="Notebook"], [class*="cell-list"], [class*="cellList"]');
  
  for (const container of containers) {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    
    const style = window.getComputedStyle(container);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    
    const editors = container.querySelectorAll('.monaco-editor');
    const visibleEditors = Array.from(editors).filter(ed => {
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
      const visibleCount = editors ? Array.from(editors).filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).length : 0;
      
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
  document.addEventListener('focusin', (event) => {
    const editor = event.target.closest('.monaco-editor');
    if (editor && editor !== lastActiveEditor) {
      lastActiveEditor = editor;
    }
  }, true);
  
  document.addEventListener('mousedown', (event) => {
    const editor = event.target.closest('.monaco-editor');
    if (editor && editor !== lastActiveEditor) {
      lastActiveEditor = editor;
    }
  }, true);
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

function findCurrentlyVisibleCells() {
  const cells = [];
  const notebookContainer = findActiveNotebookContainer();
  const searchRoot = notebookContainer || document;
  
  const editors = searchRoot.querySelectorAll('.monaco-editor');
  let skipped = { ownerDoc: 0, zeroSize: 0, hidden: 0, noLanguage: 0 };
  
  for (const editor of editors) {
    if (editor.ownerDocument !== document) { skipped.ownerDoc++; continue; }
    
    const rect = editor.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) { skipped.zeroSize++; continue; }
    
    const style = window.getComputedStyle(editor);
    if (style.display === 'none' || style.visibility === 'hidden') { skipped.hidden++; continue; }
    
    const cellType = detectCellType(editor);
    const language = mapCellTypeToLanguage(cellType);
    
    if (language) {
      cells.push({ editor, cellType, language });
    } else {
      skipped.noLanguage++;
    }
  }
  
  log.debug('findCurrentlyVisibleCells: found', cells.length, 'formattable, skipped:', skipped);
  return cells;
}

/**
 * Get the total cell count from Fabric's UI
 */
function getTotalCellCount() {
  const cellSelectionBtn = document.querySelector('button[name="CellSelection"]');
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
    '[class*="notebookContainer"]'
  ];
  
  for (const selector of knownContainers) {
    const el = document.querySelector(selector);
    if (el && el.scrollHeight > el.clientHeight) {
      return el;
    }
  }
  
  const scrollables = Array.from(document.querySelectorAll('div')).filter(el => {
    const style = window.getComputedStyle(el);
    return (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
           el.scrollHeight > el.clientHeight;
  });
  
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

/**
 * Scroll through the notebook to force lazy-loaded cells to render
 */
async function scrollToLoadAllCells(updateProgress) {
  const totalCells = getTotalCellCount();
  const currentEditors = document.querySelectorAll('.monaco-editor').length;
  
  if (totalCells && currentEditors >= totalCells) {
    log.debug('All cells already loaded, skipping scroll');
    return;
  }

  const scrollContainer = findScrollContainer();
  const originalScrollTop = scrollContainer.scrollTop;
  const scrollHeight = scrollContainer.scrollHeight;
  const clientHeight = scrollContainer.clientHeight;

  if (scrollHeight <= clientHeight) {
    return;
  }

  scrollContainer.scrollTop = 0;
  await new Promise(r => setTimeout(r, 100));

  const scrollStep = clientHeight * 0.8;
  let currentScroll = 0;
  let lastEditorCount = 0;
  let stableCount = 0;

  while (currentScroll < scrollHeight + clientHeight) {
    currentScroll += scrollStep;
    scrollContainer.scrollTop = Math.min(currentScroll, scrollHeight);
    
    await new Promise(r => setTimeout(r, 100));
    
    const currentEditorCount = document.querySelectorAll('.monaco-editor').length;
    
    if (updateProgress) {
      const percent = Math.min(100, Math.round((currentScroll / scrollHeight) * 100));
      updateProgress(`Loading cells... ${percent}% (${currentEditorCount} cells)`);
    }
    
    if (currentEditorCount === lastEditorCount) {
      stableCount++;
      if (stableCount < 3) {
        await new Promise(r => setTimeout(r, 50));
      }
    } else {
      stableCount = 0;
      lastEditorCount = currentEditorCount;
    }
  }

  scrollContainer.scrollTop = scrollHeight;
  await new Promise(r => setTimeout(r, 150));
  
  const finalEditorCount = document.querySelectorAll('.monaco-editor').length;
  
  if (totalCells && finalEditorCount < totalCells) {
    for (let pos = scrollHeight; pos >= 0; pos -= clientHeight * 0.5) {
      scrollContainer.scrollTop = pos;
      await new Promise(r => setTimeout(r, 100));
    }
  }

  scrollContainer.scrollTop = originalScrollTop;
  await new Promise(r => setTimeout(r, 100));
}

// ============================================================================
// Code Extraction & Insertion
// ============================================================================

function extractCodeFromEditor(editorElement) {
  const lines = editorElement.querySelectorAll('.view-lines .view-line');
  const codeLines = [];
  
  log.debug('extractCodeFromEditor: found', lines.length, 'view-lines');
  
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
  log.debug('extractCodeFromEditor: extracted', codeLines.length, 'lines,', code.length, 'chars');
  return code;
}

async function setCodeViaPaste(editorElement, codeToInsert) {
  log.debug('setCodeViaPaste: inserting', codeToInsert.length, 'chars');
  try {
    const textarea = editorElement.querySelector('textarea.inputarea');
    if (!textarea) {
      log.error('No textarea found in editor');
      return false;
    }
    
    textarea.focus();
    await new Promise(r => setTimeout(r, 50));
    
    textarea.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'a', code: 'KeyA', keyCode: 65, which: 65,
      ctrlKey: true, bubbles: true, cancelable: true
    }));
    await new Promise(r => setTimeout(r, 50));
    
    if (document.activeElement !== textarea && !editorElement.contains(document.activeElement)) {
      log.error('Focus lost during paste - aborting');
      return false;
    }
    
    await navigator.clipboard.writeText(codeToInsert);
    
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer()
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
    error: { bg: '#4a0e0e', border: '#f85149', text: '#ffffff' }
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
async function formatCurrentCell() {
  const cell = findActiveCell();
  if (!cell) {
    showNotification('No active cell found. Click in a cell first.', 'warning');
    return;
  }
  
  const cellType = detectCellType(cell);
  const language = mapCellTypeToLanguage(cellType);
  
  log.debug('formatCurrentCell - cellType:', cellType, 'language:', language);
  
  if (!language) {
    showNotification(`Cell type "${cellType}" not supported. Only Python and SparkSQL are supported.`, 'warning');
    return;
  }
  
  // Ensure formatters are initialized
  if (!pythonInitialized) {
    await initializeFormatters();
  }
  
  const originalCode = extractCodeFromEditor(cell);
  if (!originalCode.trim()) {
    showNotification('Cell is empty', 'warning');
    return;
  }
  
  log.debug('formatCurrentCell - code length:', originalCode.length, 'pythonInitialized:', pythonInitialized);
  log.debug('formatCurrentCell - originalCode:', JSON.stringify(originalCode));
  
  const result = formatCell(originalCode, language);
  
  log.debug('formatCurrentCell - result:', { changed: result.changed, error: result.error, formattedLength: result.formatted?.length });
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
  showOverlay('Scanning notebook...');
  
  // Initialize formatters
  await initializeFormatters();
  
  // Scroll through notebook to force lazy-loaded cells to render
  await scrollToLoadAllCells(updateOverlay);
  
  // Now all cells are in the DOM - find them
  const cells = findCurrentlyVisibleCells();
  
  if (cells.length === 0) {
    hideOverlay();
    showNotification('No formattable cells found', 'warning');
    return;
  }
  
  updateOverlay(`Formatting ${cells.length} cell(s)...`);
  
  // Phase 1: Determine which cells need formatting
  const cellsToFormat = [];
  let alreadyFormatted = 0;
  let failed = 0;
  const totalCells = cells.length;
  
  for (let i = 0; i < cells.length; i++) {
    const { editor, language } = cells[i];
    updateOverlay(`Checking cell ${i + 1}/${totalCells}...`);
    
    const originalCode = extractCodeFromEditor(editor);
    if (!originalCode.trim()) continue;
    
    log.debug('formatAllCells - cell', i, 'language:', language);
    log.debug('formatAllCells - originalCode:', JSON.stringify(originalCode));
    
    const result = formatCell(originalCode, language);
    
    log.debug('formatAllCells - result:', { changed: result.changed, error: result.error });
    log.debug('formatAllCells - formatted:', JSON.stringify(result.formatted));
    
    if (result.error) {
      log.warn('Format error on cell', i, ':', result.error);
      failed++;
      continue;
    }
    
    if (result.formatted === originalCode) {
      alreadyFormatted++;
      continue;
    }
    
    cellsToFormat.push({ editor, formattedCode: result.formatted });
  }
  
  // Phase 2: Apply changes
  let formatted = 0;
  
  for (let i = 0; i < cellsToFormat.length; i++) {
    const { editor, formattedCode } = cellsToFormat[i];
    updateOverlay(`Applying formatting ${i + 1}/${cellsToFormat.length}...`);
    
    const success = await setCodeViaPaste(editor, formattedCode);
    if (success) {
      formatted++;
    } else {
      failed++;
    }
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  hideOverlay();
  
  // Show summary
  const parts = [];
  if (formatted > 0) parts.push(`${formatted} formatted`);
  if (alreadyFormatted > 0) parts.push(`${alreadyFormatted} already clean`);
  if (failed > 0) parts.push(`${failed} failed`);
  
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

  return true;
}

/**
 * Find the Fabric status bar element
 * Returns null if not found
 */
function findStatusBar() {
  // Try multiple selectors - Fabric's class names can change
  return document.querySelector('div[class*="___fr9w3r0"]') || 
         document.querySelector('div.f1pha7fy.f1ewtqcl.f5ogflp') ||
         document.querySelector('div[class*="f1pha7fy"][class*="f1ewtqcl"]') ||
         // Additional fallback: look for the status bar by structure (contains CellSelection button)
         document.querySelector('button[name="CellSelection"]')?.parentElement;
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
    
    const cellSelectionButton = statusBar.querySelector('button[name="CellSelection"]');
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
 * This handles the case where the status bar loads after the page
 */
async function waitForStatusBarAndInject(maxWaitMs = 30000) {
  const startTime = Date.now();
  let delay = 100; // Start with 100ms
  const maxDelay = 2000; // Cap at 2 seconds between retries
  
  while (Date.now() - startTime < maxWaitMs) {
    if (createFloatingButton()) {
      return true;
    }
    
    // Exponential backoff with cap
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, maxDelay);
  }
  
  log.warn('Status bar not found after', maxWaitMs / 1000, 'seconds');
  return false;
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  const hostname = window.location.hostname;
  const fullUrl = window.location.href;
  const isTop = window === window.top;

  log.debug('Init check:', { 
    hostname, 
    isTop, 
    hasPbides: hostname.includes('pbides'),
    hasBootstrap: fullUrl.includes('bootstrapPath=notebooks'),
    url: fullUrl.slice(0, 100)
  });

  if (!isTop) {
    if (!hostname.includes('pbides')) {
      log.debug('Skipping non-pbides iframe:', hostname);
      return;
    }
    if (fullUrl.includes('bootstrapPath=notebooks')) {
      log.debug('Skipping container iframe');
      return;
    }
  }

  log.info('Initializing...');
  
  setupEditorFocusTracking();
  
  let checkAttempts = 0;
  const maxAttempts = 10;
  
  const checkForEditors = async () => {
    checkAttempts++;
    const editorCount = document.querySelectorAll('.monaco-editor').length;
    
    if (editorCount > 0) {
      log.debug('Found', editorCount, 'editors, waiting for status bar...');
      // Use dedicated function to wait for status bar with retries
      await waitForStatusBarAndInject();
      log.info('Ready - found', editorCount, 'editor(s)');
    } else if (checkAttempts < maxAttempts) {
      setTimeout(checkForEditors, 1000);
    } else {
      log.debug('No editors found after', maxAttempts, 'seconds, stopping checks');
    }
  };
  
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
  setInterval(() => {
    const button = document.getElementById('fabric-formatter-button');
    const active = isIframeActive();
    const editorCount = document.querySelectorAll('.monaco-editor').length;
    
    const buttonIsValid = button && button.isConnected && button.offsetParent !== null;

    if (active !== lastActiveState) {
      lastActiveState = active;
    }

    if (active && !buttonIsValid && editorCount > 0) {
      createFloatingButton();
    } else if (!active && button) {
      button.remove();
    }
  }, 500);

  const observer = new MutationObserver((mutations) => {
    const button = document.getElementById('fabric-formatter-button');
    const buttonIsValid = button && button.isConnected && button.offsetParent !== null;
    
    if (!buttonIsValid && isIframeActive()) {
      const editorCount = document.querySelectorAll('.monaco-editor').length;
      if (editorCount > 0) {
        // Check if status bar was just added
        const statusBar = findStatusBar();
        if (statusBar && !statusBar.querySelector('button[name="FormatCells"]')) {
          setTimeout(() => {
            createFloatingButton();
          }, 50);
        }
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Pre-initialize formatters in background
  initializeFormatters();
}

// Start
init();
