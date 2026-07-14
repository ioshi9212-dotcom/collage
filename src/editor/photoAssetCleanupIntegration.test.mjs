import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
const cleanupSource = readFileSync(resolve(process.cwd(), 'src/editor/photoAssetCleanup.js'), 'utf8');
const packageSource = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');

assert.match(appSource, /import \{ cleanupOrphanedPhotoAssets \} from '\.\/editor\/photoAssetCleanup'/);
assert.match(appSource, /function cleanupPhotoAssetsInBackground\(currentProject\)/);
assert.match(appSource, /cleanupOrphanedPhotoAssets\(\{ currentProject \}\)/);
assert.match(appSource, /setTimeout\([\s\S]{0,500}cleanupPhotoAssetsInBackground\(window\.__collageApp\?\.getProject\?\.\(\)\)/);
assert.match(appSource, /if \(outcome\.ok\) cleanupPhotoAssetsInBackground\(data\)/);
assert.match(appSource, /result\.deletedCount[\s\S]{0,160}releaseUnusedPhotoRuntimeUrls\(result\.activeAssetIds\)/);
assert.doesNotMatch(appSource, /cleanupOrphanedPhotoAssets\(\{[^}]*force:\s*true/, 'normal editor cleanup must keep the grace and throttle guards');

assert.match(cleanupSource, /PHOTO_ASSET_CLEANUP_GRACE_MS = 14 \* 24 \* 60 \* 60 \* 1000/);
assert.match(cleanupSource, /PHOTO_ASSET_CLEANUP_MAX_DELETE = 50/);
assert.match(cleanupSource, /typeof bridge\.readLatest !== 'function'/);
assert.match(cleanupSource, /key === CURRENT_STORAGE_KEY \|\| key\.startsWith\(LEGACY_STORAGE_PREFIX\)/);
assert.match(cleanupSource, /const storedProjects = await readStoredProjects\(\);[\s\S]{0,500}const records = await listAssets\(\);/, 'project references must be read before photo records are considered');
assert.match(cleanupSource, /if \(deletedIds\.length\) await deleteAssets\(deletedIds\);/);
assert.match(cleanupSource, /writeLastRun\(storage, now\);/);
assert.match(packageSource, /photoAssetCleanup\.test\.mjs/);
assert.match(packageSource, /photoAssetCleanupIntegration\.test\.mjs/);

console.log('photo asset cleanup integration checks passed');
