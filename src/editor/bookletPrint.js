import { DEFAULT_PRINT_DPI, mmToPixels, normalizePrintSettings } from './printGeometry.js';

export const BOOKLET_SHEET_WIDTH_MM = 297;
export const BOOKLET_SHEET_HEIGHT_MM = 210;
export const BOOKLET_HALF_SHEET_WIDTH_MM = BOOKLET_SHEET_WIDTH_MM / 2;
export const BOOKLET_BACK_ORDER_REVERSE = 'reverse';
export const BOOKLET_BACK_ORDER_SAME = 'same';
export const DEFAULT_BOOKLET_PAPER_THICKNESS_MM = 0.12;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createImageFromDataUrl(dataUrl, imageFactory) {
  return new Promise((resolve, reject) => {
    const image = imageFactory();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось прочитать сторону брошюры'));
    image.src = dataUrl;
  });
}

export function normalizeHomeBookletPrintSettings(value = {}) {
  return {
    showFoldLine: Boolean(value.showFoldLine),
    backOrder: value.backOrder === BOOKLET_BACK_ORDER_SAME
      ? BOOKLET_BACK_ORDER_SAME
      : BOOKLET_BACK_ORDER_REVERSE,
    rotateBack180: Boolean(value.rotateBack180),
    paperThicknessMm: clamp(
      finite(value.paperThicknessMm, DEFAULT_BOOKLET_PAPER_THICKNESS_MM),
      0.05,
      0.5,
    ),
  };
}

export function getA4BookletPrintGeometry({ canvas = {}, settings = {} } = {}) {
  const print = normalizePrintSettings(settings, canvas);
  const logicalWidth = Math.max(1, finite(canvas.width, 1)) * 2;
  const logicalHeight = Math.max(1, finite(canvas.height, 1));
  const trimWidthPx = mmToPixels(BOOKLET_SHEET_WIDTH_MM, print.printDpi);
  const trimHeightPx = mmToPixels(BOOKLET_SHEET_HEIGHT_MM, print.printDpi);
  const ratioX = trimWidthPx / logicalWidth;
  const ratioY = trimHeightPx / logicalHeight;

  return {
    printDpi: print.printDpi || DEFAULT_PRINT_DPI,
    bleedMm: 0,
    safeMm: print.safeMm,
    kind: 'booklet-a4',
    pageCount: 1,
    logicalWidth,
    logicalHeight,
    trimWidthMm: BOOKLET_SHEET_WIDTH_MM,
    trimHeightMm: BOOKLET_SHEET_HEIGHT_MM,
    fullWidthMm: BOOKLET_SHEET_WIDTH_MM,
    fullHeightMm: BOOKLET_SHEET_HEIGHT_MM,
    trimWidthPx,
    trimHeightPx,
    outputWidthPx: trimWidthPx,
    outputHeightPx: trimHeightPx,
    bleedLeftPx: 0,
    bleedTopPx: 0,
    renderPixelRatio: Math.max(ratioX, ratioY),
    ratioX,
    ratioY,
    slotWidthMm: BOOKLET_HALF_SHEET_WIDTH_MM,
    slotWidthPx: Math.round(trimWidthPx / 2),
  };
}

function flattenSheets(plan) {
  return (plan?.blocks ?? []).flatMap((block) => block?.sheets ?? []);
}

export function buildManualDuplexBookletOrder(plan, settings = {}) {
  const normalized = normalizeHomeBookletPrintSettings(settings);
  const sheets = flattenSheets(plan);
  const fronts = sheets.map((sheet) => sheet.front).filter(Boolean);
  const backSource = sheets.map((sheet) => sheet.back).filter(Boolean);
  const backs = normalized.backOrder === BOOKLET_BACK_ORDER_REVERSE
    ? [...backSource].reverse()
    : backSource;
  const combined = sheets.flatMap((sheet) => [sheet.front, sheet.back].filter(Boolean));
  const test = sheets[0] ? [sheets[0].front, sheets[0].back].filter(Boolean) : [];

  return {
    settings: normalized,
    sheetCount: sheets.length,
    sideCount: fronts.length + backs.length,
    fronts,
    backs,
    combined,
    test,
  };
}

export function shouldRotateBookletSide(sideData, settings = {}) {
  const normalized = normalizeHomeBookletPrintSettings(settings);
  return Boolean(sideData?.side === 'back' && normalized.rotateBack180);
}

export async function rotateRasterDataUrl180(dataUrl, options = {}) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw new Error('Не найдено изображение стороны брошюры');
  }
  const documentRef = options.documentRef ?? globalThis.document;
  const imageFactory = options.imageFactory ?? (() => new globalThis.Image());
  if (!documentRef?.createElement || typeof imageFactory !== 'function') {
    throw new Error('Браузер не поддерживает разворот стороны брошюры');
  }
  const image = await createImageFromDataUrl(dataUrl, imageFactory);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = documentRef.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не поддерживает разворот стороны брошюры');
  context.translate(width, height);
  context.rotate(Math.PI);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

export function estimateFoldedBlockThicknessMm(sheetsPerBlock, settings = {}) {
  const normalized = normalizeHomeBookletPrintSettings(settings);
  const sheets = Math.max(0, Math.trunc(finite(sheetsPerBlock, 0)));
  return Number((sheets * normalized.paperThicknessMm * 2).toFixed(2));
}

export function buildBookletPrintInstructions({ plan, settings = {}, dpi = DEFAULT_PRINT_DPI } = {}) {
  const order = buildManualDuplexBookletOrder(plan, settings);
  const normalized = order.settings;
  const backOrderLabel = normalized.backOrder === BOOKLET_BACK_ORDER_REVERSE
    ? 'в обратном порядке'
    : 'в том же порядке';
  const rotationLabel = normalized.rotateBack180
    ? 'оборот развёрнут на 180°'
    : 'оборот без программного разворота';

  return [
    'COLLAGE CREATOR — ПЕЧАТЬ БРОШЮРЫ A4',
    '',
    `Листов A4: ${order.sheetCount}`,
    `Сторон печати: ${order.sideCount}`,
    `Формат: A4 горизонтально, 297×210 мм, ${dpi} DPI`,
    'Масштаб в окне печати: Фактический размер / 100%.',
    'Не включать «Подогнать», «Уместить» или дополнительную раскладку брошюры в программе печати.',
    '',
    '1. Сначала распечатай файл с лицевыми сторонами, односторонне.',
    '2. Не меняя порядок листов, вложи стопку обратно в принтер.',
    `3. Распечатай файл с оборотами: ${backOrderLabel}; ${rotationLabel}.`,
    '4. Перед всем альбомом обязательно распечатай тест первого листа.',
    '5. После печати сложи листы пополам, собери блоки и сшей по сгибу.',
  ].join('\n');
}
