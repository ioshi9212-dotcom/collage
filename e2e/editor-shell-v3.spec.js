import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
}

test.describe('editor shell v3', () => {
  test('editor is fixed to the viewport and old top controls are removed', async ({ page }) => {
    await openEditor(page);
    await expect(page.locator('.app-header-v2')).toBeVisible();
    await expect(page.locator('.album-bar')).toBeHidden();
    await expect.poll(() => page.evaluate(() => ({
      bodyOverflow: getComputedStyle(document.body).overflow,
      rootHeight: document.querySelector('.app-shell')?.getBoundingClientRect().height,
      viewport: window.innerHeight,
      pageBottom: document.querySelector('.page-rail')?.getBoundingClientRect().bottom,
    }))).toMatchObject({ bodyOverflow: 'hidden', rootHeight: 900, viewport: 900, pageBottom: 900 });
  });

  test('text tools insert and immediately select editable text', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Текст', exact: true }).click();
    await expect(page.getByRole('button', { name: '+ Обычный текст' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Заголовок' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Подпись' })).toBeVisible();
    await page.getByRole('button', { name: '+ Обычный текст' }).click();
    await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().extraLayers?.pages?.['1']?.texts?.length || 0)).toBe(1);
    await expect(page.getByText('Настройки текста', { exact: true })).toBeVisible();
    await expect(page.locator('.album-mode-inspector textarea')).toHaveValue('Новый текст');
  });

  test('drawing tools insert horizontal and vertical lines with live inspector', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Рисунки', exact: true }).click();
    await expect(page.getByRole('button', { name: '+ Горизонтальная линия' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Вертикальная линия' })).toBeVisible();
    await page.getByRole('button', { name: '+ Горизонтальная линия' }).click();
    await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().extraLayers?.pages?.['1']?.drawings?.[0]?.angle)).toBe(0);
    await expect(page.getByText('Настройки линии', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '+ Вертикальная линия' }).click();
    await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().extraLayers?.pages?.['1']?.drawings?.[1]?.angle)).toBe(90);
  });

  test('booklet settings live in the page inspector instead of the old top stack', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Брошюра', exact: true }).click();
    await expect(page.locator('.inspector-tab-v2[data-tab="page"]')).toHaveClass(/active/);
    await expect(page.getByRole('heading', { name: 'Настройки брошюры', exact: true })).toBeVisible();
    await expect(page.getByLabel('Листов в блоке')).toBeVisible();
    await expect(page.locator('.booklet-summary-card')).toContainText('A4 горизонтально 297×210 мм');
  });
});
