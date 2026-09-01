import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const layoutPath = 'src/editor/layout.js';
let layout = readFileSync(layoutPath, 'utf8');

const oldFunction = `export function fitFramesToPadding(frames, canvas, requestedPadding) {
  const items = Array.isArray(frames) ? frames.filter(Boolean) : [];
  if (!items.length) return [];

  const width = safeCanvasSize(canvas?.width);
  const height = safeCanvasSize(canvas?.height);
  const normalized = items.map((frame) => cleanFrame(frame, { width, height }));
  const minX = Math.min(...normalized.map((frame) => frame.x));
  const minY = Math.min(...normalized.map((frame) => frame.y));
  const maxX = Math.max(...normalized.map((frame) => frame.x + frame.width));
  const maxY = Math.max(...normalized.map((frame) => frame.y + frame.height));
  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);

  const requiredTargetWidth = Math.max(...normalized.map((frame) => MIN_FRAME * (boundsWidth / frame.width)));
  const requiredTargetHeight = Math.max(...normalized.map((frame) => MIN_FRAME * (boundsHeight / frame.height)));
  const maxPaddingX = Math.floor((width - requiredTargetWidth) / 2);
  const maxPaddingY = Math.floor((height - requiredTargetHeight) / 2);
  const maxPadding = Math.max(0, Math.min(maxPaddingX, maxPaddingY, Math.floor((width - MIN_FRAME) / 2), Math.floor((height - MIN_FRAME) / 2)));
  const padding = Math.min(requestedPaddingValue(requestedPadding), maxPadding);
  const targetWidth = Math.max(MIN_FRAME, width - padding * 2);
  const targetHeight = Math.max(MIN_FRAME, height - padding * 2);
  const scaleX = targetWidth / boundsWidth;
  const scaleY = targetHeight / boundsHeight;

  return normalized.map((frame) => {
    const left = Math.round(padding + (frame.x - minX) * scaleX);
    const top = Math.round(padding + (frame.y - minY) * scaleY);
    const right = Math.round(padding + (frame.x + frame.width - minX) * scaleX);
    const bottom = Math.round(padding + (frame.y + frame.height - minY) * scaleY);
    return cleanFrame({
      ...frame,
      x: left,
      y: top,
      width: Math.max(MIN_FRAME, right - left),
      height: Math.max(MIN_FRAME, bottom - top),
    }, { width, height });
  });
}`;

const newFunction = `export function fitFramesToPadding(frames, canvas, requestedPadding) {
  const items = Array.isArray(frames) ? frames.filter(Boolean) : [];
  if (!items.length) return [];

  const width = safeCanvasSize(canvas?.width);
  const height = safeCanvasSize(canvas?.height);
  const padding = requestedPaddingValue(requestedPadding);

  return items.map((item) => {
    const frame = cleanFrame(item, { width, height });
    const leftDistance = frame.x;
    const rightDistance = Math.max(0, width - (frame.x + frame.width));
    const topDistance = frame.y;
    const bottomDistance = Math.max(0, height - (frame.y + frame.height));
    const horizontalPadding = Math.min(padding, Math.max(0, width - frame.width));
    const verticalPadding = Math.min(padding, Math.max(0, height - frame.height));

    const x = leftDistance <= rightDistance
      ? horizontalPadding
      : width - frame.width - horizontalPadding;
    const y = topDistance <= bottomDistance
      ? verticalPadding
      : height - frame.height - verticalPadding;

    return cleanFrame({ ...frame, x, y }, { width, height });
  });
}`;

layout = replaceOnce(layout, oldFunction, newFunction, 'fitFramesToPadding');
writeFileSync(layoutPath, layout);

const appPath = 'src/AppLive.jsx';
let app = readFileSync(appPath, 'utf8');
app = app.replaceAll(
  'Подтягивает крайние фото-окна к заданным полям страницы. Это та самая подгонка всей композиции к краям.',
  'Каждое окно сдвигается к двум ближайшим краям страницы на заданное поле. Размеры окон не меняются.',
);
app = app.replaceAll(
  "show('Окна подогнаны к полям страницы');",
  "show('Окна подогнаны к ближайшим полям страницы');",
);
writeFileSync(appPath, app);

