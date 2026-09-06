import { expect, test } from '@playwright/test';

test('publishing falls back to updating the current cloud project when version quota is full', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('collage-cloud-current-project-id', 'current-project');
    localStorage.setItem('collage-cloud-current-project-title', 'Клиентский альбом');
  });

  let updateBody = null;
  let publishBody = null;

  await page.route('**/api/projects/current-project', async (route) => {
    updateBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        project: { id: 'current-project', title: 'Клиентский альбом' },
      }),
    });
  });

  await page.route('**/api/public-albums', async (route) => {
    publishBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        album: { token: 'share-token', url: '/album/share-token' },
      }),
    });
  });

  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.saveProject === 'function');

  await page.evaluate(() => {
    const data = { pages: [{ id: 'page-1', frames: [] }] };
    const error = new Error('Достигнут лимит: не больше 25 проектов в аккаунте.');
    error.status = 409;
    window.__collageApp.saveProject = async () => ({
      ok: true,
      cloud: null,
      cloudError: error,
      data,
    });
  });

  await page.getByRole('button', { name: 'Поделиться', exact: true }).click();

  const link = page.getByLabel('Публичная ссылка на альбом');
  await expect(link).toBeVisible();
  await expect(link).toHaveValue(/\/album\/share-token$/);
  await expect(page.getByText('Для публикации войди в аккаунт', { exact: false })).toHaveCount(0);

  expect(updateBody).toEqual({
    title: 'Клиентский альбом',
    data: { pages: [{ id: 'page-1', frames: [] }] },
  });
  expect(publishBody.projectId).toBe('current-project');
  expect(publishBody.data).toEqual({ pages: [{ id: 'page-1', frames: [] }] });
});
