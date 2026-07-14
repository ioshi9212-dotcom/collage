import { expect, test } from '@playwright/test';

async function waitForEditor(page) {
  await page.addInitScript(() => {
    window.__capturedPrintDownloads = [];
    window.__capturedPdfDownloads = [];
    const capturedPdfBlobs = new Map();
    let pdfSequence = 0;
    const nativeClick = HTMLAnchorElement.prototype.click;
    const nativeCreateObjectUrl = URL.createObjectURL.bind(URL);
    const nativeRevokeObjectUrl = URL.revokeObjectURL.bind(URL);

    URL.createObjectURL = (blob) => {
      if (blob?.type === 'application/pdf') {
        pdfSequence += 1;
        const url = `blob:collage-captured-pdf-${pdfSequence}`;
        capturedPdfBlobs.set(url, blob);
        return url;
      }
      return nativeCreateObjectUrl(blob);
    };

    URL.revokeObjectURL = (url) => {
      if (capturedPdfBlobs.has(url)) return;
      nativeRevokeObjectUrl(url);
    };

    HTMLAnchorElement.prototype.click = function capturePrintDownload() {
      if (this.download && this.href.startsWith('data:image/png')) {
        window.__capturedPrintDownloads.push({ filename: this.download, href: this.href });
        return;
      }
      if (this.download?.endsWith('.pdf') && capturedPdfBlobs.has(this.href)) {
        window.__capturedPdfDownloads.push({ filename: this.download, blob: capturedPdfBlobs.get(this.href) });
        return;
      }
      nativeClick.call(this);
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
  await expect(page.getByRole('button', { name: 'PNG страницы' })).toBeVisible();
}

async function capturePng(page, buttonName) {
  const before = await page.evaluate(() => window.__capturedPrintDownloads.length);
  await page.getByRole('button', { name: buttonName }).click();
  await expect.poll(() => page.evaluate(() => window.__capturedPrintDownloads.length)).toBe(before + 1);
  return page.evaluate(async (index) => {
    const item = window.__capturedPrintDownloads[index];
    const imageInfo = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('captured print PNG could not be decoded'));
      image.src = item.href;
    });
    const bytes = new Uint8Array(await (await fetch(item.href)).arrayBuffer());
    const readUint32 = (offset) => (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    let offset = 8;
    let density = null;
    while (offset + 12 <= bytes.length) {
      const length = readUint32(offset);
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (type === 'pHYs') {
        const pixelsPerMeterX = readUint32(offset + 8);
        const unit = bytes[offset + 16];
        density = { pixelsPerMeterX, unit, dpiX: unit === 1 ? pixelsPerMeterX * 0.0254 : null };
        break;
      }
      offset += 12 + length;
    }
    return { filename: item.filename, ...imageInfo, density };
  }, before);
}

async function capturePdf(page, buttonName) {
  const before = await page.evaluate(() => window.__capturedPdfDownloads.length);
  await page.getByRole('button', { name: buttonName }).click();
  await expect.poll(() => page.evaluate(() => window.__capturedPdfDownloads.length), { timeout: 120_000 }).toBe(before + 1);
  return page.evaluate(async (index) => {
    const item = window.__capturedPdfDownloads[index];
    const bytes = new Uint8Array(await item.blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    return {
      filename: item.filename,
      size: bytes.length,
      header: text.slice(0, 8),
      pageCount: (text.match(/\/Type \/Page\b/g) || []).length,
      mediaBoxes: [...text.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((match) => match[1]),
      trimBoxes: [...text.matchAll(/\/TrimBox \[([^\]]+)\]/g)].map((match) => match[1]),
      bleedBoxes: [...text.matchAll(/\/BleedBox \[([^\]]+)\]/g)].map((match) => match[1]),
      hasPrintScalingNone: text.includes('/PrintScaling /None'),
      xmpDpi: text.match(/<collage:PrintDPI>([^<]+)<\/collage:PrintDPI>/)?.[1] || null,
      xmpBleed: text.match(/<collage:BleedMM>([^<]+)<\/collage:BleedMM>/)?.[1] || null,
      xmpPageCount: text.match(/<collage:PageCount>([^<]+)<\/collage:PageCount>/)?.[1] || null,
      xmpColorSpace: text.match(/<collage:ColorSpace>([^<]+)<\/collage:ColorSpace>/)?.[1] || null,
      startXrefValid: (() => {
        const match = text.match(/startxref\n(\d+)\n%%EOF/);
        return Boolean(match && text.slice(Number(match[1]), Number(match[1]) + 4) === 'xref');
      })(),
    };
  }, before);
}

test.describe('physical print export', () => {
  test('A5 page and spread have exact 300 DPI dimensions with 3 mm bleed and embedded density', async ({ page }) => {
    await waitForEditor(page);

    await expect(page.locator('.print-summary')).toContainText('148×210 мм');
    await expect(page.locator('.print-summary')).toContainText('300 DPI');
    await expect(page.locator('.print-summary')).toContainText('PNG 1819×2551 px');

    const pagePng = await capturePng(page, 'PNG страницы');
    expect(pagePng.filename).toMatch(/^collage-page-\d+\.png$/);
    expect(pagePng).toMatchObject({ width: 1819, height: 2551 });
    expect(pagePng.density).toMatchObject({ pixelsPerMeterX: 11811, unit: 1 });
    expect(pagePng.density.dpiX).toBeCloseTo(300, 1);

    const spreadPng = await capturePng(page, 'PNG разворота');
    expect(spreadPng.filename).toMatch(/^collage-spread-\d+-\d+\.png$/);
    expect(spreadPng).toMatchObject({ width: 3567, height: 2551 });
    expect(spreadPng.density.dpiX).toBeCloseTo(300, 1);
  });

  test('page and spread PDFs contain physical boxes, XMP print metadata and valid xref', async ({ page }) => {
    await waitForEditor(page);

    const pagePdf = await capturePdf(page, 'PDF страницы');
    expect(pagePdf.filename).toMatch(/^collage-page-\d+\.pdf$/);
    expect(pagePdf.header).toBe('%PDF-1.4');
    expect(pagePdf.pageCount).toBe(1);
    expect(pagePdf.mediaBoxes).toContain('0 0 436.5354 612.2835');
    expect(pagePdf.bleedBoxes).toContain('0 0 436.5354 612.2835');
    expect(pagePdf.trimBoxes).toContain('8.5039 8.5039 428.0315 603.7795');
    expect(pagePdf).toMatchObject({ hasPrintScalingNone: true, xmpDpi: '300', xmpBleed: '3', xmpPageCount: '1', xmpColorSpace: 'RGB', startXrefValid: true });
    expect(pagePdf.size).toBeGreaterThan(1000);

    const spreadPdf = await capturePdf(page, 'PDF разворота');
    expect(spreadPdf.filename).toMatch(/^collage-spread-\d+-\d+\.pdf$/);
    expect(spreadPdf.pageCount).toBe(1);
    expect(spreadPdf.mediaBoxes).toContain('0 0 856.063 612.2835');
    expect(spreadPdf.trimBoxes).toContain('8.5039 8.5039 847.5591 603.7795');
    expect(spreadPdf.startXrefValid).toBe(true);
  });

  test('album PDF contains one physically sized PDF page per project page', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForEditor(page);
    const expectedPages = await page.evaluate(() => window.__collageApp.getProject().pages.length);

    const albumPdf = await capturePdf(page, 'PDF альбома');
    expect(albumPdf.filename).toBe(`collage-album-${expectedPages}-pages.pdf`);
    expect(albumPdf.pageCount).toBe(expectedPages);
    expect(albumPdf.mediaBoxes).toHaveLength(expectedPages);
    expect(albumPdf.trimBoxes).toHaveLength(expectedPages);
    expect(albumPdf.xmpPageCount).toBe(String(expectedPages));
    expect(albumPdf.startXrefValid).toBe(true);
  });

  test('physical settings update print pixels without rebuilding frames', async ({ page }) => {
    await waitForEditor(page);
    const frameIdsBefore = await page.evaluate(() => (
      window.__collageApp.getProject().pages.flatMap((pageData) => pageData.frames.map((frame) => frame.id))
    ));

    await page.getByLabel('DPI').selectOption('254');
    await page.getByLabel('Вылет мм').fill('0');
    await page.getByLabel('Вылет мм').blur();

    await expect(page.locator('.print-summary')).toContainText('254 DPI');
    await expect(page.locator('.print-summary')).toContainText('PNG 1480×2100 px');

    const frameIdsAfter = await page.evaluate(() => (
      window.__collageApp.getProject().pages.flatMap((pageData) => pageData.frames.map((frame) => frame.id))
    ));
    expect(frameIdsAfter).toEqual(frameIdsBefore);
  });
});
