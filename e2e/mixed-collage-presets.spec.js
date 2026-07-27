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

async function openPresetPicker(page) {
  await openEditor(page);
  await page.locator('.editor-tool-button-v2[aria-label="Коллаж"]').click();
  const picker = page.locator('.collage-preset-picker');
  await expect(picker).toBeVisible();
  return picker;
}

test('keeps the original mixed compositions and applies overlays', async ({ page }) => {
  const picker = await openPresetPicker(page);
  await expect(picker.locator('.collage-preset-card')).toHaveCount(16);
  await expect(picker.locator('[data-preset-id="five-background-four-overlay"]')).toBeVisible();
  await expect(picker.locator('[data-preset-id="five-overlap-cascade"]')).toBeVisible();
  await expect(picker.locator('[data-preset-id="five-text-side"]')).toBeVisible();

  await picker.locator('[data-preset-id="five-background-four-overlay"]').click();
  await expect.poll(() => currentPageState(page)).toMatchObject({
    settings: { frameCount: 5, frameMode: 'free' },
    page: { frameCount: 5, layout: null, collagePresetId: 'five-background-four-overlay' },
  });

  const applied = await currentPageState(page);
  expect(applied.page.frames).toHaveLength(5);
  expect(applied.page.frames[0]).toMatchObject({ x: 0, y: 0, width: 1480, height: 2100, zIndex: 0 });
  expect(applied.page.frames.slice(1).every((frame) => frame.zIndex > 0)).toBe(true);
});

test('offers 2 to 9 photos and previews reserved text space', async ({ page }) => {
  const picker = await openPresetPicker(page);
  const counts = picker.locator('.collage-preset-counts');
  const categories = picker.locator('.collage-preset-categories');

  await expect(counts.getByRole('button')).toHaveCount(8);
  await counts.getByRole('button', { name: '2', exact: true }).click();
  await expect(picker.locator('.collage-preset-card')).toHaveCount(16);

  await categories.getByRole('button', { name: 'С текстом', exact: true }).click();
  await expect(picker.locator('.collage-preset-card')).toHaveCount(4);
  const textPreset = picker.locator('[data-preset-id="two-main-right-text"]');
  await expect(textPreset.locator('.collage-preset-preview-text-zone')).toBeVisible();
  await expect(textPreset.locator('.collage-preset-preview-text-zone')).toContainText('Текст');
  await textPreset.click();

  await expect.poll(() => currentPageState(page)).toMatchObject({
    settings: { frameCount: 2, frameMode: 'free' },
    page: { frameCount: 2, layout: null, collagePresetId: 'two-main-right-text' },
  });

  await counts.getByRole('button', { name: '9', exact: true }).click();
  await expect(picker.locator('.collage-preset-card')).toHaveCount(3);
  await expect(picker.locator('[data-preset-id="nine-timeline-story"] .collage-preset-preview-text-zone')).toBeVisible();

  await categories.getByRole('button', { name: 'Все', exact: true }).click();
  await expect(picker.locator('.collage-preset-card')).toHaveCount(16);
  await expect(picker.locator('[data-preset-id="nine-background-overlay"]')).toBeVisible();
  await expect(picker.locator('[data-preset-id="nine-overlap-editorial"]')).toBeVisible();
  await expect(picker.locator('[data-preset-id="nine-main-right-eight"]')).toBeVisible();
});

test('keeps all 16 presets reachable and applies an album layout on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const picker = await openPresetPicker(page);
  await expect(picker.locator('.collage-preset-card')).toHaveCount(16);

  await picker.locator('.collage-preset-categories').getByRole('button', { name: 'Как в альбоме', exact: true }).click();
  await expect(picker.locator('.collage-preset-card')).toHaveCount(4);

  const newPreset = picker.locator('[data-preset-id="album-five-hero-four-bottom"]');
  await newPreset.scrollIntoViewIfNeeded();
  await expect(newPreset).toBeVisible();
  await newPreset.click();

  await expect.poll(() => currentPageState(page)).toMatchObject({
    settings: { frameCount: 5, frameMode: 'free' },
    page: { frameCount: 5, layout: null, collagePresetId: 'album-five-hero-four-bottom' },
  });
});
