import { expect, test } from '@playwright/test';

async function openEditor(page, { storedMode } = {}) {
  await page.setViewportSize({ width: 1640, height: 900 });
  if (storedMode) {
    await page.addInitScript((mode) => {
      localStorage.setItem('collage-album-editor-mode', mode);
    }, storedMode);
  }
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
  await expect(page.locator('.editor-tool-rail-v2')).toBeVisible();
}

async function selectTool(page, name) {
  await page.locator(`.editor-tool-button-v2[aria-label="${name}"]`).click();
}

async function project(page) {
  return page.evaluate(() => window.__collageApp.getProject());
}

test.describe('editor shell stage 4A text state', () => {
  test('uses the highlighted tool as the authoritative mode on startup', async ({ page }) => {
    await openEditor(page, { storedMode: 'text' });

    const photoTool = page.locator('.editor-tool-button-v2[aria-label="Фото"]');
    await expect(photoTool).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => document.body.dataset.albumMode)).toBe('collage');
    await expect.poll(() => page.evaluate(() => document.body.dataset.activeEditorTool)).toBe('photos');

    await expect(page.getByRole('heading', { name: 'Настройки текста' })).toHaveCount(0);
    await expect(page.locator('.editor-workspace-v2 > .inspector')).toBeVisible();
    await expect(page.locator('.editor-workspace-v2 > .album-mode-inspector')).toBeHidden();
  });

  test('does not leave the text inspector beside Photo, Pages, or Collage', async ({ page }) => {
    await openEditor(page);

    await selectTool(page, 'Текст');
    await page.getByRole('button', { name: '+ Обычный текст', exact: true }).click();
    await expect(page.locator('.album-mode-inspector textarea')).toBeVisible();

    for (const name of ['Фото', 'Страницы', 'Коллаж']) {
      await selectTool(page, name);
      await expect.poll(() => page.evaluate(() => document.body.dataset.albumMode)).toBe('collage');
      await expect(page.getByRole('heading', { name: 'Настройки текста' })).toHaveCount(0);
      await expect(page.locator('.editor-workspace-v2 > .inspector')).toBeVisible();
      await expect(page.locator('.editor-workspace-v2 > .album-mode-inspector')).toBeHidden();
    }
  });

  test('clears a selected text when the current page changes', async ({ page }) => {
    await openEditor(page);

    await selectTool(page, 'Текст');
    await page.getByRole('button', { name: '+ Обычный текст', exact: true }).click();
    await expect(page.locator('.album-mode-inspector textarea')).toHaveValue('Новый текст');

    const before = await project(page);
    const secondPageId = before.pages[1].id;
    await page.locator('.page-rail-card').nth(1).click();

    await expect.poll(async () => (await project(page)).currentPageId).toBe(secondPageId);
    await expect(page.locator('.album-mode-inspector textarea')).toHaveCount(0);
    await expect(page.locator('.album-mode-inspector')).toContainText('Выбери текст на странице или слева');
    await expect(page.locator('.editor-tool-button-v2[aria-label="Текст"]')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => document.body.dataset.albumMode)).toBe('text');
  });

  test('activates the right page when its text is selected in a spread', async ({ page }) => {
    await openEditor(page);

    const initial = await project(page);
    const firstPageId = initial.pages[0].id;
    const secondPageId = initial.pages[1].id;

    await page.locator('.page-rail-card').nth(1).click();
    await selectTool(page, 'Текст');
    await page.getByRole('button', { name: '+ Обычный текст', exact: true }).click();
    await expect(page.locator('.album-mode-inspector textarea')).toHaveValue('Новый текст');

    await page.locator('.page-rail-card').first().click();
    await expect.poll(async () => (await project(page)).currentPageId).toBe(firstPageId);
    await expect(page.locator('.album-mode-inspector textarea')).toHaveCount(0);

    const clickPoint = await page.evaluate(() => {
      const shell = document.querySelector('.stage-scale-shell');
      const data = window.__collageApp.getProject();
      const rect = shell.getBoundingClientRect();
      const realWidth = data.canvas.width * 2 + 90;
      const scale = rect.width / realWidth;
      return {
        x: rect.left + (data.canvas.width + 90 + data.canvas.width * 0.12 + 24) * scale,
        y: rect.top + (data.canvas.height * 0.12 + 24) * scale,
      };
    });

    await page.mouse.click(clickPoint.x, clickPoint.y);

    await expect(page.locator('.album-mode-inspector textarea')).toHaveValue('Новый текст');
    await expect.poll(async () => (await project(page)).currentPageId).toBe(secondPageId);
    await expect(page.locator('.page-rail-card').nth(1)).toHaveClass(/current-page-rail-card/);
    await expect(page.locator('.editor-left-panel-v2 .layer-card')).toHaveCount(1);
  });
});
