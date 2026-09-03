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
  assert.deepEqual(
    fitted.map(({ x, y, width, height }) => ({ x, y, width, height })),
    [
      { x: 50, y: 50, width: 350, height: 300 },
      { x: 500, y: 200, width: 450, height: 550 },
    ],
    'only the page-facing edge of each outer frame may move; the opposite edge must stay fixed',
  );
  assert.equal(fitted[0].x + fitted[0].width, 400, 'left frame right edge must stay unchanged');
  assert.equal(fitted[0].y + fitted[0].height, 350, 'top frame bottom edge must stay unchanged');
  assert.equal(fitted[1].x, 500, 'right frame left edge must stay unchanged');
  assert.equal(fitted[1].y, 200, 'bottom frame top edge must stay unchanged');
  assert.deepEqual(fitted[0].photo, frames[0].photo, 'photo assignment must survive fitting');
  assert.equal(fitted[1].borderWidth, 6, 'frame style must survive fitting');
  assert.equal(fitted[1].zIndex, 5, 'z order must survive fitting');
  assert.deepEqual(frames[0], { id: 'a', x: 100, y: 100, width: 300, height: 250, photo: { id: 'photo-a' }, zIndex: 2 }, 'fitting must not mutate source frames');
}

{
  const canvas = { width: 1200, height: 900 };
  const frames = [
    { id: 'left', x: 120, y: 250, width: 240, height: 260 },
    { id: 'middle', x: 470, y: 300, width: 220, height: 220 },
    { id: 'right', x: 820, y: 270, width: 240, height: 260 },
  ];
  const fitted = fitFramesToPadding(frames, canvas, 60);
  assert.equal(fitted[0].x, 60, 'left outer edge must move to the requested field');
  assert.equal(fitted[0].x + fitted[0].width, 360, 'left frame far edge must stay fixed');
  assert.deepEqual(
    { x: fitted[1].x, y: fitted[1].y, width: fitted[1].width, height: fitted[1].height },
    { x: 470, y: 300, width: 220, height: 220 },
    'an interior frame must stay completely unchanged',
  );
  assert.equal(fitted[2].x, 820, 'right frame far edge must stay fixed');
  assert.equal(fitted[2].x + fitted[2].width, 1140, 'right outer edge must move to the requested field');
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
  const afterPaddingSettingChange = buildGridLayout(canvas, {
    frameCount: 2,
    padding: 90,
    gap: 28,
    frameMode: 'free',
  }, source);
  assert.equal(afterPaddingSettingChange.layout, null, 'editing the padding setting must not rebuild a free composition');
  assert.deepEqual(afterPaddingSettingChange.frames, source, 'editing the padding value alone must not alter existing free pages');

  const samePadding = buildGridLayout(canvas, {
    frameCount: 2,
    padding: 70,
    gap: 28,
    frameMode: 'free',
  }, source);
  assert.equal(samePadding.layout, null, 'existing free composition must stay free');
  assert.deepEqual(samePadding.frames, source, 'existing free geometry must stay unchanged until explicit fitting');
}

console.log('layout boundary checks passed');
