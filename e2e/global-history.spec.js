import { expect, test } from '@playwright/test';
import { openEditor } from './helpers.mjs';

async function project(page) {
  return page.evaluate(() => structuredClone(window.__collageApp.getProject()));
}

test('global undo and redo cover page and layout changes', async ({ page }) => {
  await openEditor(page);

  const initial = await project(page);
  const initialPageCount = initial.pages.length;
  const initialPadding = initial.settings.padding;

  await page.locator('.page-rail-add-v3').click();
  await expect.poll(async () => (await project(page)).pages.length).toBe(initialPageCount + 1);

  const undo = page.getByRole('button', { name: 'Отменить', exact: true });
  const redo = page.getByRole('button', { name: 'Вернуть', exact: true });
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect.poll(async () => (await project(page)).pages.length).toBe(initialPageCount);
  await expect(redo).toBeEnabled();

  await redo.click();
  await expect.poll(async () => (await project(page)).pages.length).toBe(initialPageCount + 1);

  await page.locator('.editor-tool-button-v2[aria-label="Коллаж"]').click();
  const paddingField = page.locator('label.field').filter({ hasText: 'Поля макета' }).first().locator('input');
  await paddingField.fill(String(initialPadding + 25));
  await paddingField.blur();

  await expect.poll(async () => (await project(page)).settings.padding).toBe(initialPadding + 25);
  await undo.click();
  await expect.poll(async () => (await project(page)).settings.padding).toBe(initialPadding);
  await redo.click();
  await expect.poll(async () => (await project(page)).settings.padding).toBe(initialPadding + 25);

  await expect(page.getByRole('button', { name: 'Подогнать окна к полям', exact: true }).first()).toBeVisible();
});
