import { expect, test } from '@playwright/test';
import { openEditor, TINY_PNG_DATA_URL } from './helpers.mjs';

test('photo panel separates unused and album photos while preserving upload order', async ({ page }) => {
  await openEditor(page);

  await page.evaluate(async ({ src }) => {
    const project = structuredClone(window.__collageApp.getProject());
    const photos = [
      { id: 'photo-order-1', name: '01-first.png', src },
      { id: 'photo-order-2', name: '02-second.png', src },
      { id: 'photo-order-3', name: '03-third.png', src },
    ];
    project.library = photos;
    project.pages[0].frames[0].photo = { ...photos[1], zoom: 1, offsetX: 0, offsetY: 0 };
    await window.__collageApp.openProject(project);
  }, { src: TINY_PNG_DATA_URL });

  const panel = page.locator('.photo-panel-v3');
  await expect(panel).toBeVisible();

  const unusedTab = panel.getByRole('tab', { name: /Не использованы/ });
  const usedTab = panel.getByRole('tab', { name: /В альбоме/ });
  await expect(unusedTab).toHaveAttribute('aria-selected', 'true');
  await expect(unusedTab).toContainText('2');
  await expect(usedTab).toContainText('1');

  await expect(panel.locator('.photo-card-name-v3')).toHaveText(['01-first.png', '03-third.png']);
  await expect(panel.locator('.photo-order-badge-v3')).toHaveText(['1', '3']);

  await usedTab.click();
  await expect(usedTab).toHaveAttribute('aria-selected', 'true');
  await expect(panel.locator('.photo-card-name-v3')).toHaveText(['02-second.png']);
  await expect(panel.locator('.photo-order-badge-v3')).toHaveText(['2']);
});

test('photo panel gives the thumbnail list most of its vertical space', async ({ page }) => {
  await page.setViewportSize({ width: 1656, height: 900 });
  await openEditor(page);
  const sizes = await page.locator('.photo-panel-v3').evaluate((panel) => {
    const header = panel.querySelector('.photo-panel-header-v3')?.getBoundingClientRect();
    const list = panel.querySelector('.photo-panel-list-v3')?.getBoundingClientRect();
    return { header: header?.height || 0, list: list?.height || 0 };
  });
  expect(sizes.header).toBeLessThan(190);
  expect(sizes.list).toBeGreaterThan(300);
});
