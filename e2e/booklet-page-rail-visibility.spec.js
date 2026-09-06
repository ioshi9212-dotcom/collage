import { expect, test } from '@playwright/test';

test('booklet mode keeps the full bottom page cards visible above the scrollbar', async ({ page }) => {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');

  await page.getByLabel('Режим просмотра').getByRole('button', { name: 'Брошюра', exact: true }).click();

  const rail = page.locator('.booklet-page-rail');
  const list = rail.locator('.page-rail-list');
  const firstCard = list.locator('.page-rail-card').first();
  await expect(rail).toBeVisible();
  await expect(firstCard).toBeVisible();

  const geometry = await page.evaluate(() => {
    const railNode = document.querySelector('.booklet-page-rail');
    const listNode = railNode?.querySelector('.page-rail-list');
    const cardNode = listNode?.querySelector('.page-rail-card');
    if (!railNode || !listNode || !cardNode) return null;
    const railRect = railNode.getBoundingClientRect();
    const listRect = listNode.getBoundingClientRect();
    const cardRect = cardNode.getBoundingClientRect();
    return {
      railHeight: railRect.height,
      listHeight: listRect.height,
      cardHeight: cardRect.height,
      cardTop: cardRect.top,
      cardBottom: cardRect.bottom,
      listTop: listRect.top,
      listBottom: listRect.bottom,
      railBottom: railRect.bottom,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry.railHeight).toBeGreaterThanOrEqual(88);
  expect(geometry.listHeight).toBeGreaterThanOrEqual(78);
  expect(geometry.cardHeight).toBeGreaterThanOrEqual(60);
  expect(geometry.cardTop).toBeGreaterThanOrEqual(geometry.listTop - 1);
  expect(geometry.cardBottom).toBeLessThanOrEqual(geometry.listBottom + 1);
  expect(Math.abs(geometry.railBottom - geometry.viewportHeight)).toBeLessThanOrEqual(2);
});
