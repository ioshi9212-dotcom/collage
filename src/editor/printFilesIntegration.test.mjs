import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../AppLive.jsx', import.meta.url), 'utf8');

for (const symbol of [
  'addPngDensityMetadata',
  'buildRasterPrintPdf',
  'pngDataUrlToJpegPage',
  'renderPrintPng',
  'exportAlbumPdf',
  'printAlbumPageIndex',
  'MAX_PDF_JPEG_BYTES',
]) {
  assert.ok(source.includes(symbol), `AppLive must connect ${symbol}`);
}

for (const label of ['PNG страницы', 'PNG разворота', 'PDF страницы', 'PDF разворота', 'PDF альбома']) {
  assert.ok(source.includes(`>${label}<`) || source.includes(`'${label}'`) || source.includes(`\`${label}\``), `editor must expose ${label}`);
}

assert.ok(source.includes("new Blob([bytes], { type: 'application/pdf' })"), 'PDF bytes must download with application/pdf');
assert.ok(source.includes('addPngDensityMetadata(raster, geometry.printDpi)'), 'PNG export must write the selected DPI');
assert.ok(source.includes('setPrintAlbumPageIndex(index)'), 'album PDF must render every project page through the hidden stage');
assert.ok(source.includes('sourceBytes > MAX_PDF_JPEG_BYTES'), 'album PDF must enforce a browser memory guard');
assert.ok(source.includes('quality: 0.96'), 'album PDF should use the bounded JPEG quality chosen for multi-page output');
assert.ok(!source.includes('PDF/X'), 'editor must not claim PDF/X compliance');
assert.ok(!source.includes('DeviceCMYK'), 'RGB raster PDF must not be mislabeled as CMYK');

console.log('print file editor integration checks passed');
