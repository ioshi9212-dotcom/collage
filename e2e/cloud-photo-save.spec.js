import { expect, test } from '@playwright/test';
import { openEditor } from './helpers.mjs';

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';

test('normal cloud saves upload photo blobs once and keep Base64 out of project JSON', async ({ page }) => {
  let uploadCount = 0;
  const savedPayloads = [];

  await page.route('**/api/photo-assets/upload?**', async (route) => {
    uploadCount += 1;
    expect(route.request().method()).toBe('PUT');
    const body = route.request().postDataBuffer();
    expect(body?.length).toBeGreaterThan(0);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        asset: {
          id: 'photo-cloud-a',
          name: 'test.png',
          type: 'image/png',
          size: body.length,
          cloudKey: 'users/7/photos/photo-cloud-a/original.png',
          cloudSchema: 'railway-bucket-v1',
          src: '/api/photo-assets/file?key=users%2F7%2Fphotos%2Fphoto-cloud-a%2Foriginal.png',
        },
      }),
    });
  });

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      savedPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ project: { id: 'cloud-project-a', title: payload.title } }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/projects/cloud-project-a', async (route) => {
    const payload = route.request().postDataJSON();
    savedPayloads.push(payload);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ project: { id: 'cloud-project-a', title: payload.title } }),
    });
  });

  await openEditor(page);
  await page.evaluate(async ({ dataUrl }) => {
    const base = window.__collageApp.getProject();
    const firstPage = base.pages[0];
    const firstFrame = firstPage.frames[0];
    const photo = { id: 'photo-a', name: 'test.png', type: 'image/png', size: 68, src: dataUrl };
    await window.__collageApp.openProject({
      ...base,
      library: [photo],
      pages: base.pages.map((item, index) => index === 0
        ? { ...item, frames: item.frames.map((frame, frameIndex) => frameIndex === 0 ? { ...firstFrame, photo } : frame) }
        : item),
    });
    window.__collageCloudAuth = { isAuthenticated: () => true };
    localStorage.removeItem('collage-cloud-current-project-id');
    localStorage.removeItem('collage-cloud-current-project-title');
  }, { dataUrl: ONE_PIXEL_PNG });

  const saveButton = page.locator('.primary-save-v2');
  await page.evaluate(() => {
    const button = document.querySelector('.primary-save-v2');
    button.click();
    button.click();
  });
  await expect.poll(() => savedPayloads.length).toBe(1);

  const firstJson = JSON.stringify(savedPayloads[0]);
  expect(firstJson).not.toContain('data:image');
  expect(savedPayloads[0].data.library[0].cloudKey).toBe('users/7/photos/photo-cloud-a/original.png');
  expect(uploadCount).toBe(1);

  await saveButton.click();
  await expect.poll(() => savedPayloads.length).toBe(2);
  expect(uploadCount).toBe(1);
  expect(JSON.stringify(savedPayloads[1])).not.toContain('data:image');
});
