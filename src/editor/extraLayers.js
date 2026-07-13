export const ALBUM_EDITOR_MODES = ['collage', 'text', 'drawings', 'templates'];
export const ALBUM_MODE_KEY = 'collage-album-editor-mode';
export const ALBUM_LAYERS_KEY = 'collage-album-extra-layers-v1';

function cloneDeep(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return value;
  }
}

function moveArrayItem(items, fromIndex, toIndex) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function makeLayerId() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function normalizeAlbumEditorMode(value, fallback = 'collage') {
  return ALBUM_EDITOR_MODES.includes(value) ? value : fallback;
}

export function normalizeExtraLayers(value) {
  return {
    version: 1,
    pages: value?.pages && typeof value.pages === 'object' ? value.pages : {},
  };
}

export function hasAnyExtraLayer(layers) {
  const pages = layers?.pages;
  if (!pages || typeof pages !== 'object') return false;
  return Object.values(pages).some((page) => (
    (Array.isArray(page?.texts) && page.texts.length > 0)
    || (Array.isArray(page?.drawings) && page.drawings.length > 0)
    || (Array.isArray(page?.templates) && page.templates.length > 0)
  ));
}

export function readExtraLayers(options = {}) {
  let localLayers = null;

  try {
    const storage = options.storage ?? globalThis.localStorage;
    const raw = storage?.getItem?.(ALBUM_LAYERS_KEY);
    if (raw) localLayers = normalizeExtraLayers(JSON.parse(raw));
  } catch {
    // ignore broken local data
  }

  try {
    const bridge = options.bridge ?? globalThis.__collageAlbumLayers;
    const bridgeLayers = normalizeExtraLayers(bridge?.getLayers?.());
    if (hasAnyExtraLayer(bridgeLayers) || !hasAnyExtraLayer(localLayers)) return bridgeLayers;
  } catch {
    // ignore bridge errors
  }

  return localLayers ?? normalizeExtraLayers(null);
}

export function writeExtraLayers(value, options = {}) {
  const layers = normalizeExtraLayers(value);
  try {
    const storage = options.storage ?? globalThis.localStorage;
    storage?.setItem?.(ALBUM_LAYERS_KEY, JSON.stringify(layers));
  } catch {
    // ignore localStorage quota/errors
  }

  try {
    const bridge = options.bridge ?? globalThis.__collageAlbumLayers;
    bridge?.setLayers?.(layers);
  } catch {
    // ignore bridge errors
  }

  try {
    const windowObject = options.windowObject ?? globalThis.window;
    const CustomEventCtor = options.CustomEventCtor ?? globalThis.CustomEvent;
    const dispatch = () => windowObject.dispatchEvent(new CustomEventCtor('collage-album-layers-import', { detail: { layers } }));
    dispatch();
    windowObject.requestAnimationFrame?.(dispatch);
    windowObject.setTimeout?.(dispatch, 120);
    windowObject.setTimeout?.(dispatch, 450);
  } catch {
    // ignore event errors
  }

  return layers;
}

export function applyAlbumEditorMode(value, fallback = 'collage', options = {}) {
  const nextMode = normalizeAlbumEditorMode(value, fallback);
  try {
    const storage = options.storage ?? globalThis.localStorage;
    storage?.setItem?.(ALBUM_MODE_KEY, nextMode);
  } catch {
    // ignore localStorage errors
  }

  const documentObject = options.documentObject ?? globalThis.document;
  if (documentObject?.body?.dataset) documentObject.body.dataset.albumMode = nextMode;

  try {
    const bridge = options.bridge ?? globalThis.__collageAlbumLayers;
    bridge?.setMode?.(nextMode);
  } catch {
    // ignore bridge errors
  }
  return nextMode;
}

export function textLayersForPage(extraLayers, pageIndex) {
  const pageNumber = pageIndex + 1;
  const page = extraLayers?.pages?.[String(pageNumber)];
  return Array.isArray(page?.texts) ? page.texts : [];
}

