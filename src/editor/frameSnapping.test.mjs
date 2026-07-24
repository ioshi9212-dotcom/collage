import assert from 'node:assert/strict';
import {
  hasFrameSnapGuides,
  snapFramePosition,
  snapFrameTransformBox,
} from './frameSnapping.js';

const canvas = { width: 1000, height: 800 };
const moving = { id: 'moving', x: 100, y: 100, width: 200, height: 200 };
const sibling = { id: 'sibling', x: 500, y: 100, width: 200, height: 300 };
const frames = [moving, sibling];

{
  const result = snapFramePosition({ frame: moving, frames, canvas, x: 292, y: 107 });
  assert.equal(result.x, 300, 'right edge should snap to the sibling left edge');
  assert.equal(result.y, 100, 'top edge should snap to the sibling top edge');
  assert.deepEqual(result.guides.vertical, [500]);
  assert.deepEqual(result.guides.horizontal, [100]);
  assert.equal(hasFrameSnapGuides(result.guides), true);
}

{
  const result = snapFramePosition({ frame: moving, frames, canvas, x: 394, y: 377 });
  assert.equal(result.x, 400, 'frame center should snap to page center');
  assert.equal(result.y, 400, 'frame center should snap to page center');
  assert.deepEqual(result.guides.vertical, [500]);
  assert.deepEqual(result.guides.horizontal, [500]);
}

{
  const result = snapFramePosition({ frame: moving, frames, canvas, x: 260, y: 250, threshold: 10 });
  assert.equal(result.x, 260);
  assert.equal(result.y, 250);
  assert.equal(hasFrameSnapGuides(result.guides), false, 'frames outside threshold must stay fully free');
}

{
  const result = snapFrameTransformBox({
    frame: moving,
    frames,
    canvas,
    pageOffsetX: 90,
    oldBox: { x: 190, y: 100, width: 200, height: 200 },
    newBox: { x: 190, y: 100, width: 392, height: 297 },
  });
  assert.equal(result.box.width, 400, 'resized right edge should snap to sibling left edge');
  assert.equal(result.box.height, 300, 'resized bottom edge should snap to sibling bottom edge');
  assert.deepEqual(result.guides.vertical, [500], 'guide coordinates must stay local to the page');
  assert.deepEqual(result.guides.horizontal, [400]);
}

{
  const result = snapFrameTransformBox({
    frame: moving,
    frames,
    canvas,
    oldBox: { x: 100, y: 100, width: 200, height: 200 },
    newBox: { x: 295, y: 295, width: 5, height: 5 },
    minFrame: 80,
  });
  assert.equal(result.box.width, 5, 'snapping must not invent a valid size from an already invalid transform');
  assert.equal(result.box.height, 5);
}

console.log('smart frame snapping checks passed');