const testPath = 'src/editor/layout.test.mjs';
let test = readFileSync(testPath, 'utf8');

const oldBlock = `{
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
}`;

const newBlock = `{
  const canvas = { width: 1000, height: 800 };
  const frames = [
    { id: 'a', x: 100, y: 100, width: 300, height: 250, photo: { id: 'photo-a' }, zIndex: 2 },
    { id: 'b', x: 500, y: 200, width: 400, height: 500, borderWidth: 6, zIndex: 5 },
  ];
  const fitted = fitFramesToPadding(frames, canvas, 50);
  assert.deepEqual(
    fitted.map(({ x, y, width, height }) => ({ x, y, width, height })),
    [
      { x: 50, y: 50, width: 300, height: 250 },
      { x: 550, y: 250, width: 400, height: 500 },
    ],
    'each free frame must move to its nearest horizontal and vertical page edges without resizing',
  );
  assert.deepEqual(fitted[0].photo, frames[0].photo, 'photo assignment must survive fitting');
  assert.equal(fitted[1].borderWidth, 6, 'frame style must survive fitting');
  assert.equal(fitted[1].zIndex, 5, 'z order must survive fitting');
  assert.deepEqual(frames[0], { id: 'a', x: 100, y: 100, width: 300, height: 250, photo: { id: 'photo-a' }, zIndex: 2 }, 'fitting must not mutate source frames');
}`;

test = replaceOnce(test, oldBlock, newBlock, 'legacy fitting expectations');

test = test.replace(
  "  assert.ok(fitted.every((frame) => frame.width >= MIN_FRAME && frame.height >= MIN_FRAME), 'large padding must not shrink frames below minimum');",
  "  assert.ok(fitted.every((frame) => frame.width === 80 && frame.height === 80), 'large padding must never resize frames');",
);

test = test.replace(
  "  assert.equal(Math.min(...fitted.frames.map((frame) => frame.x)), 90);\n  assert.equal(Math.max(...fitted.frames.map((frame) => frame.x + frame.width)), 910);",
  "  assert.deepEqual(fitted.frames.map(({ x, y, width, height }) => ({ x, y, width, height })), [\n    { x: 90, y: 90, width: 300, height: 250 },\n    { x: 510, y: 210, width: 400, height: 500 },\n  ]);",
);

test += `\n{\n  const canvas = { width: 1480, height: 2100 };\n  const [bottomRight] = fitFramesToPadding([\n    { id: 'photo', x: 560, y: 900, width: 760, height: 960 },\n  ], canvas, 70);\n  assert.equal(bottomRight.x + bottomRight.width, canvas.width - 70, 'right-nearest frame must align to the right field');\n  assert.equal(bottomRight.y + bottomRight.height, canvas.height - 70, 'bottom-nearest frame must align to the bottom field');\n  assert.equal(bottomRight.width, 760);\n  assert.equal(bottomRight.height, 960);\n}\n\n{\n  const canvas = { width: 1480, height: 2100 };\n  const fitted = fitFramesToPadding([\n    { id: 'left-low', x: 120, y: 1180, width: 610, height: 700 },\n    { id: 'right-low', x: 900, y: 1300, width: 390, height: 500 },\n  ], canvas, 70);\n  assert.equal(fitted[0].x, 70, 'left-lower frame must align to the left field');\n  assert.equal(fitted[0].y + fitted[0].height, 2030, 'left-lower frame must align to the bottom field');\n  assert.equal(fitted[1].x + fitted[1].width, 1410, 'right-lower frame must align to the right field');\n  assert.equal(fitted[1].y + fitted[1].height, 2030, 'right-lower frame must align to the bottom field');\n}\n`;

writeFileSync(testPath, test);
console.log('Nearest-edge padding patch applied');
