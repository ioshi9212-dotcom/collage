import { expect, test } from '@playwright/test';
import { openEditor } from './helpers.mjs';

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

async function clickFrame(page, frame) {
  const geometry = await stageGeometry(page);
  await page.mouse.click(
    geometry.left + (frame.x + Math.min(40, frame.width / 2)) * geometry.scale,
    geometry.top + (frame.y + Math.min(40, frame.height / 2)) * geometry.scale,
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

async function dragFrameBy(page, frame, dx, dy) {
  const geometry = await stageGeometry(page);
  const startX = geometry.left + (frame.x + Math.min(60, frame.width / 2)) * geometry.scale;
  const startY = geometry.top + (frame.y + Math.min(60, frame.height / 2)) * geometry.scale;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx * geometry.scale, startY + dy * geometry.scale, { steps: 6 });
  await page.mouse.up();
}

test('smart alignment softly snaps frame edges and can be disabled', async ({ page }) => {
  await openEditor(page);
  await page.locator('.app-view-switch-v2').getByRole('button', { name: 'Страница', exact: true }).click();
  await page.locator('.editor-tool-button-v2[aria-label="Коллаж"]').click();

  const snapButton = page.getByRole('button', { name: 'Умная привязка', exact: true });
  await expect(snapButton).toBeEnabled();
  await expect(snapButton).toHaveClass(/active-mode/);

  const initial = await currentPage(page);
  await clickFrame(page, initial.frames[0]);
  await setSelectedFrameGeometry(page, [100, 120, 220, 220]);

  let edited = await currentPage(page);
  await clickFrame(page, edited.frames[1]);
  await setSelectedFrameGeometry(page, [500, 128, 220, 220]);

  edited = await currentPage(page);
  await dragFrameBy(page, edited.frames[1], 0, -4);
  await expect.poll(async () => (await currentPage(page)).frames[1].y).toBe(120);

  await snapButton.click();
  await expect(snapButton).not.toHaveClass(/active-mode/);
  await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().settings.smartSnap)).toBe(false);
});
