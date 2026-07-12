(() => {
  const DB_NAME = 'collage-project-storage-v1';
  const DB_VERSION = 1;
  const STORE_NAME = 'projects';
  const LATEST_LOCAL_KEY = 'latest-local';
  const CURRENT_STORAGE_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';
  const CURRENT_PROJECT_ID_KEY = 'collage-cloud-current-project-id';
  const CURRENT_PROJECT_TITLE_KEY = 'collage-cloud-current-project-title';

  let writeQueue = Promise.resolve();
  let lastStoredSignature = '';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Не удалось открыть хранилище проектов'));
    });
  }

  async function writeProject(key, data, metadata = {}) {
    const database = await openDatabase();
    try {
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
    } finally {
      database.close();
    }
  }

  function queueProjectWrite(key, data, metadata = {}) {
    const operation = writeQueue
      .catch(() => {})
      .then(() => writeProject(key, data, metadata));
    writeQueue = operation;
    return operation;
  }

  async function readProject(key) {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Не удалось прочитать проект'));
      });
    } finally {
      database.close();
    }
  }

  function cloneProject(value) {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch {
        // JSON fallback below.
      }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function projectSignature(project) {
    const comparable = cloneProject(project);
    delete comparable.savedAt;
    return JSON.stringify(comparable);
  }

  function countProjectPhotos(project) {
    const ids = new Set();
    const library = Array.isArray(project?.library) ? project.library : [];
    library.forEach((photo) => {
      if (photo?.id) ids.add(photo.id);
    });
    const pages = Array.isArray(project?.pages) ? project.pages : [];
    pages.forEach((page) => {
      const frames = Array.isArray(page?.frames) ? page.frames : [];
      frames.forEach((frame) => {
        if (frame?.photo?.id) ids.add(frame.photo.id);
      });
    });
    return ids.size;
  }

  function countProjectDecor(project) {
    const pages = project?.extraLayers?.pages;
    if (!pages || typeof pages !== 'object') return 0;
    return Object.values(pages).reduce((total, page) => (
      total
      + (Array.isArray(page?.texts) ? page.texts.length : 0)
      + (Array.isArray(page?.drawings) ? page.drawings.length : 0)
      + (Array.isArray(page?.templates) ? page.templates.length : 0)
    ), 0);
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
    lastStoredSignature = projectSignature(data);
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
    const snapshot = cloneProject(project);
    snapshot.savedAt = new Date().toISOString();
    return snapshot;
  }

  async function persistCurrentEditorProject({ force = true, source = 'editor' } = {}) {
    const snapshot = await getFreshEditorSnapshot();
    const signature = projectSignature(snapshot);
    if (!force && signature === lastStoredSignature) {
      return { saved: false, data: snapshot };
    }

    await queueProjectWrite(LATEST_LOCAL_KEY, snapshot, {
      source,
      pageCount: snapshot.pages.length,
      photoCount: countProjectPhotos(snapshot),
      decorCount: countProjectDecor(snapshot),
    });
    lastStoredSignature = signature;
    return { saved: true, data: snapshot };
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
          await queueProjectWrite(LATEST_LOCAL_KEY, data, { source: 'localStorage-migration' });
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
        pageCount: project.data.pages.length,
        photoCount: countProjectPhotos(project.data),
        decorCount: countProjectDecor(project.data),
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
        lastStoredSignature = projectSignature(existing.data);
        return;
      }
      const raw = localStorage.getItem(CURRENT_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      validateProject(data);
      await queueProjectWrite(LATEST_LOCAL_KEY, data, {
        source: 'localStorage-migration',
        pageCount: data.pages.length,
        photoCount: countProjectPhotos(data),
        decorCount: countProjectDecor(data),
      });
      lastStoredSignature = projectSignature(data);
    } catch (error) {
      console.warn('Не удалось перенести локальное сохранение в IndexedDB', error);
    }
  }

  async function saveFullProjectSnapshot() {
    try {
      const result = await persistCurrentEditorProject({ force: true, source: 'manual-save' });
      const photos = countProjectPhotos(result.data);
      const decor = countProjectDecor(result.data);
      const detail = photos > 0
        ? `страниц: ${result.data.pages.length}, фото: ${photos}, оформление: ${decor}`
        : `страниц: ${result.data.pages.length}, без фото, оформление: ${decor}`;
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
        void saveFullProjectSnapshot();
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
    saveFullProject: () => persistCurrentEditorProject({ force: true, source: 'bridge-save' }),
    openLocalProject,
    readLatest: () => readProject(LATEST_LOCAL_KEY),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void migrateCurrentLocalProject(), { once: true });
  } else {
    void migrateCurrentLocalProject();
  }
})();
