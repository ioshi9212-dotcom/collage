export const MM_PER_INCH = 25.4;
export const DEFAULT_PRINT_DPI = 300;
export const DEFAULT_BLEED_MM = 3;
export const DEFAULT_SAFE_MM = 5;
export const MIN_PRINT_DPI = 72;
export const MAX_PRINT_DPI = 1200;
export const MIN_PHYSICAL_MM = 10;
export const MAX_PHYSICAL_MM = 1000;
export const MAX_BLEED_MM = 30;
export const MAX_SAFE_MM = 100;

export const PRINT_PRESETS = [
  { id: 'a5-portrait', label: 'A5 вертикальный', width: 1480, height: 2100, trimWidthMm: 148, trimHeightMm: 210 },
  { id: 'a5-landscape', label: 'A5 горизонтальный', width: 2100, height: 1480, trimWidthMm: 210, trimHeightMm: 148 },
  { id: 'a4-portrait', label: 'A4 вертикальный', width: 2100, height: 2970, trimWidthMm: 210, trimHeightMm: 297 },
  { id: 'a4-landscape', label: 'A4 горизонтальный', width: 2970, height: 2100, trimWidthMm: 297, trimHeightMm: 210 },
  { id: 'square', label: 'Квадрат 20×20 см', width: 2000, height: 2000, trimWidthMm: 200, trimHeightMm: 200 },
  { id: 'draft', label: 'Черновик', width: 1000, height: 700, trimWidthMm: 100, trimHeightMm: 70 },
  { id: 'custom', label: 'Свой размер', width: 1480, height: 2100, trimWidthMm: 148, trimHeightMm: 210 },
];

export const PRINT_ONLY_SETTING_KEYS = new Set([
  'printDpi',
  'bleedMm',
  'safeMm',
  'trimWidthMm',
  'trimHeightMm',
]);

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function positive(value, fallback, min, max) {
  return clamp(finiteNumber(value, fallback), min, max);
}

export function printPresetById(presetId) {
  return PRINT_PRESETS.find((preset) => preset.id === presetId) || PRINT_PRESETS[0];
}

export function mmToPixels(mm, dpi = DEFAULT_PRINT_DPI) {
  const safeMm = Math.max(0, finiteNumber(mm, 0));
  const safeDpi = positive(dpi, DEFAULT_PRINT_DPI, MIN_PRINT_DPI, MAX_PRINT_DPI);
  return Math.max(0, Math.round((safeMm / MM_PER_INCH) * safeDpi));
}

export function pixelsToMm(pixels, dpi = DEFAULT_PRINT_DPI) {
  const safePixels = Math.max(0, finiteNumber(pixels, 0));
  const safeDpi = positive(dpi, DEFAULT_PRINT_DPI, MIN_PRINT_DPI, MAX_PRINT_DPI);
  return (safePixels / safeDpi) * MM_PER_INCH;
}

export function normalizePrintSettings(settings = {}, canvas = {}) {
  const preset = printPresetById(settings.presetId);
  const fallbackWidthMm = preset?.trimWidthMm || positive(Number(canvas.width) / 10, 148, MIN_PHYSICAL_MM, MAX_PHYSICAL_MM);
  const fallbackHeightMm = preset?.trimHeightMm || positive(Number(canvas.height) / 10, 210, MIN_PHYSICAL_MM, MAX_PHYSICAL_MM);
  return {
    printDpi: Math.round(positive(settings.printDpi, DEFAULT_PRINT_DPI, MIN_PRINT_DPI, MAX_PRINT_DPI)),
    bleedMm: positive(settings.bleedMm, DEFAULT_BLEED_MM, 0, MAX_BLEED_MM),
    safeMm: positive(settings.safeMm, DEFAULT_SAFE_MM, 0, MAX_SAFE_MM),
    trimWidthMm: positive(settings.trimWidthMm, fallbackWidthMm, MIN_PHYSICAL_MM, MAX_PHYSICAL_MM),
    trimHeightMm: positive(settings.trimHeightMm, fallbackHeightMm, MIN_PHYSICAL_MM, MAX_PHYSICAL_MM),
  };
}

