import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  return source.replace(before, after);
}

let bucket = readFileSync('server/bucketGateway.js', 'utf8');
bucket = replaceOnce(
  bucket,
  'export function createPhotoAssetRequestHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {',
  'export function createPhotoAssetRequestHandler({ env = process.env, fetchImpl = globalThis.fetch, sessionSecret: sessionSecretOverride } = {}) {',
  'bucket handler signature',
);
bucket = replaceOnce(
  bucket,
  "  const sessionSecret = String(env.SESSION_SECRET || '');",
  "  const sessionSecret = String(sessionSecretOverride ?? env.SESSION_SECRET ?? '');",
  'bucket session secret override',
);
writeFileSync('server/bucketGateway.js', bucket);

let server = readFileSync('server.js', 'utf8');
server = replaceOnce(
  server,
  "import { resolveStaticRequest } from './server/staticFiles.js';\n",
  "import { resolveStaticRequest } from './server/staticFiles.js';\nimport { createPhotoAssetRequestHandler } from './server/bucketGateway.js';\n",
  'server bucket import',
);
server = replaceOnce(
  server,
  "const effectiveSessionSecret = configuredSessionSecret || (isProduction ? randomBytes(32).toString('hex') : 'collage-dev-secret-change-me');\n",
  "const effectiveSessionSecret = configuredSessionSecret || (isProduction ? randomBytes(32).toString('hex') : 'collage-dev-secret-change-me');\nconst handlePhotoAssetRequest = createPhotoAssetRequestHandler({\n  env: process.env,\n  sessionSecret: effectiveSessionSecret,\n});\n",
  'direct bucket handler setup',
);
server = replaceOnce(
  server,
  "  try {\n    if ((request.url || '').startsWith('/api/')) {",
  "  try {\n    if ((request.url || '').startsWith('/api/photo-assets/')) {\n      const handled = await handlePhotoAssetRequest(request, response);\n      if (handled) return;\n    }\n\n    if ((request.url || '').startsWith('/api/')) {",
  'direct bucket route',
);
writeFileSync('server.js', server);

let app = readFileSync('src/AppLive.jsx', 'utf8');
app = replaceOnce(
  app,
  "import { saveCloudProject } from './editor/cloudProjects';\n",
  "import { saveCloudProject } from './editor/cloudProjects';\nimport {\n  createCloudPhotoProject,\n  mergeCloudMetadataIntoLibrary,\n  mergeCloudPhotoMetadata,\n} from './editor/cloudPhotoSync';\n",
  'cloud sync imports',
);
app = replaceOnce(
  app,
  `  async function portableProject() {
    return createPortablePhotoProject(liveProject());
  }
`,
  `  async function portableProject() {
    return createPortablePhotoProject(liveProject());
  }

  async function cloudProject(data = project()) {
    return createCloudPhotoProject(data, {
      maxConcurrent: 2,
      onProgress: ({ finished, total, name, reused }) => {
        if (!total) return;
        const current = reused ? finished : Math.min(total, finished + 1);
        show(\`Фото в облако: \${current} из \${total} · \${name || 'Фото'}\`);
      },
    });
  }
`,
  'cloud project builder',
);
const oldSave = `  async function save() {
    const data = project();
    const local = saveLocalProject({ silent: true, data });
    const storeSnapshot = window.__collageProjectStorage?.storeSnapshot;
    const storagePromise = typeof storeSnapshot === 'function'
      ? Promise.resolve(storeSnapshot(data, { source: 'manual-save' }))
          .then(() => ({ ok: true }))
          .catch((error) => {
            console.warn('IndexedDB project save failed', error);
            return { ok: false, error };
          })
      : Promise.resolve({ ok: false, skipped: true });

    let cloud = null;
    let cloudError = null;
    const canSaveCloud = window.__collageCloudAuth?.isAuthenticated?.() === true;
    if (canSaveCloud) {
      try {
        cloud = await saveCloudProject(await portableProject());
      } catch (error) {
        cloudError = error;
        console.warn('Cloud project save failed', error);
      }
    }

    const indexedDb = await storagePromise;
    const outcome = describeSaveResult({ local, indexedDb, cloud, cloudError });
    show(outcome.message);
    if (outcome.ok) cleanupPhotoAssetsInBackground(data);
    return { ok: outcome.ok, local, indexedDb, cloud, cloudError, data };
  }
`;
const newSave = `  async function save() {
    const data = project();
    let savedData = data;
    let local = saveLocalProject({ silent: true, data });
    const storeSnapshot = window.__collageProjectStorage?.storeSnapshot;
    let indexedDb = typeof storeSnapshot === 'function'
      ? await Promise.resolve(storeSnapshot(data, { source: 'manual-save' }))
          .then(() => ({ ok: true }))
          .catch((error) => {
            console.warn('IndexedDB project save failed', error);
            return { ok: false, error };
          })
      : { ok: false, skipped: true };

    let cloud = null;
    let cloudError = null;
    const canSaveCloud = window.__collageCloudAuth?.isAuthenticated?.() === true;
    if (canSaveCloud) {
      try {
        const cloudData = await cloudProject(data);
        cloud = await saveCloudProject(cloudData);
        savedData = mergeCloudPhotoMetadata(data, cloudData);
        local = saveLocalProject({ silent: true, data: savedData });
        setLibrary((current) => mergeCloudMetadataIntoLibrary(current, cloudData));
        if (typeof storeSnapshot === 'function') {
          indexedDb = await Promise.resolve(storeSnapshot(savedData, { source: 'cloud-photo-sync' }))
            .then(() => ({ ok: true }))
            .catch((error) => {
              console.warn('IndexedDB cloud metadata save failed', error);
              return { ok: false, error };
            });
        }
      } catch (error) {
        cloudError = error;
        console.warn('Cloud project save failed', error);
      }
    }

    const outcome = describeSaveResult({ local, indexedDb, cloud, cloudError });
    show(outcome.message);
    if (outcome.ok) cleanupPhotoAssetsInBackground(savedData);
    return { ok: outcome.ok, local, indexedDb, cloud, cloudError, data: savedData };
  }
`;
app = replaceOnce(app, oldSave, newSave, 'save without base64 cloud payload');
app = replaceOnce(
  app,
  `      getProject: () => project(),
      getPortableProject: () => portableProject(),
      saveLocal: () => saveLocalProject({ silent: true }),`,
  `      getProject: () => project(),
      getPortableProject: () => portableProject(),
      getCloudProject: () => cloudProject(),
      saveLocal: () => saveLocalProject({ silent: true }),`,
  'cloud bridge method',
);
writeFileSync('src/AppLive.jsx', app);

let auth = readFileSync('public/cloud-auth.js', 'utf8');
auth = replaceOnce(
  auth,
  `    if (bridge && typeof bridge.getPortableProject === 'function') {
      const data = await bridge.getPortableProject();
      if (data && typeof data === 'object') return { source: 'bridge', data };
    }
    if (bridge && typeof bridge.getProject === 'function') {`,
  `    if (bridge && typeof bridge.getCloudProject === 'function') {
      const data = await bridge.getCloudProject();
      if (data && typeof data === 'object') return { source: 'bridge', data };
    }
    if (bridge && typeof bridge.getProject === 'function') {`,
  'account cloud project source',
);
auth = auth.replaceAll('Проекты будут сохраняться в аккаунт.', 'Проекты сохраняются в аккаунт, фотографии — отдельно в защищённое хранилище.');
writeFileSync('public/cloud-auth.js', auth);

console.log('Applied cloud photo sync without Base64 database payloads');
