import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
const stylesSource = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

assert.match(appSource, /from '\.\/editor\/reliability'/, 'AppLive must use the extracted reliability helpers');
assert.match(appSource, /showFoldLine:\s*false/, 'print fold line must be opt-in by default');
assert.match(appSource, /showFoldLine:\s*Boolean\(value\.showFoldLine\)/, 'missing print settings must not silently enable the fold line');
assert.match(appSource, /crop-\$\{pageIndex\}-tl[\s\S]{0,160}horizontalDirection=\{-1\}[\s\S]{0,100}verticalDirection=\{-1\}/, 'top-left crop marks must point outside the page');
assert.match(appSource, /CROP_MARK_OFFSET/, 'crop marks must start outside the trim boundary');

const softNumberChange = appSource.match(/onChange=\{\(event\) => \{([\s\S]*?)\n {6}\}\}/)?.[1] || '';
assert.match(softNumberChange, /setDraft\(raw\)/);
assert.doesNotMatch(softNumberChange, /commit\(/, 'number inputs must not rebuild the document on every typed character');

assert.match(appSource, /filterDuplicatePhotoUploads\(rawFiles, library\)/, 'photo uploads must skip duplicates before conversion');
assert.match(appSource, /prepareLocalPhotoFiles\(initialSelection\.accepted/, 'HEIC conversion must run inside the single React upload flow');
assert.match(appSource, /В списке: \{visibleLibrary\.length\} · в альбоме: \{usedPhotoIds\.size\}/, 'photo panel must distinguish visible thumbnails from originals retained by the album');
assert.match(appSource, /retainPlacedPhotos\(library, pages\)/, 'clearing the photo panel must retain originals already placed in frames');
assert.match(appSource, /Восстановить фотографии/, 'photo panel must expose bulk recovery for damaged albums');
assert.match(appSource, /recoverMissingFramePhotos\(pages, \[\.\.\.library, \.\.\.loaded\]\)/, 'recovery must match both retained and newly selected originals');
assert.match(appSource, /projectJsonFileError\(file\)/, 'project imports must enforce the JSON file limit');
assert.match(appSource, /describeSaveResult\(\{ local, indexedDb, cloud, cloudError \}\)/, 'save feedback must be based on confirmed storage outcomes');
assert.match(appSource, /createPreparedProjectSnapshot\(prepared\)/, 'opened cloud projects must persist the validated normalized snapshot');
assert.match(appSource, /await waitForPrintPhotos\(printPageRef,[\s\S]*?await renderPrintPng\(printPageRef/, 'album PDF export must wait for page photos before rasterizing');
assert.match(appSource, /await waitForPrintPhotos\(printBookletRef,[\s\S]*?printBookletRef\.current\?\.toDataURL/, 'booklet PDF export must wait for both page photos before rasterizing');
assert.match(appSource, /function exportPng\([\s\S]*?await waitForPrintPhotos\(stageRefToExport, photoReferences/, 'single-page and spread PNG export must wait for photos');
assert.match(appSource, /async function exportPdf\([\s\S]*?await waitForPrintPhotos\(stageRefToExport, photoReferences/, 'single-page and spread PDF export must wait for photos');
assert.match(appSource, /async function exportBookletSide[\s\S]*?renderBookletSidePng\(sideData\)/, 'single booklet PNG must use the photo-safe renderer');
assert.match(appSource, /async function exportBookletAll[\s\S]*?renderBookletSidePng\(sideData, \{ checkResolution: false \}\)/, 'all booklet PNG exports must use the photo-safe renderer');
assert.match(appSource, /async function exportBookletZip[\s\S]*?renderBookletSidePng\(sideData, \{ checkResolution: false \}\)/, 'booklet ZIP must use the photo-safe renderer');
assert.match(appSource, /PDF не создан/, 'missing or late print photos must abort export instead of producing empty windows');
assert.match(appSource, /collectAlbumResolutionWarnings\(sourcePageIndexesForBookletSides\(sequence\)\)/, 'partial booklet PDF exports must only block on photos included in the selected sides');
assert.match(appSource, /loadedPhoto\.src === photoSource \? loadedPhoto\.image : null/, 'a reused frame must never render the previous page photo while its new source loads');
assert.match(appSource, /printPhotoNodesReady\(references, renderedPhotoState\)/, 'print export must verify photo identity and source, not only rendered node count');
assert.match(appSource, /key=\{`print-page-\$\{exportPage\?\.id/, 'the hidden album stage must remount when the exported page changes');
assert.match(appSource, /hideGuidePageLabel=\{isBooklet\}/, 'booklet preview must not stack the generic page label under its side label');
assert.match(appSource, /<PageNumberLayer[\s\S]*?settings=\{pageNumbering\}/, 'user page numbering must render as a dedicated export layer');
assert.match(appSource, /<details className="page-numbering-settings">/, 'page numbering must have a dedicated inspector selector');
assert.doesNotMatch(appSource, /<details className="print-settings-details-v2 page-numbering-settings">/, 'page numbering must not make the physical print settings selector ambiguous');

const loadSavedBody = appSource.match(/function loadSaved\(\) \{([\s\S]*?)\n {2}\}/)?.[1] || '';
assert.match(loadSavedBody, /applyProjectData\(data, 'Альбом загружен'\)/);
assert.doesNotMatch(loadSavedBody, /setCanvas\(/, 'local loading must use the same atomic validator as cloud loading');

const importJsonBody = appSource.match(/function importJson\(event\) \{([\s\S]*?)\n {2}\}/)?.[1] || '';
assert.match(importJsonBody, /applyProjectData\(data, 'JSON открыт'\)/);
assert.doesNotMatch(importJsonBody, /setCanvas\(/, 'JSON import must not maintain a separate state-mutation path');

assert.match(stylesSource, /grid-template-areas:\s*\n\s*"photos pages"\s*\n\s*"photos canvas"\s*\n\s*"inspector inspector"/, 'frame inspector must remain available on medium screens');
assert.match(stylesSource, /"mode-inspector mode-inspector"/, 'text and drawing inspectors must remain available on medium screens');
assert.match(stylesSource, /@media \(max-width: 980px\)[\s\S]*?\.inspector,[\s\S]*?\.album-mode-inspector[\s\S]*?display:\s*grid !important/, 'inspectors must be visible below the canvas on narrow screens');

console.log('editor integration checks passed');
