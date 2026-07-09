import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import {
  MIN_FRAME,
  buildGridLayout,
  cleanFrame,
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

const STORAGE_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';
const ALBUM_MODE_KEY = 'collage-album-editor-mode';
const ALBUM_LAYERS_KEY = 'collage-album-extra-layers-v1';
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
  showFoldLine: true,
  showCropMarks: false,
  gap: 0,
  margin: 0,
};

const MAX_BOOKLET_PRINT_GAP = 300;
const MAX_BOOKLET_PRINT_MARGIN = 300;
const CROP_MARK_LENGTH = 56;


const PRESETS = [
  { id: 'a5-portrait', label: 'A5 вертикальный', width: 1480, height: 2100 },
  { id: 'a5-landscape', label: 'A5 горизонтальный', width: 2100, height: 1480 },
  { id: 'a4-portrait', label: 'A4 вертикальный', width: 2100, height: 2970 },
  { id: 'square', label: 'Квадрат', width: 2000, height: 2000 },
  { id: 'draft', label: 'Черновик', width: 1000, height: 700 },
  { id: 'custom', label: 'Свой размер', width: 1480, height: 2100 },
];

const imageCache = new Map();

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

function loadImage(src) {
  if (imageCache.has(src)) return Promise.resolve(imageCache.get(src));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      imageCache.set(src, image);
      resolve(image);
    };
    image.onerror = reject;
    image.src = src;
  });
}

function scaleForPreview(width, height, isSpread) {
  const maxWidth = isSpread ? 980 : 760;
  const maxHeight = 620;
  return Math.min(1, maxWidth / width, maxHeight / height);
}

function normalizeBookletPrintSettings(value = {}) {
  return {
    showFoldLine: value.showFoldLine !== false,
    showCropMarks: Boolean(value.showCropMarks),
    gap: Math.round(clamp(value.gap ?? DEFAULT_BOOKLET_PRINT_SETTINGS.gap, 0, MAX_BOOKLET_PRINT_GAP)),
    margin: Math.round(clamp(value.margin ?? DEFAULT_BOOKLET_PRINT_SETTINGS.margin, 0, MAX_BOOKLET_PRINT_MARGIN)),
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
  return (
    <>
      <Line points={[x, y, x + horizontalDirection * CROP_MARK_LENGTH, y]} stroke="#222222" strokeWidth={2} listening={false} />
      <Line points={[x, y, x, y + verticalDirection * CROP_MARK_LENGTH]} stroke="#222222" strokeWidth={2} listening={false} />
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
          <CropMark key={`crop-${pageIndex}-tl`} x={left} y={top} horizontalDirection={1} verticalDirection={1} />,
          <CropMark key={`crop-${pageIndex}-tr`} x={right} y={top} horizontalDirection={-1} verticalDirection={1} />,
          <CropMark key={`crop-${pageIndex}-bl`} x={left} y={bottom} horizontalDirection={1} verticalDirection={-1} />,
          <CropMark key={`crop-${pageIndex}-br`} x={right} y={bottom} horizontalDirection={-1} verticalDirection={-1} />,
        ];
      })}
    </Group>
  );
}


function countFramesInLayout(layout) {
  if (!layout?.rows) return 0;
  return layout.rows.reduce((sum, row) => sum + (Array.isArray(row.columns) ? row.columns.length : 0), 0);
}

function resolvePageFrameCount(page, fallbackSettings = DEFAULT_SETTINGS) {
  if (page?.isBlankPage) return 0;
  const saved = Number(page?.frameCount);
  if (Number.isFinite(saved) && saved >= 1) return clamp(saved, 1, 9);
  const fromLayout = countFramesInLayout(page?.layout);
  if (fromLayout) return clamp(fromLayout, 1, 9);
  const fromFrames = Array.isArray(page?.frames) ? page.frames.length : 0;
  if (fromFrames) return clamp(fromFrames, 1, 9);
  return clamp(Number(fallbackSettings.frameCount) || DEFAULT_SETTINGS.frameCount, 1, 9);
}

function settingsForPage(settings, page, explicitFrameCount) {
  return {
    ...settings,
    frameCount: explicitFrameCount ?? resolvePageFrameCount(page, settings),
  };
}

function createPage(canvas, settings, number, previousFrames = []) {
  const frameCount = clamp(Number(settings.frameCount) || DEFAULT_SETTINGS.frameCount, 1, 9);
  const built = buildGridLayout(canvas, { ...settings, frameCount }, previousFrames);
  return { id: makeId(), title: `Страница ${number}`, frameCount, layout: built.layout, frames: built.frames };
}

