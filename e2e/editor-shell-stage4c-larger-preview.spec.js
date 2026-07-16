import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
}

async function stageBox(page) {
  return page.locator('.stage-scale-shell').evaluate((shell) => {
    const rect = shell.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
}

test.describe('editor shell stage 4C larger preview', () => {
  test('shows a larger spread while keeping it inside the canvas area', async ({ page }) => {
    await openEditor(page);
    await page.getByLabel('Режим просмотра').getByRole('button', { name: 'Разворот', exact: true }).click();

    await expect.poll(async () => (await stageBox(page)).height).toBeGreaterThanOrEqual(680);

    const geometry = await page.evaluate(() => {
      const shell = document.querySelector('.stage-scale-shell').getBoundingClientRect();
      const area = document.querySelector('.canvas-area').getBoundingClientRect();
      const rail = document.querySelector('.page-rail').getBoundingClientRect();
      return {
        shellTop: shell.top,
        shellBottom: shell.bottom,
        shellWidth: shell.width,
        shellHeight: shell.height,
        areaLeft: area.left,
        areaRight: area.right,
        railTop: rail.top,
      };
    });

    expect(geometry.shellWidth).toBeGreaterThan(850);
    expect(geometry.shellHeight).toBeGreaterThanOrEqual(680);
    expect(geometry.shellTop).toBeGreaterThanOrEqual(90);
    expect(geometry.shellBottom).toBeLessThanOrEqual(geometry.railTop + 2);
    expect(geometry.areaRight - geometry.areaLeft).toBeGreaterThan(900);
  });

  test('does not change the saved canvas or print dimensions', async ({ page }) => {
    await openEditor(page);
    const project = await page.evaluate(() => window.__collageApp.getProject());

    expect(project.canvas.width).toBe(1480);
    expect(project.canvas.height).toBe(2100);
    expect(project.settings.printDpi).toBeTruthy();
  });
});
