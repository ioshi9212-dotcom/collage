import { expect, test } from '@playwright/test';
import { openEditor, TINY_PNG_BASE64 } from './helpers.mjs';

test('shows percentage and a progress bar while a HEIC photo is processed', async ({ page }) => {
  await page.route('**/api/heic/convert?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from(TINY_PNG_BASE64, 'base64') });
  });

  await openEditor(page);
  const input = page.locator('.upload-box input[type="file"][accept="image/*"]');
  await input.setInputFiles({ name: 'IMG_PROGRESS.HEIC', mimeType: 'image/heic', buffer: Buffer.from('fake-heic-progress-payload') });

  const progress = page.locator('.photo-upload-progress');
  await expect(progress).toBeVisible();
  await expect(progress).toContainText('Преобразую HEIC');
  const bar = progress.getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuemax', '100');
  await expect(progress.locator('.photo-upload-progress-head span')).toContainText('%');

  await expect.poll(() => page.evaluate(() => window.__collageApp?.getProject?.().library?.length || 0)).toBe(1);
  await expect(progress).toHaveClass(/done/);
  await expect(bar).toHaveAttribute('aria-valuenow', '100');
  await expect(progress).toContainText('Добавлено: 1 из выбранных 1');
});
