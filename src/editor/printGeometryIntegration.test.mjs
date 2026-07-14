import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../AppLive.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

assert.match(app, /from '\.\/editor\/printGeometry'/, 'editor must import the physical print geometry module');
assert.match(app, /getPrintPixelGeometry\(\{ canvas, settings, kind: 'page' \}\)/, 'page print geometry must be computed');
assert.match(app, /getPrintPixelGeometry\(\{ canvas, settings, kind: 'spread' \}\)/, 'spread print geometry must be computed');
assert.match(app, /composePrintRaster\(raw, geometry\)/, 'page and spread PNG must be composed to exact print pixels');
assert.match(app, /PRINT_ONLY_SETTING_KEYS\.has\(key\)/, 'print-only controls must not rebuild album frames');
assert.match(app, /name="print-photo"/, 'photo nodes must be discoverable for DPI warnings');
assert.match(app, /estimateEffectiveDpi/, 'photo resolution warnings must use effective DPI');
assert.match(app, />Ширина мм</, 'physical width control must be visible');
assert.match(app, />Высота мм</, 'physical height control must be visible');
assert.match(app, />Вылет мм</, 'bleed control must be visible');
assert.match(app, />Безопасно мм</, 'safe-zone control must be visible');
assert.match(app, /pagePrintGeometry\)}>PNG страницы</, 'page export must receive page print geometry');
assert.match(app, /spreadPrintGeometry\)}>PNG разворота</, 'spread export must receive spread print geometry');
assert.match(app, /exportRatio: bookletPixelRatio/, 'booklet manifest must record its calculated export ratio');
assert.doesNotMatch(app, /EXPORT_RATIO/, 'fixed export ratio must not remain in the editor');
assert.match(styles, /\.print-summary\s*\{/, 'print summary styling must exist');

console.log('print geometry integration checks passed');
