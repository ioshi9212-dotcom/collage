import { expect, test } from '@playwright/test';

const TOOLS = [
  ['Фото', 'photos', 'standard'],
  ['Страницы', 'pages', 'standard'],
  ['Коллаж', 'collage', 'standard'],
  ['Текст', 'text', 'mode'],
  ['Рисунки', 'drawings', 'mode'],
  ['Шаблоны', 'templates', 'mode'],
];

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => (
    typeof window.__collageApp?.getProject === 'function'
    && typeof window.__collageSafety?.getState === 'function'
    && typeof window.__collageInspectorContext?.getState === 'function'
  ));
  await expect.poll(async () => {
    const box = await stageBox(page);
    return box.width > 850 && box.height > 600;
  }).toBe(true);
}

async function stageBox(page) {
  return page.locator('.stage-scale-shell').evaluate((shell) => {
    const rect = shell.getBoundingClientRect();
    return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom };
  });
}

async function selectTool(page, label, key) {
  await page.locator(`.editor-tool-button-v2[aria-label="${label}"]`).click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.activeEditorTool)).toBe(key);
  await expect(page.locator('.editor-tool-button-v2.active')).toHaveCount(1);
  await expect(page.locator(`.editor-tool-button-v2[aria-label="${label}"]`)).toHaveClass(/active/);
}

test.describe('complete editor regression smoke', () => {
  test('keeps one stable shell while every tool is opened', async ({ page }) => {
    await openEditor(page);

    await expect(page.locator('.primary-save-v2')).toHaveCount(1);
    await expect(page.locator('.album-bar')).toHaveCount(0);
    await expect(page.locator('.album-tool-panel')).toHaveCount(0);
    await expect(page.locator('.album-mode-sidebar')).toHaveCount(0);

    const reference = await stageBox(page);

    for (const [label, key, inspectorKind] of TOOLS) {
      await selectTool(page, label, key);

      await expect.poll(async () => {
        const current = await stageBox(page);
        return Math.abs(current.width - reference.width) <= 4
          && Math.abs(current.height - reference.height) <= 4;
      }, { message: `${label}: preview geometry changed` }).toBe(true);

      if (inspectorKind === 'standard') {
        await expect(page.locator('.editor-workspace-v2 > .inspector')).toBeVisible();
        await expect(page.locator('.editor-workspace-v2 > .album-mode-inspector')).toBeHidden();
      } else {
        await expect(page.locator('.editor-workspace-v2 > .album-mode-inspector')).toBeVisible();
        await expect(page.locator('.editor-workspace-v2 > .inspector')).toBeHidden();
      }
    }

    const railGeometry = await page.locator('.page-rail').evaluate((rail) => {
      const rect = rail.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight };
    });
    expect(Math.abs(railGeometry.bottom - railGeometry.viewport)).toBeLessThanOrEqual(2);
    expect(railGeometry.top).toBeGreaterThan(reference.bottom);
  });

  test('does not restore duplicated controls while tools change', async ({ page }) => {
    await openEditor(page);

    await selectTool(page, 'Коллаж', 'collage');
    await expect(page.getByRole('button', { name: 'Перестроить рамки', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Убрать все фото со страницы', exact: true })).toHaveCount(1);

    await selectTool(page, 'Страницы', 'pages');
    const viewSwitch = page.getByLabel('Режим просмотра');
    await expect(viewSwitch.getByRole('button', { name: 'Страница', exact: true })).toHaveCount(1);
    await expect(viewSwitch.getByRole('button', { name: 'Разворот', exact: true })).toHaveCount(1);
    await expect(viewSwitch.getByRole('button', { name: 'Брошюра', exact: true })).toHaveCount(1);

    await selectTool(page, 'Шаблоны', 'templates');
    await expect(page.getByRole('button', { name: 'Сохранить альбом как шаблон', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Сохранить страницу как шаблон', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Сохранить разворот как шаблон', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Загрузить шаблон JSON', exact: true })).toHaveCount(1);
  });

  test('preserves added text after leaving the text tool', async ({ page }) => {
    await openEditor(page);
    await selectTool(page, 'Текст', 'text');
    await page.getByRole('button', { name: '+ Обычный текст', exact: true }).click();
    await expect(page.locator('.album-mode-inspector textarea')).toHaveValue('Новый текст');

    await selectTool(page, 'Фото', 'photos');
    await expect(page.getByRole('heading', { name: 'Настройки текста' })).toHaveCount(0);

    const textCount = await page.evaluate(() => {
      const project = window.__collageApp.getProject();
      const index = project.pages.findIndex((item) => item.id === project.currentPageId);
      return project.extraLayers?.pages?.[String(index + 1)]?.texts?.length || 0;
    });
    expect(textCount).toBe(1);
  });
});
