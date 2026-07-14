export const PDF_POINTS_PER_MM = 72 / 25.4;
const PNG_MIME = 'image/png';
const JPEG_MIME = 'image/jpeg';
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const textEncoder = new TextEncoder();
let crcTable = null;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function concatBytes(parts) {
  const normalized = parts.map((part) => (part instanceof Uint8Array ? part : textEncoder.encode(String(part))));
  const total = normalized.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of normalized) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function dataUrlToBytes(dataUrl, expectedMime) {
  if (typeof dataUrl !== 'string') throw new TypeError('dataUrl must be a string');
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Некорректный data URL');
  const meta = dataUrl.slice(0, comma);
  if (expectedMime && !meta.startsWith(`data:${expectedMime}`)) throw new Error(`Ожидался ${expectedMime}`);
  const body = dataUrl.slice(comma + 1);
  if (!meta.includes(';base64')) return textEncoder.encode(decodeURIComponent(body));
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToDataUrl(bytes, mime) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function readUint32(bytes, offset) {
  return (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    crcTable[index] = current >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = textEncoder.encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.length, crc32(concatBytes([typeBytes, data])));
  return chunk;
}

function parsePng(bytes) {
  if (bytes.length < PNG_SIGNATURE.length) throw new Error('PNG слишком короткий');
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) throw new Error('Файл не является PNG');
  }
  const chunks = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('PNG повреждён');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    chunks.push({ type, bytes: bytes.slice(offset, end), data: bytes.slice(offset + 8, offset + 8 + length) });
    offset = end;
    if (type === 'IEND') break;
  }
  if (!chunks.some((chunk) => chunk.type === 'IHDR') || !chunks.some((chunk) => chunk.type === 'IEND')) {
    throw new Error('PNG не содержит обязательных секций');
  }
  return chunks;
}

export function addPngDensityMetadata(dataUrl, dpi) {
  const safeDpi = clamp(Math.round(finite(dpi, 300)), 1, 1200);
  const pixelsPerMeter = Math.max(1, Math.round(safeDpi / 0.0254));
  const density = new Uint8Array(9);
  writeUint32(density, 0, pixelsPerMeter);
  writeUint32(density, 4, pixelsPerMeter);
  density[8] = 1;

  const chunks = parsePng(dataUrlToBytes(dataUrl, PNG_MIME));
  const output = [PNG_SIGNATURE];
  let inserted = false;
  for (const chunk of chunks) {
    if (chunk.type === 'pHYs') continue;
    output.push(chunk.bytes);
    if (chunk.type === 'IHDR') {
      output.push(pngChunk('pHYs', density));
      inserted = true;
    }
  }
  if (!inserted) throw new Error('Не удалось записать DPI в PNG');
  return bytesToDataUrl(concatBytes(output), PNG_MIME);
}

export function readPngDensityMetadata(input) {
  const bytes = typeof input === 'string' ? dataUrlToBytes(input, PNG_MIME) : input;
  const chunk = parsePng(bytes).find((item) => item.type === 'pHYs');
  if (!chunk || chunk.data.length !== 9) return null;
  const pixelsPerMeterX = readUint32(chunk.data, 0);
  const pixelsPerMeterY = readUint32(chunk.data, 4);
  const unit = chunk.data[8];
  return {
    pixelsPerMeterX,
    pixelsPerMeterY,
    unit,
    dpiX: unit === 1 ? pixelsPerMeterX * 0.0254 : null,
    dpiY: unit === 1 ? pixelsPerMeterY * 0.0254 : null,
  };
}

export function mmToPdfPoints(mm) {
  return Math.max(0, finite(mm, 0)) * PDF_POINTS_PER_MM;
}

function pdfNumber(value) {
  const rounded = Number(finite(value, 0).toFixed(4));
  return String(rounded);
}

