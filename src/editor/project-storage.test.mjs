import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const source = readFileSync(resolve(root, 'public/project-storage.js'), 'utf8');
const appSource = readFileSync(resolve(root, 'src/AppLive.jsx'), 'utf8');
const indexSource = readFileSync(resolve(root, 'index.html'), 'utf8');

const records = new Map();
const puts = [];
let databaseOpenCount = 0;
let stringifyCount = 0;

const database = {
  objectStoreNames: { contains: () => true },
  close() {},
  transaction(_storeName, mode) {
    const transaction = {
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore() {
        return {
          put(record) {
            puts.push(record);
            setTimeout(() => {
              records.set(record.key, record);
              transaction.oncomplete?.();
            }, 12);
          },
          get(key) {
            const request = { result: null, error: null, onsuccess: null, onerror: null };
            setTimeout(() => {
              request.result = records.get(key) || null;
              request.onsuccess?.();
            }, 0);
            return request;
          },
        };
      },
    };
    assert.ok(mode === 'readwrite' || mode === 'readonly');
    return transaction;
  },
};

const indexedDB = {
  open() {
    databaseOpenCount += 1;
    const request = { result: database, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => request.onsuccess?.(), 0);
    return request;
  },
};

const countedJson = {
  parse: JSON.parse,
  stringify(...args) {
    stringifyCount += 1;
    return JSON.stringify(...args);
  },
};

const document = {
  readyState: 'loading',
  body: { append() {} },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    return { style: {}, append() {}, remove() {}, set textContent(_value) {} };
  },
};

const context = {
  window: {},
  document,
  indexedDB,
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  console,
  Date,
  Map,
  Set,
  Promise,
  JSON: countedJson,
  setTimeout,
  clearTimeout,
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'project-storage.js' });

const storage = context.window.__collageProjectStorage;
assert.equal(typeof storage?.storeSnapshot, 'function', 'storage bridge must accept an existing snapshot');

function snapshot(marker) {
  return {
    version: 'test',
    marker,
    pages: [{ id: 'page-1', frames: [{ photo: { id: 'photo-1' } }] }],
    library: [{ id: 'photo-1', src: `data:image/jpeg;base64,${'A'.repeat(250_000)}` }],
    extraLayers: { pages: { 1: { texts: [{ id: 'text-1' }], drawings: [], templates: [] } } },
  };
}

const first = storage.storeSnapshot(snapshot('first'), { source: 'test-first' });
const second = storage.storeSnapshot(snapshot('second'), { source: 'test-second' });
const latest = storage.storeSnapshot(snapshot('latest'), { source: 'test-latest' });
const results = await Promise.all([first, second, latest]);

assert.equal(databaseOpenCount, 1, 'IndexedDB connection must be reused');
assert.equal(puts.length, 2, 'pending writes for the same key must coalesce to the latest snapshot');
assert.equal(puts.at(-1).data.marker, 'latest', 'coalesced write must keep the newest project');
assert.equal(records.get('latest-local').data.marker, 'latest');
assert.equal(stringifyCount, 0, 'IndexedDB persistence must not stringify the whole project');
assert.equal(results.at(-1).stats.pageCount, 1);
assert.equal(results.at(-1).stats.photoCount, 1);
assert.equal(results.at(-1).stats.decorCount, 1);

const readBack = await storage.readLatest();
assert.equal(readBack.data.marker, 'latest');
assert.equal(databaseOpenCount, 1, 'reads must reuse the same IndexedDB connection');

assert.doesNotMatch(source, /projectSignature|structuredClone|writeQueue\s*=\s*Promise/, 'old clone/stringify pipeline must be removed');
const saveClickBlock = source.match(/if \(label === 'Сохранить'\) \{([\s\S]*?)\n {6}\}/)?.[1] || '';
assert.ok(saveClickBlock, 'storage click listener must keep a save branch');
assert.doesNotMatch(saveClickBlock, /saveFullProjectSnapshot/, 'storage click listener must not duplicate the editor save');
assert.match(appSource, /const data = project\(\);[\s\S]{0,900}saveLocalProject\(\{ silent: true, data \}\)/, 'editor save must build one project snapshot');
assert.match(appSource, /saveCloudProject\(data\)/, 'cloud save must reuse the same snapshot');
assert.match(appSource, /const storeSnapshot = window\.__collageProjectStorage\?\.storeSnapshot;/, 'editor save must resolve the IndexedDB target once');
assert.match(appSource, /storeSnapshot\(data, \{ source: 'manual-save' \}\)/, 'IndexedDB save must reuse the same snapshot');
assert.match(appSource, /describeSaveResult\(\{ local, indexedDb, cloud, cloudError \}\)/, 'save feedback must reflect confirmed storage outcomes');

assert.doesNotMatch(source, /function cloudProjectCardIndex|function openCloudProject/, 'storage must not duplicate cloud project opening');
assert.doesNotMatch(source, /cloud-project-actions/, 'cloud card clicks must remain owned by cloud-auth.js');
assert.match(source, /function clearCloudProjectBinding\(\)/, 'local imports must have an explicit cloud unlink operation');
assert.match(source, /clearCloudProjectBinding\(\);\s*importIntoEditor\(record\.data\)/, 'opening a local project must unlink it before importing');
assert.match(source, /input\?\.closest\?\.\('\.file-actions'\)[\s\S]{0,180}clearCloudProjectBinding\(\)/, 'manual project JSON imports must unlink the previous cloud project');
assert.match(source, /LEGACY_STORAGE_PREFIX[\s\S]{0,5000}findLatestLocalStorageProject/, 'local opening must retain legacy-project discovery');
assert.match(source, /const startupLegacyExtraLayers = readLegacyExtraLayers\(\)/, 'legacy layers must be captured synchronously at script startup');
assert.match(source, /attachLegacyExtraLayers[\s\S]{0,9000}localStorage\.removeItem\(ALBUM_LAYERS_KEY\)/, 'legacy layer key must only be removed after migration code persists it');
assert.ok(
  indexSource.indexOf('/project-storage.js') < indexSource.indexOf('/src/main.jsx'),
  'project storage must load before React so obsolete standalone layers can be captured safely',
);

console.log('project storage performance checks passed');
