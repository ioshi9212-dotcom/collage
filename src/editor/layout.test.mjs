import assert from 'node:assert/strict';
import {
  MIN_FRAME,
  buildGridLayout,
  ensureLayout,
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

console.log('layout boundary checks passed');
