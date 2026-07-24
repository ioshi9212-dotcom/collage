import { expect, test } from '@playwright/test';
import { openEditor, tinyPngUpload } from './helpers.mjs';

test('duplicate photos are skipped by name and size while same-name different-size photos are kept', async ({ page }) => {
  await openEditor(page);
  const input = page.locator('.upload-box input[type="file"][accept="image/*"]');

  await input.setInputFiles(tinyPngUpload('family.png'));
  await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().library.length)).toBe(1);

  await input.setInputFiles(tinyPngUpload('family.png'));
  await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().library.length)).toBe(1);

  const source = tinyPngUpload('family.png');
  await input.setInputFiles({
    name: 'family.png',
    mimeType: 'image/png',
    buffer: Buffer.concat([source.buffer, Buffer.from([0])]),
  });
  await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().library.length)).toBe(2);
  await expect(page.locator('.editor-left-panel-v2')).toContainText('Загружено: 2');
});
