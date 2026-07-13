import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyPhotoToFrames,
  bringFrameToFront,
  buildFrameTransformPatch,
  clampFramePosition,
  clampPhotoPosition,
  clearAllFramePhotos,
  clearFramePhoto,
  coverPhotoRect,
  createPlacedPhoto,
  findFrameAtPoint,
  photoOffsetFromPosition,
  removeFrameById,
  updateFrameGeometry,
  updateFramePhoto,
  validateFrameTransformBox,
} from './frameModel.js';

{
  const rect = coverPhotoRect(
    { width: 100, height: 50 },
    { width: 200, height: 200 },
    { zoom: 1, offsetX: 12, offsetY: -8 },
  );
  assert.deepEqual(rect, {
    x: -88,
    y: -8,
    width: 400,
    height: 200,
    baseX: -100,
    baseY: 0,
  });
  assert.equal(coverPhotoRect(null, { width: 10, height: 10 }, {}), null);
}

{
  const rect = { width: 400, height: 300, baseX: -100, baseY: -50 };
  const frame = { width: 200, height: 200 };
  assert.deepEqual(clampPhotoPosition(rect, frame, 30, -200), { x: 0, y: -100 });
  assert.deepEqual(clampPhotoPosition(rect, frame, -500, 20), { x: -200, y: 0 });
  assert.deepEqual(photoOffsetFromPosition(rect, -85.4, -31.6), { offsetX: 15, offsetY: 18 });
  assert.deepEqual(photoOffsetFromPosition(null, 10, 20), { offsetX: 0, offsetY: 0 });
}

{
  const source = { id: 'photo-1', name: 'one.jpg', src: 'data:image/jpeg;base64,one', zoom: 2.5, offsetX: 90 };
  assert.deepEqual(createPlacedPhoto(source), {
    id: 'photo-1',
    name: 'one.jpg',
    src: 'data:image/jpeg;base64,one',
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });
}

{
  const frames = [
    { id: 'a', x: 0, photo: null },
    { id: 'b', x: 10, photo: { id: 'old', zoom: 1.4, offsetX: 4, offsetY: 5 } },
  ];
  const snapshot = structuredClone(frames);
  const placed = applyPhotoToFrames(frames, 'a', { id: 'new', name: 'new.png', src: 'data:new' });
  assert.deepEqual(frames, snapshot, 'placing a photo must not mutate existing frames');
  assert.equal(placed[1], frames[1], 'untouched frames should preserve object identity');
  assert.deepEqual(placed[0].photo, { id: 'new', name: 'new.png', src: 'data:new', zoom: 1, offsetX: 0, offsetY: 0 });

  const updated = updateFramePhoto(placed, 'a', { zoom: 2, offsetX: -12 });
  assert.equal(updated[0].photo.zoom, 2);
  assert.equal(updated[0].photo.offsetX, -12);
  assert.equal(updated[0].photo.offsetY, 0);
  const missing = updateFramePhoto(frames, 'a', { zoom: 3 });
  assert.equal(missing[0], frames[0], 'a frame without a photo must remain untouched');

  const cleared = clearFramePhoto(updated, 'a');
  assert.equal(cleared[0].photo, null);
  assert.equal(cleared[1], updated[1]);
  const clearedAll = clearAllFramePhotos(updated);
  assert.equal(clearedAll[0].photo, null);
  assert.equal(clearedAll[1].photo, null);
  assert.deepEqual(frames, snapshot);
}

{
  const frames = [
    { id: 'a', x: 20, y: 30, width: 200, height: 180, photo: { id: 'p' } },
    { id: 'b', x: 10, y: 10, width: 100, height: 100 },
  ];
  const changed = updateFrameGeometry(frames, 'a', { x: -50, y: 900, width: 20, height: 900 }, { width: 500, height: 400 });
  assert.equal(changed[1], frames[1]);
  assert.ok(changed[0].x >= 0);
  assert.ok(changed[0].y >= 0);
  assert.ok(changed[0].width >= 80);
  assert.ok(changed[0].height >= 80);
  assert.ok(changed[0].x + changed[0].width <= 500);
  assert.ok(changed[0].y + changed[0].height <= 400);
  assert.deepEqual(changed[0].photo, { id: 'p' });

  assert.deepEqual(removeFrameById(frames, 'a'), [frames[1]]);
  const raised = bringFrameToFront([{ id: 'a', zIndex: 2 }, { id: 'b', zIndex: 7 }, { id: 'c' }], 'a');
  assert.equal(raised[0].zIndex, 8);
  assert.equal(raised[1].zIndex, 7);
}

{
  const entries = [
    { x: 100, page: { id: 'page-1', frames: [{ id: 'frame-1', x: 20, y: 30, width: 80, height: 70 }] } },
    { x: 400, page: { id: 'page-2', frames: [{ id: 'frame-2', x: 0, y: 0, width: 100, height: 100 }] } },
  ];
  assert.deepEqual(findFrameAtPoint(entries, { x: 150, y: 60 }), {
    pageId: 'page-1',
    frameId: 'frame-1',
    frame: entries[0].page.frames[0],
  });
  assert.deepEqual(findFrameAtPoint(entries, { x: 450, y: 50 }), {
    pageId: 'page-2',
    frameId: 'frame-2',
    frame: entries[1].page.frames[0],
  });
  assert.equal(findFrameAtPoint(entries, { x: 50, y: 50 }), null);
  assert.equal(findFrameAtPoint(entries, null), null);
}

{
  assert.deepEqual(
    clampFramePosition({ width: 200, height: 150 }, { width: 500, height: 400 }, -20, 900),
    { x: 0, y: 250 },
  );
  assert.deepEqual(
    buildFrameTransformPatch(
      { x: 10, y: 20, width: 100, height: 80 },
      { x: 5, y: -4, scaleX: 1.5, scaleY: 2 },
    ),
    { x: 15, y: 16, width: 150, height: 160 },
  );

  const oldBox = { x: 100, y: 0, width: 200, height: 200 };
  const valid = { x: 120, y: 20, width: 300, height: 250 };
  const options = { pageOffsetX: 100, canvas: { width: 500, height: 400 } };
  assert.equal(validateFrameTransformBox(oldBox, valid, options), valid);
  assert.equal(validateFrameTransformBox(oldBox, { ...valid, width: 79 }, options), oldBox);
  assert.equal(validateFrameTransformBox(oldBox, { ...valid, x: 99 }, options), oldBox);
  assert.equal(validateFrameTransformBox(oldBox, { ...valid, x: 350, width: 300 }, options), oldBox);
  assert.equal(validateFrameTransformBox(oldBox, { ...valid, y: 200, height: 250 }, options), oldBox);
}

const appSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
assert.match(appSource, /from '\.\/editor\/frameModel'/, 'AppLive must import the extracted frame model');
assert.doesNotMatch(appSource, /function coverRect\(/, 'cover geometry must no longer live inside AppLive');
assert.doesNotMatch(appSource, /function clampPhoto\(/, 'photo clamping must no longer live inside AppLive');
assert.match(appSource, /applyPhotoToFrames\(frames, frameId, photo\)/);
assert.match(appSource, /findFrameAtPoint\(entries, point\)/);
assert.match(appSource, /clearAllFramePhotos\(frames\)/);
assert.match(appSource, /clearFramePhoto\(frames, selectedFrame\.id\)/);
assert.match(appSource, /validateFrameTransformBox\(oldBox, newBox, \{ pageOffsetX, canvas, minFrame: MIN_FRAME \}\)/);

console.log('frame and photo model checks passed');
