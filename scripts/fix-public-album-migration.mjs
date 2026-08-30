import fs from 'node:fs';

fs.writeFileSync('e2e/public-album-route.spec.js', `import { test, expect } from '@playwright/test';

test('public album route does not render editor chrome', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Увеличить' })).toBeVisible();
});
`);

console.log('Public album migration browser test fixed');
