import { expect, test } from '@playwright/test';

async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
}

async function visibleSolidButtons(page) {
  return page.locator('button:visible').evaluateAll((buttons) => buttons
    .map((button) => {
      const style = getComputedStyle(button);
      return {
        label: (button.getAttribute('aria-label') || button.textContent || '').trim(),
        background: style.backgroundColor,
        color: style.color,
      };
    })
    .filter((item) => item.background === 'rgb(62, 72, 77)' && item.color === 'rgb(255, 255, 255)'));
}

test.describe('button audit', () => {
  test('keeps Save as the only solid global primary action', async ({ page }) => {
    await openEditor(page);

    await expect(page.locator('.primary-save-v2')).toHaveCount(1);
    await expect.poll(() => visibleSolidButtons(page)).toEqual([
      { label: 'Сохранить', background: 'rgb(62, 72, 77)', color: 'rgb(255, 255, 255)' },
    ]);

    await page.getByRole('button', { name: 'Текст', exact: true }).click();
    const addText = page.getByRole('button', { name: '+ Обычный текст' });
    await expect(addText).toBeVisible();
    await expect(addText).not.toHaveCSS('background-color', 'rgb(62, 72, 77)');
  });

  test('danger actions and active modes are distinct from primary actions', async ({ page }) => {
    await openEditor(page);

    const viewSwitch = page.getByLabel('Режим просмотра');
    const spreadMode = viewSwitch.getByRole('button', { name: 'Разворот', exact: true });
    await expect(spreadMode).toHaveClass(/active/);
    await expect(spreadMode).toHaveCSS('background-color', 'rgb(227, 231, 233)');

    await page.getByRole('button', { name: 'Страницы', exact: true }).click();
    const deletePage = page.getByRole('button', { name: 'Удалить страницу', exact: true });
    await expect(deletePage).toBeVisible();
    await expect(deletePage).toHaveCSS('color', 'rgb(182, 80, 80)');
    await expect(deletePage).not.toHaveCSS('background-color', 'rgb(62, 72, 77)');
  });

  test('keyboard focus and compact icon controls remain easy to target', async ({ page }) => {
    await openEditor(page);

    const openButton = page.getByRole('button', { name: 'Открыть последнее сохранение', exact: true });
    await openButton.focus();
    await expect(openButton).toHaveCSS('outline-width', '3px');
    const openBox = await openButton.boundingBox();
    expect(openBox?.height).toBeGreaterThanOrEqual(36);

    await page.getByLabel('Режим просмотра').getByRole('button', { name: 'Брошюра', exact: true }).click();
    const navigation = page.locator('.button-row-v3');
    await expect(navigation).toBeVisible();
    const previous = navigation.locator('button').first();
    const next = navigation.locator('button').last();
    const previousBox = await previous.boundingBox();
    const nextBox = await next.boundingBox();
    expect(previousBox?.width).toBeGreaterThanOrEqual(44);
    expect(previousBox?.height).toBeGreaterThanOrEqual(44);
    expect(nextBox?.width).toBeGreaterThanOrEqual(44);
    expect(nextBox?.height).toBeGreaterThanOrEqual(44);
  });
});
