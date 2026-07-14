import assert from 'node:assert/strict';
import {
  addPngDensityMetadata,
  buildRasterPrintPdf,
  mmToPdfPoints,
  readPngDensityMetadata,
} from './printFiles.js';

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=';
const TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const A5_GEOMETRY = {
  printDpi: 300,
  bleedMm: 3,
  trimWidthMm: 148,
  trimHeightMm: 210,
  fullWidthMm: 154,
  fullHeightMm: 216,
  outputWidthPx: 1819,
  outputHeightPx: 2551,
};

assert.ok(Math.abs(mmToPdfPoints(25.4) - 72) < 1e-9);

{
  const tagged = addPngDensityMetadata(ONE_PIXEL_PNG, 300);
  const density = readPngDensityMetadata(tagged);
  assert.equal(density.unit, 1);
  assert.equal(density.pixelsPerMeterX, 11811);
  assert.equal(density.pixelsPerMeterY, 11811);
  assert.ok(Math.abs(density.dpiX - 300) < 0.02);

  const retagged = addPngDensityMetadata(tagged, 254);
  const replacement = readPngDensityMetadata(retagged);
  assert.equal(replacement.pixelsPerMeterX, 10000, 'existing pHYs must be replaced instead of duplicated');
  assert.ok(Math.abs(replacement.dpiX - 254) < 0.001);
}

{
  const createdAt = new Date('2026-07-14T00:00:00.000Z');
  const bytes = buildRasterPrintPdf({
    pages: [
      { jpegBytes: TINY_JPEG, widthPx: 1819, heightPx: 2551, geometry: A5_GEOMETRY },
      { jpegBytes: TINY_JPEG, widthPx: 1819, heightPx: 2551, geometry: A5_GEOMETRY },
    ],
    metadata: {
      title: 'Тестовый альбом',
      subject: 'A5 с вылетом',
      creator: 'Collage Creator',
      producer: 'Collage Creator tests',
      keywords: ['A5', 'печать'],
      createdAt,
    },
  });
  const text = new TextDecoder('latin1').decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.endsWith('%%EOF\n'));
  assert.equal((text.match(/\/Type \/Page\b/g) || []).length, 2);
  assert.ok(text.includes('/Count 2'));
  assert.ok(text.includes('/ViewerPreferences << /PrintScaling /None /PickTrayByPDFSize true >>'));
  assert.ok(text.includes('/MediaBox [0 0 436.5354 612.2835]'));
  assert.ok(text.includes('/BleedBox [0 0 436.5354 612.2835]'));
  assert.ok(text.includes('/TrimBox [8.5039 8.5039 428.0315 603.7795]'));
  assert.ok(text.includes('/ArtBox [8.5039 8.5039 428.0315 603.7795]'));
  assert.ok(text.includes('<collage:PageCount>2</collage:PageCount>'));
  assert.ok(text.includes('<collage:PrintDPI>300</collage:PrintDPI>'));
  assert.ok(text.includes('<collage:BleedMM>3</collage:BleedMM>'));
  assert.ok(text.includes('<collage:ColorSpace>RGB</collage:ColorSpace>'));
  assert.ok(text.includes('/CreationDate (D:20260714000000Z)'));

  const startXrefMatch = text.match(/startxref\n(\d+)\n%%EOF/);
  assert.ok(startXrefMatch);
  const xrefOffset = Number(startXrefMatch[1]);
  assert.equal(text.slice(xrefOffset, xrefOffset + 4), 'xref', 'startxref must point to the xref table');
}

assert.throws(() => buildRasterPrintPdf({ pages: [] }), /Нет страниц/);
assert.throws(() => buildRasterPrintPdf({
  pages: [{ jpegBytes: new Uint8Array([1, 2, 3, 4]), geometry: A5_GEOMETRY }],
}), /JPEG не найден/);

console.log('print PDF and PNG metadata checks passed');
