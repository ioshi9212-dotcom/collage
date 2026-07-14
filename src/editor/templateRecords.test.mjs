import assert from 'node:assert/strict';
import {
  MAX_TEMPLATE_JSON_BYTES,
  MAX_TEMPLATE_RECORDS,
  sanitizeTemplateRecord,
  sanitizeTemplateRecords,
  templateJsonFileError,
} from './templateRecords.js';
import { MAX_PROJECT_PAGES } from './pageModel.js';

let id = 0;
const idFactory = () => `fresh-${++id}`;
const now = '2026-07-14T00:00:00.000Z';

const dirty = sanitizeTemplateRecord({
  id: 'template-a',
  title: '  Семейный шаблон  ',
  scope: 'broken',
  canvas: { width: 99, height: 99_999 },
  settings: { frameCount: 99, padding: -5, gap: Infinity, borderWidth: 999, borderColor: '#123', showGuides: false, frameMode: 'broken' },
  pages: [{
    id: 'page-old',
    title: 'Old',
    frames: [{ id: 'frame-old', x: -100, y: 50, width: 800, height: 900, photo: { id: 'secret', src: 'data:image/png;base64,AAAA' } }],
  }],
  extraLayers: {
    pages: {
      1: {
        texts: [{ id: 'text', text: 'hello', fontSize: 9000 }],
        drawings: [{ id: 'line', type: 'line', opacity: 4 }],
      },
      900: { texts: [{ id: 'outside' }] },
    },
  },
  createdAt: 'not-a-date',
}, { idFactory, now });

assert.ok(dirty);
assert.equal(dirty.version, 2);
assert.equal(dirty.id, 'template-a');
assert.equal(dirty.title, 'Семейный шаблон');
assert.equal(dirty.scope, 'page');
assert.deepEqual(dirty.canvas, { width: 300, height: 5000 });
assert.equal(dirty.settings.frameCount, 9);
assert.equal(dirty.settings.padding, 0);
assert.equal(dirty.settings.gap, 28);
assert.equal(dirty.settings.borderWidth, 200);
assert.equal(dirty.settings.frameMode, 'free');
assert.equal(dirty.pages.length, 1);
assert.ok(dirty.pages[0].id);
assert.ok(dirty.pages[0].frames.every((frame) => frame.photo === null), 'template photos must always be stripped');
assert.equal(dirty.extraLayers.pages[1].texts[0].fontSize, 500);
assert.equal(dirty.extraLayers.pages[1].drawings[0].opacity, 1);
assert.equal(dirty.extraLayers.pages[900], undefined);
assert.equal(dirty.createdAt, now);

assert.equal(sanitizeTemplateRecord(null), null);
assert.equal(sanitizeTemplateRecord({ pages: [] }), null);
assert.equal(sanitizeTemplateRecord({ pages: Array.from({ length: MAX_PROJECT_PAGES + 1 }, () => ({})) }), null);
assert.equal(sanitizeTemplateRecord({ pages: [{ frames: Array.from({ length: 101 }, () => ({})) }] }), null, 'frame limits must be inherited from the project model');

const duplicateRecords = sanitizeTemplateRecords([
  { id: 'same', pages: [{}] },
  { id: 'same', pages: [{}] },
], { idFactory, now });
assert.equal(duplicateRecords.length, 2);
assert.notEqual(duplicateRecords[0].id, duplicateRecords[1].id);

const manyRecords = sanitizeTemplateRecords(Array.from({ length: MAX_TEMPLATE_RECORDS + 10 }, (_, index) => ({ id: `template-${index}`, pages: [{}] })), { idFactory, now });
assert.equal(manyRecords.length, MAX_TEMPLATE_RECORDS);

assert.equal(templateJsonFileError(null), 'Файл не выбран');
assert.equal(templateJsonFileError({ size: MAX_TEMPLATE_JSON_BYTES }), '');
assert.match(templateJsonFileError({ size: MAX_TEMPLATE_JSON_BYTES + 1 }), /20 МБ/);

console.log('template record safety checks passed');
