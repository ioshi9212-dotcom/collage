import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
  await page.getByLabel('Режим просмотра').getByRole('button', { name: 'Страница', exact: true }).click();
  await page.locator('.editor-tool-button-v2[aria-label="Коллаж"]').click();
}

async function clickFirstFrame(page) {
  const point = await page.evaluate(() => {
    const project = window.__collageApp.getProject();
    const pageData = project.pages.find((item) => item.id === project.currentPageId);
    const frame = pageData.frames[0];
    const shell = document.querySelector('.stage-scale-shell').getBoundingClientRect();
    const scale = shell.width / project.canvas.width;
    return {
      x: shell.left + (frame.x + frame.width / 2) * scale,
      y: shell.top + (frame.y + frame.height / 2) * scale,
    };
  });
  await page.mouse.click(point.x, point.y);
}

test('applies borders and rounded corners to a frame, page, or album', async ({ page }) => {
  await openEditor(page);
  await clickFirstFrame(page);

  await page.getByLabel('Вид рамки').selectOption('dashed');
  await page.getByLabel('Цвет рамки').fill('#7a5c50');
  await page.getByLabel('Толщина').fill('14');
  await page.getByLabel('Скругление').fill('90');
  await page.getByRole('button', { name: 'Применить оформление' }).click();

  const selectedOnly = await page.evaluate(() => {
    const project = window.__collageApp.getProject();
    const current = project.pages.find((item) => item.id === project.currentPageId);
    return current.frames.map(({ borderStyle, borderWidth, borderColor, cornerRadius }) => ({
      borderStyle, borderWidth, borderColor, cornerRadius,
    }));
  });
  expect(selectedOnly[0]).toEqual({
    borderStyle: 'dashed',
    borderWidth: 14,
    borderColor: '#7a5c50',
    cornerRadius: 90,
  });
  expect(selectedOnly[1].borderWidth).toBeUndefined();

  await page.getByLabel('Применить к').selectOption('page');
  await page.getByRole('button', { name: 'Применить оформление' }).click();
  await expect.poll(() => page.evaluate(() => {
    const project = window.__collageApp.getProject();
    return project.pages
      .find((item) => item.id === project.currentPageId)
      .frames.every((frame) => frame.cornerRadius === 90);
  })).toBe(true);

  await page.getByLabel('Применить к').selectOption('album');
  await page.getByLabel('Вид рамки').selectOption('double');
  await page.getByRole('button', { name: 'Применить оформление' }).click();
  await expect.poll(() => page.evaluate(() => window.__collageApp.getProject().pages
    .flatMap((item) => item.frames)
    .every((frame) => frame.borderStyle === 'double'))).toBe(true);
});
