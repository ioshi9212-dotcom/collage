from pathlib import Path
import re

storage_path = Path('public/project-storage.js')
storage = storage_path.read_text(encoding='utf-8')

storage = storage.replace(
"""  let writeQueue = Promise.resolve();
  let lastStoredSignature = '';
""",
"""  let databasePromise = null;
  let writeInFlight = false;
  const pendingWrites = new Map();
""",
1,
)

storage, count = re.subn(
    r"  function openDatabase\(\) \{.*?\n  \}\n\n  async function writeProject",
"""  function openDatabase() {
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        databasePromise = null;
        reject(request.error || new Error('Не удалось открыть хранилище проектов'));
      };
    });

    return databasePromise;
  }

  async function writeProject""",
    storage,
    count=1,
    flags=re.S,
)
assert count == 1, f'openDatabase replacement count: {count}'

storage, count = re.subn(
    r"  async function writeProject\(key, data, metadata = \{\}\) \{.*?\n  \}\n\n  function queueProjectWrite",
"""  async function writeProject(key, data, metadata = {}) {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        key,
        data,
        savedAt: new Date().toISOString(),
        ...metadata,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Не удалось сохранить проект'));
      transaction.onabort = () => reject(transaction.error || new Error('Сохранение проекта отменено'));
    });
  }

  function queueProjectWrite""",
    storage,
    count=1,
    flags=re.S,
)
assert count == 1, f'writeProject replacement count: {count}'

storage, count = re.subn(
    r"  function queueProjectWrite\(key, data, metadata = \{\}\) \{.*?\n  \}\n\n  async function readProject",
"""  function drainProjectWrites() {
    if (writeInFlight) return;
    writeInFlight = true;

    void (async () => {
      try {
        while (pendingWrites.size > 0) {
          const [key, entry] = pendingWrites.entries().next().value;
          pendingWrites.delete(key);
          try {
            await writeProject(key, entry.data, entry.metadata);
            entry.waiters.forEach(({ resolve }) => resolve());
          } catch (error) {
            entry.waiters.forEach(({ reject }) => reject(error));
          }
        }
      } finally {
        writeInFlight = false;
        if (pendingWrites.size > 0) drainProjectWrites();
      }
    })();
  }

  function queueProjectWrite(key, data, metadata = {}) {
    return new Promise((resolve, reject) => {
      const pending = pendingWrites.get(key);
      if (pending) {
        pending.data = data;
        pending.metadata = metadata;
        pending.waiters.push({ resolve, reject });
      } else {
        pendingWrites.set(key, {
          data,
          metadata,
          waiters: [{ resolve, reject }],
        });
      }
      drainProjectWrites();
    });
  }

  async function readProject""",
    storage,
    count=1,
    flags=re.S,
)
assert count == 1, f'queue replacement count: {count}'

storage, count = re.subn(
    r"  async function readProject\(key\) \{.*?\n  \}\n\n  function cloneProject",
"""  async function readProject(key) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Не удалось прочитать проект'));
    });
  }

  function cloneProject""",
    storage,
    count=1,
    flags=re.S,
)
assert count == 1, f'readProject replacement count: {count}'

storage, count = re.subn(
    r"  function cloneProject\(value\) \{.*?\n  \}\n\n  function validateProject",
"""  function projectStats(project) {
    const photoIds = new Set();
    const library = Array.isArray(project?.library) ? project.library : [];
    library.forEach((photo) => {
      if (photo?.id) photoIds.add(photo.id);
    });

    const pages = Array.isArray(project?.pages) ? project.pages : [];
    pages.forEach((page) => {
      const frames = Array.isArray(page?.frames) ? page.frames : [];
      frames.forEach((frame) => {
        if (frame?.photo?.id) photoIds.add(frame.photo.id);
      });
    });

    const layerPages = project?.extraLayers?.pages;
    const decorCount = layerPages && typeof layerPages === 'object'
      ? Object.values(layerPages).reduce((total, page) => (
          total
          + (Array.isArray(page?.texts) ? page.texts.length : 0)
          + (Array.isArray(page?.drawings) ? page.drawings.length : 0)
          + (Array.isArray(page?.templates) ? page.templates.length : 0)
        ), 0)
      : 0;

    return {
      pageCount: pages.length,
      photoCount: photoIds.size,
      decorCount,
    };
  }

  function validateProject""",
    storage,
    count=1,
    flags=re.S,
)
assert count == 1, f'stats replacement count: {count}'

