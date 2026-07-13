const VIEW_MODES = new Set(['single', 'spread', 'booklet']);
const EDITOR_MODES = new Set(['collage', 'text', 'drawings', 'templates']);

export class InvalidProjectError extends Error {
  constructor(message = 'Проект повреждён или имеет неподдерживаемый формат.') {
    super(message);
    this.name = 'InvalidProjectError';
    this.code = 'invalid_project';
  }
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function canvasDimension(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(5000, Math.max(300, number));
}

function requiredFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value;
}

export function prepareEditorProject(data, options = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new InvalidProjectError();
  }

  const hasPages = Array.isArray(data.pages) && data.pages.length > 0;
  const hasLegacyFrames = Array.isArray(data.frames);
  if (!hasPages && !hasLegacyFrames) throw new InvalidProjectError();

  const normalizePages = requiredFunction(options.normalizePages, 'normalizePages');
  const normalizeBookletSheets = requiredFunction(options.normalizeBookletSheets, 'normalizeBookletSheets');
  const normalizeBookletPrintSettings = requiredFunction(options.normalizeBookletPrintSettings, 'normalizeBookletPrintSettings');
  const normalizeExtraLayers = requiredFunction(options.normalizeExtraLayers, 'normalizeExtraLayers');

  const defaultCanvas = objectValue(options.defaultCanvas);
  const savedCanvas = objectValue(data.canvas);
  const canvas = {
    ...defaultCanvas,
    ...savedCanvas,
    width: canvasDimension(savedCanvas.width, Number(defaultCanvas.width) || 1480),
    height: canvasDimension(savedCanvas.height, Number(defaultCanvas.height) || 2100),
  };
  const settings = {
    ...objectValue(options.defaultSettings),
    ...objectValue(data.settings),
  };

  const pages = normalizePages(data, canvas, settings);
  if (!Array.isArray(pages) || pages.length === 0) throw new InvalidProjectError();
  if (pages.some((page) => !page || typeof page !== 'object' || !page.id)) {
    throw new InvalidProjectError();
  }

  const currentPageId = pages.some((page) => page.id === data.currentPageId)
    ? data.currentPageId
    : pages[0].id;

  return {
    canvas,
    settings,
    library: Array.isArray(data.library) ? data.library : [],
    pages,
    currentPageId,
    viewMode: VIEW_MODES.has(data.viewMode) ? data.viewMode : 'spread',
    bookletSheetsPerBlock: normalizeBookletSheets(data.bookletSheetsPerBlock),
    bookletPrintSettings: normalizeBookletPrintSettings(data.bookletPrintSettings),
    extraLayers: normalizeExtraLayers(data.extraLayers),
    albumEditorMode: EDITOR_MODES.has(data.albumEditorMode) ? data.albumEditorMode : 'collage',
  };
}
