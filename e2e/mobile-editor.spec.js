import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, deviceScaleFactor: 3 });

async function openMobileEditor(page, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
  await page.waitForFunction(() => typeof window.__collageMobileLayout?.getState === 'function');
  await expect(page.locator('body')).toHaveClass(/mobile-editor-ready/);
  await expect(page.locator('.editor-tool-rail-v2 > .mobile-inspector-toggle')).toBeVisible();
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

async function readMobileLayout(page) {
  return page.evaluate(() => {
    const read = (selector) => {
      const node = document.querySelector(selector);
      const rect = node?.getBoundingClientRect();
      return rect
        ? {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            position: getComputedStyle(node).position,
          }
        : null;
    };

    const visibleButtons = [
      ...document.querySelectorAll('.app-header-v2 button, .canvas-toolbar > button, .editor-tool-rail-v2 > button'),
    ].filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0
        && rect.width > 0
        && rect.height > 0;
    });

    const overlaps = [];
    for (let leftIndex = 0; leftIndex < visibleButtons.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < visibleButtons.length; rightIndex += 1) {
        const left = visibleButtons[leftIndex].getBoundingClientRect();
        const right = visibleButtons[rightIndex].getBoundingClientRect();
        const overlapWidth = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
        const overlapHeight = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
        if (overlapWidth * overlapHeight > 1) {
          overlaps.push({
            left: visibleButtons[leftIndex].getAttribute('aria-label') || visibleButtons[leftIndex].textContent?.trim(),
            right: visibleButtons[rightIndex].getAttribute('aria-label') || visibleButtons[rightIndex].textContent?.trim(),
            area: overlapWidth * overlapHeight,
          });
        }
      }
    }

    return {
      header: read('.app-header-v2'),
      canvas: read('.canvas-area'),
      pages: read('.page-rail'),
      tools: read('.editor-tool-rail-v2'),
      settings: read('.editor-tool-rail-v2 > .mobile-inspector-toggle'),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      overlaps,
      bodySettingsButtons: document.querySelectorAll('body > .mobile-inspector-toggle').length,
      bookletButtons: document.querySelectorAll('.mobile-booklet-toggle').length,
    };
  });
}

function expectRowsSeparated(layout) {
  expect(layout.header.bottom).toBeLessThanOrEqual(layout.canvas.top + 2);
  expect(layout.canvas.bottom).toBeLessThanOrEqual(layout.pages.top + 2);
  expect(layout.pages.bottom).toBeLessThanOrEqual(layout.tools.top + 2);
  expect(layout.tools.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
  expect(layout.canvas.width).toBeLessThanOrEqual(layout.viewport.width + 1);
  expect(layout.tools.position).not.toBe('fixed');
  expect(layout.settings.top).toBeGreaterThanOrEqual(layout.tools.top - 1);
  expect(layout.settings.bottom).toBeLessThanOrEqual(layout.tools.bottom + 1);
  expect(layout.bodySettingsButtons).toBe(0);
  expect(layout.bookletButtons).toBe(0);
  expect(layout.overlaps).toEqual([]);
}

test.describe('mobile phone editor shell', () => {
  test('limits the Konva preview backing store on high-density phones', async ({ page }) => {
    await openMobileEditor(page);

    await expect(page.locator('.app-view-switch-v2').getByRole('button', { name: 'Страница', exact: true })).toHaveClass(/active/);
    await expect(page.locator('body')).not.toHaveClass(/mobile-left-panel-open|mobile-inspector-open/);

    const metrics = await page.evaluate(() => ({
      devicePixelRatio: window.devicePixelRatio,
      performance: window.__collageCanvasPerformance,
      canvasRatios: [...document.querySelectorAll('.konvajs-content canvas')].map((canvas) => {
        const cssWidth = Number.parseFloat(canvas.style.width) || canvas.width;
        const cssHeight = Number.parseFloat(canvas.style.height) || canvas.height;
        return {
          width: canvas.width / cssWidth,
          height: canvas.height / cssHeight,
        };
      }),
    }));

    expect(metrics.devicePixelRatio).toBe(3);
    expect(metrics.performance).toMatchObject({ mobileViewport: true, previewPixelRatio: 1 });
    expect(metrics.canvasRatios.length).toBeGreaterThanOrEqual(2);
    expect(metrics.canvasRatios.every((ratio) => ratio.width <= 1.01 && ratio.height <= 1.01)).toBe(true);
  });

  test('keeps header, canvas, pages and tools in separate rows', async ({ page }, testInfo) => {
    await openMobileEditor(page);
    await expectNoDocumentOverflow(page);

    const layout = await readMobileLayout(page);
    expectRowsSeparated(layout);

    await testInfo.attach('mobile-390x844', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('keeps controls separated on a narrow 360 px phone', async ({ page }, testInfo) => {
    await openMobileEditor(page, { width: 360, height: 800 });
    await expectNoDocumentOverflow(page);

    const layout = await readMobileLayout(page);
    expectRowsSeparated(layout);

    await testInfo.attach('mobile-360x800', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('opens tools and settings as closable bottom sheets', async ({ page }) => {
    await openMobileEditor(page);

    const toolRail = page.locator('.editor-tool-rail-v2');
    await toolRail.getByRole('button', { name: 'Фото', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(/mobile-left-panel-open/);
    await expect(page.locator('.editor-left-panel-v2 .mobile-sheet-close')).toBeVisible();
    await page.locator('.editor-left-panel-v2 .mobile-sheet-close').click();
    await expect(page.locator('body')).not.toHaveClass(/mobile-left-panel-open/);

    await toolRail.getByRole('button', { name: 'Текст', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(/mobile-left-panel-open/);
    await expect(page.getByRole('button', { name: '+ Обычный текст', exact: true })).toBeVisible();
    await page.locator('.mobile-editor-backdrop').click({ position: { x: 8, y: 8 } });
    await expect(page.locator('body')).not.toHaveClass(/mobile-left-panel-open/);

    await toolRail.getByRole('button', { name: 'Настройки', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(/mobile-inspector-open/);
    await expect(page.locator('.workspace > .album-mode-inspector .mobile-sheet-close')).toBeVisible();
    await page.locator('.workspace > .album-mode-inspector .mobile-sheet-close').click();
    await expect(page.locator('body')).not.toHaveClass(/mobile-inspector-open/);
  });

  test('uses touch-sized controls and remains separated in landscape', async ({ page }, testInfo) => {
    await openMobileEditor(page, { width: 844, height: 390 });
    await expectNoDocumentOverflow(page);

    const layout = await readMobileLayout(page);
    expectRowsSeparated(layout);

    const metrics = await page.evaluate(() => ({
      tools: [...document.querySelectorAll('.editor-tool-rail-v2 > button')].map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
      headerHeight: document.querySelector('.app-header-v2')?.getBoundingClientRect().height ?? 0,
      canvasHeight: document.querySelector('.canvas-area')?.getBoundingClientRect().height ?? 0,
    }));

    expect(metrics.tools.length).toBe(7);
    expect(metrics.tools.every((item) => item.width >= 44 && item.height >= 44)).toBe(true);
    expect(metrics.headerHeight).toBeLessThanOrEqual(64);
    expect(metrics.canvasHeight).toBeGreaterThan(110);

    await testInfo.attach('mobile-landscape-844x390', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
