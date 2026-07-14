import { expect, test } from '@playwright/test';

async function waitForBookletEditor(page) {
  await page.addInitScript(() => {
    window.__capturedBookletPdfs = [];
    const capturedPdfBlobs = new Map();
    let sequence = 0;
    const nativeClick = HTMLAnchorElement.prototype.click;
    const nativeCreateObjectUrl = URL.createObjectURL.bind(URL);
    const nativeRevokeObjectUrl = URL.revokeObjectURL.bind(URL);

    URL.createObjectURL = (blob) => {
      if (blob?.type === 'application/pdf') {
        sequence += 1;
        const url = `blob:captured-booklet-pdf-${sequence}`;
        capturedPdfBlobs.set(url, blob);
        return url;
      }
      return nativeCreateObjectUrl(blob);
    };

    URL.revokeObjectURL = (url) => {
      if (capturedPdfBlobs.has(url)) return;
      nativeRevokeObjectUrl(url);
    };

    HTMLAnchorElement.prototype.click = function captureBookletPdf() {
      if (this.download?.endsWith('.pdf') && capturedPdfBlobs.has(this.href)) {
        window.__capturedBookletPdfs.push({ filename: this.download, blob: capturedPdfBlobs.get(this.href) });
        return;
      }
      nativeClick.call(this);
    };
  });

  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
  await page.getByRole('button', { name: 'Брошюра' }).click();
  await expect(page.getByRole('button', { name: 'PDF лицевых A4' })).toBeVisible();
}

async function capturePdf(page, buttonName) {
  const before = await page.evaluate(() => window.__capturedBookletPdfs.length);
  await page.getByRole('button', { name: buttonName }).click();
  await expect.poll(
    () => page.evaluate(() => window.__capturedBookletPdfs.length),
    { timeout: 180_000 },
  ).toBe(before + 1);

  return page.evaluate(async (index) => {
    const item = window.__capturedBookletPdfs[index];
    const bytes = new Uint8Array(await item.blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    return {
      filename: item.filename,
      size: bytes.length,
      header: text.slice(0, 8),
      pageCount: (text.match(/\/Type \/Page\b/g) || []).length,
      mediaBoxes: [...text.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((match) => match[1]),
      trimBoxes: [...text.matchAll(/\/TrimBox \[([^\]]+)\]/g)].map((match) => match[1]),
      xmpDpi: text.match(/<collage:PrintDPI>([^<]+)<\/collage:PrintDPI>/)?.[1] || null,
      xmpBleed: text.match(/<collage:BleedMM>([^<]+)<\/collage:BleedMM>/)?.[1] || null,
      xmpPageCount: text.match(/<collage:PageCount>([^<]+)<\/collage:PageCount>/)?.[1] || null,
      startXrefValid: (() => {
        const match = text.match(/startxref\n(\d+)\n%%EOF/);
        return Boolean(match && text.slice(Number(match[1]), Number(match[1]) + 4) === 'xref');
      })(),
    };
  }, before);
}

function expectExactA4(pdf, expectedPageCount) {
  expect(pdf.header).toBe('%PDF-1.4');
  expect(pdf.pageCount).toBe(expectedPageCount);
  expect(pdf.mediaBoxes).toHaveLength(expectedPageCount);
  expect(pdf.trimBoxes).toHaveLength(expectedPageCount);
  expect(pdf.mediaBoxes.every((box) => box === '0 0 841.8898 595.2756')).toBe(true);
  expect(pdf.trimBoxes.every((box) => box === '0 0 841.8898 595.2756')).toBe(true);
  expect(pdf.xmpDpi).toBe('300');
  expect(pdf.xmpBleed).toBe('0');
  expect(pdf.xmpPageCount).toBe(String(expectedPageCount));
  expect(pdf.startXrefValid).toBe(true);
  expect(pdf.size).toBeGreaterThan(1000);
}

test.describe('A4 folded booklet home printing', () => {
  test('exports exact A4 fronts, backs, complete booklet and first-sheet test', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForBookletEditor(page);
    await page.getByLabel('Листов в блоке').selectOption('1');

    const project = await page.evaluate(() => window.__collageApp.getProject());
    const sheetCount = Math.ceil(project.pages.length / 4);

    await expect(page.locator('.booklet-export-summary')).toContainText('A4 горизонтально 297×210 мм');
    await expect(page.locator('.booklet-export-summary')).toContainText('половина листа 148,5×210 мм');
    await expect(page.locator('.booklet-export-summary')).toContainText('3508×2480 px');

    const fronts = await capturePdf(page, 'PDF лицевых A4');
    expect(fronts.filename).toBe(`booklet-a4-${project.pages.length}-pages-fronts.pdf`);
    expectExactA4(fronts, sheetCount);

    const backs = await capturePdf(page, 'PDF оборотов A4');
    expect(backs.filename).toBe(`booklet-a4-${project.pages.length}-pages-backs.pdf`);
    expectExactA4(backs, sheetCount);

    const complete = await capturePdf(page, 'PDF вся брошюра A4');
    expect(complete.filename).toBe(`booklet-a4-${project.pages.length}-pages-complete.pdf`);
    expectExactA4(complete, sheetCount * 2);

    const duplexTest = await capturePdf(page, 'Тест первого листа');
    expect(duplexTest.filename).toBe(`booklet-a4-${project.pages.length}-pages-duplex-test.pdf`);
    expectExactA4(duplexTest, 2);
  });

  test('manual duplex settings are saved in the project without changing pages', async ({ page }) => {
    await waitForBookletEditor(page);
    const pageIdsBefore = await page.evaluate(() => window.__collageApp.getProject().pages.map((item) => item.id));

    await page.getByLabel('Порядок оборотов').selectOption('same');
    await page.getByLabel('Развернуть обороты на 180°').check();
    await page.getByLabel('Толщина бумаги, мм').fill('0.15');
    await page.getByLabel('Толщина бумаги, мм').blur();

    const project = await page.evaluate(() => window.__collageApp.getProject());
    expect(project.bookletPrintSettings).toMatchObject({
      backOrder: 'same',
      rotateBack180: true,
      paperThicknessMm: 0.15,
    });
    expect(project.pages.map((item) => item.id)).toEqual(pageIdsBefore);
  });
});
