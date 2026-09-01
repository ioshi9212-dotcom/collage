import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/editor/appIntegration.test.mjs';
let source = readFileSync(path, 'utf8');

const oldUsage = "assert.match(appSource, /В списке: \\{visibleLibrary\\.length\\} · в альбоме: \\{usedPhotoIds\\.size\\}/, 'photo panel must distinguish visible thumbnails from originals retained by the album');";
const newUsage = "assert.match(appSource, /Не использованы <b>\\{unusedLibraryPhotos\\.length\\}<\\/b>/, 'photo panel must expose unused photos separately');\nassert.match(appSource, /В альбоме <b>\\{usedLibraryPhotos\\.length\\}<\\/b>/, 'photo panel must expose already used photos separately');";
assert.ok(source.includes(oldUsage), 'old photo usage contract not found');
source = source.replace(oldUsage, newUsage);

const oldRecovery = "assert.match(appSource, /Восстановить фотографии/, 'photo panel must expose bulk recovery for damaged albums');";
const newRecovery = "assert.match(appSource, /<strong>Восстановить<\\/strong>/, 'photo panel must expose bulk recovery for damaged albums');";
assert.ok(source.includes(oldRecovery), 'old recovery contract not found');
source = source.replace(oldRecovery, newRecovery);

writeFileSync(path, source);
console.log('Photo panel integration contract updated');
