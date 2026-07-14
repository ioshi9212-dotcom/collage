import { expect, test } from '@playwright/test';

const PHOTO_DB_NAME = 'collage-photo-assets-v1';
const PHOTO_STORE_NAME = 'assets';
const PHOTO_SCHEMA = 'indexeddb-blob-v1';
const CLEANUP_LAST_RUN_KEY = 'collage-photo-asset-cleanup-last-run-v1';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
  'base64',
);

async function waitForEditor(page) {
  await page.addInitScript(() => {
    class ImmediateIntersectionObserver {
      constructor(callback) {
        this.callback = callback;
      }

      observe(target) {
        queueMicrotask(() => this.callback([{ isIntersecting: true, target }], this));
      }

      unobserve() {}

      disconnect() {}

      takeRecords() {
        return [];
      }
    }

    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: ImmediateIntersectionObserver,
    });
  });

  await page.goto('/');
  await page.waitForFunction(() => (
    typeof window.__collageApp?.getProject === 'function'
    && typeof window.__collageProjectStorage?.storeSnapshot === 'function'
    && typeof window.__collageProjectStorage?.openLocalProject === 'function'
  ));
}

async function uploadPhoto(page, name = 'e2e-photo.png') {
  const input = page.locator('input[type="file"][accept="image/*"]');
  await input.setInputFiles({ name, mimeType: 'image/png', buffer: TINY_PNG });
  await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().library.length)).toBe(1);
  return page.evaluate(() => {
    const photo = window.__collageApp.getProject().library[0];
    return { id: photo.id, assetId: photo.assetId, name: photo.name };
  });
}

async function saveCurrentProject(page) {
  await page.evaluate(async () => {
    const snapshot = window.__collageApp.getProject();
    const local = window.__collageApp.saveLocal();
    if (!local?.ok) throw new Error('local save failed');
    await window.__collageProjectStorage.storeSnapshot(snapshot, { source: 'playwright-e2e' });
  });
}

async function readAsset(page, assetId) {
  return page.evaluate(({ dbName, storeName, id }) => new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, 1);
    open.onerror = () => reject(open.error || new Error('asset db open failed'));
    open.onsuccess = () => {
      const database = open.result;
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(id);
      request.onerror = () => reject(request.error || new Error('asset read failed'));
      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? {
          id: record.id,
          schema: record.schema,
          size: Number(record.blob?.size || record.size || 0),
          updatedAt: record.updatedAt,
        } : null);
      };
    };
  }), { dbName: PHOTO_DB_NAME, storeName: PHOTO_STORE_NAME, id: assetId });
}

async function ageAssetAndCreateOrphan(page, activeAssetId, orphanAssetId) {
  await page.evaluate(({ dbName, storeName, schema, activeId, orphanId }) => new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, 1);
    open.onerror = () => reject(open.error || new Error('asset db open failed'));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const getActive = store.get(activeId);
      getActive.onerror = () => reject(getActive.error || new Error('active asset read failed'));
      getActive.onsuccess = () => {
        const active = getActive.result;
        if (!active?.blob) {
          reject(new Error('active Blob asset missing'));
          return;
        }
        const oldDate = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
        store.put({ ...active, updatedAt: oldDate });
        store.put({
          id: orphanId,
          schema,
          blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'application/octet-stream' }),
          name: 'orphan.bin',
          type: 'application/octet-stream',
          size: 3,
          updatedAt: oldDate,
        });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('asset write failed'));
      transaction.onabort = () => reject(transaction.error || new Error('asset write aborted'));
    };
  }), {
    dbName: PHOTO_DB_NAME,
    storeName: PHOTO_STORE_NAME,
    schema: PHOTO_SCHEMA,
    activeId: activeAssetId,
    orphanId: orphanAssetId,
  });
}

test.describe('photo persistence safety', () => {
  test('uploaded Blob photo survives save, reload and local project reopen', async ({ page }) => {
    await waitForEditor(page);
    const uploaded = await uploadPhoto(page);
    expect(uploaded.assetId).toBeTruthy();

    await saveCurrentProject(page);
    const storedBeforeReload = await readAsset(page, uploaded.assetId);
    expect(storedBeforeReload).toMatchObject({ id: uploaded.assetId, schema: PHOTO_SCHEMA });
    expect(storedBeforeReload.size).toBeGreaterThan(0);

    await page.reload();
    await page.waitForFunction(() => typeof window.__collageProjectStorage?.openLocalProject === 'function');
    await page.evaluate(() => window.__collageProjectStorage.openLocalProject());

    await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().library[0]?.assetId || '')).toBe(uploaded.assetId);
    await expect(page.locator('.photo-card')).toHaveCount(1);
    const thumbnail = page.locator('.photo-thumbnail img');
    await expect(thumbnail).toBeVisible();
    await expect.poll(() => thumbnail.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    await expect.poll(() => thumbnail.evaluate((image) => image.naturalHeight)).toBeGreaterThan(0);

    const storedAfterReload = await readAsset(page, uploaded.assetId);
    expect(storedAfterReload).toMatchObject({ id: uploaded.assetId, schema: PHOTO_SCHEMA });
    expect(storedAfterReload.size).toBe(storedBeforeReload.size);
  });

  test('background cleanup deletes an old orphan but preserves an old referenced Blob', async ({ page }) => {
    await waitForEditor(page);
    const uploaded = await uploadPhoto(page, 'protected-photo.png');
    await saveCurrentProject(page);

    const orphanAssetId = 'asset-playwright-orphan';
    await ageAssetAndCreateOrphan(page, uploaded.assetId, orphanAssetId);
    await page.evaluate((key) => localStorage.removeItem(key), CLEANUP_LAST_RUN_KEY);

    await page.reload();
    await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');

    await expect.poll(() => readAsset(page, orphanAssetId), { timeout: 12_000 }).toBeNull();
    const protectedAsset = await readAsset(page, uploaded.assetId);
    expect(protectedAsset).toMatchObject({ id: uploaded.assetId, schema: PHOTO_SCHEMA });
    expect(protectedAsset.size).toBeGreaterThan(0);
  });
});
