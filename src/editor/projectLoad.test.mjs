import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { InvalidProjectError, prepareEditorProject } from './projectLoad.js';

function options(overrides = {}) {
  return {
    defaultCanvas: { width: 1480, height: 2100 },
    defaultSettings: { frameCount: 5, frameMode: 'free' },
    normalizePages: (data) => data.pages || [{ id: 'legacy-page', frames: data.frames }],
    normalizeBookletSheets: (value) => Number(value) || 4,
    normalizeBookletPrintSettings: (value) => ({ gap: Number(value?.gap) || 0 }),
    normalizeExtraLayers: (value) => value?.pages ? value : { version: 1, pages: {} },
    ...overrides,
  };
}

{
  const plan = prepareEditorProject({
    canvas: { width: '2200', height: 99999 },
    settings: { frameCount: 2 },
    pages: [{ id: 'page-1' }, { id: 'page-2' }],
    currentPageId: 'page-2',
    library: [{ id: 'photo-1', src: 'data:image/png;base64,AA==' }],
    viewMode: 'booklet',
    bookletSheetsPerBlock: 6,
    bookletPrintSettings: { gap: 12 },
    extraLayers: { version: 1, pages: { 1: { texts: [] } } },
    albumEditorMode: 'text',
  }, options());

  assert.equal(plan.canvas.width, 2200);
  assert.equal(plan.canvas.height, 5000, 'canvas dimensions must be bounded before applying state');
  assert.equal(plan.settings.frameCount, 2);
  assert.equal(plan.settings.frameMode, 'free');
  assert.equal(plan.currentPageId, 'page-2');
  assert.equal(plan.viewMode, 'booklet');
  assert.equal(plan.albumEditorMode, 'text');
  assert.equal(plan.bookletSheetsPerBlock, 6);
  assert.equal(plan.bookletPrintSettings.gap, 12);
  assert.equal(plan.library.length, 1);
}

{
  const plan = prepareEditorProject({
    frames: [],
    currentPageId: 'missing',
    viewMode: 'unknown',
    albumEditorMode: 'unknown',
  }, options());
  assert.equal(plan.pages[0].id, 'legacy-page', 'legacy frame-only projects must remain supported');
  assert.equal(plan.currentPageId, 'legacy-page');
  assert.equal(plan.viewMode, 'spread');
  assert.equal(plan.albumEditorMode, 'collage');
}

for (const invalid of [null, [], {}, { pages: [] }, { pages: [null] }, { pages: [{}] }]) {
  assert.throws(
    () => prepareEditorProject(invalid, options()),
    (error) => error instanceof InvalidProjectError && error.code === 'invalid_project',
    'invalid data must be rejected before editor state changes',
  );
}

{
  let normalizationCalls = 0;
  assert.throws(
    () => prepareEditorProject({ pages: [{ id: 'page-1' }] }, options({
      normalizePages() {
        normalizationCalls += 1;
        throw new Error('broken page data');
      },
    })),
    /broken page data/,
  );
  assert.equal(normalizationCalls, 1);
}

const appSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
assert.match(appSource, /import \{ prepareEditorProject \} from '\.\/editor\/projectLoad'/);
assert.match(appSource, /openProject:\s*\(data\)\s*=>\s*\{/);
assert.match(appSource, /applyProjectData\(data, 'Проект открыт из аккаунта'\)/);
const applyBody = appSource.match(/function applyProjectData\(data, message\) \{([\s\S]*?)\n  \}/)?.[1] || '';
assert.match(applyBody, /const prepared = prepareEditorProject\(/);
assert.ok(
  applyBody.indexOf('const prepared = prepareEditorProject(') < applyBody.indexOf('setCanvas(prepared.canvas)'),
  'the complete project must be prepared before the first React state mutation',
);

console.log('atomic project load planning checks passed');
