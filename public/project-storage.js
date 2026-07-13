(() => {
  const DB_NAME = 'collage-project-storage-v1';
  const DB_VERSION = 1;
  const STORE_NAME = 'projects';
  const LATEST_LOCAL_KEY = 'latest-local';
  const CURRENT_STORAGE_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';
  const CURRENT_PROJECT_ID_KEY = 'collage-cloud-current-project-id';
  const CURRENT_PROJECT_TITLE_KEY = 'collage-cloud-current-project-title';

  let databasePromise = null;
  let writeInFlight = false;
  const pendingWrites = new Map();

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

  async function readJsonResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || `Ошибка запроса (${response.status})`);
    }
    return payload;
  }

  function findJsonInput() {
    return document.querySelector('input.hidden-input[type="file"][accept*="json"]')
      || document.querySelector('input[type="file"][accept*="application/json"]');
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

  async function openLocalProject() {
    try {
      setCloudStatus('Открываю сохранённый проект…');
      let record = await readProject(LATEST_LOCAL_KEY);

      if (!record?.data) {
        const raw = localStorage.getItem(CURRENT_STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          validateProject(data);
          record = { data };
          await queueProjectWrite(LATEST_LOCAL_KEY, data, {
            source: 'localStorage-migration',
            ...projectStats(data),
          });
        }
      }

      if (!record?.data) {
        throw new Error('Сохранённого проекта пока нет');
      }

      validateProject(record.data);
      importIntoEditor(record.data);
      setCloudStatus('Сохранённый проект открыт');
      showToast('Проект открыт полностью: макет, текст, цвета и фото');
    } catch (error) {
      console.error(error);
      setCloudStatus(error.message);
      showToast(error.message, true);
    }
  }

  function cloudProjectCardIndex(button) {
    const card = button.closest('.cloud-project-card');
    if (!card) return -1;
    return Array.from(document.querySelectorAll('.cloud-project-list .cloud-project-card')).indexOf(card);
  }

  async function openCloudProject(button) {
    try {
      const index = cloudProjectCardIndex(button);
      if (index < 0) throw new Error('Не удалось определить выбранный проект');

      setCloudStatus('Открываю проект…');
      const listResponse = await fetch('/api/projects', { credentials: 'include' });
      const listPayload = await readJsonResponse(listResponse);
      const summary = Array.isArray(listPayload.projects) ? listPayload.projects[index] : null;
      if (!summary?.id) throw new Error('Проект не найден. Нажми «Обновить» и попробуй снова.');

      const projectResponse = await fetch(`/api/projects/${encodeURIComponent(summary.id)}`, {
        credentials: 'include',
      });
      const projectPayload = await readJsonResponse(projectResponse);
      const project = projectPayload.project;
      if (!project?.data) throw new Error('В сохранении нет данных проекта');
      validateProject(project.data);

      await queueProjectWrite(LATEST_LOCAL_KEY, project.data, {
        source: 'cloud',
        projectId: project.id,
        title: project.title,
        ...projectStats(project.data),
      });
      importIntoEditor(project.data);

      localStorage.setItem(CURRENT_PROJECT_ID_KEY, project.id);
      localStorage.setItem(CURRENT_PROJECT_TITLE_KEY, project.title || 'Без названия');
      const titleInput = document.querySelector('.cloud-project-title');
      if (titleInput) titleInput.value = project.title || '';

      setCloudStatus('Проект открыт');
      showToast('Проект открыт полностью из аккаунта');
    } catch (error) {
      console.error(error);
      setCloudStatus(error.message);
      showToast(error.message, true);
    }
  }

  async function migrateCurrentLocalProject() {
    try {
      const existing = await readProject(LATEST_LOCAL_KEY);
      if (existing?.data) {
        return;
      }
      const raw = localStorage.getItem(CURRENT_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      validateProject(data);
      await queueProjectWrite(LATEST_LOCAL_KEY, data, {
        source: 'localStorage-migration',
        ...projectStats(data),
      });
    } catch (error) {
      console.warn('Не удалось перенести локальное сохранение в IndexedDB', error);
    }
  }

  async function saveFullProjectSnapshot() {
    try {
      const result = await persistCurrentEditorProject({ source: 'manual-save' });
      const { pageCount, photoCount: photos, decorCount: decor } = result.stats;
      const detail = photos > 0
        ? `страниц: ${pageCount}, фото: ${photos}, оформление: ${decor}`
        : `страниц: ${pageCount}, без фото, оформление: ${decor}`;
      showToast(`Проект сохранён полностью — ${detail}`);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Не удалось сохранить проект полностью', true);
    }
  }

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
        return;
      }
    }

    if (label === 'Открыть' && button.closest('.cloud-project-actions')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void openCloudProject(button);
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
