import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
}

test.describe('editor shell stage 4C larger canvas', () => {
  test('gives more width to the working canvas without clipping the preview', async ({ page }) => {
    await openEditor(page);

    const geometry = await page.evaluate(() => {
      const left = document.querySelector('.editor-left-panel-v2')?.getBoundingClientRect();
      const canvas = document.querySelector('.canvas-area')?.getBoundingClientRect();
      const inspector = document.querySelector('.editor-workspace-v2 > .inspector:not([hidden])')?.getBoundingClientRect()
        || document.querySelector('.editor-workspace-v2 > .album-mode-inspector:not([hidden])')?.getBoundingClientRect();
      const stage = document.querySelector('.stage-frame')?.getBoundingClientRect();
      return {
        leftWidth: left?.width || 0,
        canvasWidth: canvas?.width || 0,
        inspectorWidth: inspector?.width || 0,
        stageLeft: stage?.left || 0,
        stageRight: stage?.right || 0,
        canvasLeft: canvas?.left || 0,
        canvasRight: canvas?.right || 0,
      };
    });

    expect(geometry.leftWidth).toBeLessThanOrEqual(226);
    expect(geometry.inspectorWidth).toBeLessThanOrEqual(266);
    expect(geometry.canvasWidth).toBeGreaterThanOrEqual(1080);
    expect(geometry.stageLeft).toBeGreaterThanOrEqual(geometry.canvasLeft - 1);
    expect(geometry.stageRight).toBeLessThanOrEqual(geometry.canvasRight + 1);
  });

  test('keeps the same enlarged workspace in every editor tool', async ({ page }) => {
    await openEditor(page);

    for (const name of ['Фото', 'Страницы', 'Коллаж', 'Текст', 'Рисунки', 'Шаблоны']) {
      await page.locator(`.editor-tool-button-v2[aria-label="${name}"]`).click();
      await expect(page.locator('.canvas-area')).toBeVisible();
      const width = await page.locator('.canvas-area').evaluate((node) => node.getBoundingClientRect().width);
      expect(width).toBeGreaterThanOrEqual(1080);
    }
  });
});
