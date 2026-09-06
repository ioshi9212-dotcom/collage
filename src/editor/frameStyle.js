export const FRAME_BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted', 'double'];
export const FRAME_STYLE_SCOPES = ['frame', 'page', 'album'];
export const FRAME_STYLE_PROPERTIES = ['borderStyle', 'borderWidth', 'borderColor', 'cornerRadius'];

const DEFAULT_STYLE = Object.freeze({
  borderStyle: 'none',
  borderWidth: 0,
  borderColor: '#ffffff',
  cornerRadius: 0,
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanColor(value, fallback) {
  const color = String(value || '');
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export function normalizeFrameStyle(frame, fallback = {}) {
  const fallbackWidth = Math.max(0, Math.min(80, finiteNumber(fallback.borderWidth)));
  const borderWidth = Math.max(0, Math.min(80, finiteNumber(frame?.borderWidth, fallbackWidth)));
  const requestedStyle = frame?.borderStyle
    ?? fallback.borderStyle
    ?? (borderWidth > 0 ? 'solid' : 'none');
  const borderStyle = FRAME_BORDER_STYLES.includes(requestedStyle) ? requestedStyle : 'solid';

  return {
    borderStyle: borderWidth <= 0 ? 'none' : borderStyle,
    borderWidth,
    borderColor: cleanColor(frame?.borderColor, cleanColor(fallback.borderColor, DEFAULT_STYLE.borderColor)),
    cornerRadius: Math.max(0, Math.min(500, finiteNumber(frame?.cornerRadius, fallback.cornerRadius))),
  };
}

export function cleanFrameStylePatch(patch) {
  return normalizeFrameStyle(patch, DEFAULT_STYLE);
}

function cleanFrameStyleProperty(property, value) {
  if (property === 'borderStyle') return FRAME_BORDER_STYLES.includes(value) ? value : DEFAULT_STYLE.borderStyle;
  if (property === 'borderWidth') return Math.max(0, Math.min(80, finiteNumber(value, DEFAULT_STYLE.borderWidth)));
  if (property === 'borderColor') return cleanColor(value, DEFAULT_STYLE.borderColor);
  if (property === 'cornerRadius') return Math.max(0, Math.min(500, finiteNumber(value, DEFAULT_STYLE.cornerRadius)));
  throw new TypeError('Unknown frame style property');
}

export function applyFrameStylePropertyToPages(pages, { property, value } = {}) {
  if (!FRAME_STYLE_PROPERTIES.includes(property)) throw new TypeError('Unknown frame style property');
  const cleanValue = cleanFrameStyleProperty(property, value);
  return (Array.isArray(pages) ? pages : []).map((page) => {
    if (!Array.isArray(page?.frames)) return page;
    return {
      ...page,
      frames: page.frames.map((frame) => ({ ...frame, [property]: cleanValue })),
    };
  });
}

export function applyFrameStyleToPages(pages, {
  scope = 'frame',
  pageId,
  frameId,
  patch,
} = {}) {
  if (!FRAME_STYLE_SCOPES.includes(scope)) throw new TypeError('Unknown frame style scope');
  const cleanPatch = cleanFrameStylePatch(patch);

  return (Array.isArray(pages) ? pages : []).map((page) => {
    const appliesToPage = scope === 'album' || page?.id === pageId;
    if (!appliesToPage || !Array.isArray(page?.frames)) return page;
    return {
      ...page,
      frames: page.frames.map((frame) => (
        scope !== 'frame' || frame?.id === frameId
          ? { ...frame, ...cleanPatch }
          : frame
      )),
    };
  });
}

export function borderDashFor(style, width) {
  const unit = Math.max(1, finiteNumber(width, 1));
  if (style === 'dashed') return [unit * 4, unit * 2.5];
  if (style === 'dotted') return [unit, unit * 1.8];
  return undefined;
}
