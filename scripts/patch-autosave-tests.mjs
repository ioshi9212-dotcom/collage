import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const path = 'src/editor/project-storage.test.mjs';
let source = readFileSync(path, 'utf8');

source = replaceOnce(source,
  "const window = { requestAnimationFrame: (callback) => callback() };",
  "const intervals = [];\nconst window = {\n  requestAnimationFrame: (callback) => callback(),\n  setInterval(callback, delay) {\n    intervals.push({ callback, delay });\n    return intervals.length;\n  },\n};",
  'interval stub');

source = replaceOnce(source,
  "const context = vm.createContext({\n  window,\n  document,\n  localStorage: new FakeStorage(),",
  "const localStorage = new FakeStorage();\n\nconst context = vm.createContext({\n  window,\n  document,\n  localStorage,",
  'local storage handle');

source = replaceOnce(source,
  "const storage = window.__collageProjectStorage;\nassert.ok(storage);",
  "const storage = window.__collageProjectStorage;\nassert.ok(storage);\nassert.equal(storage.autosaveIntervalMs, 5 * 60 * 1000, 'autosave interval must be exactly five minutes');\nassert.equal(intervals.length, 1, 'autosave timer must be installed once');\nassert.equal(intervals[0].delay, 5 * 60 * 1000, 'autosave timer must run every five minutes');",
  'interval assertions');

source = replaceOnce(source,
  "const readBack = await storage.readLatest();\nassert.equal(readBack.data.marker, 'latest');\nassert.equal(databaseOpenCount, 1, 'reads must reuse the same IndexedDB connection');",
  "const readBack = await storage.readLatest();\nassert.equal(readBack.data.marker, 'latest');\nassert.equal(databaseOpenCount, 1, 'reads must reuse the same IndexedDB connection');\n\nwindow.__collageApp = { getProject: () => snapshot('autosave') };\nconst autosaveResult = await storage.autosaveNow();\nassert.equal(autosaveResult.saved, true, 'autosave must persist the current editor project');\nconst autosaved = await storage.readLatest();\nassert.equal(autosaved.data.marker, 'autosave', 'autosave must overwrite the same latest-local slot');\nassert.equal(autosaved.source, 'autosave', 'autosave source must be recorded');\nassert.equal(JSON.parse(localStorage.getItem('collage-creator-album-live-v11-preserve-mode-layout')).marker, 'autosave', 'autosave must refresh the localStorage fallback');",
  'autosave behavior');

source = replaceOnce(source,
  "assert.match(source, /function clearCloudProjectBinding\\(\\)/, 'local imports must have an explicit cloud unlink operation');",
  "assert.match(source, /function clearCloudProjectBinding\\(\\)/, 'local imports must have an explicit cloud unlink operation');\nassert.match(source, /AUTOSAVE_INTERVAL_MS = 5 \\* 60 \\* 1000/, 'autosave cadence must stay at five minutes');\nassert.match(source, /persistProjectSnapshot\\(snapshot, \\{ source: 'autosave' \\}\\)/, 'autosave must write the latest-local IndexedDB slot');",
  'source contracts');

writeFileSync(path, source);
console.log('Autosave tests patch applied');
