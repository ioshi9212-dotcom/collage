import { expect, test } from '@playwright/test';

const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz_12345';

function albumPayload(pageCount = 3) {
  return {
    album: {
      title: 'Клиентский альбом',
      data: {
        version: 'public-album-v1',
        canvas: { width: 1480, height: 2100 },
        settings: {
          borderColor: '#ffffff',
          pageNumbering: { enabled: false },
        },
        pages: Array.from({ length: pageCount }, (_, index) => ({
          id: `page-${index + 1}`,
          name: `Страница ${index + 1}`,
          frameCount: 0,
          frames: [],
          isBlankPage: false,
        })),
        extraLayers: { pages: {} },
      },
    },
  };
}

test('public album route renders only the read-only viewer on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`**/api/public-albums/${token}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(albumPayload()),
  }));

  await page.goto(`/album/${token}`);

  await expect(page.locator('.public-album-mobile')).toBeVisible();
  await expect(page.locator('.app-header-v2')).toHaveCount(0);
  await expect(page.locator('.editor-workspace-v2')).toHaveCount(0);
  await expect(page.getByText('1 / 3')).toBeVisible();

  await page.getByRole('button', { name: 'Следующая страница' }).click();
  await expect(page.getByText('2 / 3')).toBeVisible();
});

test('revoked public album shows a clean unavailable state', async ({ page }) => {
  await page.route(`**/api/public-albums/${token}`, (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'public_album_not_found', message: 'Ссылка больше не работает.' }),
  }));

  await page.goto(`/album/${token}`);
  await expect(page.getByText('Альбом недоступен')).toBeVisible();
  await expect(page.locator('.app-header-v2')).toHaveCount(0);
});
