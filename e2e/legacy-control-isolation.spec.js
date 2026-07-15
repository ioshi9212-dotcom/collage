import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => (
    typeof window.__collageApp?.getProject === 'function'
    && typeof window.__collageLegacyControls?.getState === 'function'
  ));
}

test.describe('legacy control isolation', () => {
  test('keeps hidden legacy panels inert and outside accessible control lookup', async ({ page }) => {
    await openEditor(page);

    await expect.poll(() => page.evaluate(() => window.__collageLegacyControls.getState().focusableControls)).toBe(0);

    await page.getByLabel('Режим просмотра').getByRole('button', { name: 'Брошюра', exact: true }).click();

    await expect(page.getByLabel('Листов в блоке')).toHaveCount(1);
    await expect(page.getByLabel('Порядок оборотов')).toHaveCount(1);
    await expect(page.getByLabel('Развернуть обороты на 180°')).toHaveCount(1);

    const state = await page.evaluate(() => window.__collageLegacyControls.getState());
    expect(state.roots).toBeGreaterThanOrEqual(2);
    expect(state.focusableControls).toBe(0);

    const legacyRoots = page.locator('.album-bar, .album-tool-panel, .album-mode-sidebar');
    await expect.poll(() => legacyRoots.count()).toBeGreaterThanOrEqual(2);
    for (let index = 0; index < await legacyRoots.count(); index += 1) {
      await expect(legacyRoots.nth(index)).toHaveAttribute('aria-hidden', 'true');
      await expect(legacyRoots.nth(index)).toHaveAttribute('inert', '');
    }
  });
});