function createBlankPage(number, overrides = {}) {
  return {
    id: overrides.id ?? makeId(),
    title: overrides.title ?? `Пустая страница ${number}`,
    isBlankPage: true,
    frameCount: 0,
    layout: null,
    frames: [],
  };
}

function initialAlbum() {
  const first = createPage(DEFAULT_CANVAS, DEFAULT_SETTINGS, 1);
  const second = createPage(DEFAULT_CANVAS, DEFAULT_SETTINGS, 2);
  return { pages: [first, second], currentPageId: first.id };
}

function coverRect(image, frame, photo) {
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

function clampPhoto(rect, frame, x, y) {
  if (!rect) return { x, y };
  return {
    x: clamp(x, Math.min(0, frame.width - rect.width), 0),
    y: clamp(y, Math.min(0, frame.height - rect.height), 0),
  };
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
        const next = clampPhoto(rect, frame, event.target.x(), event.target.y());
        event.target.x(next.x);
        event.target.y(next.y);
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        const next = clampPhoto(rect, frame, event.target.x(), event.target.y());
        event.target.x(next.x);
        event.target.y(next.y);
        onPhotoMove(frame.id, {
          offsetX: Math.round(next.x - rect.baseX),
          offsetY: Math.round(next.y - rect.baseY),
        });
      }}
    />
  );
}

