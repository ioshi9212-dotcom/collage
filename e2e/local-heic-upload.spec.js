import { expect, test } from '@playwright/test';
import { openEditor, TINY_PNG_BASE64 } from './helpers.mjs';

const CONVERTED_JPEG_BYTES = Buffer.from(TINY_PNG_BASE64, 'base64');

test('HEIC is converted once and then enters the original local upload flow', async ({ page }) => {
  let conversionRequests = 0;
  await page.route('**/api/heic/convert?*', async (route) => {
    conversionRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: CONVERTED_JPEG_BYTES,
    });
  });

  await openEditor(page);
  const input = page.locator('.upload-box input[type="file"][accept="image/*"]');
  await input.setInputFiles({
    name: 'IMG_2048.HEIC',
    mimeType: 'image/heic',
    buffer: Buffer.from('fake-heic-payload'),
  });

  await expect.poll(() => page.evaluate(() => window.__collageApp?.getProject?.().library?.length || 0)).toBe(1);
  const photo = await page.evaluate(() => {
    const item = window.__collageApp.getProject().library[0];
    return { name: item.name, type: item.type, assetId: item.assetId };
  });

  expect(conversionRequests).toBe(1);
  expect(photo.name).toBe('IMG_2048.jpg');
  expect(photo.type).toBe('image/jpeg');
  expect(photo.assetId).toBeTruthy();
});
