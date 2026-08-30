import { test, expect } from '@playwright/test';

test('public album route does not render editor chrome and supports panning when zoomed', async ({ page }) => {
  await page.route('**/api/public-albums/demo-token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        album: {
          title: 'Клиентский альбом',
          data: {
            canvas: { width: 1480, height: 2100 },
            settings: {},
            pages: [{ id: 'p1', frames: [] }],
          },
        },
      }),
    });
  });

  await page.goto('/album/demo-token');
  await expect(page.getByText('Клиентский альбом')).toBeVisible();
  await expect(page.locator('.app-header-v2')).toHaveCount(0);
  await expect(page.locator('.editor-workspace-v2')).toHaveCount(0);

  const zoomButton = page.getByRole('button', { name: 'Увеличить' });
  await expect(zoomButton).toBeVisible();
  await zoomButton.click();
  await expect(page.getByRole('button', { name: 'Уменьшить' })).toBeVisible();

  const scene = page.locator('.album-flip-scene');
  const book = page.locator('.album-flip-book');
  const before = await book.evaluate((node) => node.style.transform);
  const box = await scene.boundingBox();
  expect(box).not.toBeNull();

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100, startY + 60, { steps: 5 });
  await page.mouse.up();

  await expect.poll(async () => book.evaluate((node) => node.style.transform)).not.toBe(before);
  const after = await book.evaluate((node) => node.style.transform);
  expect(after).toContain('translate3d(');
  expect(after).not.toContain('translate3d(0px, 0px, 0)');
});
