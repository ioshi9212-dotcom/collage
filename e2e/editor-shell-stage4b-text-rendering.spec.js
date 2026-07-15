import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => (
    typeof window.__collageApp?.getProject === 'function'
    && typeof window.__collageTextEditing?.getState === 'function'
  ));
}

async function selectTextTool(page) {
  await page.locator('.editor-tool-button-v2[aria-label="Текст"]').click();
}

async function currentPageTexts(page) {
  return page.evaluate(() => {
    const data = window.__collageApp.getProject();
    const currentIndex = data.pages.findIndex((item) => item.id === data.currentPageId);
    return data.extraLayers?.pages?.[String(currentIndex + 1)]?.texts || [];
  });
}

test.describe('editor shell stage 4B text rendering', () => {
  test('uses a safe Cyrillic-capable font for ordinary text', async ({ page }) => {
    await openEditor(page);
    await selectTextTool(page);
    await page.getByRole('button', { name: '+ Обычный текст', exact: true }).click();

    await expect.poll(async () => (await currentPageTexts(page))[0]?.fontId).toBe('system');
    await expect.poll(async () => (await currentPageTexts(page))[0]?.fontFamily).toContain('Arial');
    await expect(page.locator('.album-mode-inspector textarea')).toHaveValue('Новый текст');

    const state = await page.evaluate(() => window.__collageTextEditing.getState());
    expect(state.hasStage).toBe(true);
    expect(state.hasSelectedText).toBe(true);
    expect(state.hasTransformer).toBe(true);
    expect(state.pixelRatio).toBeGreaterThanOrEqual(1.5);
    expect(state.fontId).toBe('system');
  });

  test('persists width changed through the selected-text handles', async ({ page }) => {
    await openEditor(page);
    await selectTextTool(page);
    await page.getByRole('button', { name: '+ Обычный текст', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__collageTextEditing.getState().hasTransformer)).toBe(true);

    const committed = await page.evaluate(() => window.__collageTextEditing.resizeSelectedText(860));
    expect(committed).toBe(true);

    await expect.poll(async () => Math.round((await currentPageTexts(page))[0]?.width || 0)).toBe(860);
    await expect(page.locator('.album-mode-inspector label.field').filter({ hasText: 'Ширина' }).locator('input')).toHaveValue('860');
    await expect.poll(() => page.evaluate(() => window.__collageTextEditing.getState().width)).toBe(860);
  });

  test('keeps title presets on their intended display font', async ({ page }) => {
    await openEditor(page);
    await selectTextTool(page);
    await page.getByRole('button', { name: '+ Заголовок', exact: true }).click();

    await expect.poll(async () => (await currentPageTexts(page))[0]?.fontId).toBe('caslon');
    await expect(page.locator('.album-mode-inspector textarea')).toHaveValue('Заголовок');
    await expect.poll(() => page.evaluate(() => window.__collageTextEditing.getState().fontId)).toBe('caslon');
    await expect.poll(() => page.evaluate(() => window.__collageTextEditing.getState().hasTransformer)).toBe(true);
  });
});
