import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
}

function toolRail(page) {
  return page.locator('.editor-tool-rail-v2');
}

test.describe('editor shell stage 2 control deduplication', () => {
  test('keeps view switching in the header and page actions in the Pages tool', async ({ page }) => {
    await openEditor(page);

    await expect(page.locator('.album-bar')).toBeHidden();
    await expect(page.locator('.album-tool-panel')).toBeHidden();
    await expect(page.locator('.album-mode-sidebar')).toBeHidden();

    const headerSwitch = page.locator('.app-view-switch-v2');
    await expect(headerSwitch.getByRole('button', { name: 'Страница', exact: true })).toBeVisible();
    await expect(headerSwitch.getByRole('button', { name: 'Разворот', exact: true })).toBeVisible();
    await expect(headerSwitch.getByRole('button', { name: 'Брошюра', exact: true })).toBeVisible();

    await toolRail(page).getByRole('button', { name: 'Страницы', exact: true }).click();
    const leftPanel = page.locator('.editor-left-panel-v2');
    await expect(leftPanel.getByRole('button', { name: 'Страница', exact: true })).toHaveCount(0);
    await expect(leftPanel.getByRole('button', { name: 'Разворот', exact: true })).toHaveCount(0);
    await expect(leftPanel.getByRole('button', { name: 'Брошюра', exact: true })).toHaveCount(0);

    const before = await page.evaluate(() => window.__collageApp.getProject().pages.length);
    await leftPanel.getByRole('button', { name: '+ Страница', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().pages.length)).toBe(before + 1);
  });

  test('shows rebuild and clear-photo actions only inside the Collage tool', async ({ page }) => {
    await openEditor(page);
    await toolRail(page).getByRole('button', { name: 'Коллаж', exact: true }).click();

    const leftPanel = page.locator('.editor-left-panel-v2');
    await expect(leftPanel.getByRole('button', { name: 'Перестроить рамки', exact: true })).toBeVisible();
    await expect(leftPanel.getByRole('button', { name: 'Очистить фото', exact: true })).toBeVisible();

    await expect(page.locator('.canvas-toolbar').getByRole('button', { name: 'Перестроить рамки', exact: true })).toHaveCount(0);
    await expect(page.locator('.canvas-toolbar').getByRole('button', { name: 'Очистить фото', exact: true })).toHaveCount(0);

    await expect(leftPanel.getByRole('button', { name: 'Сохранить страницу', exact: true })).toHaveCount(0);
    await expect(leftPanel.getByRole('button', { name: 'Сохранить разворот', exact: true })).toHaveCount(0);
    await expect(leftPanel.getByRole('button', { name: 'Сохранить альбом', exact: true })).toHaveCount(0);
  });

  test('shows one complete template action set without legacy duplicates', async ({ page }) => {
    await openEditor(page);
    await toolRail(page).getByRole('button', { name: 'Шаблоны', exact: true }).click();

    const leftPanel = page.locator('.editor-left-panel-v2');
    await expect(leftPanel.getByRole('button', { name: 'Сохранить весь альбом', exact: true })).toHaveCount(1);
    await expect(leftPanel.getByRole('button', { name: 'Сохранить страницу', exact: true })).toHaveCount(1);
    await expect(leftPanel.getByRole('button', { name: 'Сохранить разворот', exact: true })).toHaveCount(1);
    await expect(leftPanel.getByRole('button', { name: 'Загрузить JSON', exact: true })).toHaveCount(1);

    await expect(leftPanel.getByRole('button', { name: 'Сохранить альбом как шаблон', exact: true })).toHaveCount(0);
    await expect(leftPanel.getByRole('button', { name: 'Загрузить шаблон JSON', exact: true })).toHaveCount(0);
    await expect(page.locator('.album-mode-sidebar')).toBeHidden();
  });
});