export function settingsForPrintPreset(settings = {}, presetId) {
  const preset = printPresetById(presetId);
  return {
    ...settings,
    presetId: preset.id,
    trimWidthMm: preset.trimWidthMm,
    trimHeightMm: preset.trimHeightMm,
  };
}

export function getPrintGuideGeometry(canvas = {}, settings = {}) {
  const print = normalizePrintSettings(settings, canvas);
  const width = Math.max(1, finiteNumber(canvas.width, 1));
  const height = Math.max(1, finiteNumber(canvas.height, 1));
  const safeInsetX = Math.min(width / 2, (width * print.safeMm) / print.trimWidthMm);
  const safeInsetY = Math.min(height / 2, (height * print.safeMm) / print.trimHeightMm);
  return {
    ...print,
    safeInsetX,
    safeInsetY,
    safeWidth: Math.max(0, width - safeInsetX * 2),
    safeHeight: Math.max(0, height - safeInsetY * 2),
  };
}

export function getPrintPixelGeometry({ canvas = {}, settings = {}, kind = 'page' } = {}) {
  const print = normalizePrintSettings(settings, canvas);
  const pageCount = kind === 'spread' ? 2 : 1;
  const logicalWidth = Math.max(1, finiteNumber(canvas.width, 1)) * pageCount;
  const logicalHeight = Math.max(1, finiteNumber(canvas.height, 1));
  const trimWidthMm = print.trimWidthMm * pageCount;
  const trimHeightMm = print.trimHeightMm;
  const trimWidthPx = mmToPixels(trimWidthMm, print.printDpi);
  const trimHeightPx = mmToPixels(trimHeightMm, print.printDpi);
  const outputWidthPx = mmToPixels(trimWidthMm + print.bleedMm * 2, print.printDpi);
  const outputHeightPx = mmToPixels(trimHeightMm + print.bleedMm * 2, print.printDpi);
  const ratioX = trimWidthPx / logicalWidth;
  const ratioY = trimHeightPx / logicalHeight;
  const renderPixelRatio = Math.max(ratioX, ratioY);
  return {
    ...print,
    kind,
    pageCount,
    logicalWidth,
    logicalHeight,
    trimWidthMm,
    trimHeightMm,
    fullWidthMm: trimWidthMm + print.bleedMm * 2,
    fullHeightMm: trimHeightMm + print.bleedMm * 2,
    trimWidthPx,
    trimHeightPx,
    outputWidthPx,
    outputHeightPx,
    bleedLeftPx: Math.floor((outputWidthPx - trimWidthPx) / 2),
    bleedTopPx: Math.floor((outputHeightPx - trimHeightPx) / 2),
    renderPixelRatio,
    ratioX,
    ratioY,
  };
}

export function getBookletPixelRatio(canvas = {}, settings = {}) {
  const print = normalizePrintSettings(settings, canvas);
  const width = Math.max(1, finiteNumber(canvas.width, 1));
  const height = Math.max(1, finiteNumber(canvas.height, 1));
  return Math.max(
    mmToPixels(print.trimWidthMm, print.printDpi) / width,
    mmToPixels(print.trimHeightMm, print.printDpi) / height,
  );
}

export function estimateEffectiveDpi({
  sourceWidth,
  sourceHeight,
  renderedWidth,
  renderedHeight,
  pixelRatio,
  targetDpi = DEFAULT_PRINT_DPI,
} = {}) {
  const sourceW = positive(sourceWidth, 1, 1, Number.MAX_SAFE_INTEGER);
  const sourceH = positive(sourceHeight, 1, 1, Number.MAX_SAFE_INTEGER);
  const requiredW = positive(renderedWidth, 1, 1, Number.MAX_SAFE_INTEGER) * positive(pixelRatio, 1, 0.01, 100);
  const requiredH = positive(renderedHeight, 1, 1, Number.MAX_SAFE_INTEGER) * positive(pixelRatio, 1, 0.01, 100);
  const coverage = Math.min(sourceW / requiredW, sourceH / requiredH);
  return Math.round(positive(targetDpi, DEFAULT_PRINT_DPI, MIN_PRINT_DPI, MAX_PRINT_DPI) * coverage);
}

