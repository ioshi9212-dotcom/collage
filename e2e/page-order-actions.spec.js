import { expect, test } from '@playwright/test';
import { openEditor } from './helpers.mjs';

async function project(page) {
  return page.evaluate(() => structuredClone(window.__collageApp.getProject()));
}

test('page order actions move and swap the selected page by number', async ({ page }) => {
  await openEditor(page);
  await page.locator('.page-rail-add-v3').click();
  await page.locator('.page-rail-add-v3').click();
  await page.locator('.page-rail-add-v3').click();

  await expect.poll(async () => (await project(page)).pages.length).toBe(5);
  await page.locator('.editor-tool-button-v2[aria-label="Страницы"]').click();

  const beforeMove = await project(page);
  const selectedId = beforeMove.currentPageId;
  const selectedIndex = beforeMove.pages.findIndex((item) => item.id === selectedId);
  expect(selectedIndex).toBeGreaterThan(0);

  page.once('dialog', (dialog) => dialog.accept('1'));
  await page.getByRole('button', { name: 'Переместить на позицию…', exact: true }).click();

  await expect.poll(async () => {
    const next = await project(page);
    return { firstId: next.pages[0]?.id, currentPageId: next.currentPageId };
  }).toEqual({ firstId: selectedId, currentPageId: selectedId });

  const afterMove = await project(page);
  const targetId = afterMove.pages[2].id;
  page.once('dialog', (dialog) => dialog.accept('3'));
  await page.getByRole('button', { name: 'Поменять местами с…', exact: true }).click();

  await expect.poll(async () => {
    const next = await project(page);
    return { firstId: next.pages[0]?.id, thirdId: next.pages[2]?.id, currentPageId: next.currentPageId };
  }).toEqual({ firstId: targetId, thirdId: selectedId, currentPageId: selectedId });

  const finalProject = await project(page);
  expect(finalProject.pages).toHaveLength(5);
  expect(new Set(finalProject.pages.map((item) => item.id)).size).toBe(5);
  expect(finalProject.pages.map((item) => item.title)).toEqual(['Страница 1', 'Страница 2', 'Страница 3', 'Страница 4', 'Страница 5']);
});
