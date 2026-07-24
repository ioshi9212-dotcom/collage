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
assert.match(appSource, /Загружено: \{library\.length\} · используется: \{usedPhotoIds\.size\}/, 'photo panel must show loaded and used counts');
assert.match(appSource, /projectJsonFileError\(file\)/, 'project imports must enforce the JSON file limit');
assert.match(appSource, /describeSaveResult\(\{ local, indexedDb, cloud, cloudError \}\)/, 'save feedback must be based on confirmed storage outcomes');
assert.match(appSource, /createPreparedProjectSnapshot\(prepared\)/, 'opened cloud projects must persist the validated normalized snapshot');

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
