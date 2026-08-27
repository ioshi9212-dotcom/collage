import assert from 'node:assert/strict';
import {
  MIN_FRAME,
  buildGridLayout,
  ensureLayout,
  fitFramesToPadding,
  framesFromLayout,
  layoutRows,
  resizeColumn,
  resizeRow,
} from './layout.js';

function assertFramesInsideCanvas(frames, canvas) {
  for (const frame of frames) {
    assert.ok(Number.isFinite(frame.x), 'frame x must be finite');
    assert.ok(Number.isFinite(frame.y), 'frame y must be finite');
    assert.ok(Number.isFinite(frame.width), 'frame width must be finite');
    assert.ok(Number.isFinite(frame.height), 'frame height must be finite');
    assert.ok(frame.width >= MIN_FRAME, `frame width ${frame.width} is below minimum`);
    assert.ok(frame.height >= MIN_FRAME, `frame height ${frame.height} is below minimum`);
    assert.ok(frame.x >= 0, `frame x ${frame.x} is negative`);
    assert.ok(frame.y >= 0, `frame y ${frame.y} is negative`);
    assert.ok(frame.x + frame.width <= canvas.width, 'frame exceeds canvas width');
    assert.ok(frame.y + frame.height <= canvas.height, 'frame exceeds canvas height');
  }
}

const minimumCanvas = { width: 300, height: 300 };
for (let frameCount = 1; frameCount <= 9; frameCount += 1) {
  const built = buildGridLayout(minimumCanvas, {
    frameCount,
    padding: 300,
    gap: 200,
  });
  assert.equal(built.frames.length, frameCount);
  assertFramesInsideCanvas(built.frames, minimumCanvas);
  assert.ok(built.layout.padding >= 0);
  assert.ok(built.layout.gap >= 0);
}

assert.deepEqual(layoutRows(8), [3, 3, 2], 'eight-frame layout must fit a 300 px canvas');

const legacyFourColumnPage = {
  layout: {
    type: 'grid',
    padding: 0,
    gap: 0,
    rows: [
      {
        id: 'legacy-row-1',
        height: 150,
        columns: Array.from({ length: 4 }, (_, index) => ({
          id: `legacy-column-1-${index}`,
          frameId: `legacy-frame-${index}`,
          width: 75,
        })),
      },
      {
        id: 'legacy-row-2',
        height: 150,
        columns: Array.from({ length: 4 }, (_, index) => ({
          id: `legacy-column-2-${index}`,
          frameId: `legacy-frame-${index + 4}`,
          width: 75,
        })),
      },
    ],
  },
  frames: Array.from({ length: 8 }, (_, index) => ({
    id: `legacy-frame-${index}`,
    width: 75,
    height: 150,
    photo: index === 0 ? { id: 'photo-a' } : null,
  })),
};
const migratedLayout = ensureLayout(legacyFourColumnPage, minimumCanvas, {
  frameCount: 8,
  padding: 300,
  gap: 200,
});
assert.deepEqual(migratedLayout.rows.map((row) => row.columns.length), [3, 3, 2]);
const migratedFrames = framesFromLayout(migratedLayout, legacyFourColumnPage.frames);
assertFramesInsideCanvas(migratedFrames, minimumCanvas);
assert.equal(migratedFrames[0].photo?.id, 'photo-a', 'existing photo must survive layout migration');

const resizable = buildGridLayout({ width: 600, height: 600 }, {
  frameCount: 4,
  padding: 40,
  gap: 30,
}).layout;
const resizedColumns = resizeColumn(resizable, 0, 0, -10000);
assert.ok(resizedColumns.rows[0].columns[0].width >= MIN_FRAME);
assert.ok(resizedColumns.rows[0].columns[1].width >= MIN_FRAME);
const resizedRows = resizeRow(resizable, 0, 10000);
assert.ok(resizedRows.rows[0].height >= MIN_FRAME);
assert.ok(resizedRows.rows[1].height >= MIN_FRAME);

