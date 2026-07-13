from pathlib import Path

path = Path('src/AppLive.jsx')
text = path.read_text(encoding='utf-8')

import_anchor = "import { compactProjectPhotos, hydrateProjectPhotos } from './editor/photoStorage';\n"
import_replacement = import_anchor + "import { loadCachedImage as loadImage } from './editor/imageCache';\n"
if text.count(import_anchor) != 1:
    raise SystemExit(f'expected one photoStorage import, found {text.count(import_anchor)}')
text = text.replace(import_anchor, import_replacement, 1)

cache_declaration = "const imageCache = new Map();\n\n"
if text.count(cache_declaration) != 1:
    raise SystemExit(f'expected one imageCache declaration, found {text.count(cache_declaration)}')
text = text.replace(cache_declaration, '', 1)

old_loader = """function loadImage(src) {
  if (imageCache.has(src)) return Promise.resolve(imageCache.get(src));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      imageCache.set(src, image);
      resolve(image);
    };
    image.onerror = reject;
    image.src = src;
  });
}

"""
if text.count(old_loader) != 1:
    raise SystemExit(f'expected one legacy loadImage function, found {text.count(old_loader)}')
text = text.replace(old_loader, '', 1)

path.write_text(text, encoding='utf-8')
