import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../AppLive.jsx', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const canvasShellCss = await readFile(new URL('../editor-shell-stage4c-larger-canvas.css', import.meta.url), 'utf8');

for (const symbol of [
  'getBookletVisiblePageNumbers',
  'getPreviewScale',
  'getStablePreviewViewport',
  'canvasAreaRef',
  'previewViewport',
  "activePageId={isBooklet ? entry.page?.id ?? null : album.currentPageId}",
]) {
  assert.ok(appSource.includes(symbol), `AppLive must connect ${symbol}`);
}

assert.ok(appSource.includes('viewportHeight: window.innerHeight'), 'preview height must come from the stable browser viewport');
assert.ok(!appSource.includes('window.innerHeight - Math.max(0, rect.top)'), 'preview sizing must not depend on the temporary page position');
assert.ok(!appSource.includes("node.querySelector('.canvas-toolbar')"), 'preview sizing must not feed back from toolbar layout changes');
assert.ok(appSource.includes('if (Math.abs(nextWidth - observedWidth) < 1) return;'), 'ResizeObserver must ignore height-only canvas changes');
assert.ok(appSource.includes('scheduleMeasure(60)'), 'container width changes must settle before committing a new preview size');
assert.ok(appSource.includes('}, []);'), 'preview observer must not be recreated for every page or booklet side');
assert.ok(appSource.includes("const isCurrent = isBooklet ? isVisibleInBooklet : page.id === album.currentPageId"), 'both booklet pages must receive the current-page treatment');
assert.ok(!appSource.includes('className={`page-chip'), 'retired top page chips must stay removed');
assert.ok(appSource.includes("'--stage-display-height': `${stageDisplayHeight}px`"), 'responsive stage height must be exposed to CSS');
assert.ok(cssSource.includes('overflow: hidden; /* fitted preview: no internal scrollbars */'), 'fitted preview must hide internal scrollbars');
assert.ok(cssSource.includes('grid-template-columns: 220px minmax(320px, 1fr) 250px !important;'), 'canvas column must use available width instead of max-content');
assert.ok(canvasShellCss.includes('height: calc(var(--stage-display-height) + 2px);'), 'visible stage frame must reserve the transformed canvas height');
assert.match(canvasShellCss, /\.stage-frame\s*\{[^}]*padding:\s*0;/s, 'fitted stage must not inherit legacy internal padding');

console.log('stable responsive preview integration checks passed');
