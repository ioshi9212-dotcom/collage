import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE_PATH = new URL('../../public/project-storage.js', import.meta.url);
const APP_SOURCE_PATH = new URL('../AppLive.jsx', import.meta.url);
const INDEX_PATH = new URL('../../index.html', import.meta.url);
const source = readFileSync(SOURCE_PATH, 'utf8');
const appSource = readFileSync(APP_SOURCE_PATH, 'utf8');
const indexSource = readFileSync(INDEX_PATH, 'utf8');

class FakeStorage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(String(key));
  }

  key(index) {
    return [...this.map.keys()][index] ?? null;
  }

  get length() {
    return this.map.size;
  }
}

const records = new Map();
const puts = [];
let databaseOpenCount = 0;
let stringifyCount = 0;
const nativeStringify = JSON.stringify;
const json = {
  parse: JSON.parse,
  stringify(...args) {
    stringifyCount += 1;
    return nativeStringify(...args);
  },
};

function transaction() {
  const tx = {
    error: null,
    objectStore() {
      return {
        put(record) {
          puts.push(record);
          records.set(record.key, record);
        },
        get(key) {
          const request = {};
          queueMicrotask(() => {
            request.result = records.get(key);
            request.onsuccess?.();
          });
          return request;
        },
      };
    },
  };
  queueMicrotask(() => tx.oncomplete?.());
  return tx;
}

const fakeDatabase = {
  objectStoreNames: { contains: () => true },
  transaction,
  close() {},
};

const indexedDB = {
  open() {
    databaseOpenCount += 1;
    const request = {};
    queueMicrotask(() => {
      request.result = fakeDatabase;
      request.onsuccess?.();
    });
    return request;
  },
};

const window = { requestAnimationFrame: (callback) => callback() };
const document = {
  readyState: 'complete',
  querySelector() { return null; },
  addEventListener() {},
  body: { append() {} },
  createElement() { return { style: {}, remove() {} }; },
};

const context = vm.createContext({
  window,
  document,
  localStorage: new FakeStorage(),
  indexedDB,
  JSON: json,
  File: class {},
  DataTransfer: class {},
  Event: class {},
  console,
  setTimeout: (callback) => callback(),
  clearTimeout() {},
  queueMicrotask,
});
vm.runInContext(source, context, { filename: 'project-storage.js' });
const storage = window.__collageProjectStorage;
assert.ok(storage);

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
assert.match(appSource, /const data = project\(\);[\s\S]{0,900}saveLocalProject\(\{ silent: true, data \}\)/, 'editor save must build one compact local snapshot');
assert.match(appSource, /saveCloudProject\(await portableProject\(\)\)/, 'cloud save must materialize a separate portable snapshot');
assert.match(appSource, /getPortableProject: \(\) => portableProject\(\)/, 'cloud panel must receive a portable project bridge');
assert.match(appSource, /const storeSnapshot = window\.__collageProjectStorage\?\.storeSnapshot;/, 'editor save must resolve the IndexedDB target once');
assert.match(appSource, /storeSnapshot\(data, \{ source: 'manual-save' \}\)/, 'IndexedDB save must reuse the compact local snapshot');
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
