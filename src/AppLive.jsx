import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import {
  MIN_FRAME,
  buildGridLayout,
  clamp,
  ensureLayout,
  framesFromLayout,
  getColumnHandles,
  getRowHandles,
  resizeColumn,
  resizeRow,
} from './editor/layout';
import {
  BOOKLET_SIDE_BACK,
  BOOKLET_SIDE_FRONT,
  DEFAULT_SHEETS_PER_BLOCK,
  buildBookletPlan,
  clampBookletSheetsPerBlock,
  findBookletSideForPage,
  getAdjacentBookletSide,
  getBookletSide,
} from './editor/booklet';
import { saveCloudProject } from './editor/cloudProjects';
import PhotoLibraryThumbnail from './editor/PhotoLibraryThumbnail';
import { readPhotoFilesAsDataUrls } from './editor/photoImportQueue';
import { compactProjectPhotos } from './editor/photoStorage';
import { loadCachedImage as loadImage } from './editor/imageCache';
import { prepareEditorProject } from './editor/projectLoad';
import {
  MAX_LIBRARY_PHOTOS,
  createPreparedProjectSnapshot,
  describeSaveResult,
  projectJsonFileError,
  selectPhotoUploads,
} from './editor/reliability';
import {
  clonePageForDuplicate,
  createBlankPage,
  createInitialAlbum,
  createPage,
  createPageFromTemplate,
  normalizeProjectPages,
  resolvePageFrameCount,
  settingsForPage,
} from './editor/pageModel';
import {
  applyPhotoToFrames,
  bringFrameToFront,
  buildFrameTransformPatch,
  clampFramePosition,
  clampPhotoPosition,
  clearAllFramePhotos,
  clearFramePhoto,
  coverPhotoRect,
  findFrameAtPoint,
  photoOffsetFromPosition,
  removeFrameById,
  updateFrameGeometry,
  updateFramePhoto,
  validateFrameTransformBox,
} from './editor/frameModel';
import {
  ALBUM_LAYERS_KEY,
  ALBUM_MODE_KEY,
  cloneExtraLayerPage,
  createPageLayerDraft,
  deleteExtraLayerPage,
  drawingLayersForPage,
  insertExtraLayerPage,
  normalizeAlbumEditorMode,
  normalizeExtraLayers,
  pruneExtraLayerPages,
  reorderExtraLayerPages,
  sanitizeExtraLayers,
  textLayersForPage,
} from './editor/extraLayers';
import {
  MAX_TEMPLATE_RECORDS,
  sanitizeTemplateRecord,
  sanitizeTemplateRecords,
  templateJsonFileError,
} from './editor/templateRecords';

const STORAGE_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';
const LEGACY_KEYS = [
  'collage-creator-album-live-v10-layer-move-photo',
  'collage-creator-album-live-v9-photo-usage-highlight',
  'collage-creator-album-live-v8-delete-frame',
  'collage-creator-album-live-v7-frame-drag-bounds',
  'collage-creator-album-live-v6-page-frame-count',
  'collage-creator-album-live-v5-sharp-preview',
  'collage-creator-album-live-v4-grid-layout',
  'collage-creator-album-live-v3',
  'collage-creator-album-live-v2',
  'collage-creator-album-live-v1',
  'collage-creator-album-v11',
  'collage-creator-album-v10',
  'collage-creator-album-v9',
  'collage-creator-album-v8',
  'collage-creator-album-v7',
  'collage-creator-album-v6',
  'collage-creator-album-v5',
  'collage-creator-album-v4',
];

const SPREAD_GAP = 90;
const EXPORT_RATIO = 2;
const HANDLE = 28;
const DEFAULT_CANVAS = { width: 1480, height: 2100 };
const DEFAULT_SETTINGS = {
  presetId: 'a5-portrait',
  frameCount: 5,
  padding: 70,
  gap: 28,
  borderWidth: 0,
  borderColor: '#ffffff',
  showGuides: true,
  frameMode: 'free',
};

const DEFAULT_BOOKLET_PRINT_SETTINGS = {
  showFoldLine: false,
  showCropMarks: false,
  gap: 0,
  margin: 0,
};

const MAX_BOOKLET_PRINT_GAP = 300;
const MAX_BOOKLET_PRINT_MARGIN = 300;
const CROP_MARK_LENGTH = 56;
const CROP_MARK_OFFSET = 18;


const PRESETS = [
  { id: 'a5-portrait', label: 'A5 вертикальный', width: 1480, height: 2100 },
  { id: 'a5-landscape', label: 'A5 горизонтальный', width: 2100, height: 1480 },
  { id: 'a4-portrait', label: 'A4 вертикальный', width: 2100, height: 2970 },
  { id: 'square', label: 'Квадрат', width: 2000, height: 2000 },
  { id: 'draft', label: 'Черновик', width: 1000, height: 700 },
  { id: 'custom', label: 'Свой размер', width: 1480, height: 2100 },
];

const TEMPLATE_STORAGE_KEY = 'collage-user-template-packages-v2-react';

const TEXT_FONTS = [
  { id: 'system', label: 'Обычный системный', family: 'Arial, sans-serif' },
  { id: 'onest', label: 'Onest — обычный', family: "'Collage Onest', Arial, sans-serif" },
  { id: 'lato-light', label: 'Lato Light — лёгкий', family: "'Collage Lato Light', Arial, sans-serif" },
  { id: 'montserrat-alt', label: 'Montserrat Alternates', family: "'Collage Montserrat Alternates', Arial, sans-serif" },
  { id: 'bebas', label: 'Bebas Neue — заголовок', family: "'Collage Bebas Neue', Arial, sans-serif" },
  { id: 'new-standard', label: 'New Standard Old — книжный', family: "'Collage New Standard Old', Georgia, serif" },
  { id: 'caslon', label: 'Caslon Becker — классика', family: "'Collage Caslon Becker', Georgia, serif" },
  { id: 'agreverence', label: 'AGReverence — элегантный', family: "'Collage AGReverence', Georgia, serif" },
  { id: 'good-vibes', label: 'Good Vibes Pro — рукописный', family: "'Collage Good Vibes', cursive" },
  { id: 'chopin', label: 'ChopinScript — подпись', family: "'Collage Chopin Script', cursive" },
  { id: 'thin-pen', label: 'Script Thin Pen — тонкий', family: "'Collage Script Thin Pen', cursive" },
  { id: 'shelley', label: 'Shelley Volante', family: "'Collage Shelley Volante', cursive" },
  { id: 'calligraphia', label: 'Calligraphia One', family: "'Collage Calligraphia One', cursive" },
  { id: 'czizh', label: 'Czizh', family: "'Collage Czizh', serif" },
  { id: 'karsten', label: 'Karsten', family: "'Collage Karsten', serif" },
  { id: 'patefon', label: 'Patefon', family: "'Collage Patefon', serif" },
  { id: 'romand', label: 'RomanD', family: "'Collage RomanD', serif" },
  { id: 'web-serveroff', label: 'Web Serveroff', family: "'Collage Web Serveroff', sans-serif" },
  { id: 'zector', label: 'Zector', family: "'Collage Zector', sans-serif" },
  { id: 'zeferino', label: 'Zeferino Two', family: "'Collage Zeferino Two', serif" },
];

const DEFAULT_FONT_ID = 'onest';
const DEFAULT_TEXT_PRESET_ID = 'body';

const TEXT_PRESETS = [
  { id: 'body', label: 'Обычный', text: 'Новый текст', fontId: 'onest', fontSize: 56, fontWeight: 500, fontStyle: 'normal', lineHeight: 1.18, color: '#1f2723' },
  { id: 'title', label: 'Заголовок', text: 'Заголовок', fontId: 'caslon', fontSize: 96, fontWeight: 700, fontStyle: 'normal', lineHeight: 1.05, color: '#1f2723' },
  { id: 'soft-title', label: 'Нежный', text: 'Нежный заголовок', fontId: 'agreverence', fontSize: 92, fontWeight: 600, fontStyle: 'normal', lineHeight: 1.06, color: '#2a312e' },
  { id: 'strict', label: 'Строгий', text: 'Строгий текст', fontId: 'bebas', fontSize: 72, fontWeight: 500, fontStyle: 'normal', lineHeight: 1.08, color: '#1f2723' },
  { id: 'script', label: 'Рукописный', text: 'Рукописная подпись', fontId: 'good-vibes', fontSize: 88, fontWeight: 400, fontStyle: 'normal', lineHeight: 1.1, color: '#1f2723' },
  { id: 'signature', label: 'Подпись', text: 'Тёплая подпись', fontId: 'chopin', fontSize: 92, fontWeight: 700, fontStyle: 'normal', lineHeight: 1.0, color: '#1f2723' },
];

function fontById(id) {
  return TEXT_FONTS.find((font) => font.id === id) || TEXT_FONTS.find((font) => font.id === DEFAULT_FONT_ID) || TEXT_FONTS[0];
}

function presetById(id) {
  return TEXT_PRESETS.find((preset) => preset.id === id) || TEXT_PRESETS.find((preset) => preset.id === DEFAULT_TEXT_PRESET_ID) || TEXT_PRESETS[0];
}

function cloneDeep(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return value;
  }
}


function formatNumberDraft(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(fallback);
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(3)));
}

function softClampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Number.isFinite(Number(min)) ? Number(min) : 0;
  let next = number;
  if (Number.isFinite(Number(min))) next = Math.max(Number(min), next);
  if (Number.isFinite(Number(max))) next = Math.min(Number(max), next);
  return next;
}

function isSoftNumberDraft(value) {
  return value === '' || value === '-' || value === '.' || value === '-.' || value === '+.' || value === '+';
}

