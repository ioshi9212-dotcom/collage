const STYLES = new Set(['plain', 'line', 'circle', 'square', 'heart']);
const POSITIONS = new Set([
  'bottom-outer',
  'bottom-inner',
  'bottom-center',
  'top-outer',
  'top-inner',
  'top-center',
]);

export const DEFAULT_PAGE_NUMBERING = Object.freeze({
  enabled: false,
  style: 'line',
  position: 'bottom-outer',
  color: '#6f625c',
  fontFamily: 'Arial, sans-serif',
  fontSize: 28,
  opacity: 0.65,
  edgeOffset: 56,
  firstPage: 2,
});

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizePageIndex(value) {
  if (value == null || value === '') return null;
  const pageIndex = Number(value);
  if (!Number.isInteger(pageIndex) || pageIndex < 0) return null;
  return pageIndex;
}

export function normalizePageNumbering(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled: Boolean(source.enabled),
    style: STYLES.has(source.style) ? source.style : DEFAULT_PAGE_NUMBERING.style,
    position: POSITIONS.has(source.position) ? source.position : DEFAULT_PAGE_NUMBERING.position,
    color: /^#[0-9a-f]{6}$/i.test(String(source.color || ''))
      ? String(source.color)
      : DEFAULT_PAGE_NUMBERING.color,
    fontFamily: String(source.fontFamily || DEFAULT_PAGE_NUMBERING.fontFamily).slice(0, 160),
    fontSize: boundedNumber(source.fontSize, DEFAULT_PAGE_NUMBERING.fontSize, 12, 120),
    opacity: boundedNumber(source.opacity, DEFAULT_PAGE_NUMBERING.opacity, 0.1, 1),
    edgeOffset: boundedNumber(source.edgeOffset, DEFAULT_PAGE_NUMBERING.edgeOffset, 16, 300),
    firstPage: Math.round(boundedNumber(source.firstPage, DEFAULT_PAGE_NUMBERING.firstPage, 1, 9999)),
  };
}

export function pageNumberValue(pageIndex, settings) {
  const normalized = normalizePageNumbering(settings);
  const normalizedPageIndex = normalizePageIndex(pageIndex);
  if (!normalized.enabled || normalizedPageIndex == null) return null;
  const physicalPage = normalizedPageIndex + 1;
  if (physicalPage < normalized.firstPage) return null;
  return physicalPage;
}

export function pageNumberPlacement(pageIndex, canvas, settings) {
  const normalized = normalizePageNumbering(settings);
  const normalizedPageIndex = normalizePageIndex(pageIndex) ?? 0;
  const width = Math.max(1, Number(canvas?.width) || 1);
  const height = Math.max(1, Number(canvas?.height) || 1);
  const isEvenPhysicalPage = (normalizedPageIndex + 1) % 2 === 0;
  const [vertical, horizontal] = normalized.position.split('-');
  const outerIsLeft = isEvenPhysicalPage;
  const useLeft = horizontal === 'outer' ? outerIsLeft : horizontal === 'inner' ? !outerIsLeft : false;
  const x = horizontal === 'center'
    ? width / 2
    : useLeft
      ? normalized.edgeOffset
      : width - normalized.edgeOffset;
  const y = vertical === 'top'
    ? normalized.edgeOffset
    : height - normalized.edgeOffset;
  return {
    x,
    y,
    align: horizontal === 'center' ? 'center' : useLeft ? 'left' : 'right',
    ...normalized,
  };
}
