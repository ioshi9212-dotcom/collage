import { expect, test } from '@playwright/test';

// The retired shell must stay physically absent, not merely hidden or inert.
async function openEditor(page) {
  await page.setViewportSize({ width: 1640, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__collageApp?.getProject === 'function');
}

test.describe('legacy editor shell removal', () => {
  test('does not render or install the retired editor shell', async ({ page }) => {
    await openEditor(page);

    await expect(page.locator('.album-bar')).toHaveCount(0);
    await expect(page.locator('.album-tool-panel')).toHaveCount(0);
    await expect(page.locator('.album-mode-sidebar')).toHaveCount(0);
    expect(await page.evaluate(() => typeof window.__collageLegacyControls)).toBe('undefined');
  });

  test('keeps every booklet control in the current page inspector', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Брошюра', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Настройки брошюры', exact: true })).toBeVisible();
    await expect(page.getByLabel('Листов в блоке')).toBeVisible();
    await expect(page.getByLabel('Порядок оборотов')).toBeVisible();
    await expect(page.getByLabel('Развернуть обороты на 180°')).toBeVisible();
    await expect(page.getByText('Печатать линию сгиба', { exact: true })).toBeVisible();
    await expect(page.getByText('Толщина бумаги, мм', { exact: true })).toBeVisible();

    await page.getByText('Экспорт брошюры', { exact: true }).click();
    for (const label of [
      'PDF лицевых A4',
      'PDF оборотов A4',
      'PDF вся брошюра A4',
      'Тест первого листа',
      'Инструкция',
      'PNG текущей стороны',
      'PNG всех сторон',
      'Пакет печати ZIP',
    ]) {
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(1);
    }
  });
});
