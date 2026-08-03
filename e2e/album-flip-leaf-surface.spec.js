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
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
  .album-flip-turning-back { transform: rotateY(180deg); }
`;

async function brightPixelCount(page, angle) {
  await page.locator('.album-flip-turning-inner').evaluate((element, value) => {
    element.style.transform = `rotateY(${value}deg)`;
  }, angle);

  const image = await page.locator('.scene').screenshot();
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let brightPixels = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset] > 210 && data[offset + 1] > 205 && data[offset + 2] > 195) {
      brightPixels += 1;
    }
  }
  return brightPixels;
}

test('turning sheet keeps an opaque paper surface on both sides', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 560 });
  await page.setContent(`
    <style>${fixtureCss}\n${surfaceCss}</style>
    <div class="scene">
      <div class="album-flip-turning-inner">
        <div class="album-flip-turning-front" style="visibility:hidden"></div>
        <div class="album-flip-turning-back" style="visibility:hidden"></div>
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

  const frontHalfPixels = await brightPixelCount(page, -65);
  const backHalfPixels = await brightPixelCount(page, -115);

  expect(frontHalfPixels).toBeGreaterThan(8_000);
  expect(backHalfPixels).toBeGreaterThan(8_000);
});