storage = storage.replace("    lastStoredSignature = projectSignature(data);\n", "", 1)

storage, count = re.subn(
    r"  async function getFreshEditorSnapshot\(\) \{.*?\n  \}\n\n  async function persistCurrentEditorProject\(\{ force = true, source = 'editor' \} = \{\}\) \{.*?\n  \}",
"""  async function getFreshEditorSnapshot() {
    await waitForEditorCommit();
    const project = getEditorProject();
    validateProject(project);
    return project?.savedAt ? project : { ...project, savedAt: new Date().toISOString() };
  }

  async function persistProjectSnapshot(project, { source = 'editor' } = {}) {
    validateProject(project);
    const snapshot = project?.savedAt ? project : { ...project, savedAt: new Date().toISOString() };
    const stats = projectStats(snapshot);

    await queueProjectWrite(LATEST_LOCAL_KEY, snapshot, {
      source,
      ...stats,
    });
    return { saved: true, data: snapshot, stats };
  }

  async function persistCurrentEditorProject({ source = 'editor' } = {}) {
    const snapshot = await getFreshEditorSnapshot();
    return persistProjectSnapshot(snapshot, { source });
  }""",
    storage,
    count=1,
    flags=re.S,
)
assert count == 1, f'persist replacement count: {count}'

storage = storage.replace(
"""          record = { data };
          await queueProjectWrite(LATEST_LOCAL_KEY, data, { source: 'localStorage-migration' });
""",
"""          record = { data };
          await queueProjectWrite(LATEST_LOCAL_KEY, data, {
            source: 'localStorage-migration',
            ...projectStats(data),
          });
""",
1,
)

storage = storage.replace(
"""      await queueProjectWrite(LATEST_LOCAL_KEY, project.data, {
        source: 'cloud',
        projectId: project.id,
        title: project.title,
        pageCount: project.data.pages.length,
        photoCount: countProjectPhotos(project.data),
        decorCount: countProjectDecor(project.data),
      });
""",
"""      await queueProjectWrite(LATEST_LOCAL_KEY, project.data, {
        source: 'cloud',
        projectId: project.id,
        title: project.title,
        ...projectStats(project.data),
      });
""",
1,
)

storage = storage.replace("        lastStoredSignature = projectSignature(existing.data);\n", "", 1)
storage = storage.replace(
"""      await queueProjectWrite(LATEST_LOCAL_KEY, data, {
        source: 'localStorage-migration',
        pageCount: data.pages.length,
        photoCount: countProjectPhotos(data),
        decorCount: countProjectDecor(data),
      });
      lastStoredSignature = projectSignature(data);
""",
"""      await queueProjectWrite(LATEST_LOCAL_KEY, data, {
        source: 'localStorage-migration',
        ...projectStats(data),
      });
""",
1,
)

storage = storage.replace(
"""      const result = await persistCurrentEditorProject({ force: true, source: 'manual-save' });
      const photos = countProjectPhotos(result.data);
      const decor = countProjectDecor(result.data);
      const detail = photos > 0
        ? `страниц: ${result.data.pages.length}, фото: ${photos}, оформление: ${decor}`
        : `страниц: ${result.data.pages.length}, без фото, оформление: ${decor}`;
""",
"""      const result = await persistCurrentEditorProject({ source: 'manual-save' });
      const { pageCount, photoCount: photos, decorCount: decor } = result.stats;
      const detail = photos > 0
        ? `страниц: ${pageCount}, фото: ${photos}, оформление: ${decor}`
        : `страниц: ${pageCount}, без фото, оформление: ${decor}`;
""",
1,
)

