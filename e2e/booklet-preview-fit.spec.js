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

async function readStageSize(page) {
  return page.locator('.stage-scale-shell').evaluate((shell) => {
    const rect = shell.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
}

async function expectStablePageSwitches(page, pageNumbers) {
  const baseline = await expect.poll(async () => {
    const size = await readStageSize(page);
    return size.width > 200 && size.height > 350 ? size : null;
  }).not.toBeNull();
  const reference = await readStageSize(page);

  for (const pageNumber of pageNumbers) {
    await pageCard(page, pageNumber).click();
    for (const delay of [0, 80, 180]) {
      if (delay) await page.waitForTimeout(delay);
      const size = await readStageSize(page);
      expect(Math.abs(size.width - reference.width), `page ${pageNumber} width changed after ${delay} ms`).toBeLessThanOrEqual(3);
      expect(Math.abs(size.height - reference.height), `page ${pageNumber} height changed after ${delay} ms`).toBeLessThanOrEqual(3);
    }
  }

  expect(baseline).toBeTruthy();
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

  test('preview scale stays stable while pages change in every view mode', async ({ page }) => {
    await page.setViewportSize({ width: 1640, height: 900 });
    await waitForEditor(page);
    await ensurePageCount(page, 8);

    await page.getByRole('button', { name: 'Страница', exact: true }).click();
    await expectStablePageSwitches(page, [1, 8, 3, 6, 2, 7]);

    await page.getByRole('button', { name: 'Разворот', exact: true }).click();
    await expectStablePageSwitches(page, [1, 8, 3, 6, 2, 7]);

    await openBooklet(page);
    await page.getByLabel('Листов в блоке').selectOption('2');
    await expectStablePageSwitches(page, [2, 7, 1, 8, 4, 5]);
  });
});
