import { expect, test } from '@playwright/test';

async function openMobileEditor(page, { width = 390, height = 844 } = {}) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
  await page.waitForFunction(() => typeof window.__collageMobileResponsive?.getState === 'function');
  await expect.poll(() => page.evaluate(() => window.__collageMobileResponsive.getState())).toMatchObject({
    mobile: true,
    panel: '',
  });
}

test.describe('mobile responsive editor', () => {
  test('keeps canvas, page rail and tool rail inside a phone viewport', async ({ page }) => {
    await openMobileEditor(page);

    await expect(page.getByRole('button', { name: 'Страница', exact: true })).toHaveClass(/active/);
    await expect(page.locator('.mobile-inspector-trigger')).toBeVisible();

    const layout = await page.evaluate(() => {
      const workspace = document.querySelector('.editor-workspace-v2');
      const canvas = document.querySelector('.canvas-area');
      const pageRail = document.querySelector('.page-rail');
      const toolRail = document.querySelector('.editor-tool-rail-v2');
      const inspector = document.querySelector('.editor-workspace-v2 > .inspector');
      const leftPanel = document.querySelector('.editor-left-panel-v2');
      const rect = (node) => node?.getBoundingClientRect();

      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        workspaceDisplay: getComputedStyle(workspace).display,
        canvas: rect(canvas),
        pages: rect(pageRail),
        tools: rect(toolRail),
        inspectorPosition: getComputedStyle(inspector).position,
        inspectorVisibility: getComputedStyle(inspector).visibility,
        leftVisibility: getComputedStyle(leftPanel).visibility,
      };
    });

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.workspaceDisplay).toBe('grid');
    expect(layout.canvas.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.canvas.bottom).toBeLessThanOrEqual(layout.pages.top + 1);
    expect(layout.pages.bottom).toBeLessThanOrEqual(layout.tools.top + 1);
    expect(layout.tools.bottom).toBeLessThanOrEqual(845);
    expect(layout.inspectorPosition).toBe('fixed');
    expect(layout.inspectorVisibility).toBe('hidden');
    expect(layout.leftVisibility).toBe('hidden');
  });

  test('opens tools and settings as closable bottom sheets', async ({ page }) => {
    await openMobileEditor(page);

    await page.getByRole('button', { name: 'Фото', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.mobilePanel)).toBe('tools');
    await expect(page.locator('.editor-left-panel-v2')).toBeVisible();
    await expect(page.locator('.mobile-sheet-close')).toBeVisible();

    await page.locator('.mobile-editor-backdrop').click({ position: { x: 8, y: 8 } });
    await expect.poll(() => page.evaluate(() => document.body.dataset.mobilePanel || '')).toBe('');

    await page.locator('.mobile-inspector-trigger').click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.mobilePanel)).toBe('inspector');
    await expect(page.locator('.editor-workspace-v2 > .inspector')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.body.dataset.mobilePanel || '')).toBe('');
  });

  test('moves from text tools directly to the text inspector', async ({ page }) => {
    await openMobileEditor(page);

    await page.getByRole('button', { name: 'Текст', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.mobilePanel)).toBe('tools');
    await expect(page.getByRole('button', { name: '+ Заголовок', exact: true })).toBeVisible();

    await page.getByRole('button', { name: '+ Заголовок', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.mobilePanel)).toBe('inspector');
    await expect(page.getByText('Настройки текста', { exact: true })).toBeVisible();
    await expect(page.locator('.album-mode-inspector textarea')).toHaveValue('Заголовок');
  });
});
