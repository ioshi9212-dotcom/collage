import { expect, test } from '@playwright/test';
import { openEditor } from './helpers.mjs';

async function currentPage(page) {
  return page.evaluate(() => {
    const project = window.__collageApp.getProject();
    return structuredClone(project.pages.find((item) => item.id === project.currentPageId));
  });
}

async function clickFrame(page, frameId) {
  const frame = await page.evaluate((id) => {
    const project = window.__collageApp.getProject();
    const active = project.pages.find((item) => item.id === project.currentPageId);
    return structuredClone(active.frames.find((item) => item.id === id));
  }, frameId);
  const shell = page.locator('.stage-scale-shell');
  const geometry = await shell.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const realWidth = Number.parseFloat(node.style.width) || rect.width;
    return { left: rect.left, top: rect.top, scale: rect.width / realWidth };
  });
  await page.mouse.click(
    geometry.left + (frame.x + Math.min(30, frame.width / 2)) * geometry.scale,
    geometry.top + (frame.y + Math.min(30, frame.height / 2)) * geometry.scale,
  );
}

async function setSelectedFrameGeometry(page, values) {
  const inputs = page.locator('.editor-workspace-v2 > .inspector .geometry-grid input');
  await expect(inputs).toHaveCount(4);
  for (const [index, value] of values.entries()) {
    await inputs.nth(index).fill(String(value));
    await inputs.nth(index).press('Enter');
  }
}

test('free-mode add and delete preserve every existing frame geometry', async ({ page }) => {
  await openEditor(page);
  await page.locator('.app-view-switch-v2').getByRole('button', { name: 'Страница', exact: true }).click();
  await page.locator('.editor-tool-button-v2[aria-label="Коллаж"]').click();

  const initial = await currentPage(page);
  await clickFrame(page, initial.frames[0].id);
  await setSelectedFrameGeometry(page, [123, 234, 456, 567]);

  const edited = await currentPage(page);
  expect(edited.frames[0]).toMatchObject({ x: 123, y: 234, width: 456, height: 567 });
  const preservedBeforeAdd = structuredClone(edited.frames);

  await page.getByRole('button', { name: '+ Добавить окно', exact: true }).click();
  const afterAdd = await currentPage(page);
  expect(afterAdd.frames).toHaveLength(preservedBeforeAdd.length + 1);
  expect(afterAdd.frames.slice(0, preservedBeforeAdd.length)).toEqual(preservedBeforeAdd);
  expect(afterAdd.frames.at(-1).photo).toBeNull();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Удалить окно', exact: true }).click();
  const afterDelete = await currentPage(page);
  expect(afterDelete.frames).toEqual(preservedBeforeAdd);
  expect(afterDelete.frames[0]).toMatchObject({ x: 123, y: 234, width: 456, height: 567 });
});