function CollageFrame({ frame, selected, locked, borderWidth, borderColor, printMode, canvas, pageOffsetX, moveFrameWithPhoto, collagePreviewOnly = false, onSelect, onPhotoMove, onFrameChange, onFrameDragFinish }) {
  const [image, setImage] = useState(null);
  const groupRef = useRef(null);
  const frameRectRef = useRef(null);
  const transformerRef = useRef(null);
  const rect = coverRect(image, frame, frame.photo);
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

  if (collagePreviewOnly) {
    if (!frame.photo || !rect) return null;
    return (
      <Group x={frame.x} y={frame.y} listening={false}>
        <Group clipX={0} clipY={0} clipWidth={frame.width} clipHeight={frame.height}>
          <KonvaImage image={image} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
        </Group>
      </Group>
    );
  }

  function clampFrameNode(node) {
    node.x(clamp(node.x(), 0, Math.max(0, canvas.width - frame.width)));
    node.y(clamp(node.y(), 0, Math.max(0, canvas.height - frame.height)));
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
    const patch = {
      x: frame.x + node.x(),
      y: frame.y + node.y(),
      width: frame.width * node.scaleX(),
      height: frame.height * node.scaleY(),
    };
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
          boundBoxFunc={(oldBox, newBox) => {
            const pageLeft = pageOffsetX;
            const pageRight = pageOffsetX + canvas.width;
            if (newBox.width < MIN_FRAME || newBox.height < MIN_FRAME) return oldBox;
            if (newBox.x < pageLeft || newBox.y < 0) return oldBox;
            if (newBox.x + newBox.width > pageRight || newBox.y + newBox.height > canvas.height) return oldBox;
            return newBox;
          }}
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

function PageLayer({ page, pageIndex, x, y = 0, canvas, settings, activePageId, selectedFrameId, moveFrameWithPhotoId, printMode = false, collagePreviewOnly = false, onFrameSelect, onPhotoMove, onFrameChange, onFrameDragFinish, onColumnResize, onRowResize, onActivatePage }) {
  const locked = settings.frameMode === 'locked';
  const safe = Math.min(settings.padding, Math.floor(canvas.width / 3), Math.floor(canvas.height / 3));
  if (!page || page.isBlankPage) {
    return (
      <Group x={x} y={y}>
        <Rect name="background" x={0} y={0} width={canvas.width} height={canvas.height} fill={settings.borderColor} />
        {page?.isBlankPage && !printMode && !collagePreviewOnly && (
          <Text x={42} y={42} text="Пустая страница" fontSize={34} fill="#b49a87" fontStyle="bold" opacity={0.75} listening={false} />
        )}
      </Group>
    );
  }
  const orderedFrames = [...page.frames].sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0));
  return (
    <Group x={x} y={y}>
      <Rect name="background" x={0} y={0} width={canvas.width} height={canvas.height} fill={settings.borderColor} />
      {!collagePreviewOnly && !printMode && settings.showGuides && (
        <>
          <Rect x={safe} y={safe} width={Math.max(0, canvas.width - safe * 2)} height={Math.max(0, canvas.height - safe * 2)} stroke={locked ? '#2f7d52' : '#c27b4f'} strokeWidth={2} strokeScaleEnabled={false} dash={[18, 14]} listening={false} />
          <Text x={safe + 16} y={safe + 16} text={locked ? 'сетка: двигай разделители' : 'поля / безопасная зона'} fontSize={28} fill={locked ? '#2f7d52' : '#c27b4f'} opacity={0.62} listening={false} />
        </>
      )}
      {!collagePreviewOnly && !printMode && <Text x={28} y={24} text={`Стр. ${pageIndex + 1}`} fontSize={34} fill={page.id === activePageId ? (locked ? '#2f7d52' : '#c27b4f') : '#b49a87'} fontStyle="bold" listening={false} />}
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

function normalizeExtraLayers(value) {
  return {
    version: 1,
    pages: value?.pages && typeof value.pages === 'object' ? value.pages : {},
  };
}

function hasAnyExtraLayer(layers) {
  const pages = layers?.pages;
  if (!pages || typeof pages !== 'object') return false;
  return Object.values(pages).some((page) => (
    (Array.isArray(page?.texts) && page.texts.length > 0)
    || (Array.isArray(page?.drawings) && page.drawings.length > 0)
    || (Array.isArray(page?.templates) && page.templates.length > 0)
  ));
}

function readExtraLayers() {
  let localLayers = null;

  try {
    const raw = localStorage.getItem(ALBUM_LAYERS_KEY);
    if (raw) localLayers = normalizeExtraLayers(JSON.parse(raw));
  } catch {
    // ignore broken local data
  }

  try {
    const bridgeLayers = normalizeExtraLayers(globalThis.__collageAlbumLayers?.getLayers?.());
    if (hasAnyExtraLayer(bridgeLayers) || !hasAnyExtraLayer(localLayers)) return bridgeLayers;
  } catch {
    // ignore bridge errors
  }

  return localLayers ?? normalizeExtraLayers(null);
}

function writeExtraLayers(value) {
  const layers = normalizeExtraLayers(value);
  try {
    localStorage.setItem(ALBUM_LAYERS_KEY, JSON.stringify(layers));
  } catch {
    // ignore localStorage quota/errors
  }

  try {
    globalThis.__collageAlbumLayers?.setLayers?.(layers);
  } catch {
    // ignore bridge errors
  }

  try {
    window.dispatchEvent(new CustomEvent('collage-album-layers-import', { detail: { layers } }));
    window.requestAnimationFrame?.(() => {
      window.dispatchEvent(new CustomEvent('collage-album-layers-import', { detail: { layers } }));
    });
    window.setTimeout?.(() => {
      window.dispatchEvent(new CustomEvent('collage-album-layers-import', { detail: { layers } }));
    }, 120);
    window.setTimeout?.(() => {
      window.dispatchEvent(new CustomEvent('collage-album-layers-import', { detail: { layers } }));
    }, 450);
  } catch {
    // ignore event errors
  }

  return layers;
}

function applyAlbumEditorMode(value, fallback = 'collage') {
  const nextMode = ['collage', 'text', 'drawings', 'templates'].includes(value) ? value : fallback;
  try {
    localStorage.setItem(ALBUM_MODE_KEY, nextMode);
  } catch {
    // ignore localStorage errors
  }
  if (document.body?.dataset) document.body.dataset.albumMode = nextMode;
  try {
    globalThis.__collageAlbumLayers?.setMode?.(nextMode);
  } catch {
    // ignore bridge errors
  }
  return nextMode;
}

function textLayersForPage(extraLayers, pageIndex) {
  const pageNumber = pageIndex + 1;
  const page = extraLayers?.pages?.[String(pageNumber)];
  return Array.isArray(page?.texts) ? page.texts : [];
}

function ExtraPageLayers({ extraLayers, pageIndex, x = 0, y = 0 }) {
  const texts = textLayersForPage(extraLayers, pageIndex);
  if (!texts.length) return null;

  return (
    <Group x={x} y={y} listening={false}>
      {texts.map((item) => {
        const fontSize = Math.max(1, Number(item.fontSize) || 56);
        return (
          <Text
            key={item.id ?? `${pageIndex}-${item.x}-${item.y}`}
            x={Number(item.x) || 0}
            y={Number(item.y) || 0}
            width={Math.max(1, Number(item.width) || 500)}
            text={String(item.text ?? '')}
            fontSize={fontSize}
            fontFamily="Arial, sans-serif"
            lineHeight={1.18}
            fill={item.color || '#1f2723'}
            wrap="word"
            listening={false}
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

  const [album, setAlbum] = useState(initialAlbum);
  const [library, setLibrary] = useState([]);
  const [canvas, setCanvas] = useState(DEFAULT_CANVAS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedFrameId, setSelectedFrameId] = useState(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const [moveFrameWithPhotoId, setMoveFrameWithPhotoId] = useState(null);
  const [viewMode, setViewMode] = useState('spread');
  const [bookletSheetsPerBlock, setBookletSheetsPerBlock] = useState(DEFAULT_SHEETS_PER_BLOCK);
  const [bookletPrintSettings, setBookletPrintSettings] = useState(DEFAULT_BOOKLET_PRINT_SETTINGS);
  const [bookletSideId, setBookletSideId] = useState(null);
  const [printBookletSideId, setPrintBookletSideId] = useState(null);
  const [notice, setNotice] = useState('');
  const [albumMode, setAlbumMode] = useState(() => localStorage.getItem(ALBUM_MODE_KEY) || 'collage');
  const [dragPageIndex, setDragPageIndex] = useState(null);
  const [dragOverPageIndex, setDragOverPageIndex] = useState(null);

  useEffect(() => {
    const readAlbumMode = () => {
      const next = document.body?.dataset?.albumMode || localStorage.getItem(ALBUM_MODE_KEY) || 'collage';
      setAlbumMode((current) => (current === next ? current : next));
    };
    readAlbumMode();
    const timer = window.setInterval(readAlbumMode, 250);
    window.addEventListener('storage', readAlbumMode);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', readAlbumMode);
    };
  }, []);

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

  const extraLayers = readExtraLayers();

  function show(text) {
    setNotice(text);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 2500);
  }

  function updatePageFrames(pageId, updater) {
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => (page.id === pageId ? { ...page, frames: typeof updater === 'function' ? updater(page.frames) : updater } : page)),
    }));
  }

  function changeFrame(pageId, frameId, patch) {
    updatePageFrames(pageId, (frames) => frames.map((frame) => (frame.id === frameId ? cleanFrame({ ...frame, ...patch }, canvas) : frame)));
  }

  function rebuildPage(pageId, nextCanvas = canvas, nextSettings = settings, explicitFrameCount) {
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== pageId) return page;
        if (page.isBlankPage) return page;
        const frameCount = explicitFrameCount ?? resolvePageFrameCount(page, nextSettings);
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
    const frameCount = clamp(Number(value), 1, 9);
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

  function uploadPhotos(event) {
    const files = Array.from(event.target.files ?? []);
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => setLibrary((current) => [...current, { id: makeId(), name: file.name, src: reader.result }]);
      reader.readAsDataURL(file);
    });
    event.target.value = '';
    if (files.length) show('Фото загружены');
  }

  function putPhoto(pageId, frameId, photo) {
    updatePageFrames(pageId, (frames) => frames.map((frame) => (frame.id === frameId ? { ...frame, photo: { id: photo.id, name: photo.name, src: photo.src, zoom: 1, offsetX: 0, offsetY: 0 } } : frame)));
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
    for (const entry of entries) {
      if (!entry.page) continue;
      const x = point.x - entry.x;
      const y = point.y;
      const frame = entry.page.frames.find((item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
      if (frame) {
        putPhoto(entry.page.id, frame.id, photo);
        return;
      }
    }
    show('Перетащи фото прямо в рамку');
  }

  function updatePhoto(pageId, frameId, patch) {
    updatePageFrames(pageId, (frames) => frames.map((frame) => (frame.id === frameId && frame.photo ? { ...frame, photo: { ...frame.photo, ...patch } } : frame)));
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
    const currentPageLayers = readExtraLayers()?.pages?.[String(currentPageIndex + 1)] ?? null;
    const page = currentPage.isBlankPage
      ? createBlankPage(pages.length + 1)
      : createPage(canvas, settingsForPage(settings, currentPage, currentPageFrameCount), pages.length + 1, currentPage.frames);
    shiftExtraLayersForPageInsert(insertIndex, pages.length, currentPageLayers);
    setAlbum((current) => {
      const currentIndex = current.pages.findIndex((item) => item.id === current.currentPageId);
      const next = [...current.pages];
      next.splice(currentIndex + 1, 0, page);
      return { pages: next, currentPageId: page.id };
    });
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
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
    if (frameCount <= 1) return show('Нельзя удалить последнее окно на странице');
    const nextFrameCount = frameCount - 1;
    const keptFrames = currentPage.frames.filter((frame) => frame.id !== selectedFrame.id);
    const nextSettings = { ...settings, frameCount: nextFrameCount };
    setSettings(nextSettings);
    setAlbum((current) => ({
      ...current,
      pages: current.pages.map((page) => {
        if (page.id !== current.currentPageId) return page;
        const pageSettings = settingsForPage(nextSettings, page, nextFrameCount);
        const built = buildGridLayout(canvas, pageSettings, keptFrames);
        return { ...page, frameCount: nextFrameCount, layout: built.layout, frames: built.frames };
      }),
    }));
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    show(`Окно удалено. На странице ${currentPageIndex + 1}: ${nextFrameCount} фото-окон`);
  }

  function bringSelectedFrameToFront() {
    if (!selectedFrame || locked) return;
    const maxZ = Math.max(0, ...(currentPage?.frames ?? []).map((frame) => Number(frame.zIndex) || 0));
    updatePageFrames(album.currentPageId, (frames) => frames.map((frame) => (frame.id === selectedFrame.id ? { ...frame, zIndex: maxZ + 1 } : frame)));
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



  function cloneLayerPage(pageLayers) {
    if (!pageLayers) return null;
    try {
      return JSON.parse(JSON.stringify(pageLayers));
    } catch {
      return pageLayers;
    }
  }

  function shiftExtraLayersForPageInsert(insertIndex, oldPageCount, insertedPageLayers = null) {
    const layers = readExtraLayers();
    const pagesMap = layers?.pages ?? {};
    const insertPageNumber = insertIndex + 1;
    const nextPagesMap = {};

    for (const [key, value] of Object.entries(pagesMap)) {
      const pageNumber = Number(key);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > oldPageCount) {
        nextPagesMap[key] = value;
        continue;
      }
      const nextPageNumber = pageNumber >= insertPageNumber ? pageNumber + 1 : pageNumber;
      nextPagesMap[String(nextPageNumber)] = value;
    }

    if (insertedPageLayers) nextPagesMap[String(insertPageNumber)] = cloneLayerPage(insertedPageLayers);
    writeExtraLayers({ ...layers, pages: nextPagesMap });
  }

  function shiftExtraLayersForPageDelete(deleteIndex, oldPageCount) {
    const layers = readExtraLayers();
    const pagesMap = layers?.pages ?? {};
    const deletePageNumber = deleteIndex + 1;
    const nextPagesMap = {};

    for (const [key, value] of Object.entries(pagesMap)) {
      const pageNumber = Number(key);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > oldPageCount) {
        nextPagesMap[key] = value;
        continue;
      }
      if (pageNumber === deletePageNumber) continue;
      const nextPageNumber = pageNumber > deletePageNumber ? pageNumber - 1 : pageNumber;
      nextPagesMap[String(nextPageNumber)] = value;
    }

    writeExtraLayers({ ...layers, pages: nextPagesMap });
  }

  function pruneExtraLayersForPageCount(pageCount) {
    const layers = readExtraLayers();
    const pagesMap = layers?.pages ?? {};
    const nextPagesMap = {};

    for (const [key, value] of Object.entries(pagesMap)) {
      const pageNumber = Number(key);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber <= pageCount) nextPagesMap[key] = value;
    }

    writeExtraLayers({ ...layers, pages: nextPagesMap });
  }


  function reorderExtraLayersByPageMove(fromIndex, toIndex, pageCount) {
    if (fromIndex === toIndex) return;
    const layers = readExtraLayers();
    const pagesMap = layers?.pages ?? {};
    const orderedLayerPages = Array.from({ length: pageCount }, (_, index) => pagesMap[String(index + 1)] ?? null);
    const movedLayerPages = moveArrayItem(orderedLayerPages, fromIndex, toIndex);
    const nextPagesMap = {};

    movedLayerPages.forEach((pageLayers, index) => {
      if (pageLayers) nextPagesMap[String(index + 1)] = pageLayers;
    });

    for (const [key, value] of Object.entries(pagesMap)) {
      const numberKey = Number(key);
      if (!Number.isInteger(numberKey) || numberKey < 1 || numberKey > pageCount) nextPagesMap[key] = value;
    }

    writeExtraLayers({ ...layers, pages: nextPagesMap });
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

  function movePage(direction) {
    setAlbum((current) => {
      const index = current.pages.findIndex((page) => page.id === current.currentPageId);
      const target = direction === 'left' ? index - 1 : index + 1;
      if (target < 0 || target >= current.pages.length) return current;
      const next = [...current.pages];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, pages: next };
    });
    setMoveFrameWithPhotoId(null);
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
    return {
      version: 'live-22-booklet-polish-safety',
      canvas,
      settings,
      library,
      pages,
      currentPageId: album.currentPageId,
      viewMode,
      bookletSheetsPerBlock,
      bookletPrintSettings: normalizedBookletPrintSettings,
      extraLayers: readExtraLayers(),
      albumEditorMode: albumMode,
      savedAt: new Date().toISOString(),
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project()));
      show('Альбом сохранён');
    } catch (error) {
      console.error(error);
      show('Не удалось сохранить: проект слишком большой. Скачай JSON или очисти лишние фото.');
    }
  }

  function normalizePages(data, nextCanvas, nextSettings) {
    if (Array.isArray(data.pages) && data.pages.length) {
      return data.pages.map((page, index) => {
        if (page?.isBlankPage) {
          return createBlankPage(index + 1, { id: page.id, title: page.title });
        }
        const frames = Array.isArray(page.frames) ? page.frames.map((frame) => cleanFrame(frame, nextCanvas)) : [];
        const existingLayoutCount = countFramesInLayout(page.layout);
        const frameCount = clamp(Number(page.frameCount) || existingLayoutCount || frames.length || nextSettings.frameCount, 1, 9);
        const trustLayout = page.layout?.type === 'grid' && existingLayoutCount === frameCount;
        const pageSettings = { ...nextSettings, frameCount };
        const layout = trustLayout ? page.layout : buildGridLayout(nextCanvas, pageSettings, frames).layout;
        return { id: page.id ?? makeId(), title: page.title ?? `Страница ${index + 1}`, frameCount, layout, frames: framesFromLayout(layout, frames) };
      });
    }
    if (Array.isArray(data.frames)) return [createPage(nextCanvas, nextSettings, 1, data.frames.map((frame) => cleanFrame(frame, nextCanvas)))];
    return [createPage(nextCanvas, nextSettings, 1), createPage(nextCanvas, nextSettings, 2)];
  }

  function loadSaved() {
    const raw = localStorage.getItem(STORAGE_KEY) ?? LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) return show('Сохранённого проекта пока нет');
    try {
      const data = JSON.parse(raw);
      const nextCanvas = data.canvas ?? DEFAULT_CANVAS;
      const nextSettings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
      const nextPages = normalizePages(data, nextCanvas, nextSettings);
      setCanvas(nextCanvas);
      setSettings(nextSettings);
      setLibrary(Array.isArray(data.library) ? data.library : []);
      setAlbum({ pages: nextPages, currentPageId: nextPages.some((page) => page.id === data.currentPageId) ? data.currentPageId : nextPages[0].id });
      setViewMode(['single', 'spread', 'booklet'].includes(data.viewMode) ? data.viewMode : 'spread');
      setBookletSheetsPerBlock(clampBookletSheetsPerBlock(data.bookletSheetsPerBlock));
      setBookletPrintSettings(normalizeBookletPrintSettings(data.bookletPrintSettings));
      writeExtraLayers(data.extraLayers);
      setAlbumMode(applyAlbumEditorMode(data.albumEditorMode));
      setSelectedFrameId(null);
      setSelectedPhotoId(null);
      setMoveFrameWithPhotoId(null);
      show('Альбом загружен');
    } catch {
      show('Не получилось открыть сохранение');
    }
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const nextCanvas = data.canvas ?? DEFAULT_CANVAS;
        const nextSettings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
        const nextPages = normalizePages(data, nextCanvas, nextSettings);
        setCanvas(nextCanvas);
        setSettings(nextSettings);
        setLibrary(Array.isArray(data.library) ? data.library : []);
        setAlbum({ pages: nextPages, currentPageId: nextPages.some((page) => page.id === data.currentPageId) ? data.currentPageId : nextPages[0].id });
        setViewMode(['single', 'spread', 'booklet'].includes(data.viewMode) ? data.viewMode : 'spread');
        setBookletSheetsPerBlock(clampBookletSheetsPerBlock(data.bookletSheetsPerBlock));
        setBookletPrintSettings(normalizeBookletPrintSettings(data.bookletPrintSettings));
        writeExtraLayers(data.extraLayers);
        setAlbumMode(applyAlbumEditorMode(data.albumEditorMode));
        setSelectedFrameId(null);
        setSelectedPhotoId(null);
        setMoveFrameWithPhotoId(null);
        window.requestAnimationFrame?.(() => writeExtraLayers(data.extraLayers));
        window.setTimeout?.(() => writeExtraLayers(data.extraLayers), 250);
        show('JSON открыт');
      } catch {
        show('Файл не похож на проект');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function exportPng(stageRefToExport, filename, message) {
    setSelectedFrameId(null);
    setMoveFrameWithPhotoId(null);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const uri = stageRefToExport.current?.toDataURL({ pixelRatio: EXPORT_RATIO, mimeType: 'image/png' });
      if (!uri) return show('Не получилось собрать PNG');
      downloadDataUrl(filename, uri);
      show(message);
    }));
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
      {isBooklet && <ExtraPageLayers extraLayers={extraLayers} pageIndex={entry.pageIndex} x={entry.x} y={entry.y ?? 0} />}
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><p className="eyebrow">Редактор альбома</p><h1>Collage Creator</h1></div>
        <div className="topbar-actions">
          <button className="button" onClick={save}>Сохранить</button>
          <button className="button" onClick={loadSaved}>Открыть</button>
          <button className="button" onClick={() => downloadText('collage-album-project.json', JSON.stringify(project(), null, 2))}>Скачать JSON</button>
          <button className="button" onClick={() => jsonRef.current?.click()}>Загрузить JSON</button>
          <input ref={jsonRef} className="hidden-input" type="file" accept="application/json" onChange={importJson} />
          <button className="button accent" onClick={() => exportPng(printPageRef, `collage-page-${pad(currentPageIndex + 1)}.png`, 'Скачана страница')}>PNG страницы</button>
          <button className="button accent" onClick={() => exportPng(printSpreadRef, `collage-spread-${pad(spreadStart + 1)}-${pad(Math.min(spreadStart + 2, pages.length))}.png`, 'Скачан разворот')}>PNG разворота</button>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <section className="settings-bar document-panel">
        <div className="panel-kicker">Документ</div>
        <div className="document-grid">
          <label className="field wide-field"><span>Размер страницы</span><select value={settings.presetId} onChange={(event) => { const preset = PRESETS.find((item) => item.id === event.target.value) ?? PRESETS[0]; updateCanvas(preset.width, preset.height, preset.id); }}>{PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
          <label className="field small-field"><span>Ширина px</span><input type="number" value={canvas.width} onChange={(event) => updateCanvas(event.target.value, canvas.height, 'custom')} /></label>
          <label className="field small-field"><span>Высота px</span><input type="number" value={canvas.height} onChange={(event) => updateCanvas(canvas.width, event.target.value, 'custom')} /></label>
          <label className="field small-field"><span>Фото-окон</span><select value={currentPage?.isBlankPage ? 0 : currentPageFrameCount} disabled={Boolean(currentPage?.isBlankPage)} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>{currentPage?.isBlankPage ? <option value={0}>пустая</option> : [1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          <label className="field small-field"><span>Зазор</span><input type="number" value={settings.gap} onChange={(event) => updateSetting('gap', clamp(event.target.value, 0, 200))} /></label>
          <label className="field small-field"><span>Поля</span><input type="number" value={settings.padding} onChange={(event) => updateSetting('padding', clamp(event.target.value, 0, 300))} /></label>
        </div>
      </section>

      <section className={`album-bar clean-control-panel ${isBooklet ? 'booklet-mode-bar' : ''}`}>
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
              <button className="small-button" onClick={() => goSpread('prev')} disabled={spreadStart === 0}>← разворот</button>
              <button className="small-button" onClick={() => goSpread('next')} disabled={spreadStart + 2 >= pages.length}>разворот →</button>
              <button className={`small-button ${settings.showGuides ? 'active-mode' : ''}`} onClick={() => updateSetting('showGuides', !settings.showGuides)}>{settings.showGuides ? '✓ Направляющие' : 'Направляющие'}</button>
              <button className={`small-button ${locked ? 'active-mode' : ''}`} onClick={() => updateSetting('frameMode', locked ? 'free' : 'locked')}>{locked ? 'Сетка: разделители' : 'Сетка'}</button>
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
                <label className="booklet-sheets-control booklet-number-control"><span>Зазор px</span><input type="number" min="0" max={MAX_BOOKLET_PRINT_GAP} value={normalizedBookletPrintSettings.gap} onChange={(event) => updateBookletPrintSetting('gap', event.target.value)} /></label>
                <label className="booklet-sheets-control booklet-number-control"><span>Поля px</span><input type="number" min="0" max={MAX_BOOKLET_PRINT_MARGIN} value={normalizedBookletPrintSettings.margin} onChange={(event) => updateBookletPrintSetting('margin', event.target.value)} /></label>
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

      <section className="workspace three-columns">
        <aside className="sidebar">
          <div className="panel-title"><div><h2>Фото</h2><p>На компьютере можно перетаскивать. На телефоне: нажми фото, потом нажми рамку.</p></div><span>{library.length}</span></div>
          <label className="upload-box"><strong>Загрузить фото</strong><small>Можно сразу несколько</small><input type="file" accept="image/*" multiple onChange={uploadPhotos} /></label>
          <button className="button full" onClick={() => { setLibrary([]); setSelectedPhotoId(null); show('Список фото очищен'); }} disabled={library.length === 0}>Очистить список фото</button>
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
                <img src={photo.src} alt={photo.name} draggable="false" />
                {isUsed && <small className="photo-used-badge">В альбоме</small>}
                <span>{photo.name}</span>
              </button>
            );
          })}</div>}
        </aside>

        <aside className={`page-rail ${isBooklet ? 'booklet-page-rail' : ''}`}>
          <div className="panel-title compact">
            <div>
              <h2>Страницы</h2>
              <p>{isBooklet ? 'Клик по странице откроет сторону листа, где она печатается.' : 'Клик по странице открывает её в текущем виде.'}</p>
            </div>
            <span>{pages.length}</span>
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
            {!isBooklet && <button className="small-button" onClick={() => { updatePageFrames(album.currentPageId, (frames) => frames.map((frame) => ({ ...frame, photo: null }))); setSelectedFrameId(null); setMoveFrameWithPhotoId(null); }}>Очистить фото</button>}
          </div>

          <div className={`stage-frame ${isSpread || isBooklet ? 'album-preview' : ''} ${isBooklet ? 'booklet-stage' : ''}`} style={{ width: stageDisplayWidth, height: stageDisplayHeight }} onDragOver={(event) => { if (!isBooklet) event.preventDefault(); }} onDrop={isBooklet ? undefined : dropPhoto}>
            <div className="stage-scale-shell" style={{ width: stageRealWidth, height: stageRealHeight, transform: `scale(${previewScale})` }}>
              <Stage ref={stageRef} width={stageRealWidth} height={stageRealHeight} onMouseDown={(event) => { if (event.target === event.target.getStage() || event.target.name() === 'background') { setSelectedFrameId(null); setMoveFrameWithPhotoId(null); } }}>
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

        <aside className="inspector">
          <div className="panel-title compact"><div><h2>Настройки окна</h2><p>{selectedFrame ? (locked ? 'В сетке двигай зелёные разделители между окнами.' : 'Двигай рамку внутри страницы или меняй размер за маркеры. Фото внутри двигай мышкой.') : 'Выбери рамку на холсте'}</p></div></div>
          <div className="inspector-block"><h3>Цвет и рамка</h3><label className="field color-field"><span>Цвет фона / рамки</span><input type="color" value={settings.borderColor} onChange={(event) => updateSetting('borderColor', event.target.value)} /></label><label className="field"><span>Обводка внутри окна</span><input type="number" min="0" max="80" value={settings.borderWidth} onChange={(event) => updateSetting('borderWidth', clamp(event.target.value, 0, 80))} /></label></div>
          {selectedFrame ? (
            <>
              <div className="inspector-block">
                <h3>Положение рамки</h3>
                <div className="geometry-grid">
                  <label className="field"><span>X</span><input type="number" value={selectedFrame.x} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { x: event.target.value })} /></label>
                  <label className="field"><span>Y</span><input type="number" value={selectedFrame.y} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { y: event.target.value })} /></label>
                  <label className="field"><span>Ширина</span><input type="number" value={selectedFrame.width} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { width: event.target.value })} /></label>
                  <label className="field"><span>Высота</span><input type="number" value={selectedFrame.height} onChange={(event) => changeFrame(album.currentPageId, selectedFrame.id, { height: event.target.value })} /></label>
                </div>
                {!locked && <button className="button full" onClick={bringSelectedFrameToFront}>Поверх остальных</button>}
                {!locked && <button className={`button full ${moveFrameWithPhotoId === selectedFrame.id ? 'accent' : ''}`} onClick={enableMoveFrameWithPhoto} disabled={!selectedFrame.photo}>{moveFrameWithPhotoId === selectedFrame.id ? 'Перетащи рамку сейчас' : 'Двигать рамку с фото'}</button>}
                <button className="button full danger-button" onClick={deleteSelectedFrame} disabled={currentPageFrameCount <= 1}>Удалить окно</button>
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
                    <button className="button full danger-button" onClick={() => updatePageFrames(album.currentPageId, (frames) => frames.map((frame) => frame.id === selectedFrame.id ? { ...frame, photo: null } : frame))}>Убрать фото из окна</button>
                  </>
                ) : <p className="hint">Нажми фото слева, потом нажми эту рамку.</p>}
              </div>
            </>
          ) : <div className="empty-state small-empty"><p>Нажми на любое окно коллажа, чтобы настроить его.</p></div>}
        </aside>
      </section>

      <div className="export-stage-holder" aria-hidden="true">
        <Stage ref={printPageRef} width={canvas.width} height={canvas.height}><Layer><PageLayer page={currentPage} pageIndex={currentPageIndex} x={0} {...commonPageLayerProps} /></Layer></Stage>
        <Stage ref={printSpreadRef} width={canvas.width * 2} height={canvas.height}><Layer><PageLayer page={pages[spreadStart]} pageIndex={spreadStart} x={0} {...commonPageLayerProps} /><PageLayer page={pages[spreadStart + 1]} pageIndex={spreadStart + 1} x={canvas.width} {...commonPageLayerProps} /></Layer></Stage>
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
                  <ExtraPageLayers extraLayers={extraLayers} pageIndex={pageIndex} x={position.x} y={position.y} />
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
