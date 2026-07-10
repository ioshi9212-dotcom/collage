(() => {
  const MODE_KEY = 'collage-album-editor-mode';
  const STORAGE_KEY = 'collage-user-template-packages-v1';
  const IMPORT_ACCEPT = 'application/json,.json';

  const state = {
    records: [],
    selectedId: null,
  };

  function makeId(prefix = 'template') {
    return globalThis.crypto?.randomUUID?.() || `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function appApi() {
    return globalThis.__collageApp;
  }

  function albumApi() {
    return globalThis.__collageAlbumLayers;
  }

  function showNotice(text) {
    const notice = document.querySelector('.notice');
    if (notice) {
      notice.textContent = text;
      return;
    }
    console.info(text);
  }

  function isTemplatesMode() {
    return document.body?.dataset?.albumMode === 'templates' || localStorage.getItem(MODE_KEY) === 'templates';
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      state.records = Array.isArray(parsed) ? parsed : [];
    } catch {
      state.records = [];
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
  }

  function saveFile(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function visibleProject() {
    const project = appApi()?.getProject?.();
    if (!project) throw new Error('project api unavailable');
    return project;
  }

  function currentIndex(project) {
    const index = (project.pages || []).findIndex((page) => page.id === project.currentPageId);
    return index >= 0 ? index : 0;
  }

  function currentSpreadStart(project) {
    const index = currentIndex(project);
    return index % 2 === 0 ? index : index - 1;
  }

  function cleanFrame(frame) {
    return {
      ...clone(frame),
      photo: null,
    };
  }

  function cleanPage(page, index) {
    return {
      ...clone(page),
      id: page?.id || makeId('page'),
      title: page?.title || `Страница ${index + 1}`,
      frameCount: Number.isFinite(Number(page?.frameCount)) ? Number(page.frameCount) : (Array.isArray(page?.frames) ? page.frames.length : 0),
      layout: page?.layout ? clone(page.layout) : null,
      frames: Array.isArray(page?.frames) ? page.frames.map(cleanFrame) : [],
      background: page?.background ? clone(page.background) : null,
    };
  }

  function cleanLayerPage(page) {
    return {
      texts: Array.isArray(page?.texts) ? clone(page.texts) : [],
      drawings: Array.isArray(page?.drawings) ? clone(page.drawings) : [],
      templates: [],
    };
  }

  function extractExtraLayers(project, sourceIndexes) {
    const result = { version: 1, pages: {} };
    const pages = project.extraLayers?.pages || {};
    sourceIndexes.forEach((sourceIndex, targetIndex) => {
      const sourceKey = String(sourceIndex + 1);
      const sourcePage = pages[sourceKey];
      const cleaned = cleanLayerPage(sourcePage);
      if (cleaned.texts.length || cleaned.drawings.length) {
        result.pages[String(targetIndex + 1)] = cleaned;
      }
    });
    return result;
  }

  function makeRecord(scope) {
    const project = visibleProject();
    const pages = Array.isArray(project.pages) ? project.pages : [];
    if (!pages.length) throw new Error('empty project');

    let sourceIndexes;
    let defaultTitle;
    if (scope === 'page') {
      const index = currentIndex(project);
      sourceIndexes = [index];
      defaultTitle = `Страница ${index + 1}`;
    } else if (scope === 'spread') {
      const start = currentSpreadStart(project);
      sourceIndexes = [start, start + 1].filter((index) => index >= 0 && index < pages.length);
      defaultTitle = `Разворот ${start + 1}-${Math.min(start + 2, pages.length)}`;
    } else {
      sourceIndexes = pages.map((_, index) => index);
      defaultTitle = `Альбом ${pages.length} стр.`;
    }

    const entered = window.prompt('Название шаблона', defaultTitle);
    if (entered === null) return null;
    const title = entered.trim() || defaultTitle;

    return {
      version: 1,
      id: makeId('user_template'),
      title,
      scope,
      pageCount: sourceIndexes.length,
      canvas: clone(project.canvas),
      settings: clone(project.settings),
      pages: sourceIndexes.map((sourceIndex, index) => {
        const page = cleanPage(pages[sourceIndex], index);
        page.id = makeId('template_page');
        page.title = `Страница ${index + 1}`;
        return page;
      }),
      extraLayers: extractExtraLayers(project, sourceIndexes),
      createdAt: new Date().toISOString(),
    };
  }

  function addRecord(scope) {
    try {
      const record = makeRecord(scope);
      if (!record) return;
      state.records.unshift(record);
      state.selectedId = record.id;
      saveRecords();
      showNotice(`Шаблон «${record.title}» сохранён`);
      renderNow();
    } catch (error) {
      console.error(error);
      showNotice('Не получилось сохранить шаблон');
    }
  }

  function selectedRecord() {
    return state.records.find((record) => record.id === state.selectedId) || state.records[0] || null;
  }

  function makeRuntimePage(page, index) {
    const next = cleanPage(page, index);
    next.id = makeId('page');
    next.title = `Страница ${index + 1}`;
    next.frames = (next.frames || []).map((frame) => ({ ...frame, photo: null }));
    return next;
  }

  function remapExtraLayers(record, targetStartIndex, count, baseLayers = { version: 1, pages: {} }, clearTargets = true) {
    const next = clone(baseLayers) || { version: 1, pages: {} };
    if (!next.pages || typeof next.pages !== 'object') next.pages = {};

    if (clearTargets) {
      for (let i = 0; i < count; i += 1) {
        delete next.pages[String(targetStartIndex + i + 1)];
      }
    }

    const sourcePages = record.extraLayers?.pages || {};
    for (let i = 0; i < count; i += 1) {
      const sourcePage = sourcePages[String(i + 1)];
      const cleaned = cleanLayerPage(sourcePage);
      if (cleaned.texts.length || cleaned.drawings.length) {
        next.pages[String(targetStartIndex + i + 1)] = cleaned;
      }
    }
    return next;
  }

  function projectFromWholeTemplate(record) {
    const pages = (record.pages || []).map((page, index) => makeRuntimePage(page, index));
    return {
      version: 'template-package-1',
      canvas: clone(record.canvas),
      settings: clone(record.settings),
      library: [],
      pages,
      currentPageId: pages[0]?.id,
      viewMode: pages.length > 1 ? 'spread' : 'single',
      bookletSheetsPerBlock: 4,
      bookletPrintSettings: {},
      extraLayers: remapExtraLayers(record, 0, pages.length, { version: 1, pages: {} }, false),
      albumEditorMode: 'collage',
    };
  }

  function projectWithAppliedTemplate(record, mode) {
    const base = visibleProject();
    const basePages = Array.isArray(base.pages) ? clone(base.pages) : [];
    const count = mode === 'spread' ? Math.min(2, record.pages?.length || 0) : 1;
    if (!count) throw new Error('template has no pages');
    const start = mode === 'spread' ? currentSpreadStart(base) : currentIndex(base);

    for (let i = 0; i < count; i += 1) {
      const sourcePage = record.pages[i] || record.pages[0];
      const page = makeRuntimePage(sourcePage, start + i);
      page.title = `Страница ${start + i + 1}`;
      if (start + i < basePages.length) basePages[start + i] = page;
      else basePages.push(page);
    }

    return {
      ...clone(base),
      pages: basePages,
      currentPageId: basePages[start]?.id || basePages[0]?.id,
      extraLayers: remapExtraLayers(record, start, count, base.extraLayers, true),
      albumEditorMode: 'collage',
    };
  }

  function applyRecord(record, mode) {
    if (!record) return;
    const label = mode === 'album' ? 'весь альбом' : mode === 'spread' ? 'разворот' : 'страница';
    const message = mode === 'album'
      ? `Заменить текущий альбом шаблоном «${record.title}»? Фото из проекта останутся только в файлах, но на страницах их не будет.`
      : `Применить шаблон «${record.title}» на текущую ${label}?`;
    if (!window.confirm(message)) return;

    try {
      const data = mode === 'album' ? projectFromWholeTemplate(record) : projectWithAppliedTemplate(record, mode);
      const result = appApi()?.openProject?.(data, { notice: `Шаблон применён: ${label}` });
      if (!result?.ok && result !== undefined) throw new Error('openProject failed');
      showNotice(`Шаблон применён: ${label}`);
    } catch (error) {
      console.error(error);
      showNotice('Не получилось применить шаблон');
    }
  }

  function deleteRecord(record) {
    if (!record) return;
    if (!window.confirm(`Удалить шаблон «${record.title}»?`)) return;
    state.records = state.records.filter((item) => item.id !== record.id);
    if (state.selectedId === record.id) state.selectedId = state.records[0]?.id || null;
    saveRecords();
    renderNow();
  }

  function exportRecord(record) {
    if (!record) return;
    const slug = String(record.title || 'template').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '') || 'template';
    saveFile(`${slug}.json`, record);
  }

  function importRecord(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const records = Array.isArray(data) ? data : [data];
        const clean = records
          .filter((record) => record && Array.isArray(record.pages))
          .map((record) => ({ ...record, id: record.id || makeId('user_template'), createdAt: record.createdAt || new Date().toISOString() }));
        if (!clean.length) throw new Error('no templates');
        state.records = [...clean, ...state.records];
        state.selectedId = clean[0].id;
        saveRecords();
        renderNow();
        showNotice(`Импортировано шаблонов: ${clean.length}`);
      } catch (error) {
        console.error(error);
        showNotice('Файл не похож на шаблон');
      }
    };
    reader.readAsText(file);
  }

  function button(label, onClick, extra = '') {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `album-mode-button ${extra}`.trim();
    node.textContent = label;
    node.addEventListener('click', onClick);
    return node;
  }

  function block(title, children = []) {
    const wrapper = document.createElement('div');
    wrapper.className = 'template-mode-block';
    if (title) {
      const h3 = document.createElement('h3');
      h3.textContent = title;
      wrapper.append(h3);
    }
    children.forEach((child) => wrapper.append(child));
    return wrapper;
  }

  function hint(text) {
    const node = document.createElement('p');
    node.className = 'template-mode-hint';
    node.textContent = text;
    return node;
  }

  function renderTopActions() {
    const actions = document.querySelector('.album-tool-panel .album-mode-actions');
    if (!actions || actions.dataset.templateSavedOwner === 'custom-templates') return;
    actions.dataset.templateSavedOwner = 'custom-templates';
    actions.innerHTML = '';
    actions.append(
      button('Сохранить альбом как шаблон', () => addRecord('album'), 'primary'),
      button('Сохранить страницу', () => addRecord('page')),
      button('Сохранить разворот', () => addRecord('spread')),
    );
  }

  function renderList(left) {
    left.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'album-mode-title';
    title.innerHTML = '<div><h2>Мои шаблоны</h2><p>Сохраняются из текущего альбома: без фотографий, но с окнами, текстом, цветами и рисунками.</p></div><span class="album-mode-badge">пакеты</span>';
    left.append(title);

    const saveRow = document.createElement('div');
    saveRow.className = 'template-save-grid';
    saveRow.append(
      button('Сохранить весь альбом', () => addRecord('album'), 'primary'),
      button('Сохранить страницу', () => addRecord('page')),
      button('Сохранить разворот', () => addRecord('spread')),
    );
    left.append(block('Создать из текущего проекта', [saveRow, hint('Фото не сохраняются. На страницах останутся пустые фото-окна, текст и оформление.')]))

    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = IMPORT_ACCEPT;
    importInput.className = 'template-hidden-input';
    importInput.addEventListener('change', (event) => {
      importRecord(event.target.files?.[0]);
      event.target.value = '';
    });

    const tools = document.createElement('div');
    tools.className = 'template-save-grid';
    tools.append(button('Загрузить JSON', () => importInput.click()), button('Скачать все', () => saveFile('collage-my-templates.json', state.records)));
    left.append(block('Импорт / экспорт', [tools, importInput]));

    const list = document.createElement('div');
    list.className = 'template-record-list';
    if (!state.records.length) {
      const empty = document.createElement('div');
      empty.className = 'album-mode-empty';
      empty.textContent = 'Готовых шаблонов нет. Собери пустой альбом/страницу, потом нажми «Сохранить как шаблон».';
      list.append(empty);
    } else {
      state.records.forEach((record) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `template-record-card ${state.selectedId === record.id ? 'active' : ''}`;
        card.innerHTML = `<strong>${record.title || 'Без названия'}</strong><span>${record.pageCount || record.pages?.length || 0} стр. · ${record.scope === 'album' ? 'альбом' : record.scope === 'spread' ? 'разворот' : 'страница'}</span><small>${record.createdAt ? new Date(record.createdAt).toLocaleString('ru-RU') : ''}</small>`;
        card.addEventListener('click', () => {
          state.selectedId = record.id;
          renderNow();
        });
        list.append(card);
      });
    }
    left.append(block('Список', [list]));
  }

  function renderInspector(right) {
    right.innerHTML = '';
    const record = selectedRecord();
    const title = document.createElement('div');
    title.className = 'album-mode-title';
    title.innerHTML = '<div><h2>Использовать шаблон</h2><p>Применение создаёт обычные страницы коллажа: фото-окна пустые, текст редактируется в режиме «Текст».</p></div>';
    right.append(title);

    if (!record) {
      right.append(block('', [hint('Сначала сохрани свой шаблон слева.')]))
      return;
    }

    const info = document.createElement('div');
    info.className = 'template-record-info';
    info.innerHTML = `<strong>${record.title || 'Без названия'}</strong><span>${record.pageCount || record.pages?.length || 0} стр.</span>`;

    const useGrid = document.createElement('div');
    useGrid.className = 'template-use-grid';
    useGrid.append(
      button('Использовать весь шаблон', () => applyRecord(record, 'album'), 'primary'),
      button('На текущую страницу', () => applyRecord(record, 'page')),
      button('На текущий разворот', () => applyRecord(record, 'spread')),
    );

    const manage = document.createElement('div');
    manage.className = 'template-use-grid';
    manage.append(
      button('Скачать JSON', () => exportRecord(record)),
      button('Удалить шаблон', () => deleteRecord(record), 'danger'),
    );

    right.append(
      block('Выбранный шаблон', [info]),
      block('Применить', [useGrid, hint('После применения переходи в «Коллаж», добавляй фото в пустые окна. Текст меняется отдельно в режиме «Текст».')]),
      block('Управление', [manage]),
    );
  }

  function renderNow() {
    if (!isTemplatesMode()) return;
    renderTopActions();
    const left = document.querySelector('.album-mode-sidebar');
    const right = document.querySelector('.album-mode-inspector');
    if (!left || !right) return;
    if (!state.selectedId && state.records[0]) state.selectedId = state.records[0].id;
    renderList(left);
    renderInspector(right);
  }

  function scheduleRender() {
    requestAnimationFrame(() => requestAnimationFrame(renderNow));
  }

  loadRecords();
  window.addEventListener('collage-album-mode-change', scheduleRender);
  window.addEventListener('collage-album-layers-import', scheduleRender);
  window.addEventListener('storage', () => {
    loadRecords();
    scheduleRender();
  });
  setInterval(scheduleRender, 600);
  scheduleRender();
})();