function pdfUtf16Hex(value) {
  const text = String(value ?? '');
  let hex = 'FEFF';
  for (let index = 0; index < text.length; index += 1) hex += text.charCodeAt(index).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

function pdfDate(value) {
  const date = value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
  const part = (number) => String(number).padStart(2, '0');
  return `D:${date.getUTCFullYear()}${part(date.getUTCMonth() + 1)}${part(date.getUTCDate())}${part(date.getUTCHours())}${part(date.getUTCMinutes())}${part(date.getUTCSeconds())}Z`;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function streamObject(dictionary, bytes) {
  return concatBytes([`${dictionary.slice(0, -2)} /Length ${bytes.length} >>\nstream\n`, bytes, '\nendstream']);
}

function makeXmp(metadata, pages) {
  const first = pages[0]?.geometry || {};
  const keywords = Array.isArray(metadata.keywords) ? metadata.keywords.join(', ') : String(metadata.keywords || '');
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:collage="https://collage.local/ns/print/1.0/">\n` +
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(metadata.title)}</rdf:li></rdf:Alt></dc:title>\n` +
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(metadata.subject)}</rdf:li></rdf:Alt></dc:description>\n` +
    `<pdf:Producer>${xmlEscape(metadata.producer)}</pdf:Producer>\n` +
    `<pdf:Keywords>${xmlEscape(keywords)}</pdf:Keywords>\n` +
    `<xmp:CreatorTool>${xmlEscape(metadata.creator)}</xmp:CreatorTool>\n` +
    `<collage:PageCount>${pages.length}</collage:PageCount>\n` +
    `<collage:PrintDPI>${finite(first.printDpi, 0)}</collage:PrintDPI>\n` +
    `<collage:TrimWidthMM>${finite(first.trimWidthMm, 0)}</collage:TrimWidthMM>\n` +
    `<collage:TrimHeightMM>${finite(first.trimHeightMm, 0)}</collage:TrimHeightMM>\n` +
    `<collage:BleedMM>${finite(first.bleedMm, 0)}</collage:BleedMM>\n` +
    `<collage:ColorSpace>RGB</collage:ColorSpace>\n` +
    `</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>`;
}

function normalizePdfMetadata(metadata = {}) {
  return {
    title: String(metadata.title || 'Collage Creator — печатный PDF'),
    author: String(metadata.author || ''),
    subject: String(metadata.subject || 'Печатный PDF с физическим размером страницы'),
    creator: String(metadata.creator || 'Collage Creator'),
    producer: String(metadata.producer || 'Collage Creator print engine'),
    keywords: Array.isArray(metadata.keywords) ? metadata.keywords : String(metadata.keywords || 'album, print, collage'),
    language: String(metadata.language || 'ru-RU'),
    createdAt: metadata.createdAt instanceof Date ? metadata.createdAt : new Date(),
  };
}

export function buildRasterPrintPdf({ pages, metadata = {} } = {}) {
  if (!Array.isArray(pages) || pages.length === 0) throw new Error('Нет страниц для PDF');
  const normalizedPages = pages.map((item, index) => {
    const jpegBytes = item?.jpegBytes instanceof Uint8Array ? item.jpegBytes : new Uint8Array(item?.jpegBytes || []);
    const geometry = item?.geometry || {};
    if (jpegBytes.length < 4 || jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) throw new Error(`Страница ${index + 1}: JPEG не найден`);
    const widthPx = Math.max(1, Math.round(finite(item.widthPx, geometry.outputWidthPx)));
    const heightPx = Math.max(1, Math.round(finite(item.heightPx, geometry.outputHeightPx)));
    const fullWidthMm = finite(geometry.fullWidthMm, finite(geometry.trimWidthMm, 0) + finite(geometry.bleedMm, 0) * 2);
    const fullHeightMm = finite(geometry.fullHeightMm, finite(geometry.trimHeightMm, 0) + finite(geometry.bleedMm, 0) * 2);
    if (fullWidthMm <= 0 || fullHeightMm <= 0) throw new Error(`Страница ${index + 1}: физический размер не задан`);
    return { ...item, jpegBytes, geometry: { ...geometry, fullWidthMm, fullHeightMm }, widthPx, heightPx };
  });
  const info = normalizePdfMetadata(metadata);
  const objectCount = 4 + normalizedPages.length * 3;
  const catalogId = 1;
  const pagesId = 2;
  const metadataId = 3;
  const infoId = objectCount;
  const pageIds = normalizedPages.map((_, index) => 6 + index * 3);
  const objects = new Map();

  objects.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R /Metadata ${metadataId} 0 R /Lang (${info.language.replaceAll(/[()\\]/g, '')}) /ViewerPreferences << /PrintScaling /None /PickTrayByPDFSize true >> >>`);
  objects.set(pagesId, `<< /Type /Pages /Count ${normalizedPages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  const xmpBytes = textEncoder.encode(makeXmp(info, normalizedPages));
  objects.set(metadataId, streamObject('<< /Type /Metadata /Subtype /XML >>', xmpBytes));

  normalizedPages.forEach((item, index) => {
    const imageId = 4 + index * 3;
    const contentId = 5 + index * 3;
    const pageId = 6 + index * 3;
    const geometry = item.geometry;
    const mediaWidth = mmToPdfPoints(geometry.fullWidthMm);
    const mediaHeight = mmToPdfPoints(geometry.fullHeightMm);
    const bleed = mmToPdfPoints(geometry.bleedMm);
    const trimWidth = mmToPdfPoints(geometry.trimWidthMm);
    const trimHeight = mmToPdfPoints(geometry.trimHeightMm);
    const mediaBox = `[0 0 ${pdfNumber(mediaWidth)} ${pdfNumber(mediaHeight)}]`;
    const trimBox = `[${pdfNumber(bleed)} ${pdfNumber(bleed)} ${pdfNumber(bleed + trimWidth)} ${pdfNumber(bleed + trimHeight)}]`;
    objects.set(imageId, streamObject(`<< /Type /XObject /Subtype /Image /Width ${item.widthPx} /Height ${item.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode >>`, item.jpegBytes));
    const content = textEncoder.encode(`q\n${pdfNumber(mediaWidth)} 0 0 ${pdfNumber(mediaHeight)} 0 0 cm\n/Im0 Do\nQ`);
    objects.set(contentId, streamObject('<< >>', content));
    objects.set(pageId, `<< /Type /Page /Parent ${pagesId} 0 R /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R /MediaBox ${mediaBox} /CropBox ${mediaBox} /BleedBox ${mediaBox} /TrimBox ${trimBox} /ArtBox ${trimBox} >>`);
  });

  const keywordText = Array.isArray(info.keywords) ? info.keywords.join(', ') : info.keywords;
  objects.set(infoId, `<< /Title ${pdfUtf16Hex(info.title)} /Author ${pdfUtf16Hex(info.author)} /Subject ${pdfUtf16Hex(info.subject)} /Creator ${pdfUtf16Hex(info.creator)} /Producer ${pdfUtf16Hex(info.producer)} /Keywords ${pdfUtf16Hex(keywordText)} /CreationDate (${pdfDate(info.createdAt)}) /ModDate (${pdfDate(info.createdAt)}) >>`);

  const header = concatBytes(['%PDF-1.4\n%', new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]), '\n']);
  const parts = [header];
  const offsets = new Array(objectCount + 1).fill(0);
  let offset = header.length;
  for (let id = 1; id <= objectCount; id += 1) {
    const body = objects.get(id);
    if (!body) throw new Error(`PDF object ${id} missing`);
    const objectBytes = concatBytes([`${id} 0 obj\n`, body, '\nendobj\n']);
    offsets[id] = offset;
    parts.push(objectBytes);
    offset += objectBytes.length;
  }
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objectCount + 1}\n`, '0000000000 65535 f \n'];
  for (let id = 1; id <= objectCount; id += 1) xref.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objectCount + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  parts.push(concatBytes(xref));
  return concatBytes(parts);
}

function loadImage(dataUrl, imageFactory) {
  return new Promise((resolve, reject) => {
    const image = imageFactory();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось подготовить страницу для PDF'));
    image.src = dataUrl;
  });
}

export async function pngDataUrlToJpegPage(pngDataUrl, geometry, options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const imageFactory = options.imageFactory ?? (() => new globalThis.Image());
  if (!documentRef?.createElement || typeof imageFactory !== 'function') throw new Error('Браузер не поддерживает PDF-экспорт');
  const image = await loadImage(pngDataUrl, imageFactory);
  const canvas = documentRef.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не поддерживает PDF-экспорт');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const quality = clamp(finite(options.quality, 0.97), 0.8, 1);
  const jpegDataUrl = canvas.toDataURL(JPEG_MIME, quality);
  return {
    jpegBytes: dataUrlToBytes(jpegDataUrl, JPEG_MIME),
    widthPx: canvas.width,
    heightPx: canvas.height,
    geometry,
  };
}

export async function createPrintPdfFromPngPages({ pages, metadata, options } = {}) {
  if (!Array.isArray(pages) || pages.length === 0) throw new Error('Нет страниц для PDF');
  const jpegPages = [];
  for (const page of pages) jpegPages.push(await pngDataUrlToJpegPage(page.pngDataUrl, page.geometry, options));
  return buildRasterPrintPdf({ pages: jpegPages, metadata });
}
