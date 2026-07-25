import { expect, test } from '@playwright/test';
import { openEditor } from './helpers.mjs';

function currentPageState(page) {
  return page.evaluate(() => {
    const project = window.__collageApp.getProject();
    const current = project.pages.find((item) => item.id === project.currentPageId);
    return {
      settings: project.settings,
      page: current,
    };
  });
}

test('offers several mixed compositions per photo count and applies overlays', async ({ page }) => {
  await openEditor(page);
  await page.locator('.editor-tool-button-v2[aria-label="Коллаж"]').click();

  const picker = page.locator('.collage-preset-picker');
  await expect(picker).toBeVisible();
  await expect(picker.locator('.collage-preset-card')).toHaveCount(6);
  await expect(picker.locator('[data-preset-id="five-background-four-overlay"]')).toBeVisible();
  await expect(picker.locator('[data-preset-id="five-overlap-cascade"]')).toBeVisible();

  await picker.locator('[data-preset-id="five-background-four-overlay"]').click();
  await expect.poll(() => currentPageState(page)).toMatchObject({
    settings: { frameCount: 5, frameMode: 'free' },
    page: { frameCount: 5, layout: null, collagePresetId: 'five-background-four-overlay' },
  });

  const applied = await currentPageState(page);
  expect(applied.page.frames).toHaveLength(5);
  expect(applied.page.frames[0]).toMatchObject({ x: 0, y: 0, width: 1480, height: 2100, zIndex: 0 });
  expect(applied.page.frames.slice(1).every((frame) => frame.zIndex > 0)).toBe(true);

  await picker.locator('.collage-preset-counts').getByRole('button', { name: '4', exact: true }).click();
  await picker.locator('.collage-preset-categories').getByRole('button', { name: 'Фото поверх', exact: true }).click();
  await expect(picker.locator('.collage-preset-card')).toHaveCount(1);
  await expect(picker.locator('[data-preset-id="four-background-three-overlay"]')).toBeVisible();
});