function createImageFromDataUrl(dataUrl, imageFactory) {
  return new Promise((resolve, reject) => {
    const image = imageFactory();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось прочитать PNG для печатного экспорта'));
    image.src = dataUrl;
  });
}

function drawBleedEdges(context, image, geometry) {
  const { trimWidthPx, trimHeightPx, outputWidthPx, outputHeightPx, bleedLeftPx, bleedTopPx } = geometry;
  const bleedRightPx = outputWidthPx - trimWidthPx - bleedLeftPx;
  const bleedBottomPx = outputHeightPx - trimHeightPx - bleedTopPx;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sourceEdgeX = Math.max(0, sourceWidth - 1);
  const sourceEdgeY = Math.max(0, sourceHeight - 1);

  if (bleedTopPx > 0) context.drawImage(image, 0, 0, sourceWidth, 1, bleedLeftPx, 0, trimWidthPx, bleedTopPx);
  if (bleedBottomPx > 0) context.drawImage(image, 0, sourceEdgeY, sourceWidth, 1, bleedLeftPx, bleedTopPx + trimHeightPx, trimWidthPx, bleedBottomPx);
  if (bleedLeftPx > 0) context.drawImage(image, 0, 0, 1, sourceHeight, 0, bleedTopPx, bleedLeftPx, trimHeightPx);
  if (bleedRightPx > 0) context.drawImage(image, sourceEdgeX, 0, 1, sourceHeight, bleedLeftPx + trimWidthPx, bleedTopPx, bleedRightPx, trimHeightPx);

  if (bleedLeftPx > 0 && bleedTopPx > 0) context.drawImage(image, 0, 0, 1, 1, 0, 0, bleedLeftPx, bleedTopPx);
  if (bleedRightPx > 0 && bleedTopPx > 0) context.drawImage(image, sourceEdgeX, 0, 1, 1, bleedLeftPx + trimWidthPx, 0, bleedRightPx, bleedTopPx);
  if (bleedLeftPx > 0 && bleedBottomPx > 0) context.drawImage(image, 0, sourceEdgeY, 1, 1, 0, bleedTopPx + trimHeightPx, bleedLeftPx, bleedBottomPx);
  if (bleedRightPx > 0 && bleedBottomPx > 0) context.drawImage(image, sourceEdgeX, sourceEdgeY, 1, 1, bleedLeftPx + trimWidthPx, bleedTopPx + trimHeightPx, bleedRightPx, bleedBottomPx);
}

export async function composePrintRaster(dataUrl, geometry, options = {}) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw new Error('Не найден PNG для печатного экспорта');
  }
  const documentRef = options.documentRef ?? globalThis.document;
  const imageFactory = options.imageFactory ?? (() => new globalThis.Image());
  if (!documentRef?.createElement || typeof imageFactory !== 'function') {
    throw new Error('Браузер не поддерживает точный печатный экспорт');
  }
  const image = await createImageFromDataUrl(dataUrl, imageFactory);
  const canvas = documentRef.createElement('canvas');
  canvas.width = geometry.outputWidthPx;
  canvas.height = geometry.outputHeightPx;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не поддерживает сборку печатного PNG');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  drawBleedEdges(context, image, geometry);
  context.drawImage(
    image,
    0,
    0,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    geometry.bleedLeftPx,
    geometry.bleedTopPx,
    geometry.trimWidthPx,
    geometry.trimHeightPx,
  );
  return canvas.toDataURL('image/png');
}

export function formatPrintSummary(geometry) {
  return `${geometry.trimWidthMm}×${geometry.trimHeightMm} мм · ${geometry.printDpi} DPI · PNG ${geometry.outputWidthPx}×${geometry.outputHeightPx} px`;
}
