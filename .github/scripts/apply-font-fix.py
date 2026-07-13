from pathlib import Path
import json

server_path = Path('server.js')
server = server_path.read_text(encoding='utf-8')
old_mime = """  '.webp': 'image/webp',
  '.woff': 'font/woff',
"""
new_mime = """  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
"""
if server.count(old_mime) != 1:
    raise SystemExit(f'Expected one font MIME insertion point, found {server.count(old_mime)}')
server_path.write_text(server.replace(old_mime, new_mime, 1), encoding='utf-8')

package_path = Path('package.json')
package = json.loads(package_path.read_text(encoding='utf-8'))
package.setdefault('scripts', {})['test'] = 'node src/editor/layout.test.mjs && node src/editor/font-assets.test.mjs'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

test_path = Path('src/editor/font-assets.test.mjs')
test_path.write_text("""import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const styles = readFileSync(resolve(root, 'src/styles.css'), 'utf-8');
const fontUrls = [...styles.matchAll(/url\\(['\"]?([^'\")]+)['\"]?\\)/g)]
  .map((match) => match[1])
  .filter((url) => url.startsWith('/fonts/'));

assert.equal(fontUrls.length, 19, `expected 19 local font declarations, found ${fontUrls.length}`);
assert.equal(new Set(fontUrls).size, fontUrls.length, 'font URLs must be unique');
assert.ok((styles.match(/font-display:\\s*swap/g) || []).length >= fontUrls.length, 'every local font must use font-display: swap');

const validSignatures = new Set(['00010000', '4f54544f', '74727565', '74746366']);
for (const url of fontUrls) {
  const decodedPath = decodeURIComponent(url).replace(/^\\//, '');
  const filePath = resolve(root, 'public', decodedPath);
  assert.ok(existsSync(filePath), `missing font asset: ${decodedPath}`);
  assert.ok(statSync(filePath).size > 1024, `font asset is unexpectedly small: ${decodedPath}`);
  const signature = readFileSync(filePath).subarray(0, 4).toString('hex');
  assert.ok(validSignatures.has(signature), `invalid font signature for ${decodedPath}: ${signature}`);
}

const server = readFileSync(resolve(root, 'server.js'), 'utf-8');
assert.match(server, /'\\.ttf':\\s*'font\\/ttf'/, 'server must send font/ttf');
assert.match(server, /'\\.otf':\\s*'font\\/otf'/, 'server must send font/otf');
assert.match(server, /'\\.woff':\\s*'font\\/woff'/, 'server must send font/woff');
assert.match(server, /'\\.woff2':\\s*'font\\/woff2'/, 'server must send font/woff2');

const app = readFileSync(resolve(root, 'src/AppLive.jsx'), 'utf-8');
assert.match(app, /async function waitForFonts\\(\\)/, 'editor must define font export readiness');
assert.match(app, /await document\\.fonts\\?\\.ready/, 'editor must wait for browser fonts');
assert.ok((app.match(/await waitForFonts\\(\\)/g) || []).length >= 2, 'page and booklet exports must wait for fonts');

console.log(`font asset checks passed: ${fontUrls.length} fonts`);
""", encoding='utf-8')
