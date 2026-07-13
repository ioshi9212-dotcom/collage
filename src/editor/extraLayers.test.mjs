import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALBUM_LAYERS_KEY,
  ALBUM_MODE_KEY,
  applyAlbumEditorMode,
  cloneExtraLayerPage,
  createPageLayerDraft,
  deleteExtraLayerPage,
  drawingLayersForPage,
  hasAnyExtraLayer,
  insertExtraLayerPage,
  normalizeAlbumEditorMode,
  normalizeExtraLayers,
  pruneExtraLayerPages,
  readExtraLayers,
  reorderExtraLayerPages,
  textLayersForPage,
  writeExtraLayers,
} from './extraLayers.js';

class FakeStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
}

assert.deepEqual(normalizeExtraLayers(null), { version: 1, pages: {} });
const pageMap = { 1: { texts: [{ id: 'text-1' }] } };
const normalized = normalizeExtraLayers({ version: 99, pages: pageMap });
assert.equal(normalized.version, 1);
assert.equal(normalized.pages, pageMap, 'normalization must preserve the existing page map reference');
assert.equal(normalizeAlbumEditorMode('text'), 'text');
assert.equal(normalizeAlbumEditorMode('broken'), 'collage');
assert.equal(normalizeAlbumEditorMode('broken', 'templates'), 'templates');

assert.equal(hasAnyExtraLayer(null), false);
assert.equal(hasAnyExtraLayer({ pages: { 1: { texts: [] } } }), false);
assert.equal(hasAnyExtraLayer({ pages: { 1: { texts: [{ id: 'text' }] } } }), true);
assert.equal(hasAnyExtraLayer({ pages: { 1: { drawings: [{ id: 'line' }] } } }), true);
assert.equal(hasAnyExtraLayer({ pages: { 1: { templates: [{ id: 'template' }] } } }), true);

{
  const local = { version: 1, pages: { 1: { texts: [{ id: 'local' }] } } };
  const bridge = { version: 1, pages: { 2: { drawings: [{ id: 'bridge' }] } } };
  const storage = new FakeStorage({ [ALBUM_LAYERS_KEY]: JSON.stringify(local) });
  assert.deepEqual(readExtraLayers({ storage, bridge: { getLayers: () => bridge } }), bridge, 'non-empty bridge layers must win');
  assert.deepEqual(readExtraLayers({ storage, bridge: { getLayers: () => ({ pages: {} }) } }), local, 'non-empty local layers must survive an empty bridge');
  assert.deepEqual(readExtraLayers({ storage: new FakeStorage({ [ALBUM_LAYERS_KEY]: '{broken' }), bridge: { getLayers: () => null } }), { version: 1, pages: {} });
  assert.deepEqual(readExtraLayers({ storage, bridge: { getLayers() { throw new Error('bridge failed'); } } }), local);
}

{
  const storage = new FakeStorage();
  const bridgeCalls = [];
  const events = [];
  const timeoutDelays = [];
  class FakeCustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const windowObject = {
    dispatchEvent(event) { events.push(event); },
    requestAnimationFrame(callback) { callback(); },
    setTimeout(callback, delay) { timeoutDelays.push(delay); callback(); },
  };
  const layers = writeExtraLayers({ pages: { 1: { texts: [{ id: 'one' }] } } }, {
    storage,
    bridge: { setLayers(value) { bridgeCalls.push(value); } },
    windowObject,
    CustomEventCtor: FakeCustomEvent,
  });
  assert.deepEqual(JSON.parse(storage.getItem(ALBUM_LAYERS_KEY)), layers);
  assert.deepEqual(bridgeCalls, [layers]);
  assert.equal(events.length, 4, 'layer imports must keep the immediate and delayed compatibility events');
  assert.deepEqual(timeoutDelays, [120, 450]);
  assert.ok(events.every((event) => event.type === 'collage-album-layers-import'));
  assert.ok(events.every((event) => event.detail.layers === layers));
}

{
  const storage = new FakeStorage();
  const documentObject = { body: { dataset: {} } };
  const modes = [];
  const mode = applyAlbumEditorMode('drawings', 'collage', {
    storage,
    documentObject,
    bridge: { setMode(value) { modes.push(value); } },
  });
  assert.equal(mode, 'drawings');
  assert.equal(storage.getItem(ALBUM_MODE_KEY), 'drawings');
  assert.equal(documentObject.body.dataset.albumMode, 'drawings');
  assert.deepEqual(modes, ['drawings']);
}

