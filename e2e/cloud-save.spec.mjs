import { test, expect } from '@playwright/test';
import { openEditor, uploadTinyPhoto } from './helpers.mjs';

test('authenticated account save uploads a photo to Bucket while local state stays compact', async ({ page }) => {
  let photoUploadCount = 0;

  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'e2e-user', email: 'e2e@example.com' } }),
    });
  });

  await page.route('**/api/photo-assets/upload?**', async (route) => {
    photoUploadCount += 1;
    const request = route.request();
    const body = request.postDataBuffer();
    expect(request.method()).toBe('PUT');
    expect(body?.length).toBeGreaterThan(0);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        asset: {
          id: 'bucket-object-e2e',
          name: 'cloud-photo.png',
          type: 'image/png',
          size: body.length,
          cloudKey: 'users/e2e-user/photos/cloud-photo/original.png',
          cloudSchema: 'railway-bucket-v1',
          src: '/api/photo-assets/file?key=users%2Fe2e-user%2Fphotos%2Fcloud-photo%2Foriginal.png',
        },
      }),
    });
  });

  await page.route('**/api/projects', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          project: {
            id: 'cloud-e2e-project',
            title: body.title,
            updated_at: new Date().toISOString(),
          },
        }),
      });
      return;
    }
    await route.abort();
  });

  await openEditor(page);
  await expect(page.locator('.cloud-auth-panel')).toContainText('e2e@example.com');
  const uploaded = await uploadTinyPhoto(page, 'cloud-photo.png');

  await page.getByRole('button', { name: 'Аккаунт', exact: true }).click();
  await expect(page.locator('.cloud-project-title')).toBeVisible();
  await page.locator('.cloud-project-title').fill('E2E photo album');
  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/projects' && request.method() === 'POST';
  });
  await page.locator('.cloud-auth-panel').getByRole('button', { name: 'Сохранить', exact: true }).click();
  const request = await requestPromise;
  const payload = request.postDataJSON();

  expect(payload.title).toBe('E2E photo album');
  expect(payload.data.version).toBe('live-25-railway-bucket-photos');
  expect(payload.data.library[0].id).toBe(uploaded.id);
  expect(payload.data.library[0].cloudKey).toBe('users/e2e-user/photos/cloud-photo/original.png');
  expect(payload.data.library[0].assetId).toBeUndefined();
  expect(JSON.stringify(payload.data)).not.toContain('data:image/');
  expect(photoUploadCount).toBe(1);

  const compact = await page.evaluate(() => window.__collageApp.getProject());
  expect(compact.version).toBe('live-24-indexeddb-photo-assets');
  expect(compact.library[0].assetId).toBe(uploaded.assetId);
  expect(compact.library[0].cloudKey).toBe('users/e2e-user/photos/cloud-photo/original.png');
  expect(compact.library[0].src).toBeUndefined();
  expect(JSON.stringify(compact)).not.toContain('data:image/');

  await expect(page.locator('.cloud-auth-status').first()).toHaveText('Сохранено в аккаунт');
});
