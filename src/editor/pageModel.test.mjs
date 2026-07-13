import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clonePageForDuplicate,
  countFramesInLayout,
  createBlankPage,
  createInitialAlbum,
  createPage,
  createPageFromTemplate,
  normalizeProjectPages,
  resolvePageFrameCount,
  settingsForPage,
} from './pageModel.js';

const canvas = { width: 1000, height: 1400 };
const settings = {
  frameCount: 2,
  padding: 40,
  gap: 20,
  borderWidth: 0,
  borderColor: '#ffffff',
  showGuides: true,
  frameMode: 'free',
};

function ids(prefix = 'id') {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

{
  const layout = {
    rows: [
      { columns: [{ frameId: 'a' }, { frameId: 'b' }] },
      { columns: [{ frameId: 'c' }] },
    ],
  };
  assert.equal(countFramesInLayout(layout), 3);
  assert.equal(countFramesInLayout(null), 0);
  assert.equal(resolvePageFrameCount({ frameCount: 0 }, settings), 0, 'an explicit empty collage page must stay empty');
  assert.equal(resolvePageFrameCount({ isBlankPage: true, frameCount: 7 }, settings), 0);
  assert.equal(resolvePageFrameCount({ layout }, settings), 3);
  assert.equal(resolvePageFrameCount({ frames: [{}, {}, {}, {}] }, settings), 4);
  assert.equal(resolvePageFrameCount({}, { frameCount: 6 }), 6);
  assert.equal(resolvePageFrameCount({}, { frameCount: 'broken' }), 5);
  assert.equal(settingsForPage(settings, { frameCount: 0 }).frameCount, 0);
  assert.equal(settingsForPage(settings, { frameCount: 2 }, 7).frameCount, 7);
}

{
  const page = createPage(canvas, settings, 3, [], ids('page'));
  assert.equal(page.id, 'page-1');
  assert.equal(page.title, 'Страница 3');
  assert.equal(page.frameCount, 2);
  assert.equal(page.frames.length, 2);
  assert.equal(countFramesInLayout(page.layout), 2);

  const blank = createBlankPage(4, {}, ids('blank'));
  assert.deepEqual(blank, {
    id: 'blank-1',
    title: 'Пустая страница 4',
    isBlankPage: true,
    frameCount: 0,
    layout: null,
    frames: [],
  });
  const preservedBlank = createBlankPage(5, { id: 'saved-id', title: 'Обложка' }, ids('unused'));
  assert.equal(preservedBlank.id, 'saved-id');
  assert.equal(preservedBlank.title, 'Обложка');
}

{
  const source = {
    id: 'page-old',
    title: 'Страница 1',
    frameCount: 2,
    layout: {
      type: 'grid',
      rows: [{
        id: 'row-old',
        columns: [
          { id: 'column-a', frameId: 'frame-a', width: 400 },
          { id: 'column-b', frameId: 'frame-b', width: 400 },
        ],
      }],
    },
    frames: [
      { id: 'frame-a', x: 0, y: 0, width: 400, height: 600, photo: { id: 'photo-a', zoom: 1.3, offsetX: 12, offsetY: -8 } },
      { id: 'frame-b', x: 420, y: 0, width: 400, height: 600, photo: null },
    ],
  };
  const before = structuredClone(source);
  const duplicate = clonePageForDuplicate(source, 2, ids('copy'));

  assert.deepEqual(source, before, 'duplicating a page must not mutate the source');
  assert.equal(duplicate.title, 'Страница 2');
  assert.notEqual(duplicate.id, source.id);
  assert.notEqual(duplicate.frames[0].id, source.frames[0].id);
  assert.notEqual(duplicate.frames[1].id, source.frames[1].id);
  assert.notEqual(duplicate.layout.rows[0].id, source.layout.rows[0].id);
  assert.notEqual(duplicate.layout.rows[0].columns[0].id, source.layout.rows[0].columns[0].id);
  assert.equal(duplicate.layout.rows[0].columns[0].frameId, duplicate.frames[0].id);
  assert.equal(duplicate.layout.rows[0].columns[1].frameId, duplicate.frames[1].id);
  assert.deepEqual(duplicate.frames[0].photo, source.frames[0].photo, 'crop metadata and photo binding must be copied exactly');
  assert.notEqual(duplicate.frames[0].photo, source.frames[0].photo, 'copied photo metadata must be a separate object');

  const templatePage = createPageFromTemplate(source, 4, ids('template'));
  assert.equal(templatePage.title, 'Страница 5');
  assert.ok(templatePage.frames.every((frame) => frame.photo === null), 'template runtime pages must not keep source photos');
  assert.equal(templatePage.layout.rows[0].columns[0].frameId, templatePage.frames[0].id);
}

{
  const album = createInitialAlbum(canvas, settings, ids('initial'));
  assert.equal(album.pages.length, 2);
  assert.equal(album.currentPageId, album.pages[0].id);
  assert.equal(album.pages[0].title, 'Страница 1');
  assert.equal(album.pages[1].title, 'Страница 2');
  assert.notEqual(album.pages[0].id, album.pages[1].id);
}

{
  const library = [{ id: 'photo-1', name: 'baby.jpg', src: 'data:image/jpeg;base64,AAA' }];
  const source = {
    library,
    pages: [
      {
        id: 'saved-page',
        title: 'Месяц 1',
        frameCount: 1,
        layout: {
          type: 'grid',
          rows: [{ id: 'saved-row', columns: [{ id: 'saved-column', frameId: 'saved-frame' }] }],
        },
        frames: [{
          id: 'saved-frame',
          x: 10,
          y: 20,
          width: 500,
          height: 700,
          photo: { id: 'photo-1', name: 'baby.jpg', zoom: 1.4, offsetX: 9, offsetY: -3 },
        }],
      },
      { id: 'empty-page', title: 'Без фото', frameCount: 0, layout: null, frames: [] },
      { id: 'blank-page', title: 'Форзац', isBlankPage: true, frameCount: 0, layout: null, frames: [] },
    ],
  };
  const before = structuredClone(source);
  const normalized = normalizeProjectPages(source, canvas, settings, ids('normalized'));

  assert.deepEqual(source, before, 'normalizing saved pages must not mutate imported data');
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].id, 'saved-page');
  assert.equal(normalized[0].frames[0].photo.src, library[0].src, 'photo source must be hydrated from the library');
  assert.equal(normalized[0].frames[0].photo.zoom, 1.4);
  assert.equal(normalized[1].frameCount, 0, 'saved zero-frame pages must remain empty');
  assert.equal(normalized[1].frames.length, 0);
  assert.equal(normalized[2].isBlankPage, true);
  assert.equal(normalized[2].title, 'Форзац');
}

