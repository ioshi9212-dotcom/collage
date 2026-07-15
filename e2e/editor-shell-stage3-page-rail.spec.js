import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
}

async function pageCount(page) {
  return page.evaluate(() => window.__collageApp.getProject().pages.length);
}

test.describe('editor shell stage 3 page rail', () => {
  test('shows a complete add-page button beside the page cards', async ({ page }) => {
    await openEditor(page);

    const rail = page.locator('.page-rail');
    const header = page.locator('.page-rail-header-row');
    const addPage = page.locator('.page-rail-add-v3');
    const list = page.locator('.page-rail-list');

    await expect(rail).toBeVisible();
    await expect(addPage).toBeVisible();
    await expect(addPage).toHaveText('+ Страница');

    const geometry = await page.evaluate(() => {
      const railNode = document.querySelector('.page-rail');
      const headerNode = document.querySelector('.page-rail-header-row');
      const buttonNode = document.querySelector('.page-rail-add-v3');
      const listNode = document.querySelector('.page-rail-list');
      const buttonRect = buttonNode.getBoundingClientRect();
      const headerRect = headerNode.getBoundingClientRect();
      const listRect = listNode.getBoundingClientRect();
      const railRect = railNode.getBoundingClientRect();
      return {
        buttonWidth: buttonRect.width,
        buttonClientWidth: buttonNode.clientWidth,
        buttonScrollWidth: buttonNode.scrollWidth,
        headerRight: headerRect.right,
        listLeft: listRect.left,
        railBottom: railRect.bottom,
        viewportHeight: window.innerHeight,
      };
    });

    expect(geometry.buttonWidth).toBeGreaterThanOrEqual(92);
    expect(geometry.buttonScrollWidth).toBeLessThanOrEqual(geometry.buttonClientWidth);
    expect(geometry.listLeft).toBeGreaterThanOrEqual(geometry.headerRight - 1);
    expect(Math.abs(geometry.railBottom - geometry.viewportHeight)).toBeLessThanOrEqual(2);

    await expect(header).toBeVisible();
    await expect(list).toBeVisible();
  });

  test('keeps single-page view after adding a normal or blank page', async ({ page }) => {
    await openEditor(page);

    const viewSwitch = page.getByLabel('Режим просмотра');
    const single = viewSwitch.getByRole('button', { name: 'Страница', exact: true });
    await single.click();
    await expect(single).toHaveClass(/active/);

    const beforeNormal = await pageCount(page);
    await page.locator('.page-rail-add-v3').click();
    await expect.poll(() => pageCount(page)).toBe(beforeNormal + 1);
    await expect(single).toHaveClass(/active/);

    await page.getByRole('button', { name: 'Страницы', exact: true }).click();
    const beforeBlank = await pageCount(page);
    await page.getByRole('button', { name: '+ Пустая страница', exact: true }).click();
    await expect.poll(() => pageCount(page)).toBe(beforeBlank + 1);
    await expect(single).toHaveClass(/active/);
  });

  test('scrolls only the card list and keeps the current page visible', async ({ page }) => {
    await openEditor(page);

    const single = page.getByLabel('Режим просмотра').getByRole('button', { name: 'Страница', exact: true });
    await single.click();

    for (let index = 0; index < 12; index += 1) {
      const before = await pageCount(page);
      await page.locator('.page-rail-add-v3').click();
      await expect.poll(() => pageCount(page)).toBe(before + 1);
      await expect(single).toHaveClass(/active/);
    }

    await expect.poll(() => page.evaluate(() => {
      const list = document.querySelector('.page-rail-list');
      const current = list?.querySelector('.current-page-rail-card');
      if (!list || !current) return false;
      const listRect = list.getBoundingClientRect();
      const currentRect = current.getBoundingClientRect();
      return currentRect.left >= listRect.left - 2 && currentRect.right <= listRect.right + 2;
    })).toBe(true);

    const overflow = await page.evaluate(() => {
      const list = document.querySelector('.page-rail-list');
      return {
        listScrollable: list.scrollWidth > list.clientWidth,
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });

    expect(overflow.listScrollable).toBe(true);
    expect(overflow.documentOverflow).toBeLessThanOrEqual(1);
  });
});
