import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const surfaceCss = readFileSync(
  resolve(process.cwd(), 'src/album-flip-leaf-surface.css'),
  'utf8',
);

const fixtureCss = `
  html, body { margin: 0; width: 100%; height: 100%; background: #202425; }
  body { display: grid; place-items: center; }
  .scene { width: 520px; height: 420px; display: grid; place-items: center; perspective: 1800px; }
  .album-flip-turning-inner {
    position: relative;
    width: 260px;
    height: 360px;
    transform-style: preserve-3d;
    transform-origin: left center;
  }
  .album-flip-turning-front,
  .album-flip-turning-back {
    position: absolute;
    inset: 0;
  }
  .album-flip-turning-back { transform: rotateY(180deg); }
  .sample-face { position: absolute; inset: 0; }
  .sample-front { background: rgb(220, 45, 45); }
  .sample-back { background: rgb(45, 90, 220); }
`;

async function readPixelCounts(page, angle) {
  await page.locator('.album-flip-turning-inner').evaluate((element, value) => {
    element.style.transform = `rotateY(${value}deg)`;
  }, angle);

  const image = await page.locator('.scene').screenshot();
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const counts = { bright: 0, red: 0, blue: 0 };
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    if (red > 210 && green > 205 && blue > 195) counts.bright += 1;
    if (red > 170 && green < 115 && blue < 115) counts.red += 1;
    if (blue > 170 && red < 115 && green < 145) counts.blue += 1;
  }
  return counts;
}

test('turning sheet keeps an opaque paper surface on both sides', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 560 });
  await page.setContent(`
    <style>${fixtureCss}\n${surfaceCss}</style>
    <div class="scene">
      <div class="album-flip-turning-inner">
        <div class="album-flip-turning-front" aria-hidden="true" style="visibility:hidden"></div>
        <div class="album-flip-turning-back" aria-hidden="true" style="visibility:hidden"></div>
      </div>
    </div>
  `);

  const inner = page.locator('.album-flip-turning-inner');
  const paperSurface = await inner.evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return {
      content: style.content,
      backgroundColor: style.backgroundColor,
      backfaceVisibility: style.backfaceVisibility,
    };
  });

  expect(paperSurface.content).not.toBe('none');
  expect(paperSurface.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(paperSurface.backfaceVisibility).toBe('visible');

  const frontHalf = await readPixelCounts(page, -65);
  const backHalf = await readPixelCounts(page, -115);

  expect(frontHalf.bright).toBeGreaterThan(8_000);
  expect(backHalf.bright).toBeGreaterThan(8_000);
});

test('the page image remains visible and changes to the reverse side after the midpoint', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 560 });
  await page.setContent(`
    <style>${fixtureCss}\n${surfaceCss}</style>
    <div class="scene">
      <div class="album-flip-turning-inner">
        <div class="album-flip-turning-front" aria-hidden="false" style="visibility:visible">
          <div class="sample-face sample-front"></div>
        </div>
        <div class="album-flip-turning-back" aria-hidden="true" style="visibility:hidden">
          <div class="sample-face sample-back"></div>
        </div>
      </div>
    </div>
  `);

  const frontHalf = await readPixelCounts(page, -65);
  expect(frontHalf.red).toBeGreaterThan(8_000);
  expect(frontHalf.blue).toBeLessThan(500);
  expect(frontHalf.red).toBeGreaterThan(frontHalf.bright * 2);

  await page.locator('.album-flip-turning-front').evaluate((element) => {
    element.setAttribute('aria-hidden', 'true');
    element.style.visibility = 'hidden';
  });
  await page.locator('.album-flip-turning-back').evaluate((element) => {
    element.setAttribute('aria-hidden', 'false');
    element.style.visibility = 'visible';
  });

  const backHalf = await readPixelCounts(page, -115);
  expect(backHalf.blue).toBeGreaterThan(8_000);
  expect(backHalf.red).toBeLessThan(500);
  expect(backHalf.blue).toBeGreaterThan(backHalf.bright * 2);
});
