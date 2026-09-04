import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  albumMaxSpread,
  albumSpreadForPage,
  albumSpreadPages,
  albumTurningLeafPages,
  albumTurningLeafVisibleFace,
  albumVisiblePageLabel,
} from './albumFlipModel.js';

assert.equal(albumMaxSpread(0), 0);
assert.equal(albumMaxSpread(1), 0);
assert.equal(albumMaxSpread(2), 1);
assert.equal(albumMaxSpread(112), 56);

assert.deepEqual(albumSpreadPages(0, 112), { spreadIndex: 0, left: null, right: 0 });
assert.deepEqual(albumSpreadPages(1, 112), { spreadIndex: 1, left: 1, right: 2 });
assert.deepEqual(albumSpreadPages(56, 112), { spreadIndex: 56, left: 111, right: null });
assert.equal(albumSpreadForPage(0, 112), 0);
assert.equal(albumSpreadForPage(1, 112), 1);
assert.equal(albumSpreadForPage(2, 112), 1);
assert.equal(albumSpreadForPage(111, 112), 56);
assert.equal(albumVisiblePageLabel(0, 112), 'Страница 1');
assert.equal(albumVisiblePageLabel(1, 112), 'Страницы 2–3');

const current = { left: 9, right: 10 };
assert.deepEqual(
  albumTurningLeafPages('next', current, { left: 11, right: 12 }),
  { front: 10, back: 11 },
);
assert.deepEqual(
  albumTurningLeafPages('prev', current, { left: 7, right: 8 }),
  { front: 9, back: 8 },
);
assert.equal(albumTurningLeafVisibleFace(0), 'front');
assert.equal(albumTurningLeafVisibleFace(0.499), 'front');
assert.equal(albumTurningLeafVisibleFace(0.5), 'back');
assert.equal(albumTurningLeafVisibleFace(1), 'back');

const editorSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
assert.ok(editorSource.includes("albumSpreadForPage(currentPageIndex, pages.length)"), 'editor spread must use book spread numbering');
assert.ok(editorSource.includes("albumSpreadPages(spreadIndex, pages.length)"), 'editor spread must share the album spread model');
assert.ok(editorSource.includes("spreadPageIndexes.map((pageIndex, position)"), 'editor spread must render the opening page alone and later pages as pairs');
assert.ok(editorSource.includes("pageNumber % 2 === 0 ? 'левая' : 'правая'"), 'even book pages must be left and odd pages must be right');
assert.ok(editorSource.includes("width={canvas.width * spreadPageCount}"), 'spread export width must support a single opening page');
assert.ok(!editorSource.includes("currentPageIndex % 2 === 0 ? currentPageIndex : currentPageIndex - 1"), 'legacy 1-2 / 3-4 spread pairing must be removed');

const previewSource = readFileSync(resolve(process.cwd(), 'src/editor/AlbumFlipPreview.jsx'), 'utf8');
assert.match(previewSource, /function PaperStack/);
assert.match(previewSource, /album-flip-leaf-curl/);
assert.match(previewSource, /onPointerMove=\{handlePointerMove\}/);
assert.match(previewSource, /TURN_COMMIT_PROGRESS/);
assert.match(previewSource, /Потяни внешний край листа/);
assert.match(previewSource, /data-album-leaf-side="front"/);
assert.match(previewSource, /data-album-leaf-side="back"/);
assert.match(previewSource, /visibility: visibleFace === 'front'/);
assert.match(previewSource, /visibility: visibleFace === 'back'/);
assert.match(previewSource, /MAX_VIEWER_ZOOM = 3\.4/);
assert.match(previewSource, /type: 'pinch'/);
assert.match(previewSource, /pointers\.size >= 2/);
assert.match(previewSource, /translate3d\(\$\{zoomPan\.x\}px, \$\{zoomPan\.y\}px, 0\)/);
assert.match(previewSource, /touchAction: zoomed \? 'none'/);
assert.match(previewSource, /disabled=\{zoomed \|\| spreadIndex/);

const hostSource = readFileSync(resolve(process.cwd(), 'src/editor/AlbumFlipPreviewHost.jsx'), 'utf8');
assert.match(hostSource, /Листать альбом/);
assert.match(hostSource, /<AlbumFlipPreview/);
assert.match(hostSource, /window\.__collageApp\?\.getProject/);
assert.match(hostSource, /<PreviewPageNumber/);
assert.match(hostSource, /DrawingImageLayer/, '3D album preview must render PNG drawings');
assert.match(hostSource, /<Ellipse/, '3D album preview must render ellipse shapes');
assert.match(hostSource, /function PreviewShapeDrawing/, '3D album preview must render editable shapes');
assert.match(hostSource, /plane="back"[\s\S]*frames\.map[\s\S]*plane="front"/, '3D album preview must preserve under-photo and over-photo drawing planes');
assert.match(hostSource, /strokeScaleEnabled: true/, 'frame borders in the 3D album must scale together with the printed page');
assert.doesNotMatch(hostSource, /if \(item\?\.type !== 'line'\) return null/, '3D album preview must not discard PNG and shape drawings');

const mainSource = readFileSync(resolve(process.cwd(), 'src/main.jsx'), 'utf8');
assert.match(mainSource, /album-flip-preview\.css/);
assert.match(mainSource, /album-flip-leaf-surface\.css/);
assert.match(mainSource, /<AlbumFlipPreviewHost\s*\/>/);

const cssSource = readFileSync(resolve(process.cwd(), 'src/album-flip-preview.css'), 'utf8');
assert.match(cssSource, /\.album-flip-paper-stack/);
assert.match(cssSource, /\.album-flip-turning-inner/);
assert.match(cssSource, /\.album-flip-leaf-curl/);
assert.match(cssSource, /repeating-linear-gradient\(0deg, #d8d0c6/);

const surfaceSource = readFileSync(resolve(process.cwd(), 'src/album-flip-leaf-surface.css'), 'utf8');
assert.match(surfaceSource, /\.album-flip-turning-inner::before/);
assert.match(surfaceSource, /background:[\s\S]*#f7f4ef/);
assert.match(surfaceSource, /backface-visibility: visible/);
assert.match(surfaceSource, /\.album-flip-turning-front,[\s\S]*\.album-flip-turning-back/);

console.log('album flip preview checks passed');
