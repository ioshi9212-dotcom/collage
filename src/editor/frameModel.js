import { MIN_FRAME, clamp, cleanFrame } from './layout.js';

function frameList(frames) {
  return Array.isArray(frames) ? frames : [];
}

function makeFrameId() {
  return globalThis.crypto?.randomUUID?.() ?? `frame_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function coverPhotoRect(image, frame, photo) {
  if (!image || !photo) return null;
  const zoom = photo.zoom ?? 1;
  const scale = Math.max(frame.width / image.width, frame.height / image.height) * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  const baseX = (frame.width - width) / 2;
  const baseY = (frame.height - height) / 2;
  return {
    x: baseX + (photo.offsetX ?? 0),
    y: baseY + (photo.offsetY ?? 0),
    width,
    height,
    baseX,
    baseY,
  };
}

export function clampPhotoPosition(rect, frame, x, y) {
  if (!rect) return { x, y };
  return {
    x: clamp(x, Math.min(0, frame.width - rect.width), 0),
    y: clamp(y, Math.min(0, frame.height - rect.height), 0),
  };
}

export function photoOffsetFromPosition(rect, x, y) {
  if (!rect) return { offsetX: 0, offsetY: 0 };
  return {
    offsetX: Math.round(x - rect.baseX),
    offsetY: Math.round(y - rect.baseY),
  };
}

export function createPlacedPhoto(photo) {
  return {
    id: photo?.id,
    name: photo?.name,
    src: photo?.src,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  };
}

export function applyPhotoToFrames(frames, frameId, photo) {
  return frameList(frames).map((frame) => (
    frame.id === frameId ? { ...frame, photo: createPlacedPhoto(photo) } : frame
  ));
}

export function updateFramePhoto(frames, frameId, patch) {
  return frameList(frames).map((frame) => (
    frame.id === frameId && frame.photo
      ? { ...frame, photo: { ...frame.photo, ...patch } }
      : frame
  ));
}

export function clearFramePhoto(frames, frameId) {
  return frameList(frames).map((frame) => (
    frame.id === frameId ? { ...frame, photo: null } : frame
  ));
}

export function clearAllFramePhotos(frames) {
  return frameList(frames).map((frame) => ({ ...frame, photo: null }));
}

export function updateFrameGeometry(frames, frameId, patch, canvas) {
  return frameList(frames).map((frame) => (
    frame.id === frameId ? cleanFrame({ ...frame, ...patch }, canvas) : frame
  ));
}

export function removeFrameById(frames, frameId) {
  return frameList(frames).filter((frame) => frame.id !== frameId);
}

export function createFreeFrame(frames, canvas, idFactory = makeFrameId) {
  const items = frameList(frames);
  const canvasWidth = Math.max(MIN_FRAME, Math.round(Number(canvas?.width) || MIN_FRAME));
  const canvasHeight = Math.max(MIN_FRAME, Math.round(Number(canvas?.height) || MIN_FRAME));
  const width = clamp(Math.round(canvasWidth * 0.38), MIN_FRAME, canvasWidth);
  const height = clamp(Math.round(canvasHeight * 0.28), MIN_FRAME, canvasHeight);
  const maxX = Math.max(0, canvasWidth - width);
  const maxY = Math.max(0, canvasHeight - height);
  const step = Math.max(28, Math.round(Math.min(width, height) * 0.08));
  const offsets = [
    [0, 0],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
  ];
  const [offsetX, offsetY] = offsets[items.length % offsets.length];
  const maxZ = Math.max(0, ...items.map((frame) => Number(frame.zIndex) || 0));

  return cleanFrame({
    id: idFactory(),
    x: clamp(Math.round(maxX / 2 + offsetX * step), 0, maxX),
    y: clamp(Math.round(maxY / 2 + offsetY * step), 0, maxY),
    width,
    height,
    photo: null,
    zIndex: maxZ + 1,
  }, { width: canvasWidth, height: canvasHeight });
}

export function bringFrameToFront(frames, frameId) {
  const items = frameList(frames);
  const maxZ = Math.max(0, ...items.map((frame) => Number(frame.zIndex) || 0));
  return items.map((frame) => (
    frame.id === frameId ? { ...frame, zIndex: maxZ + 1 } : frame
  ));
}

export function findFrameAtPoint(entries, point) {
  if (!point) return null;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.page) continue;
    const x = point.x - entry.x;
    const y = point.y;
    const frame = frameList(entry.page.frames).find((item) => (
      x >= item.x
      && x <= item.x + item.width
      && y >= item.y
      && y <= item.y + item.height
    ));
    if (frame) return { pageId: entry.page.id, frameId: frame.id, frame };
  }
  return null;
}

export function clampFramePosition(frame, canvas, x, y) {
  return {
    x: clamp(x, 0, Math.max(0, canvas.width - frame.width)),
    y: clamp(y, 0, Math.max(0, canvas.height - frame.height)),
  };
}

export function buildFrameTransformPatch(frame, transform) {
  return {
    x: frame.x + transform.x,
    y: frame.y + transform.y,
    width: frame.width * transform.scaleX,
    height: frame.height * transform.scaleY,
  };
}

export function validateFrameTransformBox(oldBox, newBox, options) {
  const pageLeft = options.pageOffsetX;
  const pageRight = options.pageOffsetX + options.canvas.width;
  const minFrame = options.minFrame ?? MIN_FRAME;
  if (newBox.width < minFrame || newBox.height < minFrame) return oldBox;
  if (newBox.x < pageLeft || newBox.y < 0) return oldBox;
  if (newBox.x + newBox.width > pageRight || newBox.y + newBox.height > options.canvas.height) return oldBox;
  return newBox;
}