{
  const legacy = normalizeProjectPages({
    library: [{ id: 'legacy-photo', name: 'old.jpg', src: 'data:image/jpeg;base64,BBB' }],
    frames: [{
      id: 'legacy-frame',
      x: 0,
      y: 0,
      width: 400,
      height: 500,
      photo: { id: 'legacy-photo', zoom: 1.2, offsetX: 3, offsetY: 4 },
    }],
  }, canvas, { ...settings, frameCount: 1 }, ids('legacy'));
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].frames[0].photo.src, 'data:image/jpeg;base64,BBB');
  assert.equal(legacy[0].frames[0].photo.zoom, 1.2);

  const fallback = normalizeProjectPages({}, canvas, settings, ids('fallback'));
  assert.equal(fallback.length, 2);
  assert.equal(fallback[0].title, 'Страница 1');
  assert.equal(fallback[1].title, 'Страница 2');
}

const appSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
assert.match(appSource, /from '\.\/editor\/pageModel'/, 'AppLive must import the extracted page model');
assert.doesNotMatch(appSource, /function clonePageForDuplicate\(/, 'page duplication logic must no longer live inside AppLive');
assert.doesNotMatch(appSource, /function normalizePages\(/, 'saved-page normalization must no longer live inside AppLive');
assert.doesNotMatch(appSource, /function runtimePageFromTemplate\(/, 'template page preparation must no longer live inside AppLive');
assert.match(appSource, /normalizeProjectPages/);
assert.match(appSource, /createPageFromTemplate/);

console.log('page model checks passed');
