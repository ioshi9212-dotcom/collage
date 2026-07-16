// Pure preview helpers shared by the editor and tests. The preview is scaled
// to the space that is actually available; export geometry remains unchanged.
function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
  return Math.max(1, finite(value, fallback));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getStablePreviewViewport({
  containerWidth,
  viewportHeight,
  horizontalPadding = 0,
  framePadding = 18,
  minWidth = 260,
  maxWidth = 1360,
  minHeight = 360,
  maxHeight = 860,
  heightRatio = 0.78,
} = {}) {
  const safeContainerWidth = positive(containerWidth, maxWidth + horizontalPadding + framePadding);
  const safeViewportHeight = positive(viewportHeight, maxHeight / heightRatio);
  const width = clamp(safeContainerWidth - Math.max(0, finite(horizontalPadding, 0)) - Math.max(0, finite(framePadding, 18)), minWidth, maxWidth);
  const height = clamp(safeViewportHeight * Math.max(0.1, finite(heightRatio, 0.78)), minHeight, maxHeight);
  return { width, height };
}

export function getPreviewScale({
  stageWidth,
  stageHeight,
  viewportWidth,
  viewportHeight,
  maxScale = 1,
} = {}) {
  const width = positive(stageWidth, 1);
  const height = positive(stageHeight, 1);
  const availableWidth = positive(viewportWidth, width);
  const availableHeight = positive(viewportHeight, height);
  const limit = Math.max(0.01, finite(maxScale, 1));
  return Math.min(limit, availableWidth / width, availableHeight / height);
}

export function getBookletVisiblePageNumbers(sideData) {
  return new Set(
    (sideData?.slots ?? [])
      .filter((slot) => !slot?.isBlank && Number.isInteger(slot?.pageNumber) && slot.pageNumber > 0)
      .map((slot) => slot.pageNumber),
  );
}

export function isBookletPageActive(sideData, pageNumber) {
  return getBookletVisiblePageNumbers(sideData).has(Number(pageNumber));
}
