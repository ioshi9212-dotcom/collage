import { test, expect } from '@playwright/test';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDEAAUADikBAf3aW9sAAAAASUVORK5CYII=';
test('PNG catalog inserts a transformable drawing', async ({ page }) => {
  await page.route('**/api/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 1, email: 'test@example.com' } }) }));
  await page.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) }));
  await page.route('**/api/drawing-assets', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assets: [{ id: 'branch', name: 'Ветка', cloudKey: 'users/1/photos/a/original.png', src: png, width: 200, height: 80 }] }) });
    return route.continue();
  });
  await page.goto('/');
  await page.getByText('Рисунки', { exact: true }).first().click();
  await expect(page.getByText('Ветка', { exact: true })).toBeVisible();
  await page.getByText('Ветка', { exact: true }).click();
  await expect(page.getByText('Настройки PNG', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '↔ По горизонтали' })).toBeVisible();
  await expect(page.getByRole('button', { name: '↕ По вертикали' })).toBeVisible();
});
