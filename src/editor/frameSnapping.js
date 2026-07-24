export const DEFAULT_FRAME_SNAP_THRESHOLD = 18;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => Math.round(finite(value) * 2) / 2))].sort((a, b) => a - b);
}

function frameAxisTargets(frame, axis) {
  if (axis === 'x') {
    const left = finite(frame?.x);
    const width = Math.max(0, finite(frame?.width));
    return [left, left + width / 2, left + width];
  }
  const top = finite(frame?.y);
  const height = Math.max(0, finite(frame?.height));
  return [top, top + height / 2, top + height];
}

function axisTargets(frames, movingFrameId, canvas, axis, offset = 0) {
  const size = axis === 'x' ? Math.max(0, finite(canvas?.width)) : Math.max(0, finite(canvas?.height));
  const pageTargets = [0, size / 2, size];
  const siblingTargets = (Array.isArray(frames) ? frames : [])
    .filter((frame) => frame?.id !== movingFrameId)
    .flatMap((frame) => frameAxisTargets(frame, axis));
  return uniqueSorted([...pageTargets, ...siblingTargets].map((value) => value + offset));
}

function bestMatch(anchorValues, targetValues, threshold) {
  let best = null;
  for (const anchor of anchorValues) {
    for (const target of targetValues) {
      const delta = target - anchor;
      const distance = Math.abs(delta);
      if (distance > threshold) continue;
      if (!best || distance < best.distance || (distance === best.distance && Math.abs(target) < Math.abs(best.target))) {
        best = { delta, distance, target };
      }
    }
  }
  return best;
}

function guideResult(verticalMatch, horizontalMatch, verticalOffset = 0) {
  return {
    vertical: verticalMatch ? [verticalMatch.target - verticalOffset] : [],
    horizontal: horizontalMatch ? [horizontalMatch.target] : [],
  };
}

export function hasFrameSnapGuides(guides) {
  return Boolean(guides?.vertical?.length || guides?.horizontal?.length);
}

export function snapFramePosition({ frame, frames, canvas, x, y, threshold = DEFAULT_FRAME_SNAP_THRESHOLD }) {
  const width = Math.max(0, finite(frame?.width));
  const height = Math.max(0, finite(frame?.height));
  const canvasWidth = Math.max(width, finite(canvas?.width, width));
  const canvasHeight = Math.max(height, finite(canvas?.height, height));
  const rawX = clamp(finite(x), 0, Math.max(0, canvasWidth - width));
  const rawY = clamp(finite(y), 0, Math.max(0, canvasHeight - height));

  const verticalMatch = bestMatch(
    [rawX, rawX + width / 2, rawX + width],
    axisTargets(frames, frame?.id, canvas, 'x'),
    threshold,
  );
  const horizontalMatch = bestMatch(
    [rawY, rawY + height / 2, rawY + height],
    axisTargets(frames, frame?.id, canvas, 'y'),
    threshold,
  );

  return {
    x: Math.round(clamp(rawX + (verticalMatch?.delta ?? 0), 0, Math.max(0, canvasWidth - width))),
    y: Math.round(clamp(rawY + (horizontalMatch?.delta ?? 0), 0, Math.max(0, canvasHeight - height))),
    guides: guideResult(verticalMatch, horizontalMatch),
  };
}

function movedEdge(oldStart, oldEnd, newStart, newEnd) {
  const startMovement = Math.abs(newStart - oldStart);
  const endMovement = Math.abs(newEnd - oldEnd);
  if (startMovement < 0.25 && endMovement < 0.25) return null;
  return startMovement >= endMovement ? 'start' : 'end';
}

function snapResizedAxis({ oldStart, oldEnd, newStart, newEnd, targets, threshold, minSize }) {
  const edge = movedEdge(oldStart, oldEnd, newStart, newEnd);
  if (!edge) return { start: newStart, end: newEnd, match: null };

  if (edge === 'start') {
    const match = bestMatch([newStart], targets, threshold);
    const start = match ? match.target : newStart;
    if (newEnd - start < minSize) return { start: newStart, end: newEnd, match: null };
    return { start, end: newEnd, match };
  }

  const match = bestMatch([newEnd], targets, threshold);
  const end = match ? match.target : newEnd;
  if (end - newStart < minSize) return { start: newStart, end: newEnd, match: null };
  return { start: newStart, end, match };
}

export function snapFrameTransformBox({
  frame,
  frames,
  canvas,
  oldBox,
  newBox,
  pageOffsetX = 0,
  threshold = DEFAULT_FRAME_SNAP_THRESHOLD,
  minFrame = 80,
}) {
  const oldLeft = finite(oldBox?.x);
  const oldTop = finite(oldBox?.y);
  const oldRight = oldLeft + Math.max(0, finite(oldBox?.width));
  const oldBottom = oldTop + Math.max(0, finite(oldBox?.height));
  const newLeft = finite(newBox?.x);
  const newTop = finite(newBox?.y);
  const newRight = newLeft + Math.max(0, finite(newBox?.width));
  const newBottom = newTop + Math.max(0, finite(newBox?.height));

  const horizontalBox = snapResizedAxis({
    oldStart: oldLeft,
    oldEnd: oldRight,
    newStart: newLeft,
    newEnd: newRight,
    targets: axisTargets(frames, frame?.id, canvas, 'x', pageOffsetX),
    threshold,
    minSize: minFrame,
  });
  const verticalBox = snapResizedAxis({
    oldStart: oldTop,
    oldEnd: oldBottom,
    newStart: newTop,
    newEnd: newBottom,
    targets: axisTargets(frames, frame?.id, canvas, 'y'),
    threshold,
    minSize: minFrame,
  });

  return {
    box: {
      ...newBox,
      x: horizontalBox.start,
      y: verticalBox.start,
      width: horizontalBox.end - horizontalBox.start,
      height: verticalBox.end - verticalBox.start,
    },
    guides: guideResult(horizontalBox.match, verticalBox.match, pageOffsetX),
  };
}
