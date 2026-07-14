import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import {
  LOCAL_PROJECT_KEY,
  TINY_PNG_DATA_URL,
  openEditor,
  readPhotoAssetMetadata,
  uploadTinyPhoto,
  waitForLocalProject,
} from './helpers.mjs';

test.describe.configure({ mode: 'serial' });

async function openExportMenu(page) {
  const trigger = page.getByRole('button', { name: 'Экспорт ▾' });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
}

test('photo survives save, reload and local reopen through IndexedDB', async ({ page }) => {
  await openEditor(page);
  const uploaded = await uploadTinyPhoto(page, 'saved-photo.png');

  expect(uploaded.assetId).toBeTruthy();
  expect(uploaded.src).toBeUndefined();

  const assetBeforeSave = await readPhotoAssetMetadata(page, uploaded.assetId);
  expect(assetBeforeSave).toMatchObject({
    id: uploaded.assetId,
    schema: 'indexeddb-blob-v1',
    hasBlob: true,
  });
  expect(assetBeforeSave.blobSize).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  const localSnapshot = await waitForLocalProject(page);

  expect(localSnapshot.version).toBe('live-24-indexeddb-photo-assets');
  expect(localSnapshot.library[0].assetId).toBe(uploaded.assetId);
  expect(localSnapshot.library[0].src).toBeUndefined();
  expect(JSON.stringify(localSnapshot)).not.toContain('data:image/');
  expect(JSON.stringify(localSnapshot)).not.toContain('blob:');

  await page.reload();
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
  await page.getByRole('button', { name: 'Открыть', exact: true }).click();
  await page.waitForFunction((assetId) => window.__collageApp?.getProject?.().library?.[0]?.assetId === assetId, uploaded.assetId);

  const reopenedLocal = await page.evaluate(() => window.__collageApp.getProject());
  expect(reopenedLocal.library[0].assetId).toBe(uploaded.assetId);
  expect(reopenedLocal.library[0].src).toBeUndefined();

  const reopenedPortable = await page.evaluate(() => window.__collageApp.getPortableProject());
  expect(reopenedPortable.version).toBe('live-24-portable-photo-data');
  expect(reopenedPortable.library[0].src).toMatch(/^data:image\/png;base64,/);

  const persistedRaw = await page.evaluate((storageKey) => localStorage.getItem(storageKey), LOCAL_PROJECT_KEY);
  expect(persistedRaw).not.toContain('data:image/');
  expect(persistedRaw).not.toContain('blob:');
});

test('legacy Base64 JSON migrates to Blob storage and downloads as a portable project', async ({ page }) => {
  await openEditor(page);

  const legacyProject = await page.evaluate((dataUrl) => {
    const project = window.__collageApp.getProject();
    const firstPage = project.pages[0];
    const firstFrame = firstPage.frames[0];
    return {
      ...project,
      version: 'live-23-photo-library-references',
      library: [{ id: 'legacy-photo', name: 'legacy.png', src: dataUrl }],
      pages: project.pages.map((page, pageIndex) => pageIndex === 0 ? {
        ...page,
        frames: page.frames.map((frame, frameIndex) => frameIndex === 0 ? {
          ...firstFrame,
          photo: {
            id: 'legacy-photo',
            name: 'legacy.png',
            src: dataUrl,
            zoom: 1.25,
            offsetX: 4,
            offsetY: -3,
          },
        } : frame),
      } : page),
      currentPageId: firstPage.id,
    };
  }, TINY_PNG_DATA_URL);

  await openExportMenu(page);
  await page.locator('.export-popover-v2 input[type="file"][accept*="json"]').setInputFiles({
    name: 'legacy-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacyProject)),
  });

  await page.waitForFunction(() => Boolean(window.__collageApp?.getProject?.().library?.[0]?.assetId));
  const migrated = await page.evaluate(() => window.__collageApp.getProject());
  const assetId = migrated.library[0].assetId;

  expect(assetId).toBeTruthy();
  expect(migrated.library[0].src).toBeUndefined();
  expect(migrated.pages[0].frames[0].photo.assetId).toBe(assetId);
  expect(migrated.pages[0].frames[0].photo.zoom).toBe(1.25);

  const asset = await readPhotoAssetMetadata(page, assetId);
  expect(asset).toMatchObject({ id: assetId, schema: 'indexeddb-blob-v1', hasBlob: true });

  const downloadPromise = page.waitForEvent('download');
  await openExportMenu(page);
  await page.getByRole('button', { name: 'Скачать JSON', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  const portable = JSON.parse(await readFile(downloadPath, 'utf8'));
  expect(portable.version).toBe('live-24-portable-photo-data');
  expect(portable.library[0].assetId).toBe(assetId);
  expect(portable.library[0].src).toMatch(/^data:image\/png;base64,/);
  expect(portable.pages[0].frames[0].photo.src).toBeUndefined();
});
