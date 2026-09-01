import { expect, test } from '@playwright/test';
import { openEditor, TINY_PNG_DATA_URL } from './helpers.mjs';

async function currentPage(page) {
  return page.evaluate(() => {
    const project = window.__collageApp.getProject();
    return structuredClone(project.pages.find((item) => item.id === project.currentPageId));
  });
}

async function stageGeometry(page) {
  return page.locator('.stage-scale-shell').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const realWidth = Number.parseFloat(node.style.width) || rect.width;
    return { left: rect.left, top: rect.top, scale: rect.width / realWidth };
  });
}

async function framePoint(page, frame) {
  const geometry = await stageGeometry(page);
  return {
    x: geometry.left + (frame.x + Math.min(60, frame.width / 2)) * geometry.scale,
    y: geometry.top + (frame.y + Math.min(60, frame.height / 2)) * geometry.scale,
    scale: geometry.scale,
  };
}

async function clickFrame(page, frame) {
  const point = await framePoint(page, frame);
  await page.mouse.click(point.x, point.y);
}

async function rightClickFrame(page, frame) {
  const point = await framePoint(page, frame);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.locator('[data-frame-context-menu="true"]')).toBeVisible();
}

async function dragFrameBy(page, frame, dx, dy) {
  const point = await framePoint(page, frame);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + dx * point.scale, point.y + dy * point.scale, { steps: 8 });
  await page.mouse.up();
}

async function seedFramePhotos(page) {
  await page.evaluate(async (src) => {
    const project = structuredClone(window.__collageApp.getProject());
    const targetPage = project.pages.find((item) => item.id === project.currentPageId) || project.pages[0];
    if (!targetPage?.frames?.[2]) throw new Error('Need at least three frames for context-menu test');
    targetPage.frames[0].photo = { id: 'ctx-photo-a', name: 'alpha.png', src, zoom: 1, offsetX: 0, offsetY: 0 };
    targetPage.frames[1].photo = { id: 'ctx-photo-b', name: 'beta.png', src, zoom: 1, offsetX: 0, offsetY: 0 };
    targetPage.frames[2].photo = null;
    await window.__collageApp.openProject(project);
  }, TINY_PNG_DATA_URL);
  await page.waitForFunction(() => {
    const project = window.__collageApp.getProject();
    const current = project.pages.find((item) => item.id === project.currentPageId);
    return current?.frames?.[0]?.photo?.id === 'ctx-photo-a' && current?.frames?.[1]?.photo?.id === 'ctx-photo-b';
  });
}

async function openPageCollageMode(page) {
  await page.locator('.app-view-switch-v2').getByRole('button', { name: 'Страница', exact: true }).click();
  await page.locator('.editor-tool-button-v2[aria-label="Коллаж"]').click();
}

test('photo frame does not move until move-frame-with-photo mode is enabled', async ({ page }) => {
  await openEditor(page);
  await openPageCollageMode(page);
  await seedFramePhotos(page);

  const snapButton = page.getByRole('button', { name: 'Умная привязка', exact: true });
  if (await snapButton.evaluate((node) => node.classList.contains('active-mode'))) await snapButton.click();

  let projectPage = await currentPage(page);
  const original = projectPage.frames[0];
  await clickFrame(page, original);
  await dragFrameBy(page, original, 90, 60);

  await expect.poll(async () => {
    const next = await currentPage(page);
    const frame = next.frames.find((item) => item.id === original.id);
    return { x: frame.x, y: frame.y };
  }).toEqual({ x: original.x, y: original.y });

  await page.getByRole('button', { name: 'Двигать рамку с фото', exact: true }).click();
  projectPage = await currentPage(page);
  const beforeMove = projectPage.frames.find((item) => item.id === original.id);
  await dragFrameBy(page, beforeMove, 90, 60);

  await expect.poll(async () => {
    const next = await currentPage(page);
    const frame = next.frames.find((item) => item.id === original.id);
    return Math.abs(frame.x - (beforeMove.x + 90)) <= 3 && Math.abs(frame.y - (beforeMove.y + 60)) <= 3;
  }).toBe(true);
});

test('right click can copy cut paste and swap photos between frames', async ({ page }) => {
  await openEditor(page);
  await openPageCollageMode(page);
  await seedFramePhotos(page);

  let projectPage = await currentPage(page);
  await rightClickFrame(page, projectPage.frames[0]);
  await page.getByRole('menuitem', { name: 'Копировать фото', exact: true }).click();

  projectPage = await currentPage(page);
  await rightClickFrame(page, projectPage.frames[2]);
  await page.getByRole('menuitem', { name: 'Вставить фото', exact: true }).click();
  await expect.poll(async () => (await currentPage(page)).frames[2].photo?.id).toBe('ctx-photo-a');

  projectPage = await currentPage(page);
  await rightClickFrame(page, projectPage.frames[0]);
  await page.getByRole('menuitem', { name: 'Поменять местами…', exact: true }).click();
  projectPage = await currentPage(page);
  await rightClickFrame(page, projectPage.frames[1]);
  await page.getByRole('menuitem', { name: 'Поменять местами', exact: true }).click();

  await expect.poll(async () => {
    const next = await currentPage(page);
    return [next.frames[0].photo?.id ?? null, next.frames[1].photo?.id ?? null];
  }).toEqual(['ctx-photo-b', 'ctx-photo-a']);

  projectPage = await currentPage(page);
  await rightClickFrame(page, projectPage.frames[0]);
  await page.getByRole('menuitem', { name: 'Вырезать фото', exact: true }).click();
  projectPage = await currentPage(page);
  await rightClickFrame(page, projectPage.frames[2]);
  await page.getByRole('menuitem', { name: 'Вставить фото', exact: true }).click();

  await expect.poll(async () => {
    const next = await currentPage(page);
    return [next.frames[0].photo?.id ?? null, next.frames[2].photo?.id ?? null];
  }).toEqual([null, 'ctx-photo-b']);
});
