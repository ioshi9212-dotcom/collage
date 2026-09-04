import { expect, test } from '@playwright/test';

test('drawings can move under photos and shapes have fill and outline controls', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');

  await page.locator('.editor-tool-button-v2[aria-label="Рисунки"]').click();
  await page.getByRole('button', { name: '+ Круг / эллипс', exact: true }).click();

  const inspector = page.locator('.album-mode-inspector');
  await expect(inspector.getByText('Настройки фигуры', { exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Поверх фото', exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Под фото', exact: true })).toBeVisible();

  await expect.poll(async () => page.evaluate(() => {
    const project = window.__collageApp.getProject();
    return Object.values(project.extraLayers?.pages || {})
      .flatMap((item) => item?.drawings || [])
      .find((item) => item?.type === 'shape');
  })).toMatchObject({ type: 'shape', shapeKind: 'ellipse', plane: 'front', fillEnabled: true, strokeEnabled: false });

  await inspector.getByRole('button', { name: 'Под фото', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => {
    const project = window.__collageApp.getProject();
    return Object.values(project.extraLayers?.pages || {})
      .flatMap((item) => item?.drawings || [])
      .find((item) => item?.type === 'shape')?.plane;
  })).toBe('back');

  await inspector.getByLabel('Заливка').uncheck();
  await inspector.getByLabel('Контур').check();
  await expect(inspector.getByText('Толщина контура', { exact: true })).toBeVisible();

  await expect.poll(async () => page.evaluate(() => {
    const project = window.__collageApp.getProject();
    const shape = Object.values(project.extraLayers?.pages || {})
      .flatMap((item) => item?.drawings || [])
      .find((item) => item?.type === 'shape');
    return { fillEnabled: shape?.fillEnabled, strokeEnabled: shape?.strokeEnabled };
  })).toEqual({ fillEnabled: false, strokeEnabled: true });

  await page.getByRole('button', { name: '+ Квадрат / прямоугольник', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => {
    const project = window.__collageApp.getProject();
    return Object.values(project.extraLayers?.pages || {})
      .flatMap((item) => item?.drawings || [])
      .filter((item) => item?.type === 'shape')
      .map((item) => item.shapeKind);
  })).toEqual(['ellipse', 'rectangle']);
});
