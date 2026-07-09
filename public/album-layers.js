(() => {
  const STORAGE_KEY = 'collage-album-extra-layers-v1';
  const MODE_KEY = 'collage-album-editor-mode';
  const PROJECT_PREFIX = 'collage-creator-album';
  const SPREAD_GAP = 90;
  const DEFAULT_FONT_ID = 'manrope';
  const DEFAULT_TEXT_PRESET_ID = 'body';
  const TEXT_FONTS = [
    { id: 'system', label: 'Обычный', family: 'Arial, sans-serif' },
    { id: 'manrope', label: 'Мягкий обычный', family: "'Manrope', Arial, sans-serif" },
    { id: 'montserrat', label: 'Современный', family: "'Montserrat', Arial, sans-serif" },
    { id: 'rubik', label: 'Аккуратный', family: "'Rubik', Arial, sans-serif" },
    { id: 'lora', label: 'Книжный', family: "'Lora', Georgia, serif" },
    { id: 'playfair', label: 'Красивый заголовок', family: "'Playfair Display', Georgia, serif" },
    { id: 'cormorant', label: 'Элегантный', family: "'Cormorant Garamond', Georgia, serif" },
    { id: 'oswald', label: 'Строгий заголовок', family: "'Oswald', Arial, sans-serif" },
    { id: 'marck', label: 'Рукописный', family: "'Marck Script', cursive" },
    { id: 'caveat', label: 'Живая подпись', family: "'Caveat', cursive" },
    { id: 'bad-script', label: 'Нежная подпись', family: "'Bad Script', cursive" },
  ];
  const TEXT_PRESETS = [
    { id: 'body', label: 'Обычный', text: 'Новый текст', fontId: 'manrope', fontSize: 56, fontWeight: 500, fontStyle: 'normal', lineHeight: 1.18, color: '#1f2723' },
    { id: 'title', label: 'Заголовок', text: 'Заголовок', fontId: 'playfair', fontSize: 96, fontWeight: 700, fontStyle: 'normal', lineHeight: 1.05, color: '#1f2723' },
    { id: 'soft-title', label: 'Нежный', text: 'Нежный заголовок', fontId: 'cormorant', fontSize: 92, fontWeight: 600, fontStyle: 'normal', lineHeight: 1.06, color: '#2a312e' },
    { id: 'strict', label: 'Строгий', text: 'Строгий текст', fontId: 'oswald', fontSize: 72, fontWeight: 500, fontStyle: 'normal', lineHeight: 1.08, color: '#1f2723' },
    { id: 'script', label: 'Рукописный', text: 'Рукописная подпись', fontId: 'marck', fontSize: 88, fontWeight: 400, fontStyle: 'normal', lineHeight: 1.1, color: '#1f2723' },
    { id: 'signature', label: 'Подпись', text: 'Тёплая подпись', fontId: 'caveat', fontSize: 92, fontWeight: 700, fontStyle: 'normal', lineHeight: 1.0, color: '#1f2723' },
  ];

  const state = {
    mode: localStorage.getItem(MODE_KEY) || 'collage',
    selectedTextId: null,
    layers: loadLayers(),
    dragging: null,
  };

  let lastLayersSnapshot = JSON.stringify(state.layers);

  function makeId() {
    return globalThis.crypto?.randomUUID?.() || `text_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function fontById(id) {
    return TEXT_FONTS.find((font) => font.id === id) || TEXT_FONTS.find((font) => font.id === DEFAULT_FONT_ID) || TEXT_FONTS[0];
  }

  function presetById(id) {
    return TEXT_PRESETS.find((preset) => preset.id === id) || TEXT_PRESETS.find((preset) => preset.id === DEFAULT_TEXT_PRESET_ID) || TEXT_PRESETS[0];
  }

  function fontFamilyForItem(item) {
    if (item?.fontFamily) return item.fontFamily;
    return fontById(item?.fontId).family;
  }

  function fontLabelForItem(item) {
    return fontById(item?.fontId).label;
  }

  function normalizedTextStyle(item) {
    const fontWeight = Number(item?.fontWeight) || 500;
    const fontStyle = item?.fontStyle === 'italic' ? 'italic' : 'normal';
    const lineHeight = Number(item?.lineHeight) || 1.18;
    return { fontWeight, fontStyle, lineHeight };
  }

  function createTextItem(presetId = DEFAULT_TEXT_PRESET_ID) {
    const canvas = currentCanvas();
    const preset = presetById(presetId);
    return {
      id: makeId(),
      x: Math.round(canvas.width * 0.12),
      y: Math.round(canvas.height * 0.12),
      width: Math.min(720, Math.round(canvas.width * 0.62)),
      text: preset.text,
      fontId: preset.fontId,
      fontFamily: fontById(preset.fontId).family,
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight,
      fontStyle: preset.fontStyle,
      lineHeight: preset.lineHeight,
      color: preset.color,
    };
  }

  function applyTextPreset(item, presetId) {
    const preset = presetById(presetId);
    Object.assign(item, {
      fontId: preset.fontId,
      fontFamily: fontById(preset.fontId).family,
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight,
      fontStyle: preset.fontStyle,
      lineHeight: preset.lineHeight,
      color: item.color || preset.color,
    });
  }

  function loadLayers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeLayers(JSON.parse(raw));
    } catch {
      // ignore broken local data
    }
    return { version: 1, pages: {} };
  }

  function normalizeLayers(value) {
    return {
      version: 1,
      pages: value?.pages && typeof value.pages === 'object' ? value.pages : {},
    };
  }

  function saveLayers() {
    lastLayersSnapshot = JSON.stringify(state.layers);
    localStorage.setItem(STORAGE_KEY, lastLayersSnapshot);
  }

  function syncLayersFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw || raw === lastLayersSnapshot) return false;
      state.layers = normalizeLayers(JSON.parse(raw));
      state.selectedTextId = null;
      lastLayersSnapshot = JSON.stringify(state.layers);
      return true;
    } catch {
      return false;
    }
  }

  function scheduleRender() {
    render();
    window.requestAnimationFrame?.(render);
    window.setTimeout(render, 80);
    window.setTimeout(render, 350);
  }

  function extractLayersFromCurrentProject() {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PROJECT_PREFIX)) continue;
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (data?.extraLayers?.pages) {
          state.layers = normalizeLayers(data.extraLayers);
          saveLayers();
          return;
        }
      } catch {
        // ignore
      }
    }
  }

  function exportLayersForProject() {
    return normalizeLayers(state.layers);
  }

  function importLayersFromProject(value) {
    state.layers = normalizeLayers(value);
    state.selectedTextId = null;
    saveLayers();
    scheduleRender();
  }

  function setAlbumMode(value) {
    state.mode = ['collage', 'text', 'drawings', 'templates'].includes(value) ? value : 'collage';
    localStorage.setItem(MODE_KEY, state.mode);
    document.body.dataset.albumMode = state.mode;
    scheduleRender();
  }

  globalThis.__collageAlbumLayers = {
    getLayers: exportLayersForProject,
    setLayers: importLayersFromProject,
    getMode: () => state.mode,
    setMode: setAlbumMode,
  };

  window.addEventListener('collage-album-layers-import', (event) => {
    importLayersFromProject(event.detail?.layers);
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== MODE_KEY) return;
    if (event.key === MODE_KEY) {
      state.mode = localStorage.getItem(MODE_KEY) || 'collage';
    }
    if (event.key === STORAGE_KEY) syncLayersFromStorage();
    scheduleRender();
  });

  function currentCanvas() {
    const strong = document.querySelector('.canvas-toolbar strong')?.textContent || '';
    const match = strong.match(/(\d+)×(\d+)px/);
    return {
      width: match ? Number(match[1]) : 1480,
      height: match ? Number(match[2]) : 2100,
    };
  }

  function activePageNumber() {
    const text = document.querySelector('.page-chip.active-page-chip b')?.textContent;
    const pageNumber = Number(text);
    return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  }

  function visiblePages() {
    const canvas = currentCanvas();
    const toolbar = document.querySelector('.canvas-toolbar strong')?.textContent || '';
    const active = activePageNumber();
    const isSpread = toolbar.includes('Разворот');
    if (!isSpread) return [{ pageNumber: active, x: 0 }];
    const start = active % 2 === 0 ? active - 1 : active;
    return [
      { pageNumber: start, x: 0 },
      { pageNumber: start + 1, x: canvas.width + SPREAD_GAP },
    ];
  }

  function pageLayer(pageNumber) {
    const key = String(pageNumber);
    if (!state.layers.pages[key]) state.layers.pages[key] = { texts: [], drawings: [], templates: [] };
    if (!Array.isArray(state.layers.pages[key].texts)) state.layers.pages[key].texts = [];
    if (!Array.isArray(state.layers.pages[key].drawings)) state.layers.pages[key].drawings = [];
    if (!Array.isArray(state.layers.pages[key].templates)) state.layers.pages[key].templates = [];
    return state.layers.pages[key];
  }

  function pageTexts(pageNumber) {
    return pageLayer(pageNumber).texts;
  }

  function selectedItem() {
    for (const page of Object.values(state.layers.pages)) {
      const item = page?.texts?.find((text) => text.id === state.selectedTextId);
      if (item) return item;
    }
    return null;
  }

  function selectedItemPageNumber() {
    for (const [pageNumber, page] of Object.entries(state.layers.pages)) {
      if (page?.texts?.some((text) => text.id === state.selectedTextId)) return Number(pageNumber);
    }
    return activePageNumber();
  }

  function showNotice(text) {
    const notice = document.querySelector('.notice');
    if (notice) {
      notice.textContent = text;
      return;
    }
    console.info(text);
  }

  function setMode(mode) {
    state.mode = mode;
    state.selectedTextId = null;
    localStorage.setItem(MODE_KEY, mode);
    const messages = {
      collage: 'Режим коллажа: рамки и фото снова редактируются.',
      text: 'Режим текста: панели фото и рамок заменены на настройки текста.',
      drawings: 'Рисунки пока пустые. Панели уже подготовлены.',
      templates: 'Шаблоны пока пустые. Панели уже подготовлены.',
    };
    scheduleRender();
    showNotice(messages[mode] || 'Режим переключён');
  }

  function addText(presetId = DEFAULT_TEXT_PRESET_ID) {
    const pageNumber = activePageNumber();
    const item = createTextItem(presetId);
    pageTexts(pageNumber).push(item);
    state.selectedTextId = item.id;
    state.mode = 'text';
    localStorage.setItem(MODE_KEY, 'text');
    saveLayers();
    scheduleRender();
  }

  function updateSelected(patch, options = {}) {
    const item = selectedItem();
    if (!item) return;
    Object.assign(item, patch);
    saveLayers();
    renderOverlay();
    if (options.renderPanels) renderSidePanels();
  }

  function deleteSelected() {
    if (!state.selectedTextId) return;
    Object.values(state.layers.pages).forEach((page) => {
      if (Array.isArray(page.texts)) page.texts = page.texts.filter((text) => text.id !== state.selectedTextId);
    });
    state.selectedTextId = null;
    saveLayers();
    render();
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function ensureTopPanel() {
    let panel = document.querySelector('.album-tool-panel');
    const albumBar = document.querySelector('.album-bar');
    if (!albumBar) return null;
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'album-tool-panel';
      albumBar.insertAdjacentElement('afterend', panel);
    }
    return panel;
  }

  function ensureModePanels() {
    const workspace = document.querySelector('.workspace');
    const canvasArea = document.querySelector('.canvas-area');
    const pageRail = workspace?.querySelector(':scope > .page-rail');
    if (!workspace || !canvasArea) return { left: null, right: null };

    let left = workspace.querySelector(':scope > .album-mode-sidebar');
    let right = workspace.querySelector(':scope > .album-mode-inspector');

    if (!left) {
      left = document.createElement('aside');
      left.className = 'album-mode-sidebar';
    }

    const leftAnchor = pageRail || canvasArea;
    if (left.nextElementSibling !== leftAnchor) {
      workspace.insertBefore(left, leftAnchor);
    }

    if (!right) {
      right = document.createElement('aside');
      right.className = 'album-mode-inspector';
      canvasArea.insertAdjacentElement('afterend', right);
    }

    return { left, right };
  }

  function modeButton(label, mode) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `album-mode-tab ${state.mode === mode ? 'active' : ''}`;
    node.textContent = label;
    node.addEventListener('click', () => setMode(mode));
    return node;
  }

  function actionButton(label, fn, extra = '') {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `album-mode-button ${extra}`.trim();
    node.textContent = label;
    node.addEventListener('click', fn);
    return node;
  }

  function renderTopPanel() {
    const panel = ensureTopPanel();
    if (!panel) return;
    panel.innerHTML = '';

    const tabs = document.createElement('div');
    tabs.className = 'album-mode-tabs';
    tabs.append(
      modeButton('Коллаж', 'collage'),
      modeButton('Текст', 'text'),
      modeButton('Рисунки', 'drawings'),
      modeButton('Шаблоны', 'templates')
    );

    const note = document.createElement('div');
    note.className = 'album-mode-note';
    note.textContent = state.mode === 'text'
      ? 'Текст отдельным слоем. Коллаж не перестраивается и не сбрасывается.'
      : state.mode === 'collage'
        ? 'Рамки и фото редактируются как раньше. Текст остаётся на странице.'
        : 'Раздел подготовлен, наполнение добавим позже.';

    const actions = document.createElement('div');
    actions.className = 'album-mode-actions';
    if (state.mode === 'text') {
      actions.append(
        actionButton('+ Текст', () => addText('body'), 'primary'),
        actionButton('+ Заголовок', () => addText('title')),
        actionButton('+ Подпись', () => addText('signature')),
        actionButton('PNG вида + текст', exportCurrentViewWithText)
      );
    } else if (state.mode === 'drawings') {
      actions.append(actionButton('+ Рисунок', () => showNotice('Рисунки пока пустые. Потом добавим библиотеку.')));
    } else if (state.mode === 'templates') {
      actions.append(actionButton('+ Шаблон', () => showNotice('Шаблоны пока пустые. Потом добавим библиотеку.')));
    }

    panel.append(tabs, note, actions);
  }

  function titleBlock(title, subtitle, badge) {
    const wrapper = document.createElement('div');
    wrapper.className = 'album-mode-title';

    const text = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.textContent = title;
    const p = document.createElement('p');
    p.textContent = subtitle;
    text.append(h2, p);
    wrapper.append(text);

    if (badge) {
      const b = document.createElement('span');
      b.className = 'album-mode-badge';
      b.textContent = badge;
      wrapper.append(b);
    }

    return wrapper;
  }

  function block(title, children = []) {
    const wrapper = document.createElement('div');
    wrapper.className = 'album-mode-block';
    if (title) {
      const h3 = document.createElement('h3');
      h3.textContent = title;
      wrapper.append(h3);
    }
    children.forEach((child) => wrapper.append(child));
    return wrapper;
  }

  function empty(text) {
    const node = document.createElement('div');
    node.className = 'album-mode-empty';
    node.textContent = text;
    return node;
  }

  function hint(text) {
    const node = document.createElement('div');
    node.className = 'album-mode-hint';
    node.textContent = text;
    return node;
  }

  function editField(label, control) {
    const wrapper = document.createElement('label');
    wrapper.className = 'album-edit-field';
    const caption = document.createElement('span');
    caption.textContent = label;
    wrapper.append(caption, control);
    return wrapper;
  }

  function input(type, value, onInput) {
    const node = document.createElement('input');
    node.type = type;
    node.value = value ?? '';
    node.addEventListener('input', () => onInput(node.value));
    return node;
  }

  function select(value, options, onInput) {
    const node = document.createElement('select');
    options.forEach((option) => {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      node.append(item);
    });
    node.value = value ?? options[0]?.value ?? '';
    node.addEventListener('change', () => onInput(node.value));
    return node;
  }

  function textarea(value, onInput) {
    const node = document.createElement('textarea');
    node.value = value ?? '';
    node.addEventListener('input', () => onInput(node.value));
    return node;
  }

  function renderTextLeft(left) {
    const pageNumber = activePageNumber();
    const texts = pageTexts(pageNumber);
    left.append(
      titleBlock('Текст', 'Текстовые блоки текущей страницы.', `${texts.length}`),
      block(null, [actionButton('+ Добавить текст', addText, 'primary')])
    );

    if (!texts.length) {
      left.append(empty('Текста на этой странице пока нет. Нажми “+ Добавить текст”.'));
      return;
    }

    const list = document.createElement('div');
    list.className = 'album-text-list';
    texts.forEach((item, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `album-text-card ${item.id === state.selectedTextId ? 'active' : ''}`;
      const name = document.createElement('strong');
      name.textContent = item.text?.trim() || `Текст ${index + 1}`;
      const meta = document.createElement('small');
      meta.textContent = `${fontLabelForItem(item)} · ${Math.round(item.fontSize || 56)} px · x ${Math.round(item.x || 0)}, y ${Math.round(item.y || 0)}`;
      card.append(name, meta);
      card.addEventListener('click', () => {
        state.selectedTextId = item.id;
        render();
      });
      list.append(card);
    });

    left.append(block('Слои текста', [list]));
  }

  function renderTextRight(right) {
    const selected = selectedItem();
    right.append(titleBlock('Настройки текста', selected ? 'Редактируй выбранный текст здесь.' : 'Выбери текст на странице или в списке.', selected ? 'выбран' : 'нет'));

    if (!selected) {
      right.append(empty('Нажми на текст на холсте или выбери его слева. Коллажные рамки в этом режиме не трогаются.'));
      return;
    }

    const textArea = textarea(selected.text, (value) => updateSelected({ text: value }));
    const sizeInput = input('number', selected.fontSize, (value) => updateSelected({ fontSize: clampNumber(value, 12, 220) }));
    const colorInput = input('color', selected.color || '#1f2723', (value) => updateSelected({ color: value }));
    const fontSelect = select(selected.fontId || DEFAULT_FONT_ID, TEXT_FONTS.map((font) => ({ value: font.id, label: font.label })), (value) => updateSelected({ fontId: value, fontFamily: fontById(value).family }, { renderPanels: true }));
    const weightSelect = select(String(selected.fontWeight || 500), [
      { value: '400', label: 'Обычный' },
      { value: '500', label: 'Средний' },
      { value: '600', label: 'Полужирный' },
      { value: '700', label: 'Жирный' },
      { value: '800', label: 'Очень жирный' },
    ], (value) => updateSelected({ fontWeight: Number(value) }));
    const styleSelect = select(selected.fontStyle || 'normal', [
      { value: 'normal', label: 'Прямой' },
      { value: 'italic', label: 'Курсив' },
    ], (value) => updateSelected({ fontStyle: value }));
    const lineHeightInput = input('number', selected.lineHeight || 1.18, (value) => updateSelected({ lineHeight: clampNumber(value, 0.8, 2.2) }));
    lineHeightInput.step = '0.02';

    const styleGrid = document.createElement('div');
    styleGrid.className = 'album-style-grid';
    TEXT_PRESETS.forEach((preset) => {
      const chip = actionButton(preset.label, () => {
        const item = selectedItem();
        if (!item) return;
        applyTextPreset(item, preset.id);
        saveLayers();
        render();
      }, 'album-style-chip');
      chip.style.fontFamily = fontById(preset.fontId).family;
      chip.classList.toggle('active', selected.fontId === preset.fontId && Math.round(Number(selected.fontSize || 0)) === Math.round(Number(preset.fontSize || 0)));
      styleGrid.append(chip);
    });

    const preview = document.createElement('div');
    preview.className = 'album-font-preview';
    preview.style.fontFamily = fontFamilyForItem(selected);
    preview.style.fontWeight = String(selected.fontWeight || 500);
    preview.style.fontStyle = selected.fontStyle || 'normal';
    const previewTitle = document.createElement('strong');
    previewTitle.textContent = selected.text?.trim()?.slice(0, 40) || 'Пример текста';
    const previewNote = document.createElement('small');
    previewNote.textContent = `Шрифт: ${fontLabelForItem(selected)}`;
    preview.append(previewTitle, previewNote);

    const geometry = document.createElement('div');
    geometry.className = 'album-geometry-grid';
    geometry.append(
      editField('X', input('number', Math.round(selected.x || 0), (value) => updateSelected({ x: clampNumber(value, -5000, 5000) }))),
      editField('Y', input('number', Math.round(selected.y || 0), (value) => updateSelected({ y: clampNumber(value, -5000, 5000) }))),
      editField('Ширина', input('number', Math.round(selected.width || 500), (value) => updateSelected({ width: clampNumber(value, 80, 3000) }))),
      editField('Размер', sizeInput)
    );

    right.append(
      block('Содержание', [editField('Текст', textArea)]),
      block('Готовые стили', [styleGrid]),
      block('Шрифт', [editField('Гарнитура', fontSelect), editField('Насыщенность', weightSelect), editField('Начертание', styleSelect), editField('Интервал строк', lineHeightInput), preview]),
      block('Внешний вид', [editField('Цвет', colorInput), geometry]),
      block(null, [actionButton('Удалить текст', deleteSelected, 'danger')])
    );
  }

  function renderEmptyMode(left, right, mode) {
    const label = mode === 'drawings' ? 'Рисунки' : 'Шаблоны';
    left.append(
      titleBlock(label, 'Раздел пока подготовлен как структура.', 'пусто'),
      empty(mode === 'drawings' ? 'Тут позже будет загрузка/выбор рисунков.' : 'Тут позже будут готовые шаблоны.'),
      block(null, [actionButton(mode === 'drawings' ? '+ Рисунок' : '+ Шаблон', () => showNotice(`${label} пока пустые. Наполнение добавим позже.`))])
    );
    right.append(
      titleBlock(`Настройки: ${label.toLowerCase()}`, 'Появятся, когда добавим элементы.', 'скоро'),
      empty('Пока редактировать нечего. Коллаж при переключении режима не меняется.')
    );
  }

  function renderSidePanels() {
    document.body.dataset.albumMode = state.mode;
    const { left, right } = ensureModePanels();
    if (!left || !right) return;
    left.innerHTML = '';
    right.innerHTML = '';

    if (state.mode === 'text') {
      renderTextLeft(left);
      renderTextRight(right);
    } else if (state.mode === 'drawings' || state.mode === 'templates') {
      renderEmptyMode(left, right, state.mode);
    }
  }

  function ensureOverlay() {
    const shell = document.querySelector('.stage-scale-shell');
    if (!shell) return null;
    shell.style.position = 'absolute';
    let overlay = shell.querySelector('.album-layer-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'album-layer-overlay';
      shell.append(overlay);
    }
    overlay.style.width = shell.style.width || `${shell.offsetWidth}px`;
    overlay.style.height = shell.style.height || `${shell.offsetHeight}px`;
    overlay.classList.toggle('album-text-mode', state.mode === 'text');
    return overlay;
  }

  function renderOverlay() {
    const overlay = ensureOverlay();
    if (!overlay) return;
    overlay.innerHTML = '';

    visiblePages().forEach(({ pageNumber, x }) => {
      pageTexts(pageNumber).forEach((item) => {
        const div = document.createElement('div');
        div.className = `album-text-item ${item.id === state.selectedTextId ? 'selected' : ''}`;
        div.textContent = item.text || '';
        div.style.left = `${x + Number(item.x || 0)}px`;
        div.style.top = `${Number(item.y || 0)}px`;
        div.style.width = `${Number(item.width || 500)}px`;
        const textStyle = normalizedTextStyle(item);
        div.style.fontFamily = fontFamilyForItem(item);
        div.style.fontWeight = String(textStyle.fontWeight);
        div.style.fontStyle = textStyle.fontStyle;
        div.style.lineHeight = String(textStyle.lineHeight);
        div.style.fontSize = `${Number(item.fontSize || 56)}px`;
        div.style.color = item.color || '#1f2723';
        div.dataset.id = item.id;
        div.dataset.page = String(pageNumber);
        div.addEventListener('pointerdown', (event) => startTextDrag(event, item));
        overlay.append(div);
      });
    });
  }

  function stageScale() {
    const shell = document.querySelector('.stage-scale-shell');
    if (!shell) return 1;
    const transform = getComputedStyle(shell).transform;
    if (!transform || transform === 'none') return 1;
    const match = transform.match(/matrix\(([^,]+)/);
    return match ? Number(match[1]) || 1 : 1;
  }

  function startTextDrag(event, item) {
    if (state.mode !== 'text') return;
    event.preventDefault();
    event.stopPropagation();

    const wasSelected = state.selectedTextId === item.id;
    state.selectedTextId = item.id;
    const scale = stageScale();
    state.dragging = {
      id: item.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(item.x || 0),
      startY: Number(item.y || 0),
      moved: false,
      scale,
    };

    window.addEventListener('pointermove', moveTextDrag);
    window.addEventListener('pointerup', stopTextDrag, { once: true });
    if (!wasSelected) render();
  }

  function moveTextDrag(event) {
    if (!state.dragging) return;
    const item = selectedItem();
    if (!item) return;

    const dx = (event.clientX - state.dragging.startClientX) / state.dragging.scale;
    const dy = (event.clientY - state.dragging.startClientY) / state.dragging.scale;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) state.dragging.moved = true;

    item.x = Math.round(state.dragging.startX + dx);
    item.y = Math.round(state.dragging.startY + dy);
    saveLayers();
    renderOverlay();
  }

  function stopTextDrag() {
    const shouldRenderPanels = state.dragging?.moved;
    state.dragging = null;
    window.removeEventListener('pointermove', moveTextDrag);
    saveLayers();
    renderOverlay();
    if (shouldRenderPanels) renderSidePanels();
  }

  async function exportCurrentViewWithText() {
    const shell = document.querySelector('.stage-scale-shell');
    const stageCanvas = shell?.querySelector('.konvajs-content canvas');
    if (!shell || !stageCanvas) return showNotice('Не нашла холст для экспорта');

    const logicalWidth = Number.parseFloat(shell.style.width) || stageCanvas.width;
    const ratio = stageCanvas.width / logicalWidth;
    const output = document.createElement('canvas');
    output.width = stageCanvas.width;
    output.height = stageCanvas.height;
    try {
      await document.fonts?.ready;
    } catch {
      // ignore font loading errors, browser fallbacks will be used
    }

    const ctx = output.getContext('2d');
    ctx.drawImage(stageCanvas, 0, 0);

    visiblePages().forEach(({ pageNumber, x }) => {
      pageTexts(pageNumber).forEach((item) => {
        drawWrappedText(ctx, item, (x + Number(item.x || 0)) * ratio, Number(item.y || 0) * ratio, Number(item.width || 500) * ratio, Number(item.fontSize || 56) * ratio);
      });
    });

    const link = document.createElement('a');
    link.href = output.toDataURL('image/png');
    link.download = 'album-view-with-text.png';
    document.body.append(link);
    link.click();
    link.remove();
    showNotice('PNG текущего вида с текстом скачан');
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, fontSize, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.textBaseline = 'top';
    const lineHeight = fontSize * 1.18;
    let currentY = y;
    String(text).split('\n').forEach((paragraph) => {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = '';
      if (!words.length) {
        currentY += lineHeight;
        return;
      }
      words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, currentY);
          currentY += lineHeight;
          line = word;
        } else {
          line = test;
        }
      });
      if (line) {
        ctx.fillText(line, x, currentY);
        currentY += lineHeight;
      }
    });
    ctx.restore();
  }

  function render() {
    syncLayersFromStorage();
    document.body.dataset.albumMode = state.mode;
    renderTopPanel();
    renderSidePanels();
    renderOverlay();
  }

  function isTypingInAlbumPanel() {
    const active = document.activeElement;
    return Boolean(active?.closest?.('.album-tool-panel, .album-mode-sidebar, .album-mode-inspector, .cloud-auth-panel'));
  }

  window.addEventListener('DOMContentLoaded', () => {
    extractLayersFromCurrentProject();
    render();
    setInterval(() => {
      if (isTypingInAlbumPanel()) return;
      render();
    }, 500);
  });
})();
