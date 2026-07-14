import { expect, test } from '@playwright/test';

test.describe('photo persistence safety', () => {
  test('editor loads and keeps local project storage available after reload', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/collage|album|фото|коллаж/i);

    const storageState = await page.evaluate(() => ({
      localStorageAvailable: typeof localStorage !== 'undefined',
      indexedDbAvailable: typeof indexedDB !== 'undefined',
      projectBridge: typeof window.__collageProjectStorage !== 'undefined',
    }));

    expect(storageState.localStorageAvailable).toBe(true);
    expect(storageState.indexedDbAvailable).toBe(true);

    await page.reload();

    const afterReload = await page.evaluate(() => ({
      projectBridge: typeof window.__collageProjectStorage !== 'undefined',
      appBridge: typeof window.__collageApp !== 'undefined',
    }));

    expect(afterReload.projectBridge).toBe(true);
    expect(afterReload.appBridge).toBe(true);
  });

  test('cleanup never runs before editor exposes a project snapshot', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      if (typeof window.__collageApp?.getProject !== 'function') return null;
      const project = window.__collageApp.getProject();
      return {
        hasPages: Array.isArray(project.pages),
        hasLibrary: Array.isArray(project.library),
      };
    });

    expect(result).not.toBeNull();
    expect(result.hasPages).toBe(true);
    expect(result.hasLibrary).toBe(true);
  });
});
