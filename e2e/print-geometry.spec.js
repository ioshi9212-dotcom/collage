import { expect, test } from '@playwright/test';

async function waitForEditor(page) {
  await page.addInitScript(() => {
    window.__capturedPrintDownloads = [];
    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function capturePrintDownload() {
      if (this.download && this.href.startsWith('data:image/png')) {
        window.__capturedPrintDownloads.push({ filename: this.download, href: this.href });
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
  return page.evaluate((index) => {
    const item = window.__capturedPrintDownloads[index];
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ filename: item.filename, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('captured print PNG could not be decoded'));
      image.src = item.href;
    });
  }, before);
}

test.describe('physical print export', () => {
  test('A5 page and spread have exact 300 DPI dimensions with 3 mm bleed', async ({ page }) => {
    await waitForEditor(page);

    await expect(page.locator('.print-summary')).toContainText('148×210 мм');
    await expect(page.locator('.print-summary')).toContainText('300 DPI');
    await expect(page.locator('.print-summary')).toContainText('PNG 1819×2551 px');

    const pagePng = await capturePng(page, 'PNG страницы');
    expect(pagePng.filename).toMatch(/^collage-page-\d+\.png$/);
    expect(pagePng).toMatchObject({ width: 1819, height: 2551 });

    const spreadPng = await capturePng(page, 'PNG разворота');
    expect(spreadPng.filename).toMatch(/^collage-spread-\d+-\d+\.png$/);
    expect(spreadPng).toMatchObject({ width: 3567, height: 2551 });
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
