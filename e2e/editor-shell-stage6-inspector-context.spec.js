import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => (
    typeof window.__collageApp?.getProject === 'function'
    && typeof window.__collageInspectorContext?.getState === 'function'
  ));
}

async function selectTool(page, name, key) {
  await page.locator(`.editor-tool-button-v2[aria-label="${name}"]`).click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.activeEditorTool)).toBe(key);
}

async function inspectorState(page) {
  return page.evaluate(() => window.__collageInspectorContext.getState());
}

async function clickFirstFrame(page) {
  const point = await page.evaluate(() => {
    const project = window.__collageApp.getProject();
    const pageData = project.pages.find((item) => item.id === project.currentPageId) || project.pages[0];
    const frame = pageData.frames[0];
    const shell = document.querySelector('.stage-scale-shell').getBoundingClientRect();
    const scale = shell.width / project.canvas.width;
    return {
      x: shell.left + (frame.x + frame.width / 2) * scale,
      y: shell.top + (frame.y + frame.height / 2) * scale,
    };
  });
  await page.mouse.click(point.x, point.y);
}

test.describe('editor shell stage 6 contextual inspector', () => {
  test('opens page settings for Photo, Pages, and an unselected Collage', async ({ page }) => {
    await openEditor(page);

    for (const [name, key] of [['Фото', 'photos'], ['Страницы', 'pages'], ['Коллаж', 'collage']]) {
      await selectTool(page, name, key);
      await expect.poll(async () => (await inspectorState(page)).activeTab).toBe('page');
      await expect.poll(async () => (await inspectorState(page)).objectAvailable).toBe(false);
      await expect(page.locator('.editor-workspace-v2 > .inspector .inspector-tab-v2[data-tab="page"]')).toHaveClass(/active/);
      await expect(page.locator('.editor-workspace-v2 > .inspector .inspector-tab-v2[data-tab="object"]')).toBeDisabled();
      await expect(page.getByRole('heading', { name: 'Настройки окна' })).toHaveCount(0);
    }
  });

  test('opens object settings only after a frame is selected', async ({ page }) => {
    await openEditor(page);
    await page.getByLabel('Режим просмотра').getByRole('button', { name: 'Страница', exact: true }).click();
    await selectTool(page, 'Коллаж', 'collage');

    await clickFirstFrame(page);

    await expect.poll(async () => (await inspectorState(page)).activeTab).toBe('object');
    await expect.poll(async () => (await inspectorState(page)).objectAvailable).toBe(true);
    await expect(page.getByRole('heading', { name: 'Настройки окна' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Удалить окно', exact: true })).toBeVisible();

    const duplicatedBlock = page.locator('.editor-workspace-v2 > .inspector .page-only-controls-duplicate');
    await expect(duplicatedBlock).toBeHidden();
    await expect.poll(async () => (await inspectorState(page)).duplicatedPageControlsVisible).toBe(false);
  });

  test('returns to page settings when the current page changes', async ({ page }) => {
    await openEditor(page);
    await page.getByLabel('Режим просмотра').getByRole('button', { name: 'Страница', exact: true }).click();
    await selectTool(page, 'Коллаж', 'collage');
    await clickFirstFrame(page);
    await expect.poll(async () => (await inspectorState(page)).activeTab).toBe('object');

    await page.locator('.page-rail-card').nth(1).click();

    await expect.poll(async () => (await inspectorState(page)).activeTab).toBe('page');
    await expect.poll(async () => (await inspectorState(page)).objectAvailable).toBe(false);
    await expect(page.locator('.editor-workspace-v2 > .inspector .inspector-tab-v2[data-tab="object"]')).toBeDisabled();
  });

  test('does not interfere with the dedicated text inspector', async ({ page }) => {
    await openEditor(page);
    await selectTool(page, 'Текст', 'text');

    await expect(page.locator('.editor-workspace-v2 > .album-mode-inspector')).toBeVisible();
    await expect(page.locator('.editor-workspace-v2 > .inspector')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Настройки текста' })).toBeVisible();
  });
});
