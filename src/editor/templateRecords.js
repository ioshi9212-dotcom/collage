import { sanitizeExtraLayers } from './extraLayers.js';
import { MAX_PROJECT_PAGES, normalizeProjectPages } from './pageModel.js';

export const MAX_TEMPLATE_RECORDS = 200;
export const MAX_TEMPLATE_JSON_BYTES = 20 * 1024 * 1024;

const MAX_TEMPLATE_TITLE_LENGTH = 200;
const MAX_TEMPLATE_ID_LENGTH = 200;

function makeTemplateId() {
  return globalThis.crypto?.randomUUID?.() ?? `template_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

function cleanCanvas(value) {
  const source = objectValue(value) || {};
  return {
    width: Math.round(cleanNumber(source.width, 1480, 300, 5000)),
    height: Math.round(cleanNumber(source.height, 2100, 300, 5000)),
  };
}

function cleanSettings(value) {
  const source = objectValue(value) || {};
  return {
    presetId: cleanString(source.presetId, 'custom', 100),
    frameCount: Math.round(cleanNumber(source.frameCount, 5, 0, 9)),
    padding: cleanNumber(source.padding, 70, 0, 1000),
    gap: cleanNumber(source.gap, 28, 0, 1000),
    borderWidth: cleanNumber(source.borderWidth, 0, 0, 200),
    borderColor: cleanString(source.borderColor, '#ffffff', 64),
    showGuides: source.showGuides !== false,
    frameMode: source.frameMode === 'locked' ? 'locked' : 'free',
  };
}

function cleanCreatedAt(value, now) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : now;
}

function uniqueTemplateId(value, usedIds, idFactory) {
  const base = cleanString(value, '', MAX_TEMPLATE_ID_LENGTH) || cleanString(idFactory(), 'template', MAX_TEMPLATE_ID_LENGTH);
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base.slice(0, Math.max(1, MAX_TEMPLATE_ID_LENGTH - 12))}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

export function sanitizeTemplateRecord(record, options = {}) {
  const source = objectValue(record);
  if (!source || !Array.isArray(source.pages) || source.pages.length === 0 || source.pages.length > MAX_PROJECT_PAGES) return null;

  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : makeTemplateId;
  const usedIds = options.usedIds instanceof Set ? options.usedIds : new Set();
  const now = options.now || new Date().toISOString();
  const canvas = cleanCanvas(source.canvas);
  const settings = cleanSettings(source.settings);

  let pages;
  try {
    pages = normalizeProjectPages({ pages: source.pages, library: [] }, canvas, settings, idFactory)
      .map((page) => ({
        ...page,
        frames: Array.isArray(page.frames) ? page.frames.map((frame) => ({ ...frame, photo: null })) : [],
      }));
  } catch {
    return null;
  }

  if (!pages.length) return null;
  const scope = ['page', 'spread', 'album'].includes(source.scope) ? source.scope : (pages.length > 2 ? 'album' : pages.length === 2 ? 'spread' : 'page');
  const title = cleanString(source.title, `Шаблон ${pages.length} стр.`, MAX_TEMPLATE_TITLE_LENGTH).trim() || `Шаблон ${pages.length} стр.`;

  return {
    version: 2,
    id: uniqueTemplateId(source.id, usedIds, idFactory),
    title,
    scope,
    pageCount: pages.length,
    canvas,
    settings,
    pages,
    extraLayers: sanitizeExtraLayers(source.extraLayers, { idFactory }),
    createdAt: cleanCreatedAt(source.createdAt, now),
  };
}

export function sanitizeTemplateRecords(value, options = {}) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  const usedIds = new Set();
  return source
    .slice(0, MAX_TEMPLATE_RECORDS)
    .map((record) => sanitizeTemplateRecord(record, { ...options, usedIds }))
    .filter(Boolean);
}

export function templateJsonFileError(file) {
  if (!file) return 'Файл не выбран';
  if (Number(file.size) > MAX_TEMPLATE_JSON_BYTES) return 'Файл шаблона слишком большой. Максимум — 20 МБ.';
  return '';
}
