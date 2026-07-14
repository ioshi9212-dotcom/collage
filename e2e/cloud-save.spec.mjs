import { test, expect } from '@playwright/test';
import { openEditor, uploadTinyPhoto } from './helpers.mjs';

test('authenticated cloud save sends a portable photo while local state stays compact', async ({ page }) => {
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'e2e-user', email: 'e2e@example.com' } }),
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
  expect(payload.data.version).toBe('live-24-portable-photo-data');
  expect(payload.data.library[0].assetId).toBe(uploaded.assetId);
  expect(payload.data.library[0].src).toMatch(/^data:image\/png;base64,/);

  const compact = await page.evaluate(() => window.__collageApp.getProject());
  expect(compact.version).toBe('live-24-indexeddb-photo-assets');
  expect(compact.library[0].assetId).toBe(uploaded.assetId);
  expect(compact.library[0].src).toBeUndefined();
  expect(JSON.stringify(compact)).not.toContain('data:image/');

  await expect(page.locator('.cloud-auth-status').first()).toHaveText('Сохранено в аккаунт');
});
