import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const path = 'public/project-storage.js';
let source = readFileSync(path, 'utf8');

source = replaceOnce(source,
  "  const CURRENT_PROJECT_TITLE_KEY = 'collage-cloud-current-project-title';\n\n  let databasePromise = null;\n  let writeInFlight = false;\n  const pendingWrites = new Map();",
  "  const CURRENT_PROJECT_TITLE_KEY = 'collage-cloud-current-project-title';\n  const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;\n\n  let databasePromise = null;\n  let writeInFlight = false;\n  let autosaveInFlight = false;\n  let autosaveTimer = null;\n  const pendingWrites = new Map();",
  'constants');

source = replaceOnce(source,
  "  async function persistCurrentEditorProject({ source = 'editor' } = {}) {\n    const snapshot = await getFreshEditorSnapshot();\n    return persistProjectSnapshot(snapshot, { source });\n  }\n\n  async function persistMigratedRecord(record, source) {",
  "  async function persistCurrentEditorProject({ source = 'editor' } = {}) {\n    const snapshot = await getFreshEditorSnapshot();\n    return persistProjectSnapshot(snapshot, { source });\n  }\n\n  async function autosaveCurrentEditorProject() {\n    if (autosaveInFlight) return { saved: false, skipped: true };\n    const bridge = window.__collageApp;\n    if (!bridge || typeof bridge.getProject !== 'function') return { saved: false, skipped: true };\n    autosaveInFlight = true;\n    try {\n      const snapshot = await getFreshEditorSnapshot();\n      const result = await persistProjectSnapshot(snapshot, { source: 'autosave' });\n      try {\n        localStorage.setItem(CURRENT_STORAGE_KEY, JSON.stringify(snapshot));\n      } catch (error) {\n        console.warn('Автосохранение записано в IndexedDB, но резервный localStorage недоступен', error);\n      }\n      return result;\n    } catch (error) {\n      console.warn('Не удалось выполнить автосохранение проекта', error);\n      return { saved: false, error };\n    } finally {\n      autosaveInFlight = false;\n    }\n  }\n\n  function installAutosave() {\n    if (autosaveTimer !== null || typeof window.setInterval !== 'function') return;\n    autosaveTimer = window.setInterval(() => { void autosaveCurrentEditorProject(); }, AUTOSAVE_INTERVAL_MS);\n  }\n\n  async function persistMigratedRecord(record, source) {",
  'autosave');

source = replaceOnce(source,
  "    openLocalProject,\n    readLatest: () => readProject(LATEST_LOCAL_KEY),\n  };\n\n  if (document.readyState === 'loading') {",
  "    openLocalProject,\n    readLatest: () => readProject(LATEST_LOCAL_KEY),\n    autosaveNow: autosaveCurrentEditorProject,\n    autosaveIntervalMs: AUTOSAVE_INTERVAL_MS,\n  };\n\n  installAutosave();\n\n  if (document.readyState === 'loading') {",
  'bridge');

writeFileSync(path, source);
console.log('Autosave storage patch applied');