function SoftNumberInput({ value, onValue, min, max, step = 1, disabled = false, fallback = 0 }) {
  const [draft, setDraft] = useState(() => formatNumberDraft(value, fallback));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(formatNumberDraft(value, fallback));
  }, [value, fallback, editing]);

  function commit(raw, clampValue) {
    if (isSoftNumberDraft(raw)) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const next = clampValue ? softClampNumber(parsed, min, max) : parsed;
    onValue(next);
    if (clampValue) setDraft(formatNumberDraft(next, fallback));
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      disabled={disabled}
      onFocus={(event) => {
        setEditing(true);
        event.currentTarget.select?.();
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
      }}
      onBlur={(event) => {
        setEditing(false);
        commit(event.target.value, true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function moveArrayItem(items, fromIndex, toIndex) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function downloadDataUrl(filename, dataUrl) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}


function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dataUrlToBytes(dataUrl) {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return new Uint8Array();

  const meta = dataUrl.slice(0, commaIndex);
  const body = dataUrl.slice(commaIndex + 1);

  if (meta.includes(';base64')) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  return new TextEncoder().encode(decodeURIComponent(body));
}

function textToBytes(text) {
  return new TextEncoder().encode(String(text ?? ''));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function bookletSlotLabel(slot) {
  return slot?.isBlank ? 'пусто' : String(slot?.pageNumber ?? slot?.label ?? 'пусто');
}

function buildBookletPrintRows(imageEntries) {
  return imageEntries.map(({ name, sideData }) => ({
    block: sideData.blockNumber,
    sheet: sideData.sheetNumber,
    side: sideData.side,
    sideLabel: sideData.sideLabel,
    title: sideData.title,
    left: bookletSlotLabel(sideData.left),
    right: bookletSlotLabel(sideData.right),
    file: name,
  }));
}

function buildBookletReadme({ plan, canvas, sheetsPerBlock, printSettings, imageEntries }) {
  const rows = buildBookletPrintRows(imageEntries);
  const lines = [
    'Пакет печати брошюры',
    '',
    `Страниц в проекте: ${plan.pageCount}`,
    `Страниц после добивки блока: ${plan.paddedPageCount}`,
    `Виртуальных пустых страниц: ${plan.blankPageCount}`,
    `Листов в блоке: ${sheetsPerBlock}`,
    `Страниц в блоке: ${plan.pagesPerBlock}`,
    `Блоков: ${plan.blockCount}`,
    `Размер страницы: ${canvas.width}×${canvas.height}px`,
    `Сгиб: ${printSettings.showFoldLine ? 'да' : 'нет'}`,
    `Метки реза: ${printSettings.showCropMarks ? 'да' : 'нет'}`,
    `Зазор: ${printSettings.gap}px`,
    `Поля: ${printSettings.margin}px`,
    '',
    'Порядок файлов:',
    '',
  ];

  for (const row of rows) {
    lines.push(`${row.title}: [${row.left}][${row.right}] → ${row.file}`);
  }

  lines.push('', 'Подсказка:', 'front = лицевая сторона листа', 'back = оборотная сторона листа');
  lines.push('', 'print-preview.html — контрольный просмотр. Для точной печати используй PNG-файлы из папок block-XX.');

  return `${lines.join('\n')}\n`;
}

function buildBookletCsv(imageEntries) {
  const rows = buildBookletPrintRows(imageEntries);
  const lines = ['block;sheet;side;side_label;left_page;right_page;file'];
  for (const row of rows) {
    lines.push([row.block, row.sheet, row.side, row.sideLabel, row.left, row.right, row.file].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';'));
  }
  return `${lines.join('\n')}\n`;
}

function buildBookletManifestJson({ plan, canvas, sheetsPerBlock, printSettings, imageEntries }) {
  return JSON.stringify({
    type: 'collage-booklet-print-package',
    version: 'live-22-booklet-polish-safety',
    createdAt: new Date().toISOString(),
    pageCount: plan.pageCount,
    paddedPageCount: plan.paddedPageCount,
    blankPageCount: plan.blankPageCount,
    sheetsPerBlock,
    pagesPerBlock: plan.pagesPerBlock,
    blockCount: plan.blockCount,
    canvas,
    exportRatio: EXPORT_RATIO,
    printSettings,
    files: imageEntries.map(({ name, sideData }) => ({
      file: name,
      blockNumber: sideData.blockNumber,
      sheetNumber: sideData.sheetNumber,
      side: sideData.side,
      sideLabel: sideData.sideLabel,
      title: sideData.title,
      left: {
        pageNumber: sideData.left.pageNumber,
        isBlank: sideData.left.isBlank,
        label: bookletSlotLabel(sideData.left),
      },
      right: {
        pageNumber: sideData.right.pageNumber,
        isBlank: sideData.right.isBlank,
        label: bookletSlotLabel(sideData.right),
      },
    })),
  }, null, 2);
}

function buildBookletPreviewHtml({ plan, canvas, sheetsPerBlock, printSettings, imageEntries }) {
  const rows = buildBookletPrintRows(imageEntries);
  const sideCards = rows.map((row) => `
    <section class="sheet-side">
      <h2>${escapeHtml(row.title)}</h2>
      <p class="pair">[${escapeHtml(row.left)}][${escapeHtml(row.right)}]</p>
      <p class="file">${escapeHtml(row.file)}</p>
      <img src="${escapeHtml(row.file)}" alt="${escapeHtml(row.title)}">
    </section>
  `).join('\n');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Пакет печати брошюры</title>
  <style>
    body { margin: 0; padding: 24px; font-family: Arial, sans-serif; background: #f4f1ea; color: #1f2723; }
    .intro, .sheet-side { max-width: 1100px; margin: 0 auto 24px; background: white; border: 1px solid #d8d1c4; border-radius: 14px; padding: 18px; box-sizing: border-box; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    h2 { margin: 0 0 8px; font-size: 18px; }
    p { margin: 6px 0; }
    .pair { font-size: 18px; font-weight: 700; }
    .file { color: #667; font-size: 13px; }
    img { display: block; width: 100%; height: auto; margin-top: 12px; border: 1px solid #ddd6c9; background: white; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border-bottom: 1px solid #e8e1d4; padding: 6px 8px; text-align: left; }
    @media print {
      body { padding: 0; background: white; }
      .intro { display: none; }
      .sheet-side { border: 0; border-radius: 0; margin: 0; padding: 0; max-width: none; break-after: page; page-break-after: always; }
      .sheet-side h2, .sheet-side .pair, .sheet-side .file { display: none; }
      img { border: 0; margin: 0; width: 100%; }
    }
  </style>
</head>
<body>
  <section class="intro">
    <h1>Пакет печати брошюры</h1>
    <p>Это контрольный просмотр архива. Для точной печати используй PNG-файлы из папок <b>block-XX</b>.</p>
    <p>Страниц: ${plan.pageCount}. Добивка: ${plan.paddedPageCount}. Листов в блоке: ${sheetsPerBlock}. Блоков: ${plan.blockCount}.</p>
    <p>Размер страницы: ${canvas.width}×${canvas.height}px. Сгиб: ${printSettings.showFoldLine ? 'да' : 'нет'}. Метки реза: ${printSettings.showCropMarks ? 'да' : 'нет'}. Зазор: ${printSettings.gap}px. Поля: ${printSettings.margin}px.</p>
    <table>
      <thead><tr><th>Блок</th><th>Лист</th><th>Сторона</th><th>Пары</th><th>Файл</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${row.block}</td><td>${row.sheet}</td><td>${escapeHtml(row.sideLabel)}</td><td>[${escapeHtml(row.left)}][${escapeHtml(row.right)}]</td><td>${escapeHtml(row.file)}</td></tr>`).join('\n        ')}
      </tbody>
    </table>
  </section>
  ${sideCards}
</body>
</html>`;
}

let crc32Table = null;

function getCrc32Table() {
  if (crc32Table) return crc32Table;

  crc32Table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    crc32Table[index] = current >>> 0;
  }

  return crc32Table;
}

function crc32(bytes) {
  const table = getCrc32Table();
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function getZipDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function createZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const createdAt = new Date();
  const { dosDate, dosTime } = getZipDateTime(createdAt);

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes ?? []);
    const checksum = crc32(bytes);
    const size = bytes.length;
    const localHeader = new Uint8Array(30 + nameBytes.length);

    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0x0800);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, dosTime);
    writeUint16(localHeader, 12, dosDate);
    writeUint32(localHeader, 14, checksum);
    writeUint32(localHeader, 18, size);
    writeUint32(localHeader, 22, size);
    writeUint16(localHeader, 26, nameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, bytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0x0800);
    writeUint16(centralHeader, 10, 0);
    writeUint16(centralHeader, 12, dosTime);
    writeUint16(centralHeader, 14, dosDate);
    writeUint32(centralHeader, 16, checksum);
    writeUint32(centralHeader, 20, size);
    writeUint32(centralHeader, 24, size);
    writeUint16(centralHeader, 28, nameBytes.length);
    writeUint16(centralHeader, 30, 0);
    writeUint16(centralHeader, 32, 0);
    writeUint16(centralHeader, 34, 0);
    writeUint16(centralHeader, 36, 0);
    writeUint32(centralHeader, 38, 0);
    writeUint32(centralHeader, 42, offset);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + bytes.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);

  writeUint32(endRecord, 0, 0x06054b50);
  writeUint16(endRecord, 4, 0);
  writeUint16(endRecord, 6, 0);
  writeUint16(endRecord, 8, files.length);
  writeUint16(endRecord, 10, files.length);
  writeUint32(endRecord, 12, centralSize);
  writeUint32(endRecord, 16, centralOffset);
  writeUint16(endRecord, 20, 0);

  return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
}

function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  downloadDataUrl(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function scaleForPreview(width, height, isSpread) {
  const maxWidth = isSpread ? 1220 : 880;
  const maxHeight = 720;
  return Math.min(1, maxWidth / width, maxHeight / height);
}

function normalizeBookletPrintSettings(value = {}) {
  const showCropMarks = Boolean(value.showCropMarks);
  const requestedMargin = Number(value.margin ?? DEFAULT_BOOKLET_PRINT_SETTINGS.margin) || 0;
  const minimumMargin = showCropMarks ? CROP_MARK_OFFSET + CROP_MARK_LENGTH : 0;
  return {
    showFoldLine: Boolean(value.showFoldLine),
    showCropMarks,
    gap: Math.round(clamp(value.gap ?? DEFAULT_BOOKLET_PRINT_SETTINGS.gap, 0, MAX_BOOKLET_PRINT_GAP)),
    margin: Math.round(clamp(Math.max(requestedMargin, minimumMargin), 0, MAX_BOOKLET_PRINT_MARGIN)),
  };
}

function getBookletSheetSize(canvas, printSettings) {
  const normalized = normalizeBookletPrintSettings(printSettings);
  return {
    width: canvas.width * 2 + normalized.gap + normalized.margin * 2,
    height: canvas.height + normalized.margin * 2,
  };
}

function getBookletPagePosition(pageSlotIndex, canvas, printSettings) {
  const normalized = normalizeBookletPrintSettings(printSettings);
  return {
    x: normalized.margin + pageSlotIndex * (canvas.width + normalized.gap),
    y: normalized.margin,
  };
}

function BookletSheetBackground({ canvas, printSettings }) {
  const size = getBookletSheetSize(canvas, printSettings);
  return <Rect x={0} y={0} width={size.width} height={size.height} fill="#ffffff" listening={false} />;
}

function CropMark({ x, y, horizontalDirection, verticalDirection }) {
  const horizontalStart = x + horizontalDirection * CROP_MARK_OFFSET;
  const verticalStart = y + verticalDirection * CROP_MARK_OFFSET;
  return (
    <>
      <Line points={[horizontalStart, y, horizontalStart + horizontalDirection * CROP_MARK_LENGTH, y]} stroke="#222222" strokeWidth={2} listening={false} />
      <Line points={[x, verticalStart, x, verticalStart + verticalDirection * CROP_MARK_LENGTH]} stroke="#222222" strokeWidth={2} listening={false} />
    </>
  );
}

function BookletPrintGuides({ canvas, printSettings, preview = false }) {
  const normalized = normalizeBookletPrintSettings(printSettings);
  const sheet = getBookletSheetSize(canvas, normalized);
  const leftPage = getBookletPagePosition(0, canvas, normalized);
  const rightPage = getBookletPagePosition(1, canvas, normalized);
  const foldX = normalized.margin + canvas.width + normalized.gap / 2;
  const pages = [leftPage, rightPage];

  return (
    <Group listening={false}>
      {normalized.showFoldLine && (
        <Line
          points={[foldX, 0, foldX, sheet.height]}
          stroke={preview ? '#2f7d52' : '#9ca39d'}
          strokeWidth={preview ? 4 : 2}
          dash={[28, 18]}
          opacity={preview ? 0.7 : 0.85}
          listening={false}
        />
      )}
      {normalized.showCropMarks && pages.flatMap((page, pageIndex) => {
        const left = page.x;
        const right = page.x + canvas.width;
        const top = page.y;
        const bottom = page.y + canvas.height;
        return [
          <CropMark key={`crop-${pageIndex}-tl`} x={left} y={top} horizontalDirection={-1} verticalDirection={-1} />,
          <CropMark key={`crop-${pageIndex}-tr`} x={right} y={top} horizontalDirection={1} verticalDirection={-1} />,
          <CropMark key={`crop-${pageIndex}-bl`} x={left} y={bottom} horizontalDirection={-1} verticalDirection={1} />,
          <CropMark key={`crop-${pageIndex}-br`} x={right} y={bottom} horizontalDirection={1} verticalDirection={1} />,
        ];
      })}
    </Group>
  );
}


function PhotoImage({ frame, selected, image, rect, printMode, onSelect, onPhotoMove }) {
  if (!frame.photo || !rect) return null;
  return (
    <KonvaImage
      image={image}
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      draggable={!printMode && selected}
      onMouseDown={(event) => { event.cancelBubble = true; onSelect(); }}
      onTap={(event) => { event.cancelBubble = true; onSelect(); }}
      onDragStart={(event) => { event.cancelBubble = true; }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        const next = clampPhotoPosition(rect, frame, event.target.x(), event.target.y());
        event.target.x(next.x);
        event.target.y(next.y);
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        const next = clampPhotoPosition(rect, frame, event.target.x(), event.target.y());
        event.target.x(next.x);
        event.target.y(next.y);
        onPhotoMove(frame.id, photoOffsetFromPosition(rect, next.x, next.y));
      }}
    />
  );
}

function CollageFrame({ frame, selected, locked, borderWidth, borderColor, printMode, canvas, pageOffsetX, moveFrameWithPhoto, collagePreviewOnly = false, onSelect, onPhotoMove, onFrameChange, onFrameDragFinish }) {
  const [image, setImage] = useState(null);
  const groupRef = useRef(null);
  const frameRectRef = useRef(null);
  const transformerRef = useRef(null);
  const rect = coverPhotoRect(image, frame, frame.photo);
  const canDragFrame = !collagePreviewOnly && !printMode && selected && !locked;

  useEffect(() => {
    let active = true;
    if (!frame.photo?.src) {
      setImage(null);
      return () => { active = false; };
    }
    loadImage(frame.photo.src)
      .then((loaded) => { if (active) setImage(loaded); })
      .catch(() => { if (active) setImage(null); });
    return () => { active = false; };
  }, [frame.photo?.src]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const frameRect = frameRectRef.current;
    if (!transformer || !frameRect) return;
    transformer.nodes(selected && !collagePreviewOnly && !printMode && !locked ? [frameRect] : []);
    transformer.getLayer()?.batchDraw();
  }, [selected, collagePreviewOnly, printMode, locked, frame.x, frame.y, frame.width, frame.height]);

  // In text/drawings/templates modes the collage itself is preview-only,
  // but empty photo windows must stay visible as template placeholders.
  if (printMode && !frame.photo) return null;

  function clampFrameNode(node) {
    const next = clampFramePosition(frame, canvas, node.x(), node.y());
    node.x(next.x);
    node.y(next.y);
  }

  function commitFrameDrag(event) {
    if (collagePreviewOnly || printMode || !selected || locked) return;
    const node = event.target;
    clampFrameNode(node);
    onFrameChange(frame.id, { x: node.x(), y: node.y() });
    onFrameDragFinish?.();
  }

  function commitTransform() {
    if (collagePreviewOnly || printMode || !selected || locked || !frameRectRef.current) return;
    const node = frameRectRef.current;
    const patch = buildFrameTransformPatch(frame, {
      x: node.x(),
      y: node.y(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    });
    node.x(0);
    node.y(0);
    node.scaleX(1);
    node.scaleY(1);
    onFrameChange(frame.id, patch);
  }

  return (
    <>
      <Group
        ref={groupRef}
        x={frame.x}
        y={frame.y}
        listening={!collagePreviewOnly && !printMode}
        draggable={canDragFrame}
        onMouseDown={onSelect}
        onTap={onSelect}
        onDragMove={(event) => {
          if (!canDragFrame) return;
          clampFrameNode(event.target);
        }}
        onDragEnd={commitFrameDrag}
      >
        <Group clipX={0} clipY={0} clipWidth={frame.width} clipHeight={frame.height}>
          <Rect
            ref={frameRectRef}
            x={0}
            y={0}
            width={frame.width}
            height={frame.height}
            fill="#fbf7f2"
            stroke={selected && !printMode ? (locked ? '#2f7d52' : '#c27b4f') : borderColor}
            strokeWidth={selected && !printMode ? Math.max(5, borderWidth) : borderWidth}
            strokeScaleEnabled={false}
            onTransformEnd={commitTransform}
          />
          <PhotoImage frame={frame} selected={selected} image={image} rect={rect} printMode={printMode} onSelect={onSelect} onPhotoMove={onPhotoMove} />
          {moveFrameWithPhoto && !printMode && selected && !locked && (
            <Rect x={0} y={0} width={frame.width} height={frame.height} fill="rgba(47, 125, 82, 0.01)" stroke="#2f7d52" strokeWidth={6} strokeScaleEnabled={false} dash={[18, 12]} />
          )}
          {!frame.photo && !printMode && (
            <Rect x={14} y={14} width={Math.max(0, frame.width - 28)} height={Math.max(0, frame.height - 28)} stroke="#d8c7b9" strokeWidth={2} strokeScaleEnabled={false} dash={[14, 10]} cornerRadius={12} listening={false} />
          )}
        </Group>
      </Group>
      {selected && !printMode && !locked && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          keepRatio={false}
          flipEnabled={false}
          ignoreStroke
          enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']}
          anchorSize={26}
          anchorCornerRadius={6}
          borderStroke="#c27b4f"
          borderStrokeWidth={3}
          anchorStroke="#c27b4f"
          anchorFill="#fff7ef"
          boundBoxFunc={(oldBox, newBox) => validateFrameTransformBox(oldBox, newBox, { pageOffsetX, canvas, minFrame: MIN_FRAME })}
        />
      )}
    </>
  );
}

function GridHandles({ layout, onColumnResize, onRowResize, onActivate }) {
  if (!layout) return null;
  return (
    <>
      {getColumnHandles(layout).map((handle) => (
        <Rect
          key={handle.key}
          x={handle.x - HANDLE / 2}
          y={handle.y}
          width={HANDLE}
          height={handle.height}
          fill="#2f7d52"
          opacity={0.18}
          draggable
          onMouseDown={(event) => { event.cancelBubble = true; onActivate(); }}
          onTap={(event) => { event.cancelBubble = true; onActivate(); }}
          onDragMove={(event) => { event.cancelBubble = true; event.target.y(handle.y); onColumnResize(handle.rowIndex, handle.dividerIndex, event.target.x() + HANDLE / 2); }}
          onDragEnd={(event) => { event.cancelBubble = true; event.target.y(handle.y); onColumnResize(handle.rowIndex, handle.dividerIndex, event.target.x() + HANDLE / 2); }}
        />
      ))}
      {getRowHandles(layout).map((handle) => (
        <Rect
          key={handle.key}
          x={handle.x}
          y={handle.y - HANDLE / 2}
          width={handle.width}
          height={HANDLE}
          fill="#2f7d52"
          opacity={0.18}
          draggable
          onMouseDown={(event) => { event.cancelBubble = true; onActivate(); }}
          onTap={(event) => { event.cancelBubble = true; onActivate(); }}
          onDragMove={(event) => { event.cancelBubble = true; event.target.x(handle.x); onRowResize(handle.rowIndex, event.target.y() + HANDLE / 2); }}
          onDragEnd={(event) => { event.cancelBubble = true; event.target.x(handle.x); onRowResize(handle.rowIndex, event.target.y() + HANDLE / 2); }}
        />
      ))}
    </>
  );
}


function PageVisualGuides({ canvas, safe, locked, pageIndex, active }) {
  const pageColor = locked ? '#2f7d52' : '#c27b4f';
  const centerColor = '#2f7d52';
  const quarters = [0.25, 0.75];

  return (
    <>
      <Rect
        x={0}
        y={0}
        width={canvas.width}
        height={canvas.height}
        stroke={pageColor}
        strokeWidth={1.5}
        strokeScaleEnabled={false}
        dash={[18, 14]}
        opacity={0.18}
        listening={false}
      />
      <Rect
        x={safe}
        y={safe}
        width={Math.max(0, canvas.width - safe * 2)}
        height={Math.max(0, canvas.height - safe * 2)}
        stroke={pageColor}
        strokeWidth={2}
        strokeScaleEnabled={false}
        dash={[18, 14]}
        opacity={0.32}
        listening={false}
      />
      {quarters.map((part) => (
        <Group key={`quarter-${part}`} listening={false} opacity={0.08}>
          <Line points={[canvas.width * part, 0, canvas.width * part, canvas.height]} stroke={centerColor} strokeWidth={1} strokeScaleEnabled={false} dash={[10, 14]} listening={false} />
          <Line points={[0, canvas.height * part, canvas.width, canvas.height * part]} stroke={centerColor} strokeWidth={1} strokeScaleEnabled={false} dash={[10, 14]} listening={false} />
        </Group>
      ))}
      <Line points={[canvas.width / 2, 0, canvas.width / 2, canvas.height]} stroke={centerColor} strokeWidth={1.5} strokeScaleEnabled={false} opacity={0.22} listening={false} />
      <Line points={[0, canvas.height / 2, canvas.width, canvas.height / 2]} stroke={centerColor} strokeWidth={1.5} strokeScaleEnabled={false} opacity={0.22} listening={false} />
      <Text
        x={28}
        y={24}
        text={`Стр. ${pageIndex + 1}`}
        fontSize={34}
        fill={active ? pageColor : '#b49a87'}
        fontStyle="bold"
        opacity={0.82}
        listening={false}
      />
    </>
  );
}

function PageLayer({ page, pageIndex, x, y = 0, canvas, settings, activePageId, selectedFrameId, moveFrameWithPhotoId, printMode = false, collagePreviewOnly = false, onFrameSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onColumnResize, onRowResize, onActivatePage }) {
  const locked = settings.frameMode === 'locked';
  const safe = Math.min(settings.padding, Math.floor(canvas.width / 3), Math.floor(canvas.height / 3));
  if (!page || page.isBlankPage) {
    return (
      <Group x={x} y={y}>
        <Rect name="background" x={0} y={0} width={canvas.width} height={canvas.height} fill={settings.borderColor} />
        {!printMode && settings.showGuides && <PageVisualGuides canvas={canvas} safe={safe} locked={locked} pageIndex={pageIndex} active={page?.id === activePageId} />}
        {page?.isBlankPage && !printMode && !collagePreviewOnly && (
          <Text x={42} y={78} text="Пустая страница" fontSize={34} fill="#b49a87" fontStyle="bold" opacity={0.62} listening={false} />
        )}
      </Group>
    );
  }
  const orderedFrames = [...page.frames].sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0));
  return (
    <Group x={x} y={y}>
      <Rect name="background" x={0} y={0} width={canvas.width} height={canvas.height} fill={settings.borderColor} />
      {!printMode && settings.showGuides && <PageVisualGuides canvas={canvas} safe={safe} locked={locked} pageIndex={pageIndex} active={page.id === activePageId} />}
      {orderedFrames.map((frame) => (
        <CollageFrame
          key={frame.id}
          frame={frame}
          selected={!collagePreviewOnly && !printMode && page.id === activePageId && frame.id === selectedFrameId}
          locked={locked}
          borderWidth={settings.borderWidth}
          borderColor={settings.borderColor}
          printMode={printMode}
          canvas={canvas}
          pageOffsetX={x}
          moveFrameWithPhoto={!collagePreviewOnly && !printMode && frame.id === moveFrameWithPhotoId}
          onSelect={() => !collagePreviewOnly && !printMode && onFrameSelect(page.id, frame.id)}
          onPhotoMove={(frameId, patch) => !collagePreviewOnly && !printMode && onPhotoMove(page.id, frameId, patch)}
          onFrameChange={(frameId, patch) => !collagePreviewOnly && !printMode && onFrameChange(page.id, frameId, patch)}
          onFrameDragFinish={() => !collagePreviewOnly && !printMode && onFrameDragFinish?.(frame.id)}
          collagePreviewOnly={collagePreviewOnly}
        />
      ))}
      {!collagePreviewOnly && !printMode && locked && (
        <GridHandles
          layout={page.layout}
          onActivate={() => onActivatePage(page.id)}
          onColumnResize={(rowIndex, dividerIndex, centerX) => onColumnResize(page.id, rowIndex, dividerIndex, centerX)}
          onRowResize={(rowIndex, centerY) => onRowResize(page.id, rowIndex, centerY)}
        />
      )}
    </Group>
  );
}