const preserved = ensureLayout({
  layout: {
    type: 'grid',
    padding: 300,
    gap: 200,
    rows: [
      {
        id: 'row-a',
        height: 500,
        columns: [
          { id: 'column-a', frameId: 'frame-a', width: 500 },
          { id: 'column-b', frameId: 'frame-b', width: 400 },
        ],
      },
      {
        id: 'row-b',
        height: 400,
        columns: [
          { id: 'column-c', frameId: 'frame-c', width: 450 },
          { id: 'column-d', frameId: 'frame-d', width: 450 },
        ],
      },
    ],
  },
  frames: [
    { id: 'frame-a', width: 500, height: 500 },
    { id: 'frame-b', width: 400, height: 500 },
    { id: 'frame-c', width: 450, height: 400 },
    { id: 'frame-d', width: 450, height: 400 },
  ],
}, { width: 600, height: 600 }, { frameCount: 4, padding: 300, gap: 200 });
assertFramesInsideCanvas(framesFromLayout(preserved), { width: 600, height: 600 });

{
  const canvas = { width: 1000, height: 800 };
  const frames = [
    { id: 'a', x: 100, y: 100, width: 300, height: 250, photo: { id: 'photo-a' }, zIndex: 2 },
    { id: 'b', x: 500, y: 200, width: 400, height: 500, borderWidth: 6, zIndex: 5 },
  ];
  const fitted = fitFramesToPadding(frames, canvas, 50);
  const left = Math.min(...fitted.map((frame) => frame.x));
  const top = Math.min(...fitted.map((frame) => frame.y));
  const right = Math.max(...fitted.map((frame) => frame.x + frame.width));
  const bottom = Math.max(...fitted.map((frame) => frame.y + frame.height));
  assert.equal(left, 50, 'free composition must touch the requested left inset');
  assert.equal(top, 50, 'free composition must touch the requested top inset');
  assert.equal(right, 950, 'free composition must touch the requested right inset');
  assert.equal(bottom, 750, 'free composition must touch the requested bottom inset');
  assert.deepEqual(fitted[0].photo, frames[0].photo, 'photo assignment must survive fitting');
  assert.equal(fitted[1].borderWidth, 6, 'frame style must survive fitting');
  assert.equal(fitted[1].zIndex, 5, 'z order must survive fitting');
  assert.deepEqual(frames[0], { id: 'a', x: 100, y: 100, width: 300, height: 250, photo: { id: 'photo-a' }, zIndex: 2 }, 'fitting must not mutate source frames');
}

{
  const canvas = { width: 300, height: 300 };
  const fitted = fitFramesToPadding([
    { id: 'a', x: 0, y: 0, width: 80, height: 80 },
    { id: 'b', x: 220, y: 220, width: 80, height: 80 },
  ], canvas, 120);
  assertFramesInsideCanvas(fitted, canvas);
  assert.ok(fitted.every((frame) => frame.width >= MIN_FRAME && frame.height >= MIN_FRAME), 'large padding must not shrink frames below minimum');
}

{
  const canvas = { width: 1000, height: 800 };
  const source = [
    { id: 'a', x: 100, y: 100, width: 300, height: 250, freeLayoutPadding: 70 },
    { id: 'b', x: 500, y: 200, width: 400, height: 500, freeLayoutPadding: 70 },
  ];
  const fitted = buildGridLayout(canvas, {
    frameCount: 2,
    padding: 90,
    gap: 28,
    frameMode: 'free',
  }, source);
  assert.equal(fitted.layout, null, 'changing padding in free mode must preserve the composition instead of rebuilding a grid');
  assert.equal(Math.min(...fitted.frames.map((frame) => frame.x)), 90);
  assert.equal(Math.max(...fitted.frames.map((frame) => frame.x + frame.width)), 910);
  assert.ok(fitted.frames.every((frame) => frame.freeLayoutPadding === 90));

  const rebuilt = buildGridLayout(canvas, {
    frameCount: 2,
    padding: 70,
    gap: 28,
    frameMode: 'free',
  }, source);
  assert.equal(rebuilt.layout?.type, 'grid', 'same padding must retain the existing rebuild-grid behavior');
}

console.log('layout boundary checks passed');
