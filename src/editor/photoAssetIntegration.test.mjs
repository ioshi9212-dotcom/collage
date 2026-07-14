import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
const reliabilitySource = readFileSync(resolve(process.cwd(), 'src/editor/reliability.js'), 'utf8');
const cloudSource = readFileSync(resolve(process.cwd(), 'public/cloud-auth.js'), 'utf8');
const projectStorageSource = readFileSync(resolve(process.cwd(), 'public/project-storage.js'), 'utf8');
const packageSource = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');

assert.match(appSource, /from '\.\/editor\/photoAssets'/);
assert.match(appSource, /await persistPhotoFiles\(selection\.accepted/);
assert.doesNotMatch(appSource, /readPhotoFilesAsDataUrls/);
assert.match(appSource, /return createLocalPhotoProject\(\{/);
assert.match(appSource, /async function portableProject\(\)/);
assert.match(appSource, /return createPortablePhotoProject\(project\(\)\)/);
assert.match(appSource, /getPortableProject: \(\) => portableProject\(\)/);
assert.match(appSource, /async function applyProjectData\(data, message\)/);
assert.match(appSource, /await hydratePhotoProject\(prepared\)/);
assert.match(appSource, /releaseUnusedPhotoRuntimeUrls\(runtimePrepared\.library\.map/);
assert.match(appSource, /async function downloadProjectJson\(\)/);
assert.match(appSource, /onClick=\{downloadProjectJson\}>Скачать JSON/);

assert.match(reliabilitySource, /import \{ createLocalPhotoProject \} from '\.\/photoAssets\.js'/);
assert.match(reliabilitySource, /return createLocalPhotoProject\(\{/);

assert.match(cloudSource, /async function getEditorProject\(\)/);
assert.match(cloudSource, /typeof bridge\.getPortableProject === 'function'/);
assert.match(cloudSource, /await bridge\.getPortableProject\(\)/);
assert.match(cloudSource, /const editorProject = await getEditorProject\(\)/);

assert.match(projectStorageSource, /typeof bridge\.getProject !== 'function'/, 'local persistence must keep using the compact project bridge');
assert.doesNotMatch(projectStorageSource, /getPortableProject/, 'local persistence must not materialize Base64 originals');
assert.doesNotMatch(packageSource, /photoImportQueue/, 'the obsolete FileReader queue must leave the test graph');

console.log('photo asset integration checks passed');
