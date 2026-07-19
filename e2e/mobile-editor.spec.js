import { expect, test } from '@playwright/test';

async function openMobileEditor(page, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
  await expect(page.locator('body')).toHaveClass(/mobile-editor-ready/);
}

async function expectNoDocumentOverflow(page) {
  const geometry = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    bodyOverflow: getComputedStyle(document.body).overflow,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bodyOverflow).toBe('hidden');
}

test.describe('mobile phone editor shell', () => {
  test('keeps the canvas between the compact header, page rail and bottom tools', async ({ page }) => {
    await openMobileEditor(page);

    const header = page.locator('.app-header-v2');
    const canvas = page.locator('.canvas-area');
    const pageRail = page.locator('.page-rail');
    const tools = page.locator('.editor-tool-rail-v2');

    await expect(header).toBeVisible();
    await expect(canvas).toBeVisible();
    await expect(pageRail).toBeVisible();
    await expect(tools).toBeVisible();
    await expectNoDocumentOverflow(page);

    const boxes = await page.evaluate(() => {
      const read = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height } : null;
      };
      return {
        header: read('.app-header-v2'),
        canvas: read('.canvas-area'),
        pages: read('.page-rail'),
        tools: read('.editor-tool-rail-v2'),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    });

    expect(boxes.header.bottom).toBeLessThanOrEqual(boxes.canvas.top + 2);
    expect(boxes.canvas.bottom).toBeLessThanOrEqual(boxes.pages.top + 2);
    expect(boxes.pages.bottom).toBeLessThanOrEqual(boxes.tools.top + 2);
    expect(boxes.tools.bottom).toBeLessThanOrEqual(boxes.viewport.height + 1);
    expect(boxes.canvas.width).toBeLessThanOrEqual(boxes.viewport.width + 1);
  });

  test('opens tools and inspector as closable mobile sheets', async ({ page }) => {
    await openMobileEditor(page);

    const toolRail = page.locator('.editor-tool-rail-v2');
    await toolRail.getByRole('button', { name: 'Фото' }).click();
    await expect(page.locator('body')).toHaveClass(/mobile-left-panel-open/);
    await expect(page.locator('.editor-left-panel-v2 .mobile-sheet-close')).toBeVisible();
    await page.locator('.editor-left-panel-v2 .mobile-sheet-close').click();
    await expect(page.locator('body')).not.toHaveClass(/mobile-left-panel-open/);

    await toolRail.getByRole('button', { name: 'Текст' }).click();
    await expect(page.locator('body')).toHaveClass(/mobile-left-panel-open/);
    await expect(page.getByRole('button', { name: '+ Добавить текст' })).toBeVisible();
    await page.locator('.mobile-editor-backdrop').click({ position: { x: 8, y: 8 } });
    await expect(page.locator('body')).not.toHaveClass(/mobile-left-panel-open/);

    await page.getByRole('button', { name: 'Открыть настройки' }).click();
    await expect(page.locator('body')).toHaveClass(/mobile-inspector-open/);
    await expect(page.locator('.workspace > .album-mode-inspector .mobile-sheet-close')).toBeVisible();
    await page.locator('.workspace > .album-mode-inspector .mobile-sheet-close').click();
    await expect(page.locator('body')).not.toHaveClass(/mobile-inspector-open/);
  });

  test('uses touch-sized controls and remains usable in landscape', async ({ page }) => {
    await openMobileEditor(page, { width: 844, height: 390 });
    await expectNoDocumentOverflow(page);

    const metrics = await page.evaluate(() => {
      const tools = [...document.querySelectorAll('.editor-tool-button-v2')].map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      const header = document.querySelector('.app-header-v2')?.getBoundingClientRect();
      const canvas = document.querySelector('.canvas-area')?.getBoundingClientRect();
      return { tools, headerHeight: header?.height ?? 0, canvasHeight: canvas?.height ?? 0 };
    });

    expect(metrics.tools.length).toBeGreaterThanOrEqual(6);
    expect(metrics.tools.every((item) => item.width >= 44 && item.height >= 44)).toBe(true);
    expect(metrics.headerHeight).toBeLessThanOrEqual(72);
    expect(metrics.canvasHeight).toBeGreaterThan(120);
  });
});
