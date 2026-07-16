import { expect, test } from '@playwright/test';

test('uses more of the workspace for the page spread without overlapping the page rail', async ({ page }) => {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');

  const stage = page.locator('.stage-frame');
  const shell = page.locator('.stage-scale-shell');
  const rail = page.locator('.page-rail-v3');
  const inspector = page.locator('.editor-workspace-v2 > .inspector');

  await expect(stage).toBeVisible();
  await expect(shell).toBeVisible();
  await expect(rail).toBeVisible();
  await expect(inspector).toBeVisible();

  const geometry = await page.evaluate(() => {
    const stageNode = document.querySelector('.stage-frame');
    const shellNode = document.querySelector('.stage-scale-shell');
    const railNode = document.querySelector('.page-rail-v3');
    const inspectorNode = document.querySelector('.editor-workspace-v2 > .inspector');
    const stageRect = stageNode.getBoundingClientRect();
    const shellRect = shellNode.getBoundingClientRect();
    const railRect = railNode.getBoundingClientRect();
    const inspectorRect = inspectorNode.getBoundingClientRect();
    return {
      stage: stageRect.toJSON(),
      shell: shellRect.toJSON(),
      rail: railRect.toJSON(),
      inspector: inspectorRect.toJSON(),
    };
  });

  expect(geometry.shell.height).toBeGreaterThan(660);
  expect(geometry.shell.bottom).toBeLessThanOrEqual(geometry.rail.top + 1);
  expect(geometry.shell.right).toBeLessThanOrEqual(geometry.inspector.left + 1);
});
