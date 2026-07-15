import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => (
    typeof window.__collageApp?.getProject === 'function'
    && typeof window.__collageSafety?.getState === 'function'
  ));
}

async function selectTool(page, name) {
  await page.locator(`.editor-tool-button-v2[aria-label="${name}"]`).click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.activeEditorTool)).toBe({
    Фото: 'photos',
    Страницы: 'pages',
    Коллаж: 'collage',
    Шаблоны: 'templates',
  }[name]);
}

async function pageCount(page) {
  return page.evaluate(() => window.__collageApp.getProject().pages.length);
}

test.describe('editor shell stage 5 safety and labels', () => {
  test('uses explicit labels for opening, templates, and page photo clearing', async ({ page }) => {
    await openEditor(page);

    await expect(page.getByRole('button', { name: 'Открыть последнее сохранение', exact: true })).toBeVisible();

    await selectTool(page, 'Коллаж');
    const clearPagePhotos = page.getByRole('button', { name: 'Убрать все фото со страницы', exact: true });
    await expect(clearPagePhotos).toBeVisible();
    await expect(clearPagePhotos).toBeDisabled();
    await expect(clearPagePhotos).toHaveAttribute('title', 'На текущей странице нет фотографий');

    await selectTool(page, 'Шаблоны');
    await expect(page.getByRole('button', { name: 'Сохранить альбом как шаблон', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сохранить страницу как шаблон', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сохранить разворот как шаблон', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Загрузить шаблон JSON', exact: true })).toBeVisible();
  });

  test('cancelling page deletion leaves the album unchanged', async ({ page }) => {
    await openEditor(page);
    await selectTool(page, 'Страницы');

    const before = await pageCount(page);
    expect(before).toBeGreaterThan(1);

    let message = '';
    page.once('dialog', async (dialog) => {
      message = dialog.message();
      await dialog.dismiss();
    });

    await page.getByRole('button', { name: 'Удалить страницу', exact: true }).click();

    await expect.poll(() => pageCount(page)).toBe(before);
    expect(message).toContain('Удалить страницу');
    expect(message).toContain('Отменить это действие пока нельзя');
  });

  test('confirmed page deletion runs the original editor action once', async ({ page }) => {
    await openEditor(page);
    await selectTool(page, 'Страницы');

    const before = await pageCount(page);
    page.once('dialog', async (dialog) => dialog.accept());

    await page.getByRole('button', { name: 'Удалить страницу', exact: true }).click();

    await expect.poll(() => pageCount(page)).toBe(before - 1);
  });
});
