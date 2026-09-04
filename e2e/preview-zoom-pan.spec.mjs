import { expect, test } from '@playwright/test';
import { openEditor } from './helpers.mjs';

test('album preview zooms independently, pans, and keeps desktop panels compact', async ({ page }) => {
  await page.setViewportSize({ width: 1656, height: 900 });
  await openEditor(page);

  const frame = page.locator('.stage-frame.preview-scroll-enabled');
  const zoomValue = page.locator('.preview-zoom-value');
  const zoomIn = page.getByRole('button', { name: 'Увеличить альбом', exact: true });
  const fit = page.getByRole('button', { name: 'По размеру', exact: true });
  const pan = page.getByRole('button', { name: 'Двигать просмотр', exact: true });

  await expect(frame).toBeVisible();
  await expect(zoomValue).toHaveText('100%');
  await expect(pan).toBeDisabled();

  await zoomIn.click();
  await expect(zoomValue).toHaveText('125%');
  await expect(pan).toBeEnabled();
  await expect.poll(() => frame.evaluate((node) => node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight)).toBe(true);

  await pan.click();
  await expect(pan).toHaveClass(/active-mode/);

  const before = await frame.evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35, { steps: 4 });
  await page.mouse.up();

  const after = await frame.evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
  expect(after.left !== before.left || after.top !== before.top).toBe(true);

  await fit.click();
  await expect(zoomValue).toHaveText('100%');
  await expect(pan).toBeDisabled();
  await expect.poll(() => frame.evaluate((node) => Math.round(node.scrollLeft) + Math.round(node.scrollTop))).toBe(0);

  const panelWidths = await page.evaluate(() => ({
    left: document.querySelector('.editor-left-panel-v2')?.getBoundingClientRect().width ?? 999,
    right: document.querySelector('.workspace > .inspector, .workspace > .album-mode-inspector')?.getBoundingClientRect().width ?? 999,
  }));
  expect(panelWidths.left).toBeLessThan(220);
  expect(panelWidths.right).toBeLessThan(260);
});
