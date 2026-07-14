// Pure preview helpers shared by the editor and tests. The preview is scaled
// to the space that is actually available; export geometry remains unchanged.
function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
  return Math.max(1, finite(value, fallback));
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
