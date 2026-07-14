import assert from 'node:assert/strict';
import {
  MAX_DRAWING_LAYERS_PER_PAGE,
  MAX_EXTRA_LAYER_PAGES,
  MAX_TEMPLATE_LAYERS_PER_PAGE,
  MAX_TEXT_LAYERS_PER_PAGE,
  MAX_TEXT_LAYER_CHARACTERS,
  sanitizeExtraLayers,
} from './extraLayers.js';

{
  let id = 0;
  const oversizedText = 'x'.repeat(MAX_TEXT_LAYER_CHARACTERS + 50);
  const dirty = sanitizeExtraLayers({
    version: 99,
    pages: {
      1: {
        texts: [
          { id: 'duplicate', x: 'broken', y: Infinity, width: -50, text: oversizedText, fontSize: 9000, fontWeight: 4, fontStyle: 'oblique', lineHeight: 50, color: '#123456' },
          { id: 'duplicate', text: 'second' },
          null,
        ],
        drawings: [
          { id: 'line', type: 'line', x: -999999, y: 999999, length: 0, angle: Infinity, strokeWidth: 9000, opacity: -4 },
          { id: 'ignored', type: 'circle' },
        ],
        templates: [
          { id: 'template', title: 'ok', nested: { unsafe: true }, values: [1, 2], amount: Infinity, enabled: true },
        ],
      },
      501: { texts: [{ id: 'outside' }] },
      metadata: { should: 'drop' },
    },
  }, { idFactory: () => `generated-${++id}` });

  assert.equal(dirty.version, 1);
  assert.deepEqual(Object.keys(dirty.pages), ['1'], `only page numbers from 1 to ${MAX_EXTRA_LAYER_PAGES} are allowed`);
  assert.equal(dirty.pages[1].texts.length, 2, 'invalid text entries must be removed');
  assert.equal(dirty.pages[1].texts[0].text.length, MAX_TEXT_LAYER_CHARACTERS);
  assert.equal(dirty.pages[1].texts[0].x, 0);
  assert.equal(dirty.pages[1].texts[0].y, 0);
  assert.equal(dirty.pages[1].texts[0].width, 1);
  assert.equal(dirty.pages[1].texts[0].fontSize, 500);
  assert.equal(dirty.pages[1].texts[0].fontWeight, 100);
  assert.equal(dirty.pages[1].texts[0].fontStyle, 'normal');
  assert.equal(dirty.pages[1].texts[0].lineHeight, 5);
  assert.notEqual(dirty.pages[1].texts[0].id, dirty.pages[1].texts[1].id, 'duplicate IDs must be repaired');
  assert.equal(dirty.pages[1].drawings.length, 1, 'unsupported drawing types must be removed');
  assert.equal(dirty.pages[1].drawings[0].x, -10_000);
  assert.equal(dirty.pages[1].drawings[0].y, 10_000);
  assert.equal(dirty.pages[1].drawings[0].length, 1);
  assert.equal(dirty.pages[1].drawings[0].strokeWidth, 500);
  assert.equal(dirty.pages[1].drawings[0].opacity, 0);
  assert.deepEqual(dirty.pages[1].templates[0], { id: 'template', title: 'ok', enabled: true });
}

{
  const manyTexts = Array.from({ length: MAX_TEXT_LAYERS_PER_PAGE + 20 }, (_, index) => ({ id: `text-${index}`, text: 'x' }));
  const manyDrawings = Array.from({ length: MAX_DRAWING_LAYERS_PER_PAGE + 20 }, (_, index) => ({ id: `line-${index}`, type: 'line' }));
  const manyTemplates = Array.from({ length: MAX_TEMPLATE_LAYERS_PER_PAGE + 20 }, (_, index) => ({ id: `template-${index}` }));
  const limited = sanitizeExtraLayers({ pages: { 1: { texts: manyTexts, drawings: manyDrawings, templates: manyTemplates } } });
  assert.equal(limited.pages[1].texts.length, MAX_TEXT_LAYERS_PER_PAGE);
  assert.equal(limited.pages[1].drawings.length, MAX_DRAWING_LAYERS_PER_PAGE);
  assert.equal(limited.pages[1].templates.length, MAX_TEMPLATE_LAYERS_PER_PAGE);
}

console.log('extra layer safety checks passed');
