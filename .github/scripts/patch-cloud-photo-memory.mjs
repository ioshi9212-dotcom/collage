import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  return source.replace(before, after);
}

const path = 'src/AppLive.jsx';
let source = readFileSync(path, 'utf8');
source = replaceOnce(
  source,
  `  async function cloudProject(data = project()) {
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
  `  async function cloudProject(data = project()) {
    return createCloudPhotoProject(data, {
      maxConcurrent: 2,
      onProgress: ({ finished, total, name, reused }) => {
        if (!total) return;
        const current = reused ? finished : Math.min(total, finished + 1);
        show(\`Фото в облако: \${current} из \${total} · \${name || 'Фото'}\`);
      },
    });
  }

  async function rememberCloudPhotoMetadata(data, cloudData, {
    source = 'cloud-photo-sync',
    storeSnapshot = window.__collageProjectStorage?.storeSnapshot,
  } = {}) {
    const syncedData = mergeCloudPhotoMetadata(data, cloudData);
    const local = saveLocalProject({ silent: true, data: syncedData });
    setLibrary((current) => mergeCloudMetadataIntoLibrary(current, cloudData));
    const indexedDb = typeof storeSnapshot === 'function'
      ? await Promise.resolve(storeSnapshot(syncedData, { source }))
          .then(() => ({ ok: true }))
          .catch((error) => {
            console.warn('IndexedDB cloud metadata save failed', error);
            return { ok: false, error };
          })
      : { ok: false, skipped: true };
    return { data: syncedData, local, indexedDb };
  }
`,
  'cloud metadata helper',
);
source = replaceOnce(
  source,
  `        savedData = mergeCloudPhotoMetadata(data, cloudData);
        local = saveLocalProject({ silent: true, data: savedData });
        setLibrary((current) => mergeCloudMetadataIntoLibrary(current, cloudData));
        if (typeof storeSnapshot === 'function') {
          indexedDb = await Promise.resolve(storeSnapshot(savedData, { source: 'cloud-photo-sync' }))
            .then(() => ({ ok: true }))
            .catch((error) => {
              console.warn('IndexedDB cloud metadata save failed', error);
              return { ok: false, error };
            });
        }`,
  `        const remembered = await rememberCloudPhotoMetadata(data, cloudData, { storeSnapshot });
        savedData = remembered.data;
        local = remembered.local;
        indexedDb = remembered.indexedDb;`,
  'main save metadata memory',
);
source = replaceOnce(
  source,
  `      getPortableProject: () => portableProject(),
      getCloudProject: () => cloudProject(),
      saveLocal: () => saveLocalProject({ silent: true }),`,
  `      getPortableProject: () => portableProject(),
      getCloudProject: async () => {
        const data = project();
        const cloudData = await cloudProject(data);
        await rememberCloudPhotoMetadata(data, cloudData, { source: 'account-cloud-photo-sync' });
        return cloudData;
      },
      saveLocal: () => saveLocalProject({ silent: true }),`,
  'account cloud metadata memory',
);
writeFileSync(path, source);
console.log('Patched cloud photo metadata memory');