export function drawingLayersForPage(extraLayers, pageIndex) {
  const pageNumber = pageIndex + 1;
  const page = extraLayers?.pages?.[String(pageNumber)];
  return Array.isArray(page?.drawings) ? page.drawings : [];
}

export function createPageLayerDraft(layers, pageNumber) {
  const key = String(pageNumber);
  const next = cloneDeep(layers) || { version: 1, pages: {} };
  if (!next.pages || typeof next.pages !== 'object') next.pages = {};
  if (!next.pages[key]) next.pages[key] = { texts: [], drawings: [], templates: [] };
  if (!Array.isArray(next.pages[key].texts)) next.pages[key].texts = [];
  if (!Array.isArray(next.pages[key].drawings)) next.pages[key].drawings = [];
  if (!Array.isArray(next.pages[key].templates)) next.pages[key].templates = [];
  return { next, page: next.pages[key] };
}

export function cloneExtraLayerPage(pageLayers, idFactory = makeLayerId) {
  if (!pageLayers) return null;
  const cloned = cloneDeep(pageLayers);
  ['texts', 'drawings', 'templates'].forEach((key) => {
    if (Array.isArray(cloned?.[key])) {
      cloned[key] = cloned[key].map((item) => ({ ...item, id: idFactory() }));
    }
  });
  return cloned;
}

export function insertExtraLayerPage(layers, insertIndex, oldPageCount, insertedPageLayers = null, idFactory = makeLayerId) {
  const pagesMap = layers?.pages ?? {};
  const insertPageNumber = insertIndex + 1;
  const nextPagesMap = {};
  for (const [key, value] of Object.entries(pagesMap)) {
    const pageNumber = Number(key);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > oldPageCount) {
      nextPagesMap[key] = value;
      continue;
    }
    const nextPageNumber = pageNumber >= insertPageNumber ? pageNumber + 1 : pageNumber;
    nextPagesMap[String(nextPageNumber)] = value;
  }
  if (insertedPageLayers) nextPagesMap[String(insertPageNumber)] = cloneExtraLayerPage(insertedPageLayers, idFactory);
  return { ...layers, pages: nextPagesMap };
}

export function deleteExtraLayerPage(layers, deleteIndex, oldPageCount) {
  const pagesMap = layers?.pages ?? {};
  const deletePageNumber = deleteIndex + 1;
  const nextPagesMap = {};
  for (const [key, value] of Object.entries(pagesMap)) {
    const pageNumber = Number(key);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > oldPageCount) {
      nextPagesMap[key] = value;
      continue;
    }
    if (pageNumber === deletePageNumber) continue;
    const nextPageNumber = pageNumber > deletePageNumber ? pageNumber - 1 : pageNumber;
    nextPagesMap[String(nextPageNumber)] = value;
  }
  return { ...layers, pages: nextPagesMap };
}

export function pruneExtraLayerPages(layers, pageCount) {
  const pagesMap = layers?.pages ?? {};
  const nextPagesMap = {};
  for (const [key, value] of Object.entries(pagesMap)) {
    const pageNumber = Number(key);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber <= pageCount) nextPagesMap[key] = value;
  }
  return { ...layers, pages: nextPagesMap };
}

export function reorderExtraLayerPages(layers, fromIndex, toIndex, pageCount) {
  if (fromIndex === toIndex) return layers;
  const pagesMap = layers?.pages ?? {};
  const orderedLayerPages = Array.from({ length: pageCount }, (_, index) => pagesMap[String(index + 1)] ?? null);
  const movedLayerPages = moveArrayItem(orderedLayerPages, fromIndex, toIndex);
  const nextPagesMap = {};
  movedLayerPages.forEach((pageLayers, index) => {
    if (pageLayers) nextPagesMap[String(index + 1)] = pageLayers;
  });
  for (const [key, value] of Object.entries(pagesMap)) {
    const numberKey = Number(key);
    if (!Number.isInteger(numberKey) || numberKey < 1 || numberKey > pageCount) nextPagesMap[key] = value;
  }
  return { ...layers, pages: nextPagesMap };
}
