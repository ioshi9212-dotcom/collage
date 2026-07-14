(() => {
  const DB_NAME = 'collage-project-storage-v1';
  const DB_VERSION = 1;
  const STORE_NAME = 'projects';
  const LATEST_LOCAL_KEY = 'latest-local';
  const CURRENT_STORAGE_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';
  const LEGACY_STORAGE_PREFIX = 'collage-creator-album';
  const ALBUM_LAYERS_KEY = 'collage-album-extra-layers-v1';
  const CURRENT_PROJECT_ID_KEY = 'collage-cloud-current-project-id';
  const CURRENT_PROJECT_TITLE_KEY = 'collage-cloud-current-project-title';

  let databasePromise = null;
  let writeInFlight = false;
  const pendingWrites = new Map();

  function readLegacyExtraLayers() {
    try {
      const raw = localStorage.getItem(ALBUM_LAYERS_KEY);
      if (!raw) return null;
      const layers = JSON.parse(raw);
      return layers?.pages && typeof layers.pages === 'object'
        ? { version: 1, pages: layers.pages }
        : null;
    } catch {
      return null;
    }
  }

  // This script is loaded before the React module so legacy layers are captured
  // before the editor removes the obsolete standalone key.
  const startupLegacyExtraLayers = readLegacyExtraLayers();

  function attachLegacyExtraLayers(project) {
    if (!project || typeof project !== 'object') return { data: project, migrated: false };
    if (project.extraLayers?.pages || !startupLegacyExtraLayers) return { data: project, migrated: false };
    return {
      data: { ...project, extraLayers: startupLegacyExtraLayers },
      migrated: true,
    };
  }

  function openDatabase() {
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

  async function writeProject(key, data, metadata = {}) {
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

  function drainProjectWrites() {
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

  async function readProject(key) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Не удалось прочитать проект'));
    });
  }

  function projectStats(project) {
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

  function validateProject(project) {
    if (!project || typeof project !== 'object') {
      throw new Error('Редактор не передал данные проекта');
    }
    if (!Array.isArray(project.pages) || project.pages.length === 0) {
      throw new Error('В проекте нет страниц для сохранения');
    }
  }

  function showToast(message, isError = false) {
    let toast = document.querySelector('.project-storage-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'project-storage-toast';
      Object.assign(toast.style, {
        position: 'fixed',
        left: '50%',
        bottom: '28px',
        transform: 'translateX(-50%)',
        zIndex: '100000',
        maxWidth: 'min(560px, calc(100vw - 32px))',
        padding: '12px 18px',
        borderRadius: '12px',
        color: '#fff',
        font: '600 14px/1.35 Arial, sans-serif',
        boxShadow: '0 10px 30px rgba(0, 0, 0, .24)',
        opacity: '0',
        transition: 'opacity .18s ease',
        pointerEvents: 'none',
      });
      document.body.append(toast);
    }

    toast.textContent = message;
    toast.style.background = isError ? '#9f2f2f' : '#2f6f52';
    toast.style.opacity = '1';
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.style.opacity = '0';
    }, 3200);
  }

  function setCloudStatus(message) {
    const status = document.querySelector('.cloud-auth-status');
    if (status) status.textContent = message;
  }

  function clearCloudProjectBinding() {
    localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
    localStorage.removeItem(CURRENT_PROJECT_TITLE_KEY);
    const titleInput = document.querySelector('.cloud-project-title');
    if (titleInput) titleInput.value = '';
  }

  function parseStoredProject(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      validateProject(parsed);
      const attached = attachLegacyExtraLayers(parsed);
      return {
        key,
        data: attached.data,
        migratedLayers: attached.migrated,
        savedAt: Date.parse(parsed.savedAt || '') || 0,
      };
    } catch {
      return null;
    }
  }

  function findLatestLocalStorageProject() {
    const current = parseStoredProject(CURRENT_STORAGE_KEY);
    if (current) return current;

    return Object.keys(localStorage)
      .filter((key) => key !== CURRENT_STORAGE_KEY && key.startsWith(LEGACY_STORAGE_PREFIX))
      .map(parseStoredProject)
      .filter(Boolean)
      .sort((left, right) => right.savedAt - left.savedAt)[0] || null;
  }

  function findJsonInput() {
    return document.querySelector('.file-actions input.hidden-input[type="file"][accept*="json"]')
      || document.querySelector('.file-actions input[type="file"][accept*="application/json"]');
  }

  function importIntoEditor(data) {
    const input = findJsonInput();
    if (!input) throw new Error('Редактор ещё не готов. Обнови страницу и попробуй снова.');

    const file = new File(
      [JSON.stringify(data)],
      `collage-project-${Date.now()}.json`,
      { type: 'application/json' },
    );
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getEditorProject() {
    const bridge = window.__collageApp;
    if (!bridge || typeof bridge.getProject !== 'function') return null;
    const project = bridge.getProject();
    return project && typeof project === 'object' ? project : null;
  }

  function waitForEditorCommit() {
    return new Promise((resolve) => {
      const raf = window.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
      raf(() => raf(resolve));
    });
  }

  async function getFreshEditorSnapshot() {
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
  }

  async function persistMigratedRecord(record, source) {
    const attached = attachLegacyExtraLayers(record?.data);
    if (!attached.migrated) return record;
    await queueProjectWrite(LATEST_LOCAL_KEY, attached.data, {
      source,
      ...projectStats(attached.data),
    });
    localStorage.removeItem(ALBUM_LAYERS_KEY);
    return { ...record, data: attached.data };
  }

  async function openLocalProject() {
    try {
      setCloudStatus('Открываю сохранённый проект…');
      let record = await readProject(LATEST_LOCAL_KEY);
      if (record?.data) record = await persistMigratedRecord(record, 'indexeddb-layer-migration');

      if (!record?.data) {
        const localProject = findLatestLocalStorageProject();
        if (localProject?.data) {
          record = { data: localProject.data };
          await queueProjectWrite(LATEST_LOCAL_KEY, localProject.data, {
            source: localProject.key === CURRENT_STORAGE_KEY ? 'localStorage-migration' : 'legacy-localStorage-migration',
            ...projectStats(localProject.data),
          });
          if (localProject.migratedLayers) localStorage.removeItem(ALBUM_LAYERS_KEY);
        }
      }

      if (!record?.data) {
        throw new Error('Сохранённого проекта пока нет');
      }

      validateProject(record.data);
      clearCloudProjectBinding();
      importIntoEditor(record.data);
      setCloudStatus('Сохранённый проект открыт как локальная копия');
      showToast('Проект открыт локально. Следующее облачное сохранение создаст новый проект.');
    } catch (error) {
      console.error(error);
      setCloudStatus(error.message);
      showToast(error.message, true);
    }
  }

  async function migrateCurrentLocalProject() {
    try {
      let existing = await readProject(LATEST_LOCAL_KEY);
      if (existing?.data) {
        existing = await persistMigratedRecord(existing, 'indexeddb-layer-migration');
        return existing;
      }

      const localProject = findLatestLocalStorageProject();
      if (!localProject?.data) return null;
      await queueProjectWrite(LATEST_LOCAL_KEY, localProject.data, {
        source: localProject.key === CURRENT_STORAGE_KEY ? 'localStorage-migration' : 'legacy-localStorage-migration',
        ...projectStats(localProject.data),
      });
      if (localProject.migratedLayers) localStorage.removeItem(ALBUM_LAYERS_KEY);
      return localProject;
    } catch (error) {
      console.warn('Не удалось перенести локальное сохранение в IndexedDB', error);
      return null;
    }
  }

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!input?.closest?.('.file-actions')) return;
    if (String(input.accept || '').includes('json')) clearCloudProjectBinding();
  }, true);

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('button');
    if (!button) return;
    const label = button.textContent.trim();

    if (button.closest('.file-actions')) {
      if (label === 'Сохранить') {
        // React handles this click and passes the same snapshot to every storage target.
        return;
      }

      if (label === 'Открыть') {
        event.preventDefault();
        event.stopImmediatePropagation();
        void openLocalProject();
      }
    }
  }, true);

  window.__collageProjectStorage = {
    saveFullProject: () => persistCurrentEditorProject({ source: 'bridge-save' }),
    storeSnapshot: (data, options = {}) => persistProjectSnapshot(data, options),
    openLocalProject,
    readLatest: () => readProject(LATEST_LOCAL_KEY),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void migrateCurrentLocalProject(), { once: true });
  } else {
    void migrateCurrentLocalProject();
  }
})();
