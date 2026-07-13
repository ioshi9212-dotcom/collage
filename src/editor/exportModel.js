export function waitForExportFonts(fonts = document.fonts) {
  return Promise.resolve(fonts?.ready).catch(() => null);
}

export function buildPngExportOptions(pixelRatio, mimeType = 'image/png') {
  return { pixelRatio, mimeType };
}

export function bookletSideFilename(sideData) {
  if (!sideData) return 'booklet-side.png';
  const pad = (value) => String(value).padStart(2, '0');
  return `booklet-block-${pad(sideData.blockNumber)}-sheet-${pad(sideData.sheetNumber)}-${sideData.side}.png`;
}

export function canExportBooklet(plan) {
  return Boolean(plan?.sides?.length);
}

export function buildBookletExportSummary(plan, sheetsPerBlock) {
  return {
    pages: plan?.pageCount ?? 0,
    blocks: plan?.blockCount ?? 0,
    sheets: (plan?.blockCount ?? 0) * sheetsPerBlock,
    sides: plan?.sides?.length ?? 0,
    blanks: plan?.blankPageCount ?? 0,
  };
}
