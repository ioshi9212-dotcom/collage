import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveStaticRequest, safeStaticPath } from './staticFiles.js';

const distDir = resolve('/tmp/collage-dist');
const files = new Set([
  join(distDir, 'index.html'),
  join(distDir, 'assets', 'app.js'),
  join(distDir, 'fonts', 'album.ttf'),
  join(distDir, 'manifest'),
]);
const fileExists = (path) => files.has(path);
const fileStat = (path) => ({ isFile: () => files.has(path) });
const resolveRequest = (requestUrl, options = {}) => resolveStaticRequest({
  distDir,
  requestUrl,
  method: options.method || 'GET',
  fileExists: options.fileExists || fileExists,
  fileStat: options.fileStat || fileStat,
});

assert.deepEqual(resolveRequest('/'), { kind: 'file', path: join(distDir, 'index.html') });
assert.deepEqual(resolveRequest('/assets/app.js?v=42'), { kind: 'file', path: join(distDir, 'assets', 'app.js') });
assert.deepEqual(resolveRequest('/fonts/album.ttf'), { kind: 'file', path: join(distDir, 'fonts', 'album.ttf') });
assert.deepEqual(resolveRequest('/manifest'), { kind: 'file', path: join(distDir, 'manifest') });
assert.deepEqual(resolveRequest('/assets/app.js', { method: 'HEAD' }), { kind: 'file', path: join(distDir, 'assets', 'app.js') });

for (const missingAsset of [
  '/assets/missing.js',
  '/styles/missing.css',
  '/images/missing.png',
  '/fonts/missing.ttf',
  '/data/missing.json?cache=1',
  '/icons/missing.svg',
]) {
  assert.deepEqual(resolveRequest(missingAsset), { kind: 'not_found' }, `${missingAsset} must return a real 404`);
}

for (const spaRoute of ['/editor', '/albums/123', '/albums/123/', '/project.v2/editor', '/settings?tab=cloud']) {
  assert.deepEqual(resolveRequest(spaRoute), { kind: 'spa', path: join(distDir, 'index.html') }, `${spaRoute} must use the SPA entry`);
}

for (const unsafePath of [
  '/../secret.txt',
  '/%2e%2e/secret.txt',
  '/%2e%2e%2fsecret.txt',
  '/broken/%E0%A4%A',
  '/zero%00byte',
]) {
  assert.equal(safeStaticPath(distDir, unsafePath), null, `${unsafePath} must not resolve inside dist`);
  assert.deepEqual(resolveRequest(unsafePath), { kind: 'not_found' });
}

assert.deepEqual(resolveRequest('/editor', { method: 'POST' }), { kind: 'not_found' }, 'non-GET requests must not receive the SPA shell');
assert.deepEqual(resolveRequest('/editor', { fileExists: () => false }), { kind: 'not_found' }, 'SPA fallback requires a real index.html');

const serverSource = readFileSync(resolve(process.cwd(), 'server.js'), 'utf8');
assert.match(serverSource, /resolveStaticRequest/);
assert.match(serverSource, /staticResult\.kind === 'not_found'/);
assert.match(serverSource, /response\.writeHead\(404/);
assert.doesNotMatch(serverSource, /sendFile\(response, join\(distDir, 'index\.html'\)\);\s*\}\);/, 'server must not unconditionally return index.html');

console.log('static file routing checks passed');