function textFontFamily(item) {
  return item?.fontFamily || fontById(item?.fontId).family;
}

function textFontStyle(item) {
  const style = item?.fontStyle === 'italic' ? 'italic' : 'normal';
  const weight = Number(item?.fontWeight) || 500;
  return `${style} ${weight}`;
}

function ExtraPageLayers({
  extraLayers,
  pageIndex,
  x = 0,
  y = 0,
  mode = 'collage',
  selectedTextId = null,
  selectedDrawingId = null,
  printMode = false,
  onSelectText = () => {},
  onSelectDrawing = () => {},
  onTextDragEnd = () => {},
  onDrawingDragEnd = () => {},
}) {
  const texts = textLayersForPage(extraLayers, pageIndex);
  const drawings = drawingLayersForPage(extraLayers, pageIndex);
  if (!texts.length && !drawings.length) return null;
  const canEditText = mode === 'text' && !printMode;
  const canEditDrawings = mode === 'drawings' && !printMode;

  return (
    <Group x={x} y={y} listening={!printMode}>
      {drawings.map((item) => {
        if (item?.type !== 'line') return null;
        const length = Math.max(1, Number(item.length) || 300);
        const strokeWidth = Math.max(1, Number(item.strokeWidth) || 4);
        const isSelected = item.id === selectedDrawingId;
        return (
          <Group
            key={item.id ?? `${pageIndex}-line-${item.x}-${item.y}`}
            x={Number(item.x) || 0}
            y={Number(item.y) || 0}
            rotation={Number(item.angle) || 0}
            opacity={Number(item.opacity ?? 1)}
            draggable={canEditDrawings && isSelected}
            listening={canEditDrawings}
            onMouseDown={(event) => { event.cancelBubble = true; onSelectDrawing(item.id); }}
            onTap={(event) => { event.cancelBubble = true; onSelectDrawing(item.id); }}
            onDragEnd={(event) => onDrawingDragEnd(item.id, { x: Math.round(event.target.x()), y: Math.round(event.target.y()) })}
          >
            <Line
              points={[0, 0, length, 0]}
              stroke={item.color || '#6f6862'}
              strokeWidth={strokeWidth}
              lineCap="round"
              lineJoin="round"
              listening={canEditDrawings}
              hitStrokeWidth={Math.max(24, strokeWidth + 18)}
            />
            {isSelected && canEditDrawings && (
              <Line points={[0, 0, length, 0]} stroke="#2f7d52" strokeWidth={Math.max(2, strokeWidth + 8)} opacity={0.18} lineCap="round" listening={false} />
            )}
          </Group>
        );
      })}
      {texts.map((item) => {
        const fontSize = Math.max(1, Number(item.fontSize) || 56);
        const isSelected = item.id === selectedTextId;
        const width = Math.max(1, Number(item.width) || 500);
        const textValue = String(item.text ?? '');
        return (
          <Text
            key={item.id ?? `${pageIndex}-${item.x}-${item.y}`}
            x={Number(item.x) || 0}
            y={Number(item.y) || 0}
            width={width}
            text={textValue}
            fontSize={fontSize}
            fontFamily={textFontFamily(item)}
            fontStyle={textFontStyle(item)}
            lineHeight={Number(item.lineHeight) || 1.18}
            fill={item.color || '#1f2723'}
            wrap="word"
            draggable={canEditText && isSelected}
            listening={canEditText}
            onMouseDown={(event) => { event.cancelBubble = true; onSelectText(item.id); }}
            onTap={(event) => { event.cancelBubble = true; onSelectText(item.id); }}
            onDragEnd={(event) => onTextDragEnd(item.id, { x: Math.round(event.target.x()), y: Math.round(event.target.y()) })}
            shadowColor={isSelected && canEditText ? '#2f7d52' : undefined}
            shadowBlur={isSelected && canEditText ? 10 : 0}
            shadowOpacity={isSelected && canEditText ? 0.24 : 0}
          />
        );
      })}
    </Group>
  );
}


