import { expect, test } from '@playwright/test';

async function openTextInspector(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => (
    typeof window.__collageApp?.getProject === 'function'
    && typeof window.__collageTextEditing?.getState === 'function'
  ));
  await page.getByRole('button', { name: 'Текст', exact: true }).click();
  await page.getByRole('button', { name: '+ Обычный текст', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Настройки текста', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Предыдущий шрифт', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Следующий шрифт', exact: true })).toBeVisible();
}

function selectedTextFont(page) {
  return page.evaluate(() => {
    const project = window.__collageApp.getProject();
    const pageIndex = project.pages.findIndex((item) => item.id === project.currentPageId);
    const texts = project.extraLayers?.pages?.[String(pageIndex + 1)]?.texts || [];
    const selected = texts[0] || null;
    return {
      fontId: selected?.fontId || null,
      fontFamily: selected?.fontFamily || null,
      renderedFontFamily: window.__collageTextEditing.getState().renderedFontFamily,
    };
  });
}

test('font selection and arrow browsing update the canvas immediately', async ({ page }) => {
  await openTextInspector(page);

  const picker = page.getByLabel('Гарнитура');
  await picker.selectOption('caslon');
  await expect.poll(() => selectedTextFont(page)).toMatchObject({
    fontId: 'caslon',
    fontFamily: "'Collage Caslon Becker', Georgia, serif",
    renderedFontFamily: "'Collage Caslon Becker', Georgia, serif",
  });

  await page.getByRole('button', { name: 'Следующий шрифт', exact: true }).click();
  await expect.poll(() => selectedTextFont(page)).toMatchObject({
    fontId: 'agreverence',
    renderedFontFamily: "'Collage AGReverence', Georgia, serif",
  });

  await page.getByRole('button', { name: 'Предыдущий шрифт', exact: true }).click();
  await expect.poll(() => selectedTextFont(page)).toMatchObject({
    fontId: 'caslon',
    renderedFontFamily: "'Collage Caslon Becker', Georgia, serif",
  });

  await picker.focus();
  await picker.press('ArrowRight');
  await expect.poll(() => selectedTextFont(page)).toMatchObject({ fontId: 'agreverence' });
  await expect(page.locator('.font-picker-live-status')).toContainText('AGReverence');
});