{
  const layers = {
    version: 1,
    pages: {
      1: { texts: [{ id: 't1' }], drawings: [{ id: 'd1' }], templates: [{ id: 'p1' }] },
      2: { texts: 'broken', drawings: null },
    },
  };
  assert.deepEqual(textLayersForPage(layers, 0), [{ id: 't1' }]);
  assert.deepEqual(drawingLayersForPage(layers, 0), [{ id: 'd1' }]);
  assert.deepEqual(textLayersForPage(layers, 1), []);
  assert.deepEqual(drawingLayersForPage(layers, 5), []);
}

{
  const original = { version: 1, pages: { 1: { texts: [{ id: 'old' }], drawings: null } } };
  const { next, page } = createPageLayerDraft(original, 1);
  page.texts.push({ id: 'new' });
  assert.deepEqual(original.pages[1].texts, [{ id: 'old' }], 'drafting must not mutate the current React state');
  assert.deepEqual(next.pages[1].texts, [{ id: 'old' }, { id: 'new' }]);
  assert.deepEqual(next.pages[1].drawings, []);
  assert.deepEqual(next.pages[1].templates, []);
}

{
  let id = 0;
  const cloned = cloneExtraLayerPage({
    texts: [{ id: 'old-text', value: 1 }],
    drawings: [{ id: 'old-line', value: 2 }],
    templates: [{ id: 'old-template', value: 3 }],
  }, () => `fresh-${++id}`);
  assert.deepEqual(cloned, {
    texts: [{ id: 'fresh-1', value: 1 }],
    drawings: [{ id: 'fresh-2', value: 2 }],
    templates: [{ id: 'fresh-3', value: 3 }],
  });
}

const baseLayers = {
  version: 1,
  pages: {
    1: { texts: [{ id: 'page-1' }] },
    2: { texts: [{ id: 'page-2' }] },
    3: { texts: [{ id: 'page-3' }] },
    metadata: { keep: true },
  },
};

{
  let id = 0;
  const inserted = insertExtraLayerPage(baseLayers, 1, 3, baseLayers.pages[1], () => `copy-${++id}`);
  assert.equal(inserted.pages[1], baseLayers.pages[1]);
  assert.deepEqual(inserted.pages[2], { texts: [{ id: 'copy-1' }] });
  assert.equal(inserted.pages[3], baseLayers.pages[2]);
  assert.equal(inserted.pages[4], baseLayers.pages[3]);
  assert.equal(inserted.pages.metadata, baseLayers.pages.metadata);
  assert.equal(baseLayers.pages[2].texts[0].id, 'page-2', 'insertion must not mutate source layers');
}

{
  const deleted = deleteExtraLayerPage(baseLayers, 1, 3);
  assert.equal(deleted.pages[1], baseLayers.pages[1]);
  assert.equal(deleted.pages[2], baseLayers.pages[3]);
  assert.equal('3' in deleted.pages, false);
  assert.equal(deleted.pages.metadata, baseLayers.pages.metadata);
}

{
  const pruned = pruneExtraLayerPages(baseLayers, 2);
  assert.equal(pruned.pages[1], baseLayers.pages[1]);
  assert.equal(pruned.pages[2], baseLayers.pages[2]);
  assert.equal('3' in pruned.pages, false);
  assert.equal(pruned.pages.metadata, baseLayers.pages.metadata);
}

{
  const reordered = reorderExtraLayerPages(baseLayers, 0, 2, 3);
  assert.equal(reordered.pages[1], baseLayers.pages[2]);
  assert.equal(reordered.pages[2], baseLayers.pages[3]);
  assert.equal(reordered.pages[3], baseLayers.pages[1]);
  assert.equal(reordered.pages.metadata, baseLayers.pages.metadata);
  assert.equal(reorderExtraLayerPages(baseLayers, 1, 1, 3), baseLayers, 'no-op reorder must preserve the existing state object');
}

const appSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
assert.match(appSource, /from '\.\/editor\/extraLayers'/, 'AppLive must import the extracted module');
assert.doesNotMatch(appSource, /function normalizeExtraLayers\(/, 'normalization must no longer live inside AppLive');
assert.match(appSource, /function shiftExtraLayersForPageInsert\([\s\S]*?insertExtraLayerPage\(layers, insertIndex, oldPageCount, insertedPageLayers, makeId\)/, 'React wrapper must delegate insertion to the extracted pure function');
assert.match(appSource, /reorderExtraLayerPages\(layers, fromIndex, toIndex, pageCount\)/);
assert.match(appSource, /cloneExtraLayerPage\([\s\S]*?}, makeId\)/, 'template layers must receive fresh IDs through the extracted clone helper');

console.log('extra layer module checks passed');
