import { expect, test } from '@playwright/test';
import { openEditor, TINY_PNG_BASE64 } from './helpers.mjs';

const TINY_PNG = Buffer.from(TINY_PNG_BASE64, 'base64');

test('photo import report keeps exact skipped file reasons visible', async ({ page }) => {
  await page.route('**/api/heic/convert?*', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'HEIC-файл не читается' }),
    });
  });

  await openEditor(page);
  const input = page.locator('.upload-box input[type="file"][accept="image/*"]');
  await input.setInputFiles([
    {
      name: 'good.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    },
    {
      name: 'broken.HEIC',
      mimeType: 'image/heic',
      buffer: Buffer.from('broken-heic'),
    },
  ]);

  const report = page.locator('.photo-import-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('Выбрано: 2 · добавлено: 1');
  await expect(report).toContainText('Не удалось: 1');
  await expect(report).toContainText('broken.HEIC');
  await expect(report).toContainText('Не удалось прочитать HEIC даже запасным конвертером');

  await page.waitForTimeout(3000);
  await expect(report).toBeVisible();
  await expect(page.locator('.photo-grid .photo-card')).toHaveCount(1);
});
