import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
}

test.describe('editor shell v2', () => {
  test('shows compact header, tool rail, canvas, inspector and bottom page strip', async ({ page }) => {
    await openEditor(page);

    await expect(page.locator('.app-header-v2')).toBeVisible();
    await expect(page.locator('.editor-tool-rail-v2')).toBeVisible();
    await expect(page.locator('.canvas-area')).toBeVisible();
    await expect(page.locator('.inspector')).toBeVisible();
    await expect(page.locator('.page-rail')).toBeVisible();

    const canvasBox = await page.locator('.canvas-area').boundingBox();
    const pagesBox = await page.locator('.page-rail').boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(pagesBox).not.toBeNull();
    expect(pagesBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height - 2);
  });

  test('switches contextual left tools and page inspector without changing project pages', async ({ page }) => {
    await openEditor(page);
    const pageIdsBefore = await page.evaluate(() => window.__collageApp.getProject().pages.map((item) => item.id));

    await page.locator('.editor-tool-rail-v2').getByRole('button', { name: 'Коллаж' }).click();
    await expect(page.locator('.editor-left-panel-v2 h2')).toHaveText('Коллаж');
    await expect(page.getByLabel('Фото-окон').first()).toBeVisible();

    await page.locator('.editor-tool-rail-v2').getByRole('button', { name: 'Фото' }).click();
    await expect(page.locator('.editor-left-panel-v2 h2')).toHaveText('Фото');

    await page.locator('.inspector-tab-v2[data-tab="page"]').click();
    await expect(page.locator('.page-settings-panel-v2')).toBeVisible();
    await page.locator('.print-settings-details-v2 > summary').click();
    await expect(page.getByLabel('DPI')).toBeVisible();

    const pageIdsAfter = await page.evaluate(() => window.__collageApp.getProject().pages.map((item) => item.id));
    expect(pageIdsAfter).toEqual(pageIdsBefore);
  });

  test('opens a stable export popover with existing print actions', async ({ page }) => {
    await openEditor(page);

    const trigger = page.getByRole('button', { name: 'Экспорт ▾' });
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.export-popover-v2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'PNG страницы' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'PDF альбома' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Скачать JSON' })).toBeVisible();

    await trigger.click();
    await expect(page.locator('.export-popover-v2')).toHaveCount(0);
  });
});
