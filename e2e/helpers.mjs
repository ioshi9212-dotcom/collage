import { expect } from '@playwright/test';

export const LOCAL_PROJECT_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';
export const PHOTO_DB_NAME = 'collage-photo-assets-v1';
export const PHOTO_STORE_NAME = 'assets';
export const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9oQAAAAASUVORK5CYII=';
export const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

export function tinyPngUpload(name = 'tiny.png') {
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  };
}

export async function openEditor(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
  await expect(page.locator('.file-actions')).toBeVisible();
}

export async function uploadTinyPhoto(page, name = 'tiny.png') {
  await page.locator('.upload-box input[type="file"][accept="image/*"]').setInputFiles(tinyPngUpload(name));
  await page.waitForFunction(() => window.__collageApp?.getProject?.().library?.length === 1);
  return page.evaluate(() => window.__collageApp.getProject().library[0]);
}

export async function readPhotoAssetMetadata(page, assetId) {
  return page.evaluate(async ({ dbName, storeName, id }) => new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(dbName);
    openRequest.onerror = () => reject(openRequest.error || new Error('Unable to open photo database'));
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(id);
      request.onerror = () => reject(request.error || new Error('Unable to read photo asset'));
      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? {
          id: record.id,
          schema: record.schema,
          size: record.size,
          hasBlob: record.blob instanceof Blob,
          blobSize: record.blob instanceof Blob ? record.blob.size : 0,
        } : null);
      };
    };
  }), { dbName: PHOTO_DB_NAME, storeName: PHOTO_STORE_NAME, id: assetId });
}

export async function waitForLocalProject(page) {
  await page.waitForFunction((storageKey) => {
    try {
      const raw = localStorage.getItem(storageKey);
      return Boolean(raw && JSON.parse(raw)?.library?.[0]?.assetId);
    } catch {
      return false;
    }
  }, LOCAL_PROJECT_KEY);
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)), LOCAL_PROJECT_KEY);
}
