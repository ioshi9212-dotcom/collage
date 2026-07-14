import { expect, test } from '@playwright/test';

async function waitForEditor(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
}

async function openBooklet(page) {
  await page.getByRole('button', { name: 'Брошюра' }).click();
  await expect(page.locator('.booklet-canvas-area')).toBeVisible();
}

async function ensurePageCount(page, targetCount) {
  let pageCount = await page.evaluate(() => window.__collageApp.getProject().pages.length);
  while (pageCount < targetCount) {
    await page.getByRole('button', { name: '+ Страница', exact: true }).click();
    pageCount += 1;
  }
  await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().pages.length)).toBe(targetCount);
}

function pageCard(page, pageNumber) {
  return page.locator('.page-rail-card').filter({
    has: page.locator('.page-rail-card-top b', { hasText: new RegExp(`^${pageNumber}$`) }),
  });
}

test.describe('booklet pair preview', () => {
  test('clicking page 2 keeps both page 2 and its printed neighbour 7 active', async ({ page }) => {
    await page.setViewportSize({ width: 1640, height: 900 });
    await waitForEditor(page);
    await ensurePageCount(page, 8);
    await openBooklet(page);
    await page.getByLabel('Листов в блоке').selectOption('2');

    await pageCard(page, 2).click();

    const page2 = pageCard(page, 2);
    const page7 = pageCard(page, 7);
    await expect(page2).toHaveClass(/booklet-visible-rail-card/);
    await expect(page7).toHaveClass(/booklet-visible-rail-card/);
    await expect(page2).toHaveClass(/current-page-rail-card/);
    await expect(page7).toHaveClass(/current-page-rail-card/);
    await expect(page2).toContainText('рядом 7');
    await expect(page7).toContainText('рядом 2');
  });

  test('booklet canvas fits inside its frame without internal scrollbars', async ({ page }) => {
    await page.setViewportSize({ width: 1640, height: 900 });
    await waitForEditor(page);
    await openBooklet(page);

    await expect.poll(async () => page.locator('.stage-frame').evaluate((frame) => {
      const shell = frame.querySelector('.stage-scale-shell');
      if (!shell) return false;
      const frameRect = frame.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      const style = getComputedStyle(frame);
      return style.overflow === 'hidden'
        && shellRect.width <= frameRect.width + 1
        && shellRect.height <= frameRect.height + 1;
    })).toBe(true);
  });
});
