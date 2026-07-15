import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
}

async function measureShell(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        display: style.display,
        visibility: style.visibility,
      };
    };

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      left: box('.editor-left-panel-v2'),
      canvas: box('.canvas-area'),
      pageRail: box('.page-rail'),
      regularInspector: box('.editor-workspace-v2 > .inspector'),
      modeInspector: box('.editor-workspace-v2 > .album-mode-inspector'),
      legacyModeSidebar: box('.editor-workspace-v2 > .album-mode-sidebar'),
    };
  });
}

function expectStableColumns(actual, baseline) {
  expect(Math.abs(actual.left.x - baseline.left.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.left.width - baseline.left.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.canvas.x - baseline.canvas.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.canvas.width - baseline.canvas.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.pageRail.x - baseline.pageRail.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.pageRail.width - baseline.pageRail.width)).toBeLessThanOrEqual(1);
}

test.describe('stage 1 editor structure', () => {
  test('keeps one left panel, one inspector column and a bottom page rail in every tool mode', async ({ page }) => {
    await openEditor(page);

    const rail = page.locator('.editor-tool-rail-v2');
    const modes = [
      { name: 'Фото', heading: 'Фото', contextual: false },
      { name: 'Страницы', heading: 'Страницы', contextual: false },
      { name: 'Коллаж', heading: 'Коллаж', contextual: false },
      { name: 'Текст', heading: 'Текст', contextual: true, inspectorHeading: 'Настройки текста' },
      { name: 'Рисунки', heading: 'Рисунки', contextual: true, inspectorHeading: 'Настройки линии' },
      { name: 'Шаблоны', heading: 'Мои шаблоны', contextual: true, inspectorHeading: 'Использовать шаблон' },
    ];

    await rail.getByRole('button', { name: 'Фото', exact: true }).click();
    const baseline = await measureShell(page);

    for (const mode of modes) {
      await rail.getByRole('button', { name: mode.name, exact: true }).click();
      await expect(page.locator('.editor-left-panel-v2 h2').first()).toHaveText(mode.heading);
      await expect(page.locator('.editor-workspace-v2 > .album-mode-sidebar')).toBeHidden();

      if (mode.contextual) {
        await expect(page.locator('.editor-workspace-v2 > .inspector')).toBeHidden();
        await expect(page.locator('.editor-workspace-v2 > .album-mode-inspector')).toBeVisible();
        await expect(page.locator('.editor-workspace-v2 > .album-mode-inspector h2').first()).toHaveText(mode.inspectorHeading);
      } else {
        await expect(page.locator('.editor-workspace-v2 > .inspector')).toBeVisible();
        await expect(page.locator('.editor-workspace-v2 > .album-mode-inspector')).toBeHidden();
      }

      const shell = await measureShell(page);
      expect(shell.documentWidth).toBeLessThanOrEqual(shell.viewportWidth);
      expect(shell.pageRail.bottom).toBe(shell.viewportHeight);
      expect(Math.abs(shell.canvas.bottom - shell.pageRail.y)).toBeLessThanOrEqual(1);
      expect(shell.left.right).toBeLessThanOrEqual(shell.canvas.x + 1);

      const visibleInspector = mode.contextual ? shell.modeInspector : shell.regularInspector;
      expect(visibleInspector.x).toBeGreaterThanOrEqual(shell.canvas.right - 1);
      expect(visibleInspector.bottom).toBe(shell.viewportHeight);
      expect(shell.legacyModeSidebar.display).toBe('none');
      expectStableColumns(shell, baseline);
    }
  });
});
