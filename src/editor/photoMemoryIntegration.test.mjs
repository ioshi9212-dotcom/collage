import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
const thumbnailSource = readFileSync(resolve(process.cwd(), 'src/editor/PhotoLibraryThumbnail.jsx'), 'utf8');
const stylesSource = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

assert.match(appSource, /import PhotoLibraryThumbnail from '\.\/editor\/PhotoLibraryThumbnail'/);
assert.match(appSource, /persistPhotoFiles/);
assert.match(appSource, /async function uploadPhotos\(event\)/);
assert.match(appSource, /const chunkSize = 2/, 'large selections must be split into small responsive chunks');
assert.match(appSource, /await persistPhotoFiles\(chunk, \{ idFactory: makeId, maxConcurrent: 1 \}\)/, 'each chunk must be written sequentially to reduce memory and storage contention');
assert.match(appSource, /await new Promise\(\(resolve\) => requestAnimationFrame/, 'the browser must be allowed to repaint between photo chunks');
assert.doesNotMatch(appSource, /readPhotoFilesAsDataUrls/, 'uploads must store File blobs without creating Base64 copies');
assert.doesNotMatch(appSource, /selection\.accepted\.forEach\(\(file\)/, 'uploads must not start one storage operation per photo at once');
assert.match(appSource, /<PhotoLibraryThumbnail photo=\{photo\} \/>/);
assert.doesNotMatch(appSource, /<img src=\{photo\.src\}/, 'the library must not mount full-resolution originals');

assert.match(thumbnailSource, /IntersectionObserver/);
assert.match(thumbnailSource, /rootMargin: OBSERVER_MARGIN/);
assert.match(thumbnailSource, /setPreviewSrc\(''\)/, 'offscreen thumbnails must release their mounted source');
assert.match(thumbnailSource, /loading="lazy"/);
assert.match(thumbnailSource, /decoding="async"/);

assert.match(stylesSource, /\.photo-card \{[\s\S]*?content-visibility: auto;/);
assert.match(stylesSource, /\.photo-thumbnail-placeholder/);
assert.match(stylesSource, /\.disabled-upload-box/);

console.log('photo memory integration checks passed');
