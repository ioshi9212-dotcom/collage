import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../AppLive.jsx', import.meta.url), 'utf8');

for (const symbol of [
  'getA4BookletPrintGeometry',
  'buildManualDuplexBookletOrder',
  'renderBookletSidePng',
  'exportBookletPdf',
  'downloadBookletInstructions',
  'rotateRasterDataUrl180',
  'bookletA4Geometry',
  'bookletManualDuplexOrder',
]) {
  assert.ok(source.includes(symbol), `AppLive must connect ${symbol}`);
}

for (const label of [
  'PDF лицевых A4',
  'PDF оборотов A4',
  'PDF вся брошюра A4',
  'Тест первого листа',
  'Инструкция',
  'Порядок оборотов',
  'Развернуть обороты на 180°',
]) {
  assert.ok(source.includes(label), `booklet editor must expose ${label}`);
}

assert.ok(source.includes('A4 горизонтально 297×210 мм'), 'booklet summary must show the physical sheet size');
assert.ok(source.includes('половина листа 148,5×210 мм'), 'booklet summary must explain the folded page width');
assert.ok(source.includes("showCropMarks: false, gap: 0, margin: 0"), 'booklet PDF must ignore crop-only legacy spacing');
assert.ok(source.includes('sourceBytes > MAX_PDF_JPEG_BYTES'), 'booklet PDF must keep the browser memory guard');
assert.ok(source.includes("bookletPdfSequence('fronts')") === false, 'booklet kinds must be selected dynamically, not hard-coded');
assert.ok(source.includes("if (kind === 'fronts') return bookletManualDuplexOrder.fronts"), 'front PDF must use front-side order');
assert.ok(source.includes("if (kind === 'backs') return bookletManualDuplexOrder.backs"), 'back PDF must use configured back-side order');
assert.ok(source.includes("if (kind === 'test') return bookletManualDuplexOrder.test"), 'test PDF must contain the first physical sheet');

console.log('A4 booklet editor integration checks passed');
