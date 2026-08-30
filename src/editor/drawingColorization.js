function parseHexColor(value) {
  const text = String(value || '').trim();
  const short = text.match(/^#([0-9a-f]{3})$/i);
  if (short) return short[1].split('').map((char) => Number.parseInt(char + char, 16));
  const full = text.match(/^#([0-9a-f]{6})$/i);
  if (!full) return [0, 0, 0];
  return [0, 2, 4].map((offset) => Number.parseInt(full[1].slice(offset, offset + 2), 16));
}

export function colorizeDrawingImage(image, color = '#000000') {
  if (!image?.naturalWidth || !image?.naturalHeight || typeof document === 'undefined') return image;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return image;
  try {
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const [red, green, blue] = parseHexColor(color);
    for (let index = 0; index < pixels.data.length; index += 4) {
      if (pixels.data[index + 3] === 0) continue;
      pixels.data[index] = red;
      pixels.data[index + 1] = green;
      pixels.data[index + 2] = blue;
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  } catch {
    return image;
  }
}

export { parseHexColor };
