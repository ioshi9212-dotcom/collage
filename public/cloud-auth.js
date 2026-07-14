(() => {
  const CURRENT_STORAGE_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';
  const LEGACY_PREFIX = 'collage-creator-album';
  const CURRENT_PROJECT_ID_KEY = 'collage-cloud-current-project-id';
  const CURRENT_PROJECT_TITLE_KEY = 'collage-cloud-current-project-title';
  const MAX_CLOUD_PROJECT_BYTES = 50 * 1024 * 1024;

  const state = {
    user: null,
    projects: [],
    collapsed: localStorage.getItem('collage-cloud-panel-collapsed') === '1',
    busy: false,
  };

  window.__collageCloudAuth = {
    isAuthenticated: () => Boolean(state.user),
  };

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else if (value !== undefined && value !== null) node.setAttribute(key, value);
    });
    children.forEach((child) => node.append(child));
    return node;
  }

  function friendlyApiError(payload) {
    if (payload?.error === 'database_not_configured' || String(payload?.message || '').includes('DATABASE_URL')) {
      return 'База не подключена: в Railway у сервиса нет DATABASE_URL. Добавь Postgres к этому проекту и сделай Redeploy.';
    }
    return payload?.message || payload?.error || 'Ошибка запроса';
  }

  function byteLength(text) {
    return new Blob([String(text ?? '')]).size;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(friendlyApiError(payload));
    return payload;
  }

  function setStatus(text) {
    const status = document.querySelector('.cloud-auth-status');
    if (status) status.textContent = text || '';
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  function projectKeys() {
    return Object.keys(localStorage).filter((key) => key.startsWith(LEGACY_PREFIX));
  }

  function getLatestLocalProject() {
    const parsed = projectKeys()
      .map((key) => {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          return { key, data, savedAt: Date.parse(data.savedAt || '') || 0 };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.savedAt - a.savedAt);

    const currentRaw = localStorage.getItem(CURRENT_STORAGE_KEY);
    if (currentRaw) {
      try {
        const current = JSON.parse(currentRaw);
        return { key: CURRENT_STORAGE_KEY, data: current };
      } catch {
        // fall through to latest parsed project
      }
    }

    return parsed[0] || null;
  }

  async function getEditorProject() {
    const bridge = window.__collageApp;
    if (bridge && typeof bridge.getPortableProject === 'function') {
      const data = await bridge.getPortableProject();
      if (data && typeof data === 'object') return { source: 'bridge', data };
    }
    if (bridge && typeof bridge.getProject === 'function') {
      const data = bridge.getProject();
      if (data && typeof data === 'object') return { source: 'bridge', data };
    }

    const localProject = getLatestLocalProject();
    if (localProject?.data) {
      const requiresAssets = Array.isArray(localProject.data.library)
        && localProject.data.library.some((photo) => photo?.assetId && !photo?.src);
      if (requiresAssets) throw new Error('Редактор ещё загружается. Повтори сохранение через несколько секунд.');
      return { source: 'localStorage', data: localProject.data };
    }
    return null;
  }

  function guessTitle(data) {
    const savedTitle = localStorage.getItem(CURRENT_PROJECT_TITLE_KEY);
    if (savedTitle) return savedTitle;
    const pages = Array.isArray(data?.pages) ? data.pages.length : 0;
    const date = new Date().toLocaleDateString('ru-RU');
    return pages ? `Альбом ${date} · ${pages} стр.` : `Альбом ${date}`;
  }

  async function loadMe() {
    try {
      const result = await api('/api/me');
      state.user = result.user || null;
      if (state.user) await loadProjects(false);
    } catch (error) {
      state.user = null;
      setTimeout(() => setStatus(error.message), 0);
    }
    render();
  }

  async function auth(mode) {
    const email = document.querySelector('.cloud-email')?.value || '';
    const password = document.querySelector('.cloud-password')?.value || '';
    setStatus(mode === 'login' ? 'Вхожу…' : 'Регистрирую…');
    try {
      const result = await api(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      state.user = result.user;
      await loadProjects(false);
      setStatus('Готово');
      render();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => {});
    state.user = null;
    state.projects = [];
    localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
    localStorage.removeItem(CURRENT_PROJECT_TITLE_KEY);
    render();
  }

  async function loadProjects(shouldRender = true) {
    if (!state.user) return;
    const result = await api('/api/projects');
    state.projects = result.projects || [];
    if (shouldRender) render();
  }

  async function saveCloud(options = {}) {
    if (state.busy) return;
    const forceCreate = options?.forceCreate === true;
    if (!state.user) return setStatus('Сначала войди в аккаунт');
    const requestedTitle = document.querySelector('.cloud-project-title')?.value || '';
    let finalStatus = '';
    state.busy = true;
    setStatus('Сохраняю проект…');
    render();

    try {
      const editorProject = await getEditorProject();
      if (!editorProject?.data) throw new Error('Сначала сохрани проект локально');

      if (editorProject.source === 'localStorage' && !window.__collageApp?.getProject) {
        setStatus('Сохраняю последний локальный проект…');
      }

      const title = (requestedTitle || guessTitle(editorProject.data)).trim() || 'Без названия';
      const existingId = forceCreate ? '' : localStorage.getItem(CURRENT_PROJECT_ID_KEY);
      const url = existingId ? `/api/projects/${existingId}` : '/api/projects';
      const method = existingId ? 'PUT' : 'POST';
      const payload = JSON.stringify({ title, data: editorProject.data });
      const payloadBytes = byteLength(payload);

      if (payloadBytes > MAX_CLOUD_PROJECT_BYTES) {
        throw new Error(`Проект слишком большой для облака: ${formatBytes(payloadBytes)}. Очисти лишние фото или скачай JSON.`);
      }

      const result = await api(url, {
        method,
        body: payload,
      });

      localStorage.setItem(CURRENT_PROJECT_ID_KEY, result.project.id);
      localStorage.setItem(CURRENT_PROJECT_TITLE_KEY, result.project.title);
      await loadProjects(false);
      finalStatus = editorProject.source === 'bridge' ? 'Сохранено в аккаунт' : 'Сохранено в аккаунт из локального сохранения';
    } catch (error) {
      finalStatus = error.message;
    } finally {
      state.busy = false;
      render();
      setStatus(finalStatus);
    }
  }

  async function saveAsNew() {
    await saveCloud({ forceCreate: true });
  }

  async function openProject(id) {
    if (state.busy) return;
    if (!confirm('Открыть проект из аккаунта? Текущий несохранённый макет заменится.')) return;
    state.busy = true;
    setStatus('Открываю проект…');
    render();

    try {
      const result = await api(`/api/projects/${id}`);
      const project = result.project;
      if (!project?.data || typeof project.data !== 'object' || Array.isArray(project.data)) {
        throw new Error('Проект повреждён или имеет неподдерживаемый формат.');
      }

      const bridge = window.__collageApp;
      if (typeof bridge?.openProject === 'function') {
        const opened = await bridge.openProject(project.data);
        if (opened === false || opened?.ok === false) {
          throw new Error('Редактор не смог открыть проект.');
        }
        localStorage.setItem(CURRENT_PROJECT_ID_KEY, project.id);
        localStorage.setItem(CURRENT_PROJECT_TITLE_KEY, project.title);
        setStatus('Проект открыт');
        return;
      }

      localStorage.setItem(CURRENT_STORAGE_KEY, JSON.stringify(project.data));
      localStorage.setItem(CURRENT_PROJECT_ID_KEY, project.id);
      localStorage.setItem(CURRENT_PROJECT_TITLE_KEY, project.title);
      location.reload();
    } catch (error) {
      setStatus(error.message);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function deleteProject(id) {
    if (!confirm('Удалить проект из аккаунта?')) return;
    setStatus('Удаляю…');
    try {
      await api(`/api/projects/${id}`, { method: 'DELETE' });
      if (localStorage.getItem(CURRENT_PROJECT_ID_KEY) === id) {
        localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
        localStorage.removeItem(CURRENT_PROJECT_TITLE_KEY);
      }
      await loadProjects();
      setStatus('Удалено');
    } catch (error) {
      setStatus(error.message);
    }
  }

  function renderLoggedOut(body) {
    body.append(
      el('label', { class: 'cloud-auth-field' }, [
        el('span', { text: 'Email' }),
        el('input', { class: 'cloud-email', type: 'email', autocomplete: 'email', placeholder: 'you@email.com' }),
      ]),
      el('label', { class: 'cloud-auth-field' }, [
        el('span', { text: 'Пароль' }),
        el('input', { class: 'cloud-password', type: 'password', autocomplete: 'current-password', placeholder: 'минимум 8 символов' }),
      ]),
      el('div', { class: 'cloud-auth-row' }, [
        el('button', { class: 'cloud-auth-button primary', type: 'button', onclick: () => auth('login'), text: 'Войти' }),
        el('button', { class: 'cloud-auth-button', type: 'button', onclick: () => auth('register'), text: 'Регистрация' }),
      ]),
      el('div', { class: 'cloud-auth-status', text: 'Проекты будут сохраняться в аккаунт.' })
    );
  }

  function renderLoggedIn(body) {
    const currentId = localStorage.getItem(CURRENT_PROJECT_ID_KEY);
    const currentTitle = localStorage.getItem(CURRENT_PROJECT_TITLE_KEY) || '';

    body.append(
      el('label', { class: 'cloud-auth-field' }, [
        el('span', { text: 'Название проекта' }),
        el('input', { class: 'cloud-project-title', type: 'text', value: currentTitle, placeholder: 'Например: Альбом для печати' }),
      ]),
      el('div', { class: 'cloud-auth-row' }, [
        el('button', { class: 'cloud-auth-button primary', type: 'button', disabled: state.busy ? 'disabled' : null, onclick: saveCloud, text: 'Сохранить' }),
        el('button', { class: 'cloud-auth-button', type: 'button', disabled: state.busy ? 'disabled' : null, onclick: saveAsNew, text: 'Как новый' }),
        el('button', { class: 'cloud-auth-button', type: 'button', onclick: () => loadProjects(), text: 'Обновить' }),
      ]),
      el('div', { class: 'cloud-auth-status', text: currentId ? 'Этот проект связан с аккаунтом.' : 'Сохрани, чтобы создать проект в аккаунте.' }),
      el('div', { class: 'cloud-project-list' }, state.projects.length ? state.projects.map((project) => {
        const active = project.id === currentId;
        return el('div', { class: `cloud-project-card ${active ? 'active' : ''}` }, [
          el('strong', { text: project.title || 'Без названия' }),
          el('small', { text: `Обновлён: ${formatDate(project.updated_at)}` }),
          el('div', { class: 'cloud-project-actions' }, [
            el('button', { class: 'cloud-auth-button', type: 'button', onclick: () => openProject(project.id), text: 'Открыть' }),
            el('button', { class: 'cloud-auth-button danger', type: 'button', onclick: () => deleteProject(project.id), text: 'Удалить' }),
          ]),
        ]);
      }) : [el('div', { class: 'cloud-auth-status', text: 'Пока проектов нет.' })]),
      el('div', { class: 'cloud-auth-row' }, [
        el('button', { class: 'cloud-auth-button', type: 'button', onclick: logout, text: 'Выйти' }),
      ])
    );
  }

  function render() {
    let panel = document.querySelector('.cloud-auth-panel');
    if (!panel) {
      panel = el('aside', { class: 'cloud-auth-panel' });
      document.body.append(panel);
    }

    panel.className = `cloud-auth-panel ${state.collapsed ? 'collapsed' : ''}`;
    panel.innerHTML = '';

    const head = el('div', { class: 'cloud-auth-head' }, [
      el('div', { class: 'cloud-auth-title' }, [
        el('strong', { text: 'Аккаунт' }),
        el('span', { text: state.user ? state.user.email : 'вход и проекты' }),
      ]),
      el('button', {
        class: 'cloud-auth-toggle',
        type: 'button',
        onclick: () => {
          state.collapsed = !state.collapsed;
          localStorage.setItem('collage-cloud-panel-collapsed', state.collapsed ? '1' : '0');
          render();
        },
        text: state.collapsed ? 'Открыть' : 'Свернуть',
      }),
    ]);

    const body = el('div', { class: 'cloud-auth-body' });
    if (state.user) renderLoggedIn(body);
    else renderLoggedOut(body);

    panel.append(head, body);
  }

  window.addEventListener('DOMContentLoaded', () => {
    render();
    loadMe();
  });
})();
