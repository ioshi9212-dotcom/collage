import assert from 'node:assert/strict';
import { countFramesInLayout } from './pageModel.js';
import { addFreeFrameToPage, removeFreeFrameFromPage } from './freeFrameActions.js';

const canvas = { width: 1480, height: 2100 };
const settings = { frameCount: 2, padding: 70, gap: 28, frameMode: 'free' };
const first = { id: 'first', x: 37, y: 91, width: 611, height: 733, photo: { id: 'photo-1', zoom: 1.42, offsetX: -17, offsetY: 9 }, zIndex: 2 };
const second = { id: 'second', x: 721, y: 1003, width: 503, height: 417, photo: null, zIndex: 8 };
const page = { id: 'page-1', frameCount: 2, layout: null, frames: [first, second] };

{
  const result = addFreeFrameToPage(page, canvas, settings, () => 'new-frame');
  assert.equal(result.page.frames.length, 3);
  assert.equal(result.page.frameCount, 3);
  assert.equal(countFramesInLayout(result.page.layout), 3);
  assert.equal(result.page.frames[0], first, 'adding a frame must preserve the first frame object');
  assert.equal(result.page.frames[1], second, 'adding a frame must preserve the second frame object');
  assert.deepEqual(result.page.frames[0], first, 'manual geometry and photo crop must stay unchanged');
  assert.deepEqual(result.page.frames[1], second, 'other manual geometry must stay unchanged');
  assert.equal(result.frame.id, 'new-frame');
  assert.equal(result.frame.photo, null);
  assert.equal(result.frame.zIndex, 9);
  assert.ok(result.frame.x >= 0 && result.frame.x + result.frame.width <= canvas.width);
  assert.ok(result.frame.y >= 0 && result.frame.y + result.frame.height <= canvas.height);
}

{
  const next = removeFreeFrameFromPage(page, 'second', canvas, settings);
  assert.equal(next.frames.length, 1);
  assert.equal(next.frameCount, 1);
  assert.equal(countFramesInLayout(next.layout), 1);
  assert.equal(next.frames[0], first, 'deleting another frame must preserve object identity');
  assert.deepEqual(next.frames[0], first, 'deleting another frame must preserve geometry and photo crop');
}

{
  const next = removeFreeFrameFromPage({ ...page, frameCount: 1, frames: [first] }, 'first', canvas, settings);
  assert.equal(next.frameCount, 0);
  assert.deepEqual(next.frames, []);
  assert.equal(next.layout, null);
}

console.log('free frame actions preserve manual geometry');