storage = storage.replace(
"""      if (label === 'Сохранить') {
        void saveFullProjectSnapshot();
        return;
      }
""",
"""      if (label === 'Сохранить') {
        // React handles this click and passes the same snapshot to every storage target.
        return;
      }
""",
1,
)

storage = storage.replace(
"""  window.__collageProjectStorage = {
    saveFullProject: () => persistCurrentEditorProject({ force: true, source: 'bridge-save' }),
    openLocalProject,
    readLatest: () => readProject(LATEST_LOCAL_KEY),
  };
""",
"""  window.__collageProjectStorage = {
    saveFullProject: () => persistCurrentEditorProject({ source: 'bridge-save' }),
    storeSnapshot: (data, options = {}) => persistProjectSnapshot(data, options),
    openLocalProject,
    readLatest: () => readProject(LATEST_LOCAL_KEY),
  };
""",
1,
)

for forbidden in ('projectSignature', 'cloneProject', 'countProjectPhotos', 'countProjectDecor', 'lastStoredSignature', 'writeQueue = Promise'):
    assert forbidden not in storage, f'old storage path remains: {forbidden}'

storage_path.write_text(storage, encoding='utf-8')

app_path = Path('src/AppLive.jsx')
app = app_path.read_text(encoding='utf-8')
old = """  function saveLocalProject({ silent = false } = {}) {
    const data = project();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (!silent) show('Альбом сохранён');
      return { ok: true, data };
    } catch (error) {
      console.error(error);
      if (!silent) show('Не удалось сохранить: проект слишком большой. Скачай JSON или очисти лишние фото.');
      return { ok: false, error };
    }
  }

  async function save() {
    const local = saveLocalProject({ silent: true });
    try {
      const result = await saveCloudProject(project());
      if (result?.id) {
        show('Альбом сохранён в аккаунт');
      } else {
        show('Альбом сохранён локально');
      }
    } catch (error) {
      console.error(error);
      show('Локально сохранено. Облако недоступно');
    }
    return local;
  }
"""
new = """  function saveLocalProject({ silent = false, data = null } = {}) {
    const snapshot = data ?? project();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      if (!silent) show('Альбом сохранён');
      return { ok: true, data: snapshot };
    } catch (error) {
      console.error(error);
      if (!silent) show('Не удалось сохранить: проект слишком большой. Скачай JSON или очисти лишние фото.');
      return { ok: false, error };
    }
  }

  async function save() {
    const data = project();
    const local = saveLocalProject({ silent: true, data });
    const storagePromise = Promise.resolve(
      window.__collageProjectStorage?.storeSnapshot?.(data, { source: 'manual-save' }),
    ).catch((error) => {
      console.warn('IndexedDB project save failed', error);
      return null;
    });

    try {
      const result = await saveCloudProject(data);
      await storagePromise;
      if (result?.id) {
        show('Альбом сохранён в аккаунт');
      } else {
        show('Альбом сохранён локально');
      }
    } catch (error) {
      console.error(error);
      await storagePromise;
      show('Локально сохранено. Облако недоступно');
    }
    return local;
  }
"""
assert app.count(old) == 1, f'AppLive save block count: {app.count(old)}'
app = app.replace(old, new, 1)
app_path.write_text(app, encoding='utf-8')

index_path = Path('index.html')
index = index_path.read_text(encoding='utf-8')
old_version = '/project-storage.js?v=20260712-2'
new_version = '/project-storage.js?v=20260713-3'
assert index.count(old_version) == 1, f'index storage version count: {index.count(old_version)}'
index_path.write_text(index.replace(old_version, new_version, 1), encoding='utf-8')
