import { test, expect } from '@playwright/test';

function scaleFromTransform(transform) {
  const match = String(transform || '').match(/scale\(([^)]+)\)/);
  return match ? Number(match[1]) : 1;
}

async function pinchScene(page, centerX, centerY, startHalfDistance = 40, endHalfDistance = 50) {
  await page.evaluate(({ centerX, centerY, startHalfDistance, endHalfDistance }) => {
    const scene = document.querySelector('.album-flip-scene');
    if (!scene) throw new Error('album scene not found');
    scene.setPointerCapture = () => {};

    const fire = (type, pointerId, x, y) => {
      scene.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        isPrimary: pointerId === 41,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
      }));
    };

    fire('pointerdown', 41, centerX - startHalfDistance, centerY);
    fire('pointerdown', 42, centerX + startHalfDistance, centerY);
    fire('pointermove', 41, centerX - endHalfDistance, centerY);
    fire('pointermove', 42, centerX + endHalfDistance, centerY);
    fire('pointerup', 41, centerX - endHalfDistance, centerY);
    fire('pointerup', 42, centerX + endHalfDistance, centerY);
  }, { centerX, centerY, startHalfDistance, endHalfDistance });
}

test('public album route supports movable repeated pinch zoom', async ({ page }) => {
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
  const beforePan = await book.evaluate((node) => node.style.transform);
  const box = await scene.boundingBox();
  expect(box).not.toBeNull();

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 100, centerY + 60, { steps: 5 });
  await page.mouse.up();

  await expect.poll(async () => book.evaluate((node) => node.style.transform)).not.toBe(beforePan);
  const afterPan = await book.evaluate((node) => node.style.transform);
  expect(afterPan).toContain('translate3d(');
  expect(afterPan).not.toContain('translate3d(0px, 0px, 0)');

  const scaleBeforePinch = scaleFromTransform(afterPan);
  await pinchScene(page, centerX, centerY);
  await expect.poll(async () => scaleFromTransform(await book.evaluate((node) => node.style.transform)))
    .toBeGreaterThan(scaleBeforePinch + 0.1);
  const scaleAfterFirstPinch = scaleFromTransform(await book.evaluate((node) => node.style.transform));

  await pinchScene(page, centerX, centerY);
  await expect.poll(async () => scaleFromTransform(await book.evaluate((node) => node.style.transform)))
    .toBeGreaterThan(scaleAfterFirstPinch + 0.1);

  const finalTransform = await book.evaluate((node) => node.style.transform);
  expect(scaleFromTransform(finalTransform)).toBeLessThanOrEqual(3.4);
});
