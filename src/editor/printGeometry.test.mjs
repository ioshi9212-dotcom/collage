import assert from 'node:assert/strict';
import {
  DEFAULT_BLEED_MM,
  DEFAULT_PRINT_DPI,
  DEFAULT_SAFE_MM,
  estimateEffectiveDpi,
  formatPrintSummary,
  getBookletPixelRatio,
  getPrintGuideGeometry,
  getPrintPixelGeometry,
  mmToPixels,
  normalizePrintSettings,
  pixelsToMm,
  settingsForPrintPreset,
} from './printGeometry.js';

assert.equal(mmToPixels(148, 300), 1748);
assert.equal(mmToPixels(210, 300), 2480);
assert.ok(Math.abs(pixelsToMm(1748, 300) - 148) < 0.05);

{
  const geometry = getPrintPixelGeometry({
    canvas: { width: 1480, height: 2100 },
    settings: { presetId: 'a5-portrait' },
  });
  assert.equal(geometry.printDpi, DEFAULT_PRINT_DPI);
  assert.equal(geometry.bleedMm, DEFAULT_BLEED_MM);
  assert.equal(geometry.safeMm, DEFAULT_SAFE_MM);
  assert.equal(geometry.trimWidthPx, 1748);
  assert.equal(geometry.trimHeightPx, 2480);
  assert.equal(geometry.outputWidthPx, 1819);
  assert.equal(geometry.outputHeightPx, 2551);
  assert.ok(Math.abs(geometry.renderPixelRatio - Math.max(1748 / 1480, 2480 / 2100)) < 1e-9);
  assert.equal(formatPrintSummary(geometry), '148×210 мм · 300 DPI · PNG 1819×2551 px');
}

{
  const geometry = getPrintPixelGeometry({
    canvas: { width: 1480, height: 2100 },
    settings: { presetId: 'a5-portrait', bleedMm: 3, printDpi: 300 },
    kind: 'spread',
  });
  assert.equal(geometry.pageCount, 2);
  assert.equal(geometry.trimWidthMm, 296);
  assert.equal(geometry.trimWidthPx, 3496);
  assert.equal(geometry.outputWidthPx, 3567);
  assert.equal(geometry.outputHeightPx, 2551);
}

{
  const oldA4 = normalizePrintSettings({ presetId: 'a4-portrait' }, { width: 2100, height: 2970 });
  assert.equal(oldA4.trimWidthMm, 210, 'legacy A4 projects must infer A4 physical width');
  assert.equal(oldA4.trimHeightMm, 297, 'legacy A4 projects must infer A4 physical height');
}

{
  const custom = settingsForPrintPreset({ bleedMm: 0 }, 'a4-landscape');
  assert.equal(custom.presetId, 'a4-landscape');
  assert.equal(custom.trimWidthMm, 297);
  assert.equal(custom.trimHeightMm, 210);
  assert.equal(custom.bleedMm, 0);
}

{
  const guide = getPrintGuideGeometry(
    { width: 1480, height: 2100 },
    { presetId: 'a5-portrait', safeMm: 5 },
  );
  assert.equal(Math.round(guide.safeInsetX), 50);
  assert.equal(Math.round(guide.safeInsetY), 50);
  assert.equal(Math.round(guide.safeWidth), 1380);
  assert.equal(Math.round(guide.safeHeight), 2000);
}

{
  const pixelRatio = getBookletPixelRatio(
    { width: 1480, height: 2100 },
    { presetId: 'a5-portrait', printDpi: 300 },
  );
  assert.ok(Math.abs(pixelRatio - Math.max(1748 / 1480, 2480 / 2100)) < 1e-9);
}

assert.equal(estimateEffectiveDpi({
  sourceWidth: 1748,
  sourceHeight: 2480,
  renderedWidth: 1480,
  renderedHeight: 2100,
  pixelRatio: 2480 / 2100,
  targetDpi: 300,
}), 300);

assert.equal(estimateEffectiveDpi({
  sourceWidth: 874,
  sourceHeight: 1240,
  renderedWidth: 1480,
  renderedHeight: 2100,
  pixelRatio: 2480 / 2100,
  targetDpi: 300,
}), 150);

console.log('print geometry checks passed');