export default function App() {
  const stageRef = useRef(null);
  const printPageRef = useRef(null);
  const printSpreadRef = useRef(null);
  const printBookletRef = useRef(null);
  const jsonRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const photoUploadInFlightRef = useRef(false);

  const [album, setAlbum] = useState(() => createInitialAlbum(DEFAULT_CANVAS, DEFAULT_SETTINGS));
  const [library, setLibrary] = useState([]);
  const [canvas, setCanvas] = useState(DEFAULT_CANVAS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedFrameId, setSelectedFrameId] = useState(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const [photoImporting, setPhotoImporting] = useState(false);
  const [moveFrameWithPhotoId, setMoveFrameWithPhotoId] = useState(null);
  const [viewMode, setViewMode] = useState('spread');
  const [bookletSheetsPerBlock, setBookletSheetsPerBlock] = useState(DEFAULT_SHEETS_PER_BLOCK);
  const [bookletPrintSettings, setBookletPrintSettings] = useState(DEFAULT_BOOKLET_PRINT_SETTINGS);
  const [bookletSideId, setBookletSideId] = useState(null);
  const [printBookletSideId, setPrintBookletSideId] = useState(null);
  const [notice, setNotice] = useState('');
  const [albumMode, setAlbumMode] = useState(() => localStorage.getItem(ALBUM_MODE_KEY) || 'collage');
  const [extraLayers, setExtraLayers] = useState(() => normalizeExtraLayers(null));
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [templateRecords, setTemplateRecords] = useState(() => {
    try {
      const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return sanitizeTemplateRecords(parsed);
    } catch {
      return [];
    }
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const templateJsonRef = useRef(null);
  const [dragPageIndex, setDragPageIndex] = useState(null);
  const [dragOverPageIndex, setDragOverPageIndex] = useState(null);

  useEffect(() => {
    const next = normalizeAlbumEditorMode(albumMode);
    if (document.body?.dataset) document.body.dataset.albumMode = next;
    try { localStorage.setItem(ALBUM_MODE_KEY, next); } catch { /* ignore localStorage errors */ }
  }, [albumMode]);

  useEffect(() => {
    try { localStorage.removeItem(ALBUM_LAYERS_KEY); } catch { /* ignore localStorage errors */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templateRecords)); } catch { /* ignore localStorage errors */ }
  }, [templateRecords]);

  const collagePreviewOnly = albumMode !== 'collage';

  const pages = album.pages;
  const currentPageIndex = Math.max(0, pages.findIndex((page) => page.id === album.currentPageId));
  const currentPage = pages[currentPageIndex] ?? pages[0];
  const currentPageFrameCount = resolvePageFrameCount(currentPage, settings);
  const spreadStart = currentPageIndex % 2 === 0 ? currentPageIndex : currentPageIndex - 1;
  const isBooklet = viewMode === 'booklet';
  const isSpread = viewMode === 'spread';
  const locked = settings.frameMode === 'locked';
  const bookletPlan = useMemo(
    () => buildBookletPlan({ pageCount: pages.length, sheetsPerBlock: bookletSheetsPerBlock }),
    [pages.length, bookletSheetsPerBlock],
  );
  const currentBookletSide = useMemo(() => {
    if (!bookletPlan.sides.length) return null;
    if (bookletSideId) {
      const byId = bookletPlan.sides.find((side) => side.id === bookletSideId);
      if (byId) return byId;
    }
    return findBookletSideForPage(bookletPlan, currentPageIndex + 1) ?? bookletPlan.sides[0];
  }, [bookletPlan, bookletSideId, currentPageIndex]);
  const printBookletSide = useMemo(() => {
    if (!bookletPlan.sides.length) return null;
    if (printBookletSideId) {
      const byId = bookletPlan.sides.find((side) => side.id === printBookletSideId);
      if (byId) return byId;
    }
    return currentBookletSide ?? bookletPlan.sides[0];
  }, [bookletPlan, printBookletSideId, currentBookletSide]);
  const visibleBookletPageNumbers = useMemo(() => {
    if (!currentBookletSide) return new Set();
    return new Set(currentBookletSide.slots.filter((slot) => !slot.isBlank && slot.pageNumber).map((slot) => slot.pageNumber));
  }, [currentBookletSide]);
  const trailingBlankPageCount = useMemo(() => {
    let count = 0;
    for (let index = pages.length - 1; index >= 0; index -= 1) {
      if (!pages[index]?.isBlankPage) break;
      count += 1;
    }
    return count;
  }, [pages]);
  const normalizedBookletPrintSettings = useMemo(
    () => normalizeBookletPrintSettings(bookletPrintSettings),
    [bookletPrintSettings],
  );
  const bookletSheetSize = useMemo(
    () => getBookletSheetSize(canvas, normalizedBookletPrintSettings),
    [canvas, normalizedBookletPrintSettings],
  );
  const stageRealWidth = isBooklet ? bookletSheetSize.width : isSpread ? canvas.width * 2 + SPREAD_GAP : canvas.width;
  const stageRealHeight = isBooklet ? bookletSheetSize.height : canvas.height;
  const previewScale = scaleForPreview(stageRealWidth, stageRealHeight, isSpread || isBooklet);
  const stageDisplayWidth = stageRealWidth * previewScale;
  const stageDisplayHeight = stageRealHeight * previewScale;
  const bookletExportSummary = useMemo(() => ({
    pages: pages.length,
    blocks: bookletPlan.blockCount,
    sheets: bookletPlan.blockCount * bookletSheetsPerBlock,
    sides: bookletPlan.sides.length,
    blanks: bookletPlan.blankPageCount,
  }), [pages.length, bookletPlan, bookletSheetsPerBlock]);
  const entries = isBooklet && currentBookletSide
    ? currentBookletSide.slots.map((slot, index) => {
        const position = getBookletPagePosition(index, canvas, normalizedBookletPrintSettings);
        return {
          page: slot.sourcePageIndex == null ? null : pages[slot.sourcePageIndex],
          pageIndex: slot.sourcePageIndex ?? -1,
          x: position.x,
          y: position.y,
          bookletSlot: slot,
        };
      })
    : isSpread
      ? [
          { page: pages[spreadStart], pageIndex: spreadStart, x: 0 },
          { page: pages[spreadStart + 1], pageIndex: spreadStart + 1, x: canvas.width + SPREAD_GAP },
        ]
      : [{ page: currentPage, pageIndex: currentPageIndex, x: 0 }];

  const selectedFrame = useMemo(() => currentPage?.frames.find((frame) => frame.id === selectedFrameId) ?? null, [currentPage, selectedFrameId]);
  const selectedPhoto = useMemo(() => library.find((photo) => photo.id === selectedPhotoId) ?? null, [library, selectedPhotoId]);
  const usedPhotoIds = useMemo(() => {
    const used = new Set();
    pages.forEach((page) => {
      page.frames?.forEach((frame) => {
        if (frame.photo?.id) used.add(frame.photo.id);
      });
    });
    return used;
  }, [pages]);


  function show(text) {
    setNotice(text);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 2500);
  }

  function updateExtraLayers(updater) {
    setExtraLayers((current) => normalizeExtraLayers(typeof updater === 'function' ? updater(normalizeExtraLayers(current)) : updater));
  }

  function setMode(mode) {
    const next = normalizeAlbumEditorMode(mode);
    setAlbumMode(next);
    setSelectedFrameId(null);
    setSelectedTextId(null);
    setSelectedDrawingId(null);
  }

  function activePageNumber() {
    return currentPageIndex + 1;
  }

  function createTextItem(presetId = DEFAULT_TEXT_PRESET_ID) {
    const preset = presetById(presetId);
    return {
      id: makeId(),
      x: Math.round(canvas.width * 0.12),
      y: Math.round(canvas.height * 0.12),
      width: Math.min(720, Math.round(canvas.width * 0.62)),
      text: preset.text,
      fontId: preset.fontId,
      fontFamily: fontById(preset.fontId).family,
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight,
      fontStyle: preset.fontStyle,
      lineHeight: preset.lineHeight,
      color: preset.color,
    };
  }

  function addText(presetId = DEFAULT_TEXT_PRESET_ID) {
    const item = createTextItem(presetId);
    updateExtraLayers((layers) => {
      const { next, page } = createPageLayerDraft(layers, activePageNumber());
      page.texts.push(item);
      return next;
    });
    setSelectedFrameId(null);
    setSelectedDrawingId(null);
    setSelectedTextId(item.id);
    setMode('text');
  }

  function updateText(id, patch) {
    updateExtraLayers((layers) => {
      const next = cloneDeep(layers) || { version: 1, pages: {} };
      Object.values(next.pages || {}).forEach((page) => {
        if (!Array.isArray(page.texts)) return;
        page.texts = page.texts.map((item) => (item.id === id ? { ...item, ...patch } : item));
      });
      return next;
    });
  }

  function deleteText(id = selectedTextId) {
    if (!id) return;
    updateExtraLayers((layers) => {
      const next = cloneDeep(layers) || { version: 1, pages: {} };
      Object.values(next.pages || {}).forEach((page) => {
        if (Array.isArray(page.texts)) page.texts = page.texts.filter((item) => item.id !== id);
      });
      return next;
    });
    setSelectedTextId(null);
  }

  function createLineItem() {
    return {
      id: makeId(),
      type: 'line',
      x: Math.round(canvas.width * 0.18),
      y: Math.round(canvas.height * 0.5),
      length: Math.round(canvas.width * 0.48),
      angle: 0,
      strokeWidth: 4,
      color: '#6f6862',
      opacity: 1,
    };
  }

  function addLine() {
    const item = createLineItem();
    updateExtraLayers((layers) => {
      const { next, page } = createPageLayerDraft(layers, activePageNumber());
      page.drawings.push(item);
      return next;
    });
    setSelectedFrameId(null);
    setSelectedTextId(null);
    setSelectedDrawingId(item.id);
    setMode('drawings');
  }

  function updateDrawing(id, patch) {
    updateExtraLayers((layers) => {
      const next = cloneDeep(layers) || { version: 1, pages: {} };
      Object.values(next.pages || {}).forEach((page) => {
        if (!Array.isArray(page.drawings)) return;
        page.drawings = page.drawings.map((item) => (item.id === id ? { ...item, ...patch } : item));
      });
      return next;
    });
  }

  function deleteDrawing(id = selectedDrawingId) {
    if (!id) return;
    updateExtraLayers((layers) => {
      const next = cloneDeep(layers) || { version: 1, pages: {} };
      Object.values(next.pages || {}).forEach((page) => {
        if (Array.isArray(page.drawings)) page.drawings = page.drawings.filter((item) => item.id !== id);
      });
      return next;
    });
    setSelectedDrawingId(null);
  }

  function updatePageFrames(pageId, updater) {
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => (page.id === pageId ? { ...page, frames: typeof updater === 'function' ? updater(page.frames) : updater } : page)),
    }));
  }

  function changeFrame(pageId, frameId, patch) {
    updatePageFrames(pageId, (frames) => updateFrameGeometry(frames, frameId, patch, canvas));
  }

  function rebuildPage(pageId, nextCanvas = canvas, nextSettings = settings, explicitFrameCount) {
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== pageId) return page;
        if (page.isBlankPage) return page;
        const frameCount = explicitFrameCount ?? resolvePageFrameCount(page, nextSettings);
        if (frameCount <= 0) return { ...page, frameCount: 0, layout: null, frames: [] };
        const pageSettings = settingsForPage(nextSettings, page, frameCount);
        const built = buildGridLayout(nextCanvas, pageSettings, page.frames);
        return { ...page, frameCount, layout: built.layout, frames: built.frames };
      }),
    }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
  }

  function rebuildAll(nextCanvas = canvas, nextSettings = settings) {
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.isBlankPage) return page;
        const frameCount = resolvePageFrameCount(page, nextSettings);
        if (frameCount <= 0) return { ...page, frameCount: 0, layout: null, frames: [] };
        const pageSettings = settingsForPage(nextSettings, page, frameCount);
        const built = buildGridLayout(nextCanvas, pageSettings, page.frames);
        return { ...page, frameCount, layout: built.layout, frames: built.frames };
      }),
    }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
  }

  function updateCurrentPageFrameCount(value) {
    if (currentPage?.isBlankPage) {
      show('Это пустая страница без фото-окон');
      return;
    }
    const frameCount = clamp(Number(value), 0, 9);
    const nextSettings = { ...settings, frameCount };
    setSettings(nextSettings);
    rebuildPage(album.currentPageId, canvas, nextSettings, frameCount);
    show(`На странице ${currentPageIndex + 1}: ${frameCount} фото-окон`);
  }

  function updateSetting(key, value) {
    if (key === 'frameCount') {
      updateCurrentPageFrameCount(value);
      return;
    }
    const next = { ...settings, [key]: value };
    setSettings(next);

    if (key === 'showGuides' || key === 'borderColor' || key === 'borderWidth') return;

    if (key === 'frameMode') {
      setMoveFrameWithPhotoId(null);
      show(value === 'locked' ? 'Сетка включена. Раскладка сохранена.' : 'Свободный режим включён. Раскладка сохранена.');
      return;
    }

    rebuildAll(canvas, next);
  }



  function updateCanvas(width, height, presetId = settings.presetId) {
    const nextCanvas = { width: clamp(width, 300, 5000), height: clamp(height, 300, 5000) };
    const nextSettings = { ...settings, presetId };
    setCanvas(nextCanvas);
    setSettings(nextSettings);
    rebuildAll(nextCanvas, nextSettings);
  }

  function updateLayoutPage(pageId, layoutUpdater) {
    setAlbum((current) => ({
      ...current,
      currentPageId: pageId,
      pages: current.pages.map((page) => {
        if (page.id !== pageId) return page;
        const oldLayout = ensureLayout(page, canvas, settingsForPage(settings, page));
        const nextLayout = layoutUpdater(oldLayout);
        return { ...page, layout: nextLayout, frames: framesFromLayout(nextLayout, page.frames) };
      }),
    }));
  }

  function resizeGridColumn(pageId, rowIndex, dividerIndex, centerX) {
    updateLayoutPage(pageId, (layout) => resizeColumn(layout, rowIndex, dividerIndex, centerX));
  }

  function resizeGridRow(pageId, rowIndex, centerY) {
    updateLayoutPage(pageId, (layout) => resizeRow(layout, rowIndex, centerY));
  }

  async function uploadPhotos(event) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (photoUploadInFlightRef.current) return show('Дождись окончания текущей загрузки фото');

    const selection = selectPhotoUploads(files, library.length);
    if (!selection.accepted.length) {
      if (selection.rejectedSize) return show('Фото слишком большие. Максимум 25 МБ на файл.');
      if (selection.rejectedLimit) return show(`В библиотеке можно хранить не больше ${MAX_LIBRARY_PHOTOS} фото`);
      return show('Подходящих изображений не найдено');
    }

    photoUploadInFlightRef.current = true;
    setPhotoImporting(true);
    const skippedBeforeRead = selection.rejectedType + selection.rejectedSize + selection.rejectedLimit;
    show(`Загружаю фото: ${selection.accepted.length}`);

    try {
      const result = await readPhotoFilesAsDataUrls(selection.accepted);
      const availableSlots = Math.max(0, MAX_LIBRARY_PHOTOS - library.length);
      const additions = result.loaded.slice(0, availableSlots).map(({ file, dataUrl }) => ({
        id: makeId(),
        name: file.name,
        src: dataUrl,
      }));
      if (additions.length) {
        setLibrary((current) => [...current, ...additions].slice(0, MAX_LIBRARY_PHOTOS));
      }

      const overflow = Math.max(0, result.loaded.length - additions.length);
      const skipped = skippedBeforeRead + result.failed.length + overflow;
      const suffix = skipped ? ` · пропущено: ${skipped}` : '';
      show(`Фото загружены: ${additions.length}${suffix}`);
    } catch (error) {
      console.warn('Photo import failed', error);
      show('Не удалось загрузить фотографии');
    } finally {
      photoUploadInFlightRef.current = false;
      setPhotoImporting(false);
    }
  }

  function putPhoto(pageId, frameId, photo) {
    updatePageFrames(pageId, (frames) => applyPhotoToFrames(frames, frameId, photo));
    setAlbum((current) => ({ ...current, currentPageId: pageId }));
    setSelectedFrameId(frameId);
    setMoveFrameWithPhotoId(null);
  }

  function selectFrame(pageId, frameId) {
    if (selectedPhoto) {
      putPhoto(pageId, frameId, selectedPhoto);
      setSelectedPhotoId(null);
      show('Фото вставлено');
      return;
    }
    setAlbum((current) => ({ ...current, currentPageId: pageId }));
    setSelectedFrameId(frameId);
    setMoveFrameWithPhotoId((current) => (current && current !== frameId ? null : current));
  }

  function dropPhoto(event) {
    event.preventDefault();
    const photo = library.find((item) => item.id === event.dataTransfer.getData('photo-id'));
    if (!photo || !stageRef.current) return;
    stageRef.current.setPointersPositions(event);
    const point = stageRef.current.getPointerPosition();
    if (!point) return;
    const target = findFrameAtPoint(entries, point);
    if (target) {
      putPhoto(target.pageId, target.frameId, photo);
      return;
    }
    show('Перетащи фото прямо в рамку');
  }

  function updatePhoto(pageId, frameId, patch) {
    updatePageFrames(pageId, (frames) => updateFramePhoto(frames, frameId, patch));
  }

  function addPage() {
    const page = createPage(canvas, settings, pages.length + 1);
    const index = pages.findIndex((item) => item.id === album.currentPageId);
    const insertIndex = Math.max(0, index + 1);
    shiftExtraLayersForPageInsert(insertIndex, pages.length);
    setAlbum((current) => {
      const currentIndex = current.pages.findIndex((item) => item.id === current.currentPageId);
      const next = [...current.pages];
      next.splice(currentIndex + 1, 0, page);
      return { pages: next, currentPageId: page.id };
    });
    setViewMode('spread');
    setMoveFrameWithPhotoId(null);
  }

  function addBlankPage() {
    const page = createBlankPage(pages.length + 1);
    const index = pages.findIndex((item) => item.id === album.currentPageId);
    const insertIndex = Math.max(0, index + 1);
    shiftExtraLayersForPageInsert(insertIndex, pages.length);
    setAlbum((current) => {
      const currentIndex = current.pages.findIndex((item) => item.id === current.currentPageId);
      const next = [...current.pages];
      next.splice(currentIndex + 1, 0, page);
      return { pages: next, currentPageId: page.id };
    });
    setViewMode('spread');
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    show('Пустая страница добавлена');
  }

  function addBlankPagesToBookletBlock() {
    const count = bookletPlan.blankPageCount;
    if (!count) return show('Блок уже полный: пустые страницы не нужны');
    const nextBlankPages = Array.from({ length: count }, (_, index) => createBlankPage(pages.length + index + 1));
    setAlbum((current) => ({
      ...current,
      pages: [...current.pages, ...nextBlankPages],
      currentPageId: nextBlankPages[0]?.id ?? current.currentPageId,
    }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    show(`Добавлены пустые страницы: ${count}`);
  }

  function removeTrailingBlankPages() {
    const next = [...pages];
    let removed = 0;
    while (next.length > 1 && next[next.length - 1]?.isBlankPage) {
      next.pop();
      removed += 1;
    }
    if (!removed) return show('В конце нет пустых страниц');
    pruneExtraLayersForPageCount(next.length);
    setAlbum((current) => ({
      ...current,
      pages: next,
      currentPageId: next.some((page) => page.id === current.currentPageId) ? current.currentPageId : next[next.length - 1].id,
    }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    show(`Убраны пустые страницы в конце: ${removed}`);
  }

  function duplicatePage() {
    if (!currentPage) return;
    const index = pages.findIndex((item) => item.id === album.currentPageId);
    const insertIndex = Math.max(0, index + 1);
    const currentPageLayers = extraLayers?.pages?.[String(currentPageIndex + 1)] ?? null;
    const page = clonePageForDuplicate(currentPage, insertIndex + 1);
    shiftExtraLayersForPageInsert(insertIndex, pages.length, currentPageLayers);
    setAlbum((current) => {
      const currentIndex = current.pages.findIndex((item) => item.id === current.currentPageId);
      const next = [...current.pages];
      next.splice(currentIndex + 1, 0, page);
      return { pages: next, currentPageId: page.id };
    });
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    show('Страница скопирована точно');
  }

  function deletePage() {
    if (pages.length <= 1) return show('Нельзя удалить единственную страницу');
    const index = pages.findIndex((page) => page.id === album.currentPageId);
    if (index >= 0) shiftExtraLayersForPageDelete(index, pages.length);
    setAlbum((current) => {
      const currentIndex = current.pages.findIndex((page) => page.id === current.currentPageId);
      const next = current.pages.filter((page) => page.id !== current.currentPageId);
      return { pages: next, currentPageId: next[Math.min(currentIndex, next.length - 1)].id };
    });
    setMoveFrameWithPhotoId(null);
  }



  function deleteSelectedFrame() {
    if (!selectedFrame || !currentPage) return;
    const frameCount = resolvePageFrameCount(currentPage, settings);
    if (frameCount <= 0) return show('На странице уже нет фото-окон');
    const nextFrameCount = frameCount - 1;
    const keptFrames = removeFrameById(currentPage.frames, selectedFrame.id);
    const nextSettings = { ...settings, frameCount: nextFrameCount };
    setSettings(nextSettings);
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== current.currentPageId) return page;
        if (nextFrameCount <= 0) return { ...page, frameCount: 0, layout: null, frames: [] };
        const pageSettings = settingsForPage(nextSettings, page, nextFrameCount);
        const built = buildGridLayout(canvas, pageSettings, keptFrames);
        return { ...page, frameCount: nextFrameCount, layout: built.layout, frames: built.frames };
      }),
    }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    show(nextFrameCount > 0 ? `Окно удалено. На странице ${currentPageIndex + 1}: ${nextFrameCount} фото-окон` : `На странице ${currentPageIndex + 1} больше нет фото-окон`);
  }

  function bringSelectedFrameToFront() {
    if (!selectedFrame || locked) return;
    updatePageFrames(album.currentPageId, (frames) => bringFrameToFront(frames, selectedFrame.id));
    show('Окно поднято поверх остальных');
  }

  function enableMoveFrameWithPhoto() {
    if (!selectedFrame || locked) return;
    if (!selectedFrame.photo) {
      show('В этом окне нет фото. Рамку можно двигать обычным способом.');
      return;
    }
    setMoveFrameWithPhotoId(selectedFrame.id);
    show('Теперь перетащи рамку: фото поедет вместе с ней.');
  }



  function shiftExtraLayersForPageInsert(insertIndex, oldPageCount, insertedPageLayers = null) {
    updateExtraLayers((layers) => insertExtraLayerPage(layers, insertIndex, oldPageCount, insertedPageLayers, makeId));
  }

  function shiftExtraLayersForPageDelete(deleteIndex, oldPageCount) {
    updateExtraLayers((layers) => deleteExtraLayerPage(layers, deleteIndex, oldPageCount));
  }

  function pruneExtraLayersForPageCount(pageCount) {
    updateExtraLayers((layers) => pruneExtraLayerPages(layers, pageCount));
  }

  function reorderExtraLayersByPageMove(fromIndex, toIndex, pageCount) {
    if (fromIndex === toIndex) return;
    updateExtraLayers((layers) => reorderExtraLayerPages(layers, fromIndex, toIndex, pageCount));
  }


  function reorderPages(fromIndex, toIndex) {
    const safeFrom = Number(fromIndex);
    const safeTo = Number(toIndex);
    if (!Number.isInteger(safeFrom) || !Number.isInteger(safeTo)) return;
    if (safeFrom < 0 || safeTo < 0 || safeFrom >= pages.length || safeTo >= pages.length) return;
    if (safeFrom === safeTo) {
      selectPageByIndex(safeTo);
      return;
    }

    reorderExtraLayersByPageMove(safeFrom, safeTo, pages.length);

    const movedPage = pages[safeFrom];
    setAlbum((current) => {
      const nextPages = moveArrayItem(current.pages, safeFrom, safeTo);
      return { ...current, pages: nextPages, currentPageId: movedPage?.id ?? current.currentPageId };
    });

    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    setDragPageIndex(null);
    setDragOverPageIndex(null);

    if (viewMode === 'booklet') {
      const side = findBookletSideForPage(bookletPlan, safeTo + 1);
      setBookletSideId(side?.id ?? null);
    }

    show(`Страница ${safeFrom + 1} перемещена на место ${safeTo + 1}`);
  }

  function startPageDrag(event, index) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-collage-page-index', String(index));
    event.dataTransfer.setData('text/plain', String(index));
    setDragPageIndex(index);
    setDragOverPageIndex(index);
  }

  function dragOverPage(event, index) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverPageIndex(index);
  }

  function dropPage(event, index) {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/x-collage-page-index') || event.dataTransfer.getData('text/plain');
    reorderPages(Number(raw), index);
  }

  function finishPageDrag() {
    setDragPageIndex(null);
    setDragOverPageIndex(null);
  }


  function goSpread(direction) {
    const next = direction === 'next' ? Math.min(pages.length - 1, spreadStart + 2) : Math.max(0, spreadStart - 2);
    setAlbum((current) => ({ ...current, currentPageId: pages[next]?.id ?? pages[0].id }));
    setMoveFrameWithPhotoId(null);
  }

  function selectPageByIndex(index) {
    const page = pages[index];
    if (!page) return;
    setAlbum((current) => ({ ...current, currentPageId: page.id }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    if (viewMode === 'booklet') {
      const side = findBookletSideForPage(bookletPlan, index + 1);
      setBookletSideId(side?.id ?? null);
    }
  }

  function enterBookletMode() {
    const side = findBookletSideForPage(bookletPlan, currentPageIndex + 1) ?? bookletPlan.sides[0];
    setBookletSideId(side?.id ?? null);
    setViewMode('booklet');
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
  }

  function updateBookletSheetsPerBlock(value) {
    const nextSheets = clampBookletSheetsPerBlock(value);
    const nextPlan = buildBookletPlan({ pageCount: pages.length, sheetsPerBlock: nextSheets });
    const side = findBookletSideForPage(nextPlan, currentPageIndex + 1) ?? nextPlan.sides[0];
    setBookletSheetsPerBlock(nextSheets);
    setBookletSideId(side?.id ?? null);
  }

  function updateBookletPrintSetting(key, value) {
    setBookletPrintSettings((current) => normalizeBookletPrintSettings({
      ...current,
      [key]: value,
    }));
  }

  function openBookletSide(sideData) {
    if (!sideData) return;
    setBookletSideId(sideData.id);
    const pageNumber = sideData.right.pageNumber ?? sideData.left.pageNumber;
    const page = pageNumber ? pages[pageNumber - 1] : null;
    if (page) setAlbum((current) => ({ ...current, currentPageId: page.id }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
  }

  function goBookletSide(delta) {
    openBookletSide(getAdjacentBookletSide(bookletPlan, currentBookletSide?.id, delta));
  }

  function toggleBookletSheetSide() {
    if (!currentBookletSide) return;
    const nextSide = currentBookletSide.side === BOOKLET_SIDE_FRONT ? BOOKLET_SIDE_BACK : BOOKLET_SIDE_FRONT;
    openBookletSide(getBookletSide(bookletPlan, {
      blockIndex: currentBookletSide.blockIndex,
      sheetIndex: currentBookletSide.sheetIndex,
      side: nextSide,
    }));
  }



  function project() {
    const compactedPhotos = compactProjectPhotos(library, pages);
    return {
      version: 'live-23-photo-library-references',
      canvas,
      settings,
      library: compactedPhotos.library,
      pages: compactedPhotos.pages,
      currentPageId: album.currentPageId,
      viewMode,
      bookletSheetsPerBlock,
      bookletPrintSettings: normalizedBookletPrintSettings,
      extraLayers: sanitizeExtraLayers(extraLayers),
      albumEditorMode: albumMode,
      savedAt: new Date().toISOString(),
    };
  }

  function saveLocalProject({ silent = false, data = null } = {}) {
    const snapshot = data ?? project();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      if (!silent) show('Альбом сохранён');
      return { ok: true, data: snapshot };
    } catch (error) {
      console.error(error);
      if (!silent) show('Не удалось сохранить: проект слишком большой. Скачай JSON или очисти лишние фото.');
      return { ok: false, error };
    }
  }

  async function save() {
    const data = project();
    const local = saveLocalProject({ silent: true, data });
    const storeSnapshot = window.__collageProjectStorage?.storeSnapshot;
    const storagePromise = typeof storeSnapshot === 'function'
      ? Promise.resolve(storeSnapshot(data, { source: 'manual-save' }))
          .then(() => ({ ok: true }))
          .catch((error) => {
            console.warn('IndexedDB project save failed', error);
            return { ok: false, error };
          })
      : Promise.resolve({ ok: false, skipped: true });

    let cloud = null;
    let cloudError = null;
    try {
      cloud = await saveCloudProject(data);
    } catch (error) {
      cloudError = error;
      console.warn('Cloud project save failed', error);
    }

    const indexedDb = await storagePromise;
    const outcome = describeSaveResult({ local, indexedDb, cloud, cloudError });
    show(outcome.message);
    return { ok: outcome.ok, local, indexedDb, cloud, cloudError, data };
  }

  useEffect(() => {
    window.__collageApp = {
      getProject: () => project(),
      saveLocal: () => saveLocalProject({ silent: true }),
      openProject: (data) => {
        const prepared = applyProjectData(data, 'Проект открыт из аккаунта');
        const snapshot = createPreparedProjectSnapshot(prepared);
        saveLocalProject({ silent: true, data: snapshot });
        Promise.resolve(
          window.__collageProjectStorage?.storeSnapshot?.(snapshot, { source: 'cloud-open' }),
        ).catch((error) => console.warn('IndexedDB cloud project save failed', error));
        return { ok: true, currentPageId: prepared.currentPageId };
      },
    };

    return () => {
      if (window.__collageApp?.getProject) delete window.__collageApp;
    };
  });

  function applyProjectData(data, message) {
    const prepared = prepareEditorProject(data, {
      defaultCanvas: DEFAULT_CANVAS,
      defaultSettings: DEFAULT_SETTINGS,
      normalizePages: normalizeProjectPages,
      normalizeBookletSheets: clampBookletSheetsPerBlock,
      normalizeBookletPrintSettings,
      normalizeExtraLayers: sanitizeExtraLayers,
    });

    setCanvas(prepared.canvas);
    setSettings(prepared.settings);
    setLibrary(prepared.library);
    setAlbum({ pages: prepared.pages, currentPageId: prepared.currentPageId });
    setViewMode(prepared.viewMode);
    setBookletSheetsPerBlock(prepared.bookletSheetsPerBlock);
    setBookletPrintSettings(prepared.bookletPrintSettings);
    setExtraLayers(prepared.extraLayers);
    setAlbumMode(prepared.albumEditorMode);
    setBookletSideId(null);
    setPrintBookletSideId(null);
    setSelectedFrameId(null);
    setSelectedPhotoId(null);
    setMoveFrameWithPhotoId(null);
    setSelectedTextId(null);
    setSelectedDrawingId(null);
    setDragPageIndex(null);
    setDragOverPageIndex(null);
    show(message);
    return prepared;
  }

  function loadSaved() {
    const raw = localStorage.getItem(STORAGE_KEY) ?? LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) return show('Сохранённого проекта пока нет');
    try {
      const data = JSON.parse(raw);
      applyProjectData(data, 'Альбом загружен');
    } catch (error) {
      console.warn('Local project load failed', error);
      show('Не получилось открыть сохранение');
    }
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fileError = projectJsonFileError(file);
    if (fileError) return show(fileError);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        applyProjectData(data, 'JSON открыт');
      } catch (error) {
        console.warn('Project JSON import failed', error);
        show('Файл не похож на проект');
      }
    };
    reader.onerror = () => show('Не удалось прочитать JSON');
    reader.readAsText(file);
  }

  async function waitForFonts() {
    try {
      await document.fonts?.ready;
    } catch {
      // Browser font loading API is optional. If it fails, export with fallbacks.
    }
  }

  function exportPng(stageRefToExport, filename, message) {
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      await waitForFonts();
      const uri = stageRefToExport.current?.toDataURL({ pixelRatio: EXPORT_RATIO, mimeType: 'image/png' });
      if (!uri) return show('Не получилось собрать PNG');
      downloadDataUrl(filename, uri);
      show(message);
    }));
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(async () => {
      await waitForFonts();
      resolve();
    })));
  }

  function bookletSideFilename(sideData) {
    if (!sideData) return 'booklet-side.png';
    return `booklet-block-${pad(sideData.blockNumber)}-sheet-${pad(sideData.sheetNumber)}-${sideData.side}.png`;
  }

  function ensureBookletReadyForExport(exportLabel) {
    if (!bookletPlan.sides.length) {
      show(`Нет сторон брошюры для ${exportLabel}`);
      return false;
    }
    if (bookletPlan.blankPageCount > 0) {
      const proceed = window.confirm(
        `До полного блока не хватает ${bookletPlan.blankPageCount} пуст. стр.\n\n` +
        `Можно сначала нажать «Добавить пустые».\n` +
        `Если продолжить сейчас, экспорт всё равно будет собран, но часть сторон будет с виртуально пустыми страницами.\n\n` +
        `Продолжить ${exportLabel}?`
      );
      if (!proceed) return false;
    }
    return true;
  }

  async function exportBookletSide(sideData = currentBookletSide) {
    if (!sideData) return show('Нет стороны брошюры для экспорта');
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    setPrintBookletSideId(sideData.id);
    await nextPaint();
    const uri = printBookletRef.current?.toDataURL({ pixelRatio: EXPORT_RATIO, mimeType: 'image/png' });
    if (!uri) return show('Не получилось собрать PNG брошюры');
    downloadDataUrl(bookletSideFilename(sideData), uri);
    show(`Скачана сторона: ${sideData.title}`);
  }

  async function exportBookletAll() {
    if (!ensureBookletReadyForExport('PNG всех сторон')) return;

    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    show(`Готовлю PNG брошюры: ${bookletPlan.sides.length} сторон`);

    for (const sideData of bookletPlan.sides) {
      setPrintBookletSideId(sideData.id);
      await nextPaint();
      const uri = printBookletRef.current?.toDataURL({ pixelRatio: EXPORT_RATIO, mimeType: 'image/png' });
      if (!uri) {
        show(`Не получилось собрать: ${sideData.title}`);
        return;
      }
      downloadDataUrl(bookletSideFilename(sideData), uri);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }

    setPrintBookletSideId(currentBookletSide?.id ?? null);
    show(`Скачаны PNG брошюры: ${bookletPlan.sides.length} сторон`);
  }


  async function exportBookletZip() {
    if (!ensureBookletReadyForExport('ZIP-пакета печати')) return;

    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    show(`Готовлю ZIP брошюры: ${bookletPlan.sides.length} сторон`);

    const files = [];
    const imageEntries = [];

    for (const sideData of bookletPlan.sides) {
      setPrintBookletSideId(sideData.id);
      await nextPaint();
      const uri = printBookletRef.current?.toDataURL({ pixelRatio: EXPORT_RATIO, mimeType: 'image/png' });
      if (!uri) {
        show(`Не получилось собрать: ${sideData.title}`);
        return;
      }

      const name = `block-${pad(sideData.blockNumber)}/${bookletSideFilename(sideData)}`;
      imageEntries.push({ name, sideData });
      files.push({
        name,
        bytes: dataUrlToBytes(uri),
      });
    }

    const packageData = {
      plan: bookletPlan,
      canvas,
      sheetsPerBlock: bookletSheetsPerBlock,
      printSettings: normalizedBookletPrintSettings,
      imageEntries,
    };

    files.unshift(
      { name: 'README_PRINT_ORDER.txt', bytes: textToBytes(buildBookletReadme(packageData)) },
      { name: 'print-order.csv', bytes: textToBytes(buildBookletCsv(imageEntries)) },
      { name: 'booklet-manifest.json', bytes: textToBytes(buildBookletManifestJson(packageData)) },
      { name: 'print-preview.html', bytes: textToBytes(buildBookletPreviewHtml(packageData)) },
    );

    setPrintBookletSideId(currentBookletSide?.id ?? null);
    const zip = createZipBlob(files);
    downloadBlob(`booklet-print-package-${pages.length}-pages-${bookletSheetsPerBlock}-sheets.zip`, zip);
    show(`Скачан ZIP: ${imageEntries.length} PNG + схема печати`);
  }

  const renderEntries = entries.map((entry, entryIndex) => (
    <React.Fragment key={`${entry.page?.id ?? 'blank'}-${entry.pageIndex}-${entryIndex}`}>
      <PageLayer
        page={entry.page}
        pageIndex={entry.pageIndex}
        x={entry.x}
        y={entry.y ?? 0}
        canvas={canvas}
        settings={settings}
        activePageId={album.currentPageId}
        collagePreviewOnly={collagePreviewOnly || isBooklet}
        selectedFrameId={selectedFrameId}
        moveFrameWithPhotoId={moveFrameWithPhotoId}
        onFrameSelect={selectFrame}
        onPhotoMove={updatePhoto}
        onFrameChange={changeFrame}
        onFrameDragFinish={() => setMoveFrameWithPhotoId(null)}
        onColumnResize={resizeGridColumn}
        onRowResize={resizeGridRow}
        onActivatePage={(pageId) => setAlbum((current) => ({ ...current, currentPageId: pageId }))}
      />
      <ExtraPageLayers
        extraLayers={extraLayers}
        pageIndex={entry.pageIndex}
        x={entry.x}
        y={entry.y ?? 0}
        mode={isBooklet ? 'collage' : albumMode}
        selectedTextId={selectedTextId}
        selectedDrawingId={selectedDrawingId}
        onSelectText={(id) => { setSelectedTextId(id); setSelectedDrawingId(null); setSelectedFrameId(null); }}
        onSelectDrawing={(id) => { setSelectedDrawingId(id); setSelectedTextId(null); setSelectedFrameId(null); }}
        onTextDragEnd={updateText}
        onDrawingDragEnd={updateDrawing}
      />
    </React.Fragment>
  ));

  const bookletLabels = isBooklet && currentBookletSide ? currentBookletSide.slots.map((slot, index) => {
    const position = getBookletPagePosition(index, canvas, normalizedBookletPrintSettings);
    return (
      <Text
        key={`booklet-label-${index}-${slot.label}`}
        x={position.x + 28}
        y={position.y + 24}
        text={slot.isBlank ? 'пустая страница' : `стр. ${slot.pageNumber}`}
        fontSize={34}
        fontStyle="bold"
        fill={slot.isBlank ? '#9aa7a0' : '#2f7d52'}
        listening={false}
      />
    );
  }) : null;

  const commonPageLayerProps = {
    canvas,
    settings,
    activePageId: null,
    selectedFrameId: null,
    moveFrameWithPhotoId: null,
    printMode: true,
    onFrameSelect: () => {},
    onPhotoMove: () => {},
    onFrameChange: () => {},
    onFrameDragFinish: () => {},
    onColumnResize: () => {},
    onRowResize: () => {},
    onActivatePage: () => {},
  };


  const currentLayerPageNumber = activePageNumber();
  const currentLayerPage = extraLayers.pages?.[String(currentLayerPageNumber)] || { texts: [], drawings: [] };
  const currentTexts = Array.isArray(currentLayerPage.texts) ? currentLayerPage.texts : [];
  const currentDrawings = Array.isArray(currentLayerPage.drawings) ? currentLayerPage.drawings : [];
  const selectedText = Object.values(extraLayers.pages || {}).flatMap((page) => page?.texts || []).find((item) => item.id === selectedTextId) || null;
  const selectedDrawing = Object.values(extraLayers.pages || {}).flatMap((page) => page?.drawings || []).find((item) => item.id === selectedDrawingId) || null;
  const selectedTemplate = templateRecords.find((item) => item.id === selectedTemplateId) || templateRecords[0] || null;

  function saveTemplate(scope) {
    const sourceIndexes = scope === 'page'
      ? [currentPageIndex]
      : scope === 'spread'
        ? [spreadStart, spreadStart + 1].filter((index) => index >= 0 && index < pages.length)
        : pages.map((_, index) => index);
    if (!sourceIndexes.length) return show('Нет страниц для шаблона');
    const defaultTitle = scope === 'album'
      ? `Альбом ${sourceIndexes.length} стр.`
      : scope === 'spread'
        ? `Разворот ${sourceIndexes[0] + 1}-${sourceIndexes[sourceIndexes.length - 1] + 1}`
        : `Страница ${sourceIndexes[0] + 1}`;
    const entered = window.prompt('Название шаблона', defaultTitle);
    if (entered === null) return;
    const title = entered.trim() || defaultTitle;
    const layerPages = {};
    sourceIndexes.forEach((sourceIndex, targetIndex) => {
      const sourcePage = extraLayers.pages?.[String(sourceIndex + 1)];
      const cleaned = {
        texts: Array.isArray(sourcePage?.texts) ? cloneDeep(sourcePage.texts) : [],
        drawings: Array.isArray(sourcePage?.drawings) ? cloneDeep(sourcePage.drawings) : [],
        templates: [],
      };
      if (cleaned.texts.length || cleaned.drawings.length) layerPages[String(targetIndex + 1)] = cleaned;
    });
    const record = sanitizeTemplateRecord({
      version: 2,
      id: makeId(),
      title,
      scope,
      pageCount: sourceIndexes.length,
      canvas: cloneDeep(canvas),
      settings: cloneDeep(settings),
      pages: sourceIndexes.map((sourceIndex, index) => {
        const page = cloneDeep(pages[sourceIndex]);
        return {
          ...page,
          id: makeId(),
          title: `Страница ${index + 1}`,
          frames: Array.isArray(page?.frames) ? page.frames.map((frame) => ({ ...frame, photo: null })) : [],
        };
      }),
      extraLayers: { version: 1, pages: layerPages },
      createdAt: new Date().toISOString(),
    });
    if (!record) return show('Не удалось подготовить шаблон');
    setTemplateRecords((current) => [record, ...current].slice(0, MAX_TEMPLATE_RECORDS));
    setSelectedTemplateId(record.id);
    show(`Шаблон сохранён: ${title}`);
  }

  function remapTemplateLayers(record, targetStartIndex, count, baseLayers = { version: 1, pages: {} }) {
    const next = cloneDeep(baseLayers) || { version: 1, pages: {} };
    if (!next.pages || typeof next.pages !== 'object') next.pages = {};
    for (let i = 0; i < count; i += 1) delete next.pages[String(targetStartIndex + i + 1)];
    for (let i = 0; i < count; i += 1) {
      const sourcePage = record.extraLayers?.pages?.[String(i + 1)];
      const cleaned = cloneExtraLayerPage({
        texts: Array.isArray(sourcePage?.texts) ? sourcePage.texts : [],
        drawings: Array.isArray(sourcePage?.drawings) ? sourcePage.drawings : [],
        templates: [],
      }, makeId);
      if (cleaned.texts.length || cleaned.drawings.length) next.pages[String(targetStartIndex + i + 1)] = cleaned;
    }
    return normalizeExtraLayers(next);
  }

  function applyTemplate(record, mode) {
    if (!record) return;
    const label = mode === 'album' ? 'весь альбом' : mode === 'spread' ? 'разворот' : 'страницу';
    if (!window.confirm(`Применить шаблон «${record.title}» на ${label}? Фото в применяемых окнах будут пустыми.`)) return;
    const recordPages = Array.isArray(record.pages) ? record.pages : [];
    if (!recordPages.length) return show('В шаблоне нет страниц');
    const nextCanvas = record.canvas || canvas;
    const nextSettings = { ...settings, ...(record.settings || {}) };
    if (mode === 'album') {
      const nextPages = recordPages.map((page, index) => createPageFromTemplate(page, index));
      setCanvas(nextCanvas);
      setSettings(nextSettings);
      setLibrary([]);
      setAlbum({ pages: nextPages, currentPageId: nextPages[0]?.id });
      setExtraLayers(remapTemplateLayers(record, 0, nextPages.length, { version: 1, pages: {} }));
      setViewMode(nextPages.length > 1 ? 'spread' : 'single');
      setMode('collage');
      show('Шаблон применён как альбом');
      return;
    }
    const count = mode === 'spread' ? Math.min(2, recordPages.length) : 1;
    const start = mode === 'spread' ? spreadStart : currentPageIndex;
    const replacementPages = Array.from({ length: count }, (_, i) => createPageFromTemplate(recordPages[i] || recordPages[0], start + i));
    setAlbum((current) => {
      const nextPages = [...current.pages];
      replacementPages.forEach((page, i) => {
        if (start + i < nextPages.length) nextPages[start + i] = { ...page, title: `Страница ${start + i + 1}` };
        else nextPages.push({ ...page, title: `Страница ${start + i + 1}` });
      });
      return { ...current, pages: nextPages, currentPageId: nextPages[start]?.id || nextPages[0]?.id };
    });
    setExtraLayers((current) => remapTemplateLayers(record, start, count, current));
    setMode('collage');
    show(`Шаблон применён: ${label}`);
  }

  function deleteTemplate(record) {
    if (!record) return;
    if (!window.confirm(`Удалить шаблон «${record.title}»?`)) return;
    setTemplateRecords((current) => current.filter((item) => item.id !== record.id));
    setSelectedTemplateId(null);
  }

  function exportTemplate(record) {
    if (!record) return;
    const slug = String(record.title || 'template').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '') || 'template';
    downloadText(`${slug}.json`, JSON.stringify(record, null, 2));
  }

  function importTemplateJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fileError = templateJsonFileError(file);
    if (fileError) return show(fileError);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const cleaned = sanitizeTemplateRecords(data);
        if (!cleaned.length) throw new Error('empty templates');
        setTemplateRecords((current) => sanitizeTemplateRecords([...cleaned, ...current]));
        setSelectedTemplateId(cleaned[0].id);
        show(`Импортировано шаблонов: ${cleaned.length}`);
      } catch (error) {
        console.warn('Template import failed', error);
        show('Файл не похож на шаблон');
      }
    };
    reader.onerror = () => show('Не удалось прочитать шаблон');
    reader.readAsText(file);
  }

  function renderModeLeftPanel() {
    if (albumMode === 'text') {
      return (
        <>
          <div className="panel-title compact"><div><h2>Текст</h2><p>Текстовые блоки текущей страницы.</p></div><span>{currentTexts.length}</span></div>
          <button className="button full accent" onClick={() => addText('body')}>+ Добавить текст</button>
          {currentTexts.length === 0 ? <div className="empty-state small-empty"><p>Текста на этой странице пока нет.</p></div> : (
            <div className="layer-list">
              {currentTexts.map((item, index) => (
                <button key={item.id} className={`layer-card ${item.id === selectedTextId ? 'active' : ''}`} onClick={() => { setSelectedTextId(item.id); setSelectedDrawingId(null); }}>
                  <strong>{item.text?.trim() || `Текст ${index + 1}`}</strong>
                  <small>{fontById(item.fontId).label} · {Math.round(Number(item.fontSize) || 56)} px</small>
                </button>
              ))}
            </div>
          )}
        </>
      );
    }
    if (albumMode === 'drawings') {
      return (
        <>
          <div className="panel-title compact"><div><h2>Рисунки</h2><p>Линии и простой декор текущей страницы.</p></div><span>{currentDrawings.length}</span></div>
          <button className="button full accent" onClick={addLine}>+ Линия</button>
          {currentDrawings.length === 0 ? <div className="empty-state small-empty"><p>Рисунков на этой странице пока нет.</p></div> : (
            <div className="layer-list">
              {currentDrawings.map((item, index) => (
                <button key={item.id} className={`layer-card line-layer-card ${item.id === selectedDrawingId ? 'active' : ''}`} onClick={() => { setSelectedDrawingId(item.id); setSelectedTextId(null); }}>
                  <i style={{ background: item.color || '#6f6862' }} />
                  <strong>Линия {index + 1}</strong>
                  <small>{Math.round(Number(item.strokeWidth) || 4)} px · {Math.round(Number(item.length) || 300)} px</small>
                </button>
              ))}
            </div>
          )}
        </>
      );
    }
    if (albumMode === 'templates') {
      return (
        <>
          <div className="panel-title compact"><div><h2>Мои шаблоны</h2><p>Сохраняются без фото: окна, текст, линии и оформление.</p></div><span>{templateRecords.length}</span></div>
          <div className="template-save-grid">
            <button className="button full accent" onClick={() => saveTemplate('album')}>Сохранить весь альбом</button>
            <button className="button full" onClick={() => saveTemplate('page')}>Сохранить страницу</button>
            <button className="button full" onClick={() => saveTemplate('spread')}>Сохранить разворот</button>
            <button className="button full" onClick={() => templateJsonRef.current?.click()}>Загрузить JSON</button>
            <input ref={templateJsonRef} className="hidden-input" type="file" accept="application/json,.json" onChange={importTemplateJson} />
          </div>
          {templateRecords.length === 0 ? <div className="empty-state small-empty"><p>Шаблонов пока нет. Собери пустой альбом и нажми “Сохранить”.</p></div> : (
            <div className="layer-list template-record-list">
              {templateRecords.map((record) => (
                <button key={record.id} className={`layer-card ${record.id === selectedTemplate?.id ? 'active' : ''}`} onClick={() => setSelectedTemplateId(record.id)}>
                  <strong>{record.title || 'Без названия'}</strong>
                  <small>{record.pageCount || record.pages?.length || 0} стр. · {record.scope === 'album' ? 'альбом' : record.scope === 'spread' ? 'разворот' : 'страница'}</small>
                </button>
              ))}
            </div>
          )}
        </>
      );
    }
    return null;
  }

  function renderModeInspector() {
    if (albumMode === 'text') {
      return (
        <>
          <div className="panel-title compact"><div><h2>Настройки текста</h2><p>{selectedText ? 'Редактируй выбранный текст.' : 'Выбери текст на странице или слева.'}</p></div><span>{selectedText ? 'выбран' : 'нет'}</span></div>
          {!selectedText ? <div className="empty-state small-empty"><p>Фото-окна в этом режиме не трогаются.</p></div> : (
            <>
              <div className="inspector-block"><h3>Содержание</h3><label className="field"><span>Текст</span><textarea value={selectedText.text || ''} onChange={(event) => updateText(selectedText.id, { text: event.target.value })} /></label></div>
              <div className="inspector-block"><h3>Шрифт</h3>
                <label className="field"><span>Гарнитура</span><select value={selectedText.fontId || DEFAULT_FONT_ID} onChange={(event) => updateText(selectedText.id, { fontId: event.target.value, fontFamily: fontById(event.target.value).family })}>{TEXT_FONTS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label>
                <label className="field"><span>Размер</span><SoftNumberInput min={8} max={260} value={Math.round(Number(selectedText.fontSize) || 56)} onValue={(value) => updateText(selectedText.id, { fontSize: value })} /></label>
                <label className="field"><span>Цвет</span><input type="color" value={selectedText.color || '#1f2723'} onChange={(event) => updateText(selectedText.id, { color: event.target.value })} /></label>
              </div>
              <div className="inspector-block"><h3>Положение</h3><div className="geometry-grid">
                <label className="field"><span>X</span><SoftNumberInput value={Math.round(Number(selectedText.x) || 0)} onValue={(value) => updateText(selectedText.id, { x: value })} /></label>
                <label className="field"><span>Y</span><SoftNumberInput value={Math.round(Number(selectedText.y) || 0)} onValue={(value) => updateText(selectedText.id, { y: value })} /></label>
                <label className="field"><span>Ширина</span><SoftNumberInput min={40} max={4000} value={Math.round(Number(selectedText.width) || 500)} onValue={(value) => updateText(selectedText.id, { width: value })} /></label>
              </div></div>
              <button className="button full danger-button" onClick={() => deleteText(selectedText.id)}>Удалить текст</button>
            </>
          )}
        </>
      );
    }
    if (albumMode === 'drawings') {
      return (
        <>
          <div className="panel-title compact"><div><h2>Настройки линии</h2><p>{selectedDrawing ? 'Длина, угол, толщина и цвет.' : 'Выбери линию или добавь новую.'}</p></div><span>{selectedDrawing ? 'выбрана' : 'нет'}</span></div>
          {!selectedDrawing ? <div className="empty-state small-empty"><p>Фото-окна в этом режиме только видны.</p></div> : (
            <>
              <div className="inspector-block"><h3>Линия</h3>
                <label className="field"><span>Цвет</span><input type="color" value={selectedDrawing.color || '#6f6862'} onChange={(event) => updateDrawing(selectedDrawing.id, { color: event.target.value })} /></label>
                <label className="field"><span>Толщина</span><SoftNumberInput min={1} max={120} value={Math.round(Number(selectedDrawing.strokeWidth) || 4)} onValue={(value) => updateDrawing(selectedDrawing.id, { strokeWidth: value })} /></label>
                <label className="field"><span>Прозрачность</span><SoftNumberInput min={0.05} max={1} step={0.05} value={Number(selectedDrawing.opacity ?? 1)} onValue={(value) => updateDrawing(selectedDrawing.id, { opacity: value })} /></label>
              </div>
              <div className="inspector-block"><h3>Положение</h3><div className="geometry-grid">
                <label className="field"><span>X</span><SoftNumberInput value={Math.round(Number(selectedDrawing.x) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { x: value })} /></label>
                <label className="field"><span>Y</span><SoftNumberInput value={Math.round(Number(selectedDrawing.y) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { y: value })} /></label>
                <label className="field"><span>Длина</span><SoftNumberInput min={1} max={5000} value={Math.round(Number(selectedDrawing.length) || 300)} onValue={(value) => updateDrawing(selectedDrawing.id, { length: value })} /></label>
                <label className="field"><span>Угол</span><SoftNumberInput min={-180} max={180} value={Math.round(Number(selectedDrawing.angle) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { angle: value })} /></label>
              </div></div>
              <button className="button full danger-button" onClick={() => deleteDrawing(selectedDrawing.id)}>Удалить линию</button>
            </>
          )}
        </>
      );
    }
    if (albumMode === 'templates') {
      return (
        <>
          <div className="panel-title compact"><div><h2>Использовать шаблон</h2><p>После применения это обычный коллаж: фото-окна пустые.</p></div></div>
          {!selectedTemplate ? <div className="empty-state small-empty"><p>Сначала сохрани или загрузи шаблон.</p></div> : (
            <>
              <div className="inspector-block"><h3>{selectedTemplate.title || 'Без названия'}</h3><p className="hint">{selectedTemplate.pageCount || selectedTemplate.pages?.length || 0} страниц</p></div>
              <button className="button full accent" onClick={() => applyTemplate(selectedTemplate, 'album')}>Использовать весь шаблон</button>
              <button className="button full" onClick={() => applyTemplate(selectedTemplate, 'page')}>На текущую страницу</button>
              <button className="button full" onClick={() => applyTemplate(selectedTemplate, 'spread')}>На текущий разворот</button>
              <button className="button full" onClick={() => exportTemplate(selectedTemplate)}>Скачать JSON</button>
              <button className="button full danger-button" onClick={() => deleteTemplate(selectedTemplate)}>Удалить шаблон</button>
            </>
          )}
        </>
      );
    }
    return null;
  }

  return (
    <main className="app-shell">
      <header className="topbar app-topbar">
        <div className="brand-block">
          <p className="eyebrow">Редактор альбома</p>
          <h1>Collage Creator</h1>
        </div>

        <section className="document-panel top-control-card">
          <div className="section-title">Документ</div>
          <div className="document-grid">
            <label className="field wide-field"><span>Размер страницы</span><select value={settings.presetId} onChange={(event) => { const preset = PRESETS.find((item) => item.id === event.target.value) ?? PRESETS[0]; updateCanvas(preset.width, preset.height, preset.id); }}>{PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
            <label className="field small-field"><span>Ширина px</span><SoftNumberInput min={300} max={5000} value={canvas.width} onValue={(value) => updateCanvas(value, canvas.height, 'custom')} /></label>
            <label className="field small-field"><span>Высота px</span><SoftNumberInput min={300} max={5000} value={canvas.height} onValue={(value) => updateCanvas(canvas.width, value, 'custom')} /></label>
            <label className="field small-field"><span>Фото-окон</span><select value={currentPage?.isBlankPage ? 0 : currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage) || albumMode !== 'collage'} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{currentPage?.isBlankPage ? <option value={0}>пустая</option> : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count === 0 ? 'нет' : count}</option>)}</select></label>
            <label className="field small-field"><span>Зазор</span><SoftNumberInput min={0} max={200} value={settings.gap} onValue={(value) => updateSetting('gap', value)} /></label>
            <label className="field small-field"><span>Поля</span><SoftNumberInput min={0} max={300} value={settings.padding} onValue={(value) => updateSetting('padding', value)} /></label>
          </div>
        </section>

        <section className="topbar-actions file-panel">
          <div className="section-title">Файл / экспорт</div>
          <div className="file-actions">
            <button className="button" onClick={save}>Сохранить</button>
            <button className="button" onClick={loadSaved}>Открыть</button>
            <button className="button" onClick={() => downloadText('collage-album-project.json', JSON.stringify(project(), null, 2))}>Скачать JSON</button>
            <button className="button" onClick={() => jsonRef.current?.click()}>Загрузить JSON</button>
            <input ref={jsonRef} className="hidden-input" type="file" accept="application/json" onChange={importJson} />
            <button className="button accent" onClick={() => exportPng(printPageRef, `collage-page-${pad(currentPageIndex + 1)}.png`, 'Скачана страница')}>PNG страницы</button>
            <button className="button accent" onClick={() => exportPng(printSpreadRef, `collage-spread-${pad(spreadStart + 1)}-${pad(Math.min(spreadStart + 2, pages.length))}.png`, 'Скачан разворот')}>PNG разворота</button>
          </div>
        </section>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <section className={`album-bar clean-control-panel top-control-card ${isBooklet ? 'booklet-mode-bar' : ''}`}>
        <div className="control-row primary-control-row">
          <div className="album-head">
            <strong>{isBooklet ? 'Брошюра' : 'Страницы альбома'}</strong>
            <span>{isBooklet ? (currentBookletSide?.title ?? 'Брошюра') : isSpread ? `Разворот ${spreadStart + 1}–${Math.min(spreadStart + 2, pages.length)}` : `Страница ${currentPageIndex + 1} из ${pages.length}`}</span>
          </div>

          <div className="album-actions control-group">
            <span className="control-label">Страницы</span>
            <button className="small-button" onClick={addPage}>+ Страница</button>
            <button className="small-button" onClick={addBlankPage}>+ Пустая</button>
            <button className="small-button" onClick={duplicatePage}>Копия</button>
            <button className="small-button danger" onClick={deletePage}>Удалить</button>
          </div>

          <div className="view-switch control-group">
            <span className="control-label">Вид</span>
            <button className={`small-button ${viewMode === 'single' ? 'active-mode' : ''}`} onClick={() => setViewMode('single')}>Страница</button>
            <button className={`small-button ${viewMode === 'spread' ? 'active-mode' : ''}`} onClick={() => setViewMode('spread')}>Разворот</button>
            <button className={`small-button ${isBooklet ? 'active-mode' : ''}`} onClick={enterBookletMode}>Брошюра</button>
          </div>

          {!isBooklet && (
            <div className="spread-actions control-group">
              <span className="control-label">Навигация</span>
              <button className="small-button" onClick={() => goSpread('prev')} disabled={spreadStart === 0}>← Разворот</button>
              <button className="small-button" onClick={() => goSpread('next')} disabled={spreadStart + 2 >= pages.length}>Разворот →</button>
              <button className={`small-button ${settings.showGuides ? 'active-mode' : ''}`} onClick={() => updateSetting('showGuides', !settings.showGuides)}>Направляющие</button>
              <button className={`small-button ${locked ? 'active-mode' : ''}`} onClick={() => updateSetting('frameMode', locked ? 'free' : 'locked')}>Сетка окон</button>
            </div>
          )}
        </div>

        {isBooklet && (
          <div className="booklet-control-grid">
            <div className="booklet-control-card booklet-settings-card">
              <strong>Настройки брошюры</strong>
              <div className="booklet-inline-controls">
                <label className="booklet-sheets-control"><span>Листов в блоке</span><select value={bookletSheetsPerBlock} onChange={(event) => updateBookletSheetsPerBlock(event.target.value)}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} лист. / {count * 4} стр.</option>)}</select></label>
                <label className="booklet-print-toggle"><input type="checkbox" checked={normalizedBookletPrintSettings.showFoldLine} onChange={(event) => updateBookletPrintSetting('showFoldLine', event.target.checked)} /><span>Сгиб</span></label>
                <label className="booklet-print-toggle"><input type="checkbox" checked={normalizedBookletPrintSettings.showCropMarks} onChange={(event) => updateBookletPrintSetting('showCropMarks', event.target.checked)} /><span>Метки реза</span></label>
                <label className="booklet-sheets-control booklet-number-control"><span>Зазор px</span><SoftNumberInput min={0} max={MAX_BOOKLET_PRINT_GAP} value={normalizedBookletPrintSettings.gap} onValue={(value) => updateBookletPrintSetting('gap', value)} /></label>
                <label className="booklet-sheets-control booklet-number-control"><span>Поля px</span><SoftNumberInput min={0} max={MAX_BOOKLET_PRINT_MARGIN} value={normalizedBookletPrintSettings.margin} onValue={(value) => updateBookletPrintSetting('margin', value)} /></label>
              </div>
            </div>

            <div className="booklet-control-card booklet-navigation-card">
              <strong>Стороны листа</strong>
              <div className="booklet-inline-controls">
                <button className="small-button" onClick={() => goBookletSide(-1)} disabled={!currentBookletSide || bookletPlan.sides[0]?.id === currentBookletSide.id}>← сторона</button>
                <button className="small-button" onClick={toggleBookletSheetSide} disabled={!currentBookletSide}>{currentBookletSide?.side === BOOKLET_SIDE_FRONT ? 'Оборот листа' : 'Лицевая листа'}</button>
                <button className="small-button" onClick={() => goBookletSide(1)} disabled={!currentBookletSide || bookletPlan.sides[bookletPlan.sides.length - 1]?.id === currentBookletSide.id}>сторона →</button>
                {trailingBlankPageCount > 0 && <button className="small-button" onClick={removeTrailingBlankPages}>Убрать пустые в конце</button>}
              </div>
            </div>

            <div className="booklet-control-card booklet-summary-card">
              <strong>Сводка</strong>
              <span>{bookletExportSummary.blocks} блок. · {bookletExportSummary.sheets} лист. · {bookletExportSummary.sides} сторон</span>
              <span>{bookletExportSummary.pages} стр. проекта · пустых: {bookletExportSummary.blanks}</span>
              <span>Сгиб: {normalizedBookletPrintSettings.showFoldLine ? 'да' : 'нет'} · Метки: {normalizedBookletPrintSettings.showCropMarks ? 'да' : 'нет'} · Зазор: {normalizedBookletPrintSettings.gap}px · Поля: {normalizedBookletPrintSettings.margin}px</span>
              {bookletPlan.blankPageCount > 0 && (
                <div className="booklet-warning">
                  <strong>Внимание:</strong> до полного блока не хватает {bookletPlan.blankPageCount} пуст. стр.
                  <button className="small-button" onClick={addBlankPagesToBookletBlock}>Добавить пустые</button>
                </div>
              )}
            </div>

            <div className="booklet-control-card booklet-export-card">
              <strong>Экспорт брошюры</strong>
              <div className="booklet-export-buttons">
                <button className="small-button accent soft-accent" onClick={() => exportBookletSide()} disabled={!currentBookletSide}>PNG текущей стороны</button>
                <button className="small-button accent soft-accent" onClick={exportBookletAll} disabled={!bookletPlan.sides.length}>PNG всех сторон</button>
                <button className="small-button accent primary-accent" onClick={exportBookletZip} disabled={!bookletPlan.sides.length}>Пакет печати ZIP</button>
              </div>
            </div>
          </div>
        )}

        <div className="page-strip">{pages.map((page, index) => {
          const pageNumber = index + 1;
          const isVisibleInBooklet = isBooklet && visibleBookletPageNumbers.has(pageNumber);
          return (
            <button key={page.id} type="button" className={`page-chip ${page.id === album.currentPageId ? 'active-page-chip' : ''} ${isVisibleInBooklet ? 'booklet-visible-page' : ''}`} onClick={() => selectPageByIndex(index)}>
              <b>{pageNumber}</b>
              <span>{page.isBlankPage ? 'пустая' : `${page.frames.filter((frame) => frame.photo).length}/${resolvePageFrameCount(page, settings)}`}</span>
              <small>{isBooklet ? (bookletPlan.pageMap[String(pageNumber)]?.pairPageNumber ? `с ${bookletPlan.pageMap[String(pageNumber)].pairPageNumber}` : 'пусто') : page.isBlankPage ? 'белая' : index % 2 === 0 ? 'левая' : 'правая'}</small>
            </button>
          );
        })}</div>
      </section>

      {!isBooklet && (
        <section className="album-tool-panel react-mode-panel">
          <div className="album-mode-tabs">
            {[
              ['collage', 'Коллаж'],
              ['text', 'Текст'],
              ['drawings', 'Рисунки'],
              ['templates', 'Шаблоны'],
            ].map(([mode, label]) => (
              <button key={mode} type="button" className={`album-mode-tab ${albumMode === mode ? 'active' : ''}`} onClick={() => setMode(mode)}>{label}</button>
            ))}
          </div>
          <div className="album-mode-note">
            {albumMode === 'collage' && 'Рамки и фото редактируются здесь. Текст и рисунки остаются на странице.'}
            {albumMode === 'text' && 'Текст редактируется отдельно. Фото-окна только видны и не двигаются.'}
            {albumMode === 'drawings' && 'Рисунки редактируются отдельно. Фото-окна только видны и не двигаются.'}
            {albumMode === 'templates' && 'Шаблоны сохраняют альбом/страницу/разворот без фотографий.'}
          </div>
          <div className="album-mode-actions">
            {albumMode === 'collage' && (
              <>
                <button className="album-mode-button primary" onClick={() => saveTemplate('page')}>Сохранить страницу как шаблон</button>
                <button className="album-mode-button" onClick={() => saveTemplate('spread')}>Сохранить разворот</button>
                <button className="album-mode-button" onClick={() => saveTemplate('album')}>Сохранить альбом</button>
              </>
            )}
            {albumMode === 'text' && (
              <>
                <button className="album-mode-button primary" onClick={() => addText('body')}>+ Текст</button>
                <button className="album-mode-button" onClick={() => addText('title')}>+ Заголовок</button>
                <button className="album-mode-button" onClick={() => addText('signature')}>+ Подпись</button>
                <button className="album-mode-button" onClick={() => saveTemplate('page')}>Сохранить страницу</button>
              </>
            )}
            {albumMode === 'drawings' && (
              <>
                <button className="album-mode-button primary" onClick={addLine}>+ Линия</button>
                <button className="album-mode-button" onClick={() => saveTemplate('page')}>Сохранить страницу</button>
              </>
            )}
            {albumMode === 'templates' && (
              <>
                <button className="album-mode-button primary" onClick={() => saveTemplate('album')}>Сохранить альбом</button>
                <button className="album-mode-button" onClick={() => templateJsonRef.current?.click()}>Загрузить шаблон JSON</button>
              </>
            )}
          </div>
        </section>
      )}

      <section className="workspace three-columns">
        <aside className="sidebar">
          <div className="panel-title"><div><h2>Фото</h2><p>На компьютере можно перетаскивать. На телефоне: нажми фото, потом нажми рамку.</p></div><span>{library.length}</span></div>
          <label className={`upload-box ${photoImporting ? 'disabled-upload-box' : ''}`}><strong>{photoImporting ? 'Загружаю фото…' : 'Загрузить фото'}</strong><small>{photoImporting ? 'Оригиналы читаются по очереди' : 'Можно сразу несколько'}</small><input type="file" accept="image/*" multiple disabled={photoImporting} onChange={uploadPhotos} /></label>
          <button className="button full" onClick={() => { setLibrary([]); setSelectedPhotoId(null); show('Список фото очищен'); }} disabled={library.length === 0 || photoImporting}>Очистить список фото</button>
          {selectedPhoto && <div className="mobile-pick-hint">Выбрано фото. Теперь нажми рамку на странице.</div>}
          {library.length === 0 ? <div className="empty-state"><p>Пока фото нет. Нажми “Загрузить фото”.</p></div> : <div className="photo-grid">{library.map((photo) => {
            const isUsed = usedPhotoIds.has(photo.id);
            return (
              <button
                key={photo.id}
                type="button"
                className={`photo-card ${photo.id === selectedPhotoId ? 'selected-photo-card' : ''} ${isUsed ? 'used-photo-card' : ''}`}
                draggable
                onClick={() => { setSelectedPhotoId(photo.id); show(isUsed ? 'Фото уже есть в альбоме. Можно вставить ещё раз.' : 'Фото выбрано'); }}
                onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('photo-id', photo.id); }}
              >
                <PhotoLibraryThumbnail photo={photo} />
                {isUsed && <small className="photo-used-badge">В альбоме</small>}
                <span>{photo.name}</span>
              </button>
            );
          })}</div>}
        </aside>

        {albumMode !== 'collage' && !isBooklet && (
          <aside className="album-mode-sidebar">
            {renderModeLeftPanel()}
          </aside>
        )}

        <aside className={`page-rail ${isBooklet ? 'booklet-page-rail' : ''}`}>
          <div className="panel-title compact page-rail-header-row">
            <div>
              <h2>Страницы</h2>
              <p>{isBooklet ? 'Клик по странице откроет сторону листа, где она печатается.' : 'Клик по странице открывает её в текущем виде.'}</p>
            </div>
            <span>{pages.length}</span>
            {!isBooklet && (
              <label className="frame-count-inline-control">
                <span>Фото-окон</span>
                <select value={currentPage?.isBlankPage ? 0 : currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage) || albumMode !== 'collage'} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>
                  {currentPage?.isBlankPage ? <option value={0}>пустая</option> : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count === 0 ? 'нет' : count}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="page-rail-list">
            {pages.map((page, index) => {
              const pageNumber = index + 1;
              const isBlankPage = Boolean(page.isBlankPage);
              const frameTotal = resolvePageFrameCount(page, settings);
              const filledFrames = isBlankPage ? 0 : page.frames.filter((frame) => frame.photo).length;
              const bookletInfo = bookletPlan.pageMap[String(pageNumber)];
              const isCurrent = page.id === album.currentPageId;
              const isSpreadPage = isSpread && (index === spreadStart || index === spreadStart + 1);
              const isVisibleInBooklet = isBooklet && visibleBookletPageNumbers.has(pageNumber);
              const isOnStage = isBooklet ? isVisibleInBooklet : isSpread ? isSpreadPage : isCurrent;
              const metaText = isBooklet
                ? (bookletInfo ? `${bookletInfo.sideLabel} · л.${bookletInfo.sheetNumber}` : 'не в блоке')
                : (isBlankPage ? 'пустая' : `${filledFrames}/${frameTotal} фото`);
              const pairText = isBooklet
                ? (bookletInfo?.pairPageNumber ? `рядом ${bookletInfo.pairPageNumber}` : 'рядом пусто')
                : (isBlankPage ? 'белая страница' : (index % 2 === 0 ? 'левая' : 'правая'));

              return (
                <button
                  key={page.id}
                  type="button"
                  className={`page-rail-card ${isBlankPage ? 'blank-page-rail-card' : ''} ${isCurrent ? 'current-page-rail-card' : ''} ${isOnStage ? 'stage-page-rail-card' : ''} ${isVisibleInBooklet ? 'booklet-visible-rail-card' : ''} ${dragPageIndex === index ? 'dragging-page-rail-card' : ''} ${dragOverPageIndex === index && dragPageIndex !== null && dragPageIndex !== index ? 'drag-over-page-rail-card' : ''}`}
                  draggable
                  onClick={() => selectPageByIndex(index)}
                  onDragStart={(event) => startPageDrag(event, index)}
                  onDragOver={(event) => dragOverPage(event, index)}
                  onDrop={(event) => dropPage(event, index)}
                  onDragEnd={finishPageDrag}
                  title="Перетащи карточку вверх или вниз, чтобы изменить порядок страниц"
                >
                  <div className="page-rail-card-top"><b>{pageNumber}</b></div>
                  <span>{metaText}</span>
                  <small>{pairText}</small>
                </button>
              );
            })}
          </div>

          {isBooklet && bookletPlan.blankPageCount > 0 && (
            <div className="page-rail-note">
              +{bookletPlan.blankPageCount} виртуал. пуст. при печати
              <button type="button" onClick={addBlankPagesToBookletBlock}>добавить реально</button>
            </div>
          )}
          {trailingBlankPageCount > 0 && (
            <div className="page-rail-note soft-note">
              В конце реальных пустых: {trailingBlankPageCount}
            </div>
          )}
        </aside>

        <section className={`canvas-area ${isSpread || isBooklet ? 'album-mode' : ''} ${isBooklet ? 'booklet-canvas-area' : ''}`} style={{ '--stage-display-width': `${stageDisplayWidth}px` }}>
          <div className="canvas-toolbar">
            <div>
              <strong>{isBooklet ? `${currentBookletSide?.title ?? 'Брошюра'} · ${stageRealWidth}×${stageRealHeight}px` : isSpread ? `Разворот · страницы ${spreadStart + 1}–${Math.min(spreadStart + 2, pages.length)} · ${canvas.width}×${canvas.height}px` : `Страница ${currentPageIndex + 1} · ${canvas.width}×${canvas.height}px`}</strong>
              <span>{isBooklet ? 'Просмотр физической стороны А4: слева и справа показаны страницы, которые будут напечатаны рядом.' : locked ? 'Сетка: двигай зелёные разделители. Зазор постоянный, окна не выходят за страницу.' : 'Свободный режим: окна можно двигать внутри страницы и менять размер за маркеры. Фото внутри можно двигать.'}</span>
              <em>{isBooklet ? 'Это режим просмотра и PNG-экспорта брошюры. Редактирование страниц делай в режиме Страница или Разворот.' : 'PNG страницы сохраняет одну страницу. PNG разворота склеивает две страницы в один файл без зазора.'}</em>
            </div>
            {!isBooklet && <button className="small-button" onClick={() => rebuildPage(album.currentPageId, canvas, settings)}>Перестроить рамки</button>}
            {!isBooklet && <button className="small-button" onClick={() => { updatePageFrames(album.currentPageId, (frames) => clearAllFramePhotos(frames)); setSelectedFrameId(null); setMoveFrameWithPhotoId(null); }}>Очистить фото</button>}
          </div>

          <div className={`stage-frame ${isSpread || isBooklet ? 'album-preview' : ''} ${isBooklet ? 'booklet-stage' : ''}`} style={{ width: stageDisplayWidth, height: stageDisplayHeight }} onDragOver={(event) => { if (!isBooklet) event.preventDefault(); }} onDrop={isBooklet ? undefined : dropPhoto}>
            <div className="stage-scale-shell" style={{ width: stageRealWidth, height: stageRealHeight, transform: `scale(${previewScale})` }}>
              <Stage ref={stageRef} width={stageRealWidth} height={stageRealHeight} onMouseDown={(event) => { if (event.target === event.target.getStage() || event.target.name() === 'background') { setSelectedFrameId(null); setMoveFrameWithPhotoId(null); setSelectedTextId(null); setSelectedDrawingId(null); } }}>
                <Layer>
                  {isBooklet && <BookletSheetBackground canvas={canvas} printSettings={normalizedBookletPrintSettings} />}
                  {renderEntries}
                  {bookletLabels}
                  {isSpread && !collagePreviewOnly && settings.showGuides && <Line points={[canvas.width + SPREAD_GAP / 2, 0, canvas.width + SPREAD_GAP / 2, canvas.height]} stroke={locked ? '#2f7d52' : '#c27b4f'} strokeWidth={3} dash={[24, 18]} opacity={0.55} listening={false} />}
                  {isBooklet && <BookletPrintGuides canvas={canvas} printSettings={normalizedBookletPrintSettings} preview />}
                </Layer>
              </Stage>
            </div>
          </div>
        </section>

        {albumMode !== 'collage' && !isBooklet && (
          <aside className="album-mode-inspector">
            {renderModeInspector()}
          </aside>
        )}

        <aside className="inspector">
          <div className="panel-title compact"><div><h2>Настройки окна</h2><p>{selectedFrame ? (locked ? 'В сетке двигай зелёные разделители между окнами.' : 'Двигай рамку внутри страницы или меняй размер за маркеры. Фото внутри двигай мышкой.') : 'Выбери рамку на холсте'}</p></div></div>
          <div className="inspector-block"><h3>Цвет и рамка</h3><label className="field color-field"><span>Цвет фона / рамки</span><input type="color" value={settings.borderColor} onChange={(event) => updateSetting('borderColor', event.target.value)} /></label><label className="field"><span>Обводка внутри окна</span><SoftNumberInput min={0} max={80} value={settings.borderWidth} onValue={(value) => updateSetting('borderWidth', value)} /></label></div>
          {selectedFrame ? (
            <>
              <div className="inspector-block">
                <h3>Положение рамки</h3>
                <div className="geometry-grid">
                  <label className="field"><span>X</span><SoftNumberInput min={0} max={Math.max(0, canvas.width - selectedFrame.width)} value={selectedFrame.x} onValue={(value) => changeFrame(album.currentPageId, selectedFrame.id, { x: value })} /></label>
                  <label className="field"><span>Y</span><SoftNumberInput min={0} max={Math.max(0, canvas.height - selectedFrame.height)} value={selectedFrame.y} onValue={(value) => changeFrame(album.currentPageId, selectedFrame.id, { y: value })} /></label>
                  <label className="field"><span>Ширина</span><SoftNumberInput min={MIN_FRAME} max={canvas.width} value={selectedFrame.width} onValue={(value) => changeFrame(album.currentPageId, selectedFrame.id, { width: value })} /></label>
                  <label className="field"><span>Высота</span><SoftNumberInput min={MIN_FRAME} max={canvas.height} value={selectedFrame.height} onValue={(value) => changeFrame(album.currentPageId, selectedFrame.id, { height: value })} /></label>
                </div>
                {!locked && <button className="button full" onClick={bringSelectedFrameToFront}>Поверх остальных</button>}
                {!locked && <button className={`button full ${moveFrameWithPhotoId === selectedFrame.id ? 'accent' : ''}`} onClick={enableMoveFrameWithPhoto} disabled={!selectedFrame.photo}>{moveFrameWithPhotoId === selectedFrame.id ? 'Перетащи рамку сейчас' : 'Двигать рамку с фото'}</button>}
                <button className="button full danger-button" onClick={deleteSelectedFrame} disabled={currentPageFrameCount <= 0}>Удалить окно</button>
                <p className="hint">Удаление перестроит эту страницу: соседние окна сдвинутся, фото сохранятся по порядку.</p>
                <p className="hint">Режим: {locked ? 'сетка через layout, без угадывания соседей по координатам' : selectedFrame.photo ? 'фото внутри окна двигается; для движения рамки вместе с фото нажми кнопку выше' : 'рамка двигается внутри страницы и меняет размер за маркеры'}.</p>
              </div>
              <div className="inspector-block">
                <h3>Фото внутри окна</h3>
                {selectedFrame.photo ? (
                  <>
                    <p className="photo-name">{selectedFrame.photo.name}</p>
                    <label className="range-row"><span>Масштаб</span><input type="range" min="1" max="3" step="0.01" value={selectedFrame.photo.zoom} onChange={(event) => updatePhoto(album.currentPageId, selectedFrame.id, { zoom: Number(event.target.value) })} /><b>{selectedFrame.photo.zoom.toFixed(2)}</b></label>
                    <button className="button full" onClick={() => updatePhoto(album.currentPageId, selectedFrame.id, { zoom: 1, offsetX: 0, offsetY: 0 })}>Центрировать фото</button>
                    <button className="button full danger-button" onClick={() => updatePageFrames(album.currentPageId, (frames) => clearFramePhoto(frames, selectedFrame.id))}>Убрать фото из окна</button>
                  </>
                ) : <p className="hint">Нажми фото слева, потом нажми эту рамку.</p>}
              </div>
            </>
          ) : <div className="empty-state small-empty"><p>Нажми на любое окно коллажа, чтобы настроить его.</p></div>}
        </aside>
      </section>

      <div className="export-stage-holder" aria-hidden="true">
        <Stage ref={printPageRef} width={canvas.width} height={canvas.height}>
          <Layer>
            <PageLayer page={currentPage} pageIndex={currentPageIndex} x={0} {...commonPageLayerProps} />
            <ExtraPageLayers extraLayers={extraLayers} pageIndex={currentPageIndex} x={0} y={0} printMode />
          </Layer>
        </Stage>
        <Stage ref={printSpreadRef} width={canvas.width * 2} height={canvas.height}>
          <Layer>
            <PageLayer page={pages[spreadStart]} pageIndex={spreadStart} x={0} {...commonPageLayerProps} />
            <ExtraPageLayers extraLayers={extraLayers} pageIndex={spreadStart} x={0} y={0} printMode />
            <PageLayer page={pages[spreadStart + 1]} pageIndex={spreadStart + 1} x={canvas.width} {...commonPageLayerProps} />
            <ExtraPageLayers extraLayers={extraLayers} pageIndex={spreadStart + 1} x={canvas.width} y={0} printMode />
          </Layer>
        </Stage>
        <Stage ref={printBookletRef} width={bookletSheetSize.width} height={bookletSheetSize.height}>
          <Layer>
            <BookletSheetBackground canvas={canvas} printSettings={normalizedBookletPrintSettings} />
            {(printBookletSide?.slots ?? []).map((slot, index) => {
              const pageIndex = slot.sourcePageIndex ?? -1;
              const position = getBookletPagePosition(index, canvas, normalizedBookletPrintSettings);
              return (
                <React.Fragment key={`print-booklet-${printBookletSide?.id ?? 'empty'}-${index}`}>
                  <PageLayer
                    page={slot.sourcePageIndex == null ? null : pages[slot.sourcePageIndex]}
                    pageIndex={pageIndex}
                    x={position.x}
                    y={position.y}
                    {...commonPageLayerProps}
                  />
                  <ExtraPageLayers extraLayers={extraLayers} pageIndex={pageIndex} x={position.x} y={position.y} printMode />
                </React.Fragment>
              );
            })}
            <BookletPrintGuides canvas={canvas} printSettings={normalizedBookletPrintSettings} />
          </Layer>
        </Stage>
      </div>
    </main>
  );
}
