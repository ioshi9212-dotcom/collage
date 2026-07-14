export const ALBUM_EDITOR_MODES = ['collage', 'text', 'drawings', 'templates'];
export const ALBUM_MODE_KEY = 'collage-album-editor-mode';
export const ALBUM_LAYERS_KEY = 'collage-album-extra-layers-v1';

export const MAX_EXTRA_LAYER_PAGES = 500;
export const MAX_TEXT_LAYERS_PER_PAGE = 250;
export const MAX_DRAWING_LAYERS_PER_PAGE = 250;
export const MAX_TEMPLATE_LAYERS_PER_PAGE = 100;
export const MAX_TEXT_LAYER_CHARACTERS = 20_000;

const MAX_LAYER_ID_LENGTH = 200;
const MAX_FONT_ID_LENGTH = 100;
const MAX_FONT_FAMILY_LENGTH = 300;
const MAX_COLOR_LENGTH = 64;
const MAX_TEMPLATE_KEYS = 32;
const MAX_TEMPLATE_STRING_LENGTH = 2_000;

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

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function cleanString(value, fallback = '', maxLength = 1_000) {
  const text = value == null ? fallback : String(value);
  return text.slice(0, maxLength);
}

function cleanNumber(value, fallback, min, max) {
  const number = Number(value);
  const finite = Number.isFinite(number) ? number : fallback;
  return Math.min(max, Math.max(min, finite));
}

function uniqueLayerId(value, usedIds, idFactory) {
  const base = cleanString(value, '', MAX_LAYER_ID_LENGTH) || cleanString(idFactory(), 'layer', MAX_LAYER_ID_LENGTH);
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base.slice(0, Math.max(1, MAX_LAYER_ID_LENGTH - 12))}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function sanitizeTextLayer(item, usedIds, idFactory) {
  const source = objectValue(item);
  if (!source) return null;
  return {
    id: uniqueLayerId(source.id, usedIds, idFactory),
    x: cleanNumber(source.x, 0, -10_000, 10_000),
    y: cleanNumber(source.y, 0, -10_000, 10_000),
    width: cleanNumber(source.width, 500, 1, 10_000),
    text: cleanString(source.text, '', MAX_TEXT_LAYER_CHARACTERS),
    fontId: cleanString(source.fontId, 'onest', MAX_FONT_ID_LENGTH),
    fontFamily: cleanString(source.fontFamily, '', MAX_FONT_FAMILY_LENGTH),
    fontSize: cleanNumber(source.fontSize, 56, 1, 500),
    fontWeight: Math.round(cleanNumber(source.fontWeight, 500, 100, 900)),
    fontStyle: source.fontStyle === 'italic' ? 'italic' : 'normal',
    lineHeight: cleanNumber(source.lineHeight, 1.18, 0.5, 5),
    color: cleanString(source.color, '#1f2723', MAX_COLOR_LENGTH),
  };
}

function sanitizeDrawingLayer(item, usedIds, idFactory) {
  const source = objectValue(item);
  if (!source || source.type !== 'line') return null;
  return {
    id: uniqueLayerId(source.id, usedIds, idFactory),
    type: 'line',
    x: cleanNumber(source.x, 0, -10_000, 10_000),
    y: cleanNumber(source.y, 0, -10_000, 10_000),
    length: cleanNumber(source.length, 300, 1, 10_000),
    angle: cleanNumber(source.angle, 0, -3_600, 3_600),
    strokeWidth: cleanNumber(source.strokeWidth, 4, 1, 500),
    color: cleanString(source.color, '#6f6862', MAX_COLOR_LENGTH),
    opacity: cleanNumber(source.opacity, 1, 0, 1),
  };
}

function sanitizeTemplateLayer(item, usedIds, idFactory) {
  const source = objectValue(item);
  if (!source) return null;
  const next = { id: uniqueLayerId(source.id, usedIds, idFactory) };
  for (const [key, value] of Object.entries(source).slice(0, MAX_TEMPLATE_KEYS)) {
    if (key === 'id') continue;
    if (typeof value === 'string') next[key] = value.slice(0, MAX_TEMPLATE_STRING_LENGTH);
    else if (typeof value === 'boolean') next[key] = value;
    else if (Number.isFinite(Number(value))) next[key] = cleanNumber(value, 0, -1_000_000, 1_000_000);
  }
  return next;
}

function sanitizeLayerList(items, limit, sanitizer, idFactory) {
  if (!Array.isArray(items)) return [];
  const usedIds = new Set();
  return items
    .slice(0, limit)
    .map((item) => sanitizer(item, usedIds, idFactory))
    .filter(Boolean);
}

function sanitizeLayerPage(page, idFactory) {
  const source = objectValue(page) || {};
  return {
    texts: sanitizeLayerList(source.texts, MAX_TEXT_LAYERS_PER_PAGE, sanitizeTextLayer, idFactory),
    drawings: sanitizeLayerList(source.drawings, MAX_DRAWING_LAYERS_PER_PAGE, sanitizeDrawingLayer, idFactory),
    templates: sanitizeLayerList(source.templates, MAX_TEMPLATE_LAYERS_PER_PAGE, sanitizeTemplateLayer, idFactory),
  };
}

export function normalizeAlbumEditorMode(value, fallback = 'collage') {
  return ALBUM_EDITOR_MODES.includes(value) ? value : fallback;
}

export function normalizeExtraLayers(value) {
  return {
    version: 1,
    pages: value?.pages && typeof value.pages === 'object' && !Array.isArray(value.pages) ? value.pages : {},
  };
}

export function sanitizeExtraLayers(value, options = {}) {
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : makeLayerId;
  const sourcePages = normalizeExtraLayers(value).pages;
  const pages = {};

  for (const [key, page] of Object.entries(sourcePages)) {
    const pageNumber = Number(key);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > MAX_EXTRA_LAYER_PAGES) continue;
    pages[String(pageNumber)] = sanitizeLayerPage(page, idFactory);
  }

  return { version: 1, pages };
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
    if (raw) localLayers = sanitizeExtraLayers(JSON.parse(raw), options);
  } catch {
    // ignore broken local data
  }

  try {
    const bridge = options.bridge ?? globalThis.__collageAlbumLayers;
    const bridgeLayers = sanitizeExtraLayers(bridge?.getLayers?.(), options);
    if (hasAnyExtraLayer(bridgeLayers) || !hasAnyExtraLayer(localLayers)) return bridgeLayers;
  } catch {
    // ignore bridge errors
  }

  return localLayers ?? sanitizeExtraLayers(null, options);
}

export function writeExtraLayers(value, options = {}) {
  const layers = sanitizeExtraLayers(value, options);
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
  if (!next.pages || typeof next.pages !== 'object' || Array.isArray(next.pages)) next.pages = {};
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
