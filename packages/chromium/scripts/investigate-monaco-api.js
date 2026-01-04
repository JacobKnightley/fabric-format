/**
 * Monaco API Access Investigation Script
 *
 * This script is designed to be pasted into the browser's DevTools console
 * while on a Microsoft Fabric Notebook page to investigate Monaco Editor
 * access patterns.
 *
 * PURPOSE: Determine if we can access Monaco's internal API to:
 * 1. Get text directly from model (bypassing DOM extraction)
 * 2. Listen for content-ready events (instead of polling)
 * 3. Detect when lazy-loading is complete
 *
 * NOTE: This runs in the PAGE context, not the content script context.
 * Content scripts are isolated and cannot access window.monaco directly.
 *
 * Usage: Open DevTools console on Fabric Notebook, paste this script.
 */

(function investigateMonaco() {
  console.log('=== Monaco API Investigation ===\n');

  // Check 1: Is monaco global available?
  console.log('1. Checking for window.monaco...');
  if (typeof monaco !== 'undefined') {
    console.log('   ✅ window.monaco EXISTS');
    console.log('   - monaco.editor:', typeof monaco.editor);
    console.log('   - monaco.languages:', typeof monaco.languages);
  } else {
    console.log('   ❌ window.monaco is NOT defined');
    console.log('   - Fabric may use a bundled/renamed Monaco');
  }

  // Check 2: Look for monaco instance on DOM elements
  console.log('\n2. Checking for Monaco instances on DOM elements...');
  const monacoEditors = document.querySelectorAll('.monaco-editor');
  console.log(`   Found ${monacoEditors.length} .monaco-editor elements`);

  monacoEditors.forEach((el, i) => {
    console.log(`\n   Editor ${i + 1}:`);

    // Common storage locations for Monaco editor instances
    const possibleProps = [
      '_editor',
      '__editor',
      'monacoEditor',
      'editor',
      '_monacoEditor',
    ];

    for (const prop of possibleProps) {
      if (el[prop]) {
        console.log(`   ✅ Found editor on el.${prop}`);
        const editor = el[prop];
        if (typeof editor.getValue === 'function') {
          console.log(`   - getValue() available!`);
          console.log(
            `   - Content preview: "${editor.getValue().substring(0, 50)}..."`,
          );
        }
        if (typeof editor.getModel === 'function') {
          console.log(`   - getModel() available`);
          const model = editor.getModel();
          if (model) {
            console.log(`   - Model URI: ${model.uri?.toString()}`);
            console.log(`   - Line count: ${model.getLineCount()}`);
          }
        }
        break;
      }
    }

    // Check for React fiber or other framework bindings
    const reactProps = Object.keys(el).filter((k) => k.startsWith('__react'));
    if (reactProps.length > 0) {
      console.log(`   - React bindings found: ${reactProps.join(', ')}`);
    }
  });

  // Check 3: Try monaco.editor.getEditors()
  console.log('\n3. Checking monaco.editor.getEditors()...');
  if (typeof monaco !== 'undefined' && monaco.editor?.getEditors) {
    const editors = monaco.editor.getEditors();
    console.log(`   ✅ Found ${editors.length} editor instances`);
    editors.forEach((editor, i) => {
      const model = editor.getModel();
      console.log(
        `\n   Editor ${i + 1}: ${model?.getLineCount() ?? 0} lines, URI: ${model?.uri?.toString() ?? 'none'}`,
      );
      if (model) {
        const preview = model.getValue().substring(0, 80).replace(/\n/g, '\\n');
        console.log(`   Preview: "${preview}..."`);
      }
    });
  } else {
    console.log('   ❌ monaco.editor.getEditors() not available');
  }

  // Check 4: Look for Fabric-specific globals
  console.log('\n4. Checking for Fabric-specific globals...');
  const fabricGlobals = [
    'fabricNotebook',
    '__FABRIC__',
    'notebookContext',
    'cellManager',
    'nteract',
  ];
  for (const g of fabricGlobals) {
    if (typeof window[g] !== 'undefined') {
      console.log(`   ✅ window.${g} EXISTS`);
    }
  }

  // Check 5: Search for any object with getEditors method
  console.log('\n5. Searching window for getEditors method...');
  const searched = new Set();
  function searchForGetEditors(obj, path, depth = 0) {
    if (depth > 3 || searched.has(obj)) return;
    searched.add(obj);

    try {
      for (const key of Object.keys(obj)) {
        try {
          const val = obj[key];
          if (val && typeof val.getEditors === 'function') {
            console.log(`   ✅ Found getEditors at: ${path}.${key}`);
          }
          if (val && typeof val === 'object' && depth < 2) {
            searchForGetEditors(val, `${path}.${key}`, depth + 1);
          }
        } catch {}
      }
    } catch {}
  }
  searchForGetEditors(window, 'window');

  console.log('\n=== Investigation Complete ===');
  console.log('If Monaco API is accessible, we could:');
  console.log('- Use editor.getValue() instead of DOM extraction');
  console.log('- Listen to onDidChangeModelContent for stability');
  console.log('- Skip scroll/focus delays entirely');
})();
