(() => {
  const TEMPLATE_MANIFEST_URL = '/templates/index.json';
  const SPREAD_GAP = 90;
  const DEFAULT_TEMPLATE_COLOR = '#f5ece2';

  const state = {
    templates: [],
    packages: [],
    loadState: 'idle',
    selectedAppliedId: null,
    selectedSlotId: null,
    dragging: null,
    lastRenderMode: '',
  };

  function makeId(prefix = 'template') {
    return globalThis.crypto?.randomUUID?.() || `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function albumApi() {
    return globalThis.__collageAlbumLayers;
  }

  function currentLayers() {
    return albumApi()?.getLayers?.() || { version: 1, pages: {} };
  }

  function setLayers(layers) {
    albumApi()?.setLayers?.(layers);
  }

  function activePageNumber() {
    const text = document.querySelector('.page-chip.active-page-chip b')?.textContent;
    const pageNumber = Number(text);
    return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  }

  function currentCanvas() {
    const strong = document.querySelector('.canvas-toolbar strong')?.textContent || '';
    const match = strong.match(/(\d+)×(\d+)px/);
    return {
      width: match ? Number(match[1]) : 1480,
      height: match ? Number(match[2]) : 2100,
    };
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

  function pageLayer(layers, pageNumber = activePageNumber()) {
    const key = String(pageNumber);
    if (!layers.pages) layers.pages = {};
    if (!layers.pages[key]) layers.pages[key] = { texts: [], drawings: [], templates: [] };
    if (!Array.isArray(layers.pages[key].texts)) layers.pages[key].texts = [];
    if (!Array.isArray(layers.pages[key].drawings)) layers.pages[key].drawings = [];
    if (!Array.isArray(layers.pages[key].templates)) layers.pages[key].templates = [];
    return layers.pages[key];
  }

  function templatesForPage(pageNumber = activePageNumber()) {
    const layers = currentLayers();
    return pageLayer(layers, pageNumber).templates || [];
  }

  function selectedTemplate() {
    const layers = currentLayers();
    for (const page of Object.values(layers.pages || {})) {
      const found = page?.templates?.find((item) => item.id === state.selectedAppliedId);
      if (found) return found;
    }
    return null;
  }

  function selectedSlot() {
    const template = selectedTemplate();
    return template?.photoSlots?.find((slot) => slot.id === state.selectedSlotId) || null;
  }

  function saveTemplatePatch(patchFn) {
    const layers = currentLayers();
    const template = Object.values(layers.pages || {})
      .flatMap((page) => page.templates || [])
      .find((item) => item.id === state.selectedAppliedId);
    if (!template) return;
    patchFn(template, layers);
    setLayers(layers);
    renderNow();
  }

  function showNotice(text) {
    const notice = document.querySelector('.notice');
    if (notice) {
      notice.textContent = text;
      return;
    }
    console.info(text);
  }

  async function loadManifest(force = false) {
    if (state.loadState === 'ready' && !force) return;
    state.loadState = 'loading';
    try {
      const response = await fetch(`${TEMPLATE_MANIFEST_URL}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`manifest ${response.status}`);
      const manifest = await response.json();
      const loadEntries = async (entries, label) => {
        const loaded = [];
        for (const entry of entries) {
          if (!entry.src) continue;
          try {
            const itemResponse = await fetch(`${entry.src}?v=${Date.now()}`, { cache: 'no-store' });
            if (!itemResponse.ok) throw new Error(`${label} ${itemResponse.status}`);
            const data = await itemResponse.json();
            loaded.push({ ...entry, data });
          } catch (error) {
            loaded.push({ ...entry, error: error.message });
          }
        }
        return loaded;
      };

      const templateEntries = Array.isArray(manifest.templates) ? manifest.templates : [];
      const packageEntries = Array.isArray(manifest.packages) ? manifest.packages : [];
      state.templates = await loadEntries(templateEntries, 'template');
      state.packages = await loadEntries(packageEntries, 'package');
      state.loadState = 'ready';
    } catch (error) {
      state.templates = [];
      state.packages = [];
      state.loadState = 'error';
      showNotice(`Не смогла загрузить шаблоны: ${error.message}`);
    }
  }

  function normalizeTemplateData(data = {}) {
    const canvas = currentCanvas();
    return {
      id: makeId('applied_template'),
      sourceId: data.id || '',
      title: data.title || 'Новый шаблон',
      category: data.category || 'custom',
      page: data.page || { presetId: 'a5-portrait', width: canvas.width, height: canvas.height },
      background: data.background || { type: 'color', color: DEFAULT_TEMPLATE_COLOR, image: null, fit: 'cover', opacity: 1 },
      photoSlots: Array.isArray(data.photoSlots) ? data.photoSlots.map((slot, index) => ({
        id: slot.id || makeId('slot'),
        label: slot.label || `Фото ${index + 1}`,
        x: Number(slot.x ?? 120),
        y: Number(slot.y ?? 220),
        width: Number(slot.width ?? 520),
        height: Number(slot.height ?? 680),
        radius: Number(slot.radius ?? 0),
        fill: slot.fill || 'rgba(255,255,255,0.12)',
        border: {
          enabled: slot.border?.enabled !== false,
          color: slot.border?.color || '#ffffff',
          width: Number(slot.border?.width ?? 16),
          offset: Number(slot.border?.offset ?? 0),
        },
      })) : [],
      texts: Array.isArray(data.texts) ? data.texts.map((text) => ({
        id: text.id || makeId('template_text'),
        text: text.text || '',
        x: Number(text.x ?? 120),
        y: Number(text.y ?? 120),
        width: Number(text.width ?? 800),
        fontFamily: text.fontFamily || "'Collage Caslon Becker', Georgia, serif",
        fontSize: Number(text.fontSize ?? 92),
        fontWeight: Number(text.fontWeight ?? 400),
        fontStyle: text.fontStyle === 'italic' ? 'italic' : 'normal',
        lineHeight: Number(text.lineHeight ?? 1.08),
        color: text.color || '#1f2723',
        align: text.align || 'left',
      })) : [],
      decorations: Array.isArray(data.decorations) ? data.decorations : [],
    };
  }

  function applyTemplate(templateData) {
    const layers = currentLayers();
    const page = pageLayer(layers, activePageNumber());
    const applied = normalizeTemplateData(templateData);
    page.templates.push(applied);
    state.selectedAppliedId = applied.id;
    state.selectedSlotId = applied.photoSlots[0]?.id || null;
    setLayers(layers);
    showNotice(`Шаблон «${applied.title}» применён к странице`);
    renderNow();
  }

  function applyAlbumPackage(packageData) {
    const pages = Array.isArray(packageData?.pages) ? packageData.pages : [];
    const title = packageData?.title || 'Пакет альбома';
    if (!pages.length) {
      showNotice('В пакете нет страниц');
      return;
    }

    const confirmed = window.confirm(
      `Применить пакет «${title}»?\n\n` +
      `Текущий альбом будет заменён на ${pages.length} стр. из пакета.\n` +
      `Перед этим можно скачать JSON проекта, если нужно сохранить текущую работу.`
    );
    if (!confirmed) return;

    const result = globalThis.__collageApp?.applyTemplatePackage?.(packageData);
    if (!result?.ok) {
      showNotice(result?.error ? `Не удалось применить пакет: ${result.error}` : 'Редактор ещё не готов применить пакет');
      return;
    }

    state.selectedAppliedId = null;
    state.selectedSlotId = null;
    showNotice(`Пакет «${result.title || title}» применён: ${result.pageCount || pages.length} стр.`);
    window.setTimeout(renderNow, 180);
  }

  function createBlankTemplate() {
    const canvas = currentCanvas();
    applyTemplate({
      id: 'manual-template',
      title: 'Ручной шаблон',
      category: 'manual',
      page: { presetId: 'current', width: canvas.width, height: canvas.height },
      background: { type: 'color', color: DEFAULT_TEMPLATE_COLOR, image: null, fit: 'cover', opacity: 1 },
      photoSlots: [],
      texts: [],
      decorations: [],
    });
  }

  function deleteSelectedTemplate() {
    if (!state.selectedAppliedId) return;
    const layers = currentLayers();
    Object.values(layers.pages || {}).forEach((page) => {
      if (Array.isArray(page.templates)) page.templates = page.templates.filter((item) => item.id !== state.selectedAppliedId);
    });
    state.selectedAppliedId = null;
    state.selectedSlotId = null;
    setLayers(layers);
    renderNow();
  }

  function addPhotoSlot() {
    saveTemplatePatch((template) => {
      const index = (template.photoSlots || []).length + 1;
      if (!Array.isArray(template.photoSlots)) template.photoSlots = [];
      template.photoSlots.push({
        id: makeId('slot'),
        label: `Фото ${index}`,
        x: 120 + (index - 1) * 45,
        y: 260 + (index - 1) * 45,
        width: 520,
        height: 680,
        radius: 0,
        fill: 'rgba(255,255,255,0.12)',
        border: { enabled: true, color: '#ffffff', width: 16, offset: 0 },
      });
      state.selectedSlotId = template.photoSlots.at(-1).id;
    });
  }

  function deleteSelectedSlot() {
    if (!state.selectedSlotId) return;
    saveTemplatePatch((template) => {
      template.photoSlots = (template.photoSlots || []).filter((slot) => slot.id !== state.selectedSlotId);
      state.selectedSlotId = template.photoSlots[0]?.id || null;
    });
  }

  function addTemplateTitle() {
    saveTemplatePatch((template) => {
      if (!Array.isArray(template.texts)) template.texts = [];
      template.texts.push({
        id: makeId('template_text'),
        text: 'Наша история',
        x: 120,
        y: 110,
        width: 900,
        fontFamily: "'Collage Caslon Becker', Georgia, serif",
        fontSize: 92,
        fontWeight: 400,
        fontStyle: 'normal',
        lineHeight: 1.08,
        color: '#2b221c',
        align: 'left',
      });
    });
  }

  function downloadSelectedTemplate() {
    const template = selectedTemplate();
    if (!template) return;
    const exportData = clone(template);
    exportData.id = exportData.sourceId || exportData.id;
    delete exportData.sourceId;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportData.id || 'template'}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importTemplateFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'));
        applyTemplate(data);
      } catch (error) {
        showNotice(`Не смогла прочитать JSON шаблона: ${error.message}`);
      }
    };
    reader.readAsText(file);
  }

  function uploadBackground(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      saveTemplatePatch((template) => {
        template.background = {
          ...(template.background || {}),
          type: 'image',
          image: String(reader.result || ''),
          fit: 'cover',
          opacity: 1,
        };
      });
    };
    reader.readAsDataURL(file);
  }

  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(label, fn, extra = '') {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `album-mode-button ${extra}`.trim();
    node.textContent = label;
    node.addEventListener('click', fn);
    return node;
  }

  function block(title, children = []) {
    const wrapper = el('div', 'album-mode-block');
    if (title) wrapper.append(el('h3', '', title));
    children.forEach((child) => wrapper.append(child));
    return wrapper;
  }

  function hint(text) {
    return el('div', 'album-mode-hint', text);
  }

  function empty(text) {
    return el('div', 'album-mode-empty', text);
  }

  function field(label, control) {
    const wrapper = el('label', 'album-edit-field');
    wrapper.append(el('span', '', label), control);
    return wrapper;
  }

  function input(type, value, onInput) {
    const node = document.createElement('input');
    node.type = type;
    node.value = value ?? '';
    node.addEventListener('input', () => onInput(node.value));
    return node;
  }

  function numberInput(value, min, max, onInput) {
    const node = input('number', value, (raw) => {
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      onInput(Math.min(max, Math.max(min, n)));
    });
    node.min = String(min);
    node.max = String(max);
    return node;
  }

  function fileInput(accept, onFile) {
    const node = document.createElement('input');
    node.type = 'file';
    node.accept = accept;
    node.className = 'template-file-input';
    node.addEventListener('change', () => onFile(node.files?.[0]));
    return node;
  }

  function renderTopActions() {
    if (document.body.dataset.albumMode !== 'templates') return;
    const actions = document.querySelector('.album-tool-panel .album-mode-actions');
    if (!actions || actions.dataset.templateModePatched === '1') return;
    actions.dataset.templateModePatched = '1';
    actions.innerHTML = '';
    actions.append(
      button('+ Ручной шаблон', createBlankTemplate, 'primary'),
      button('+ Фото-окно', addPhotoSlot),
      button('+ Текст шаблона', addTemplateTitle),
      button('PNG вида + шаблон', exportCurrentViewWithTemplates)
    );
  }

  function renderPanels() {
    if (document.body.dataset.albumMode !== 'templates') return;
    const left = document.querySelector('.album-mode-sidebar');
    const right = document.querySelector('.album-mode-inspector');
    if (!left || !right) return;

    left.innerHTML = '';
    right.innerHTML = '';

    const pageTemplates = templatesForPage();
    const title = el('div', 'album-mode-title');
    const titleText = document.createElement('div');
    titleText.append(el('h2', '', 'Шаблоны'), el('p', '', 'Готовые и ручные шаблоны страницы.'));
    title.append(titleText, el('span', 'album-mode-badge', `${pageTemplates.length}`));
    left.append(title);

    const packageGallery = el('div', 'template-card-list template-package-list');
    if (state.loadState === 'loading') packageGallery.append(empty('Загружаю пакеты…'));
    else if (!state.packages.length) packageGallery.append(empty('Пакетов альбомов пока нет. Добавь их в public/templates/index.json → packages.'));
    else state.packages.forEach((entry) => {
      const card = el('button', 'template-card template-package-card');
      card.type = 'button';
      const pageCount = entry.pageCount || entry.data?.pageCount || entry.data?.pages?.length || 0;
      const design = entry.design || entry.data?.design || entry.category || entry.data?.category || 'album';
      card.append(
        el('strong', '', entry.title || entry.data?.title || entry.id),
        el('small', '', entry.error ? `Ошибка: ${entry.error}` : `${design} · страниц: ${pageCount}`)
      );
      card.disabled = Boolean(entry.error || !entry.data);
      card.addEventListener('click', () => applyAlbumPackage(entry.data));
      packageGallery.append(card);
    });

    const gallery = el('div', 'template-card-list');
    if (state.loadState === 'loading') gallery.append(empty('Загружаю шаблоны…'));
    else if (!state.templates.length) gallery.append(empty('В папке public/templates пока нет готовых шаблонов. Можно создать ручной.'));
    else state.templates.forEach((entry) => {
      const card = el('button', 'template-card');
      card.type = 'button';
      card.append(el('strong', '', entry.title || entry.data?.title || entry.id), el('small', '', entry.error ? `Ошибка: ${entry.error}` : `${entry.category || entry.data?.category || 'template'} · фото: ${entry.photoSlots || entry.data?.photoSlots?.length || 0}`));
      card.disabled = Boolean(entry.error || !entry.data);
      card.addEventListener('click', () => applyTemplate(entry.data));
      gallery.append(card);
    });

    const importInput = fileInput('.json,application/json', importTemplateFile);
    left.append(
      block('Пакеты альбомов', [packageGallery, hint('Пакет заменяет весь текущий альбом и сразу создаёт все страницы в ленте.')]),
      block('Шаблоны страницы', [gallery, button('Обновить список', () => loadManifest(true).then(renderNow))]),
      block('Ручной режим', [button('+ Пустой шаблон', createBlankTemplate, 'primary'), hint('Создай пустой шаблон, добавь фон, фото-окна, текст, потом скачай JSON и положи его в public/templates.')]),
      block('Загрузить JSON', [importInput])
    );

    const appliedList = el('div', 'template-applied-list');
    if (!pageTemplates.length) appliedList.append(empty('На этой странице шаблонов нет.'));
    pageTemplates.forEach((template) => {
      const card = el('button', `template-applied-card ${template.id === state.selectedAppliedId ? 'active' : ''}`);
      card.type = 'button';
      card.append(el('strong', '', template.title || 'Шаблон'), el('small', '', `окна: ${template.photoSlots?.length || 0} · текст: ${template.texts?.length || 0}`));
      card.addEventListener('click', () => {
        state.selectedAppliedId = template.id;
        state.selectedSlotId = template.photoSlots?.[0]?.id || null;
        renderNow();
      });
      appliedList.append(card);
    });
    left.append(block('На странице', [appliedList]));

    const selected = selectedTemplate();
    const rightTitle = el('div', 'album-mode-title');
    const rightTitleText = document.createElement('div');
    rightTitleText.append(el('h2', '', 'Настройки шаблона'), el('p', '', selected ? selected.title : 'Выбери шаблон слева.'));
    rightTitle.append(rightTitleText, el('span', 'album-mode-badge', selected ? 'выбран' : 'нет'));
    right.append(rightTitle);

    if (!selected) {
      right.append(empty('Выбери применённый шаблон или создай ручной.'));
      return;
    }

    const bg = selected.background || { type: 'color', color: DEFAULT_TEMPLATE_COLOR };
    const bgColor = input('color', bg.color || DEFAULT_TEMPLATE_COLOR, (value) => saveTemplatePatch((template) => {
      template.background = { ...(template.background || {}), type: 'color', color: value, image: template.background?.image || null, fit: 'cover', opacity: 1 };
    }));
    const bgHex = input('text', bg.color || DEFAULT_TEMPLATE_COLOR, (value) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(value.trim())) return;
      saveTemplatePatch((template) => {
        template.background = { ...(template.background || {}), type: 'color', color: value.trim(), image: template.background?.image || null, fit: 'cover', opacity: 1 };
      });
    });
    const colorRow = el('div', 'template-color-row');
    colorRow.append(bgColor, bgHex);

    right.append(block('Фон', [field('Цвет / HEX', colorRow), field('Картинка фона', fileInput('image/*', uploadBackground)), button('Убрать картинку фона', () => saveTemplatePatch((template) => {
      template.background = { ...(template.background || {}), type: 'color', image: null };
    }))]));

    const slot = selectedSlot();
    right.append(block('Фото-окна', [button('+ Фото-окно', addPhotoSlot, 'primary'), hint('Фото-окно сейчас работает как рамка/место под фото. Его можно таскать мышкой на холсте в режиме шаблона.')]))

    if (slot) {
      right.append(block('Выбранное окно', [
        field('X', numberInput(Math.round(slot.x || 0), -5000, 5000, (value) => saveTemplatePatch(() => { slot.x = value; }))),
        field('Y', numberInput(Math.round(slot.y || 0), -5000, 5000, (value) => saveTemplatePatch(() => { slot.y = value; }))),
        field('Ширина', numberInput(Math.round(slot.width || 520), 20, 5000, (value) => saveTemplatePatch(() => { slot.width = value; }))),
        field('Высота', numberInput(Math.round(slot.height || 680), 20, 5000, (value) => saveTemplatePatch(() => { slot.height = value; }))),
        field('Скругление', numberInput(Math.round(slot.radius || 0), 0, 500, (value) => saveTemplatePatch(() => { slot.radius = value; }))),
        field('Толщина рамки', numberInput(Math.round(slot.border?.width ?? 16), 0, 200, (value) => saveTemplatePatch(() => { slot.border = { ...(slot.border || {}), enabled: true, width: value }; }))),
        field('Цвет рамки', input('color', slot.border?.color || '#ffffff', (value) => saveTemplatePatch(() => { slot.border = { ...(slot.border || {}), enabled: true, color: value }; }))),
        button('Удалить окно', deleteSelectedSlot, 'danger'),
      ]));
    }

    right.append(block('Сохранение', [
      button('Скачать JSON шаблона', downloadSelectedTemplate, 'primary'),
      button('Удалить шаблон со страницы', deleteSelectedTemplate, 'danger'),
      el('div', 'template-inspector-note', 'Чтобы добавить шаблон в редактор для всех: скачай JSON, положи его в public/templates и пропиши в public/templates/index.json.'),
    ]));
  }

  function ensureBackgroundLayer() {
    const shell = document.querySelector('.stage-scale-shell');
    if (!shell) return null;
    shell.style.position = 'absolute';
    let layer = shell.querySelector('.template-page-background-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'template-page-background-layer';
      shell.insertBefore(layer, shell.firstChild);
    }
    layer.style.width = shell.style.width || `${shell.offsetWidth}px`;
    layer.style.height = shell.style.height || `${shell.offsetHeight}px`;
    return layer;
  }

  function ensureTemplateOverlay() {
    const overlay = document.querySelector('.album-layer-overlay');
    if (!overlay) return null;
    let layer = overlay.querySelector('.template-layer-overlay');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'template-layer-overlay';
      overlay.insertBefore(layer, overlay.firstChild);
    }
    layer.style.width = overlay.style.width || `${overlay.offsetWidth}px`;
    layer.style.height = overlay.style.height || `${overlay.offsetHeight}px`;
    return layer;
  }

  function renderBackgroundNode(parent, template, pageX) {
    const canvas = currentCanvas();
    const bg = template.background || {};
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.left = `${pageX}px`;
    div.style.top = '0px';
    div.style.width = `${canvas.width}px`;
    div.style.height = `${canvas.height}px`;
    div.style.backgroundColor = bg.color || 'transparent';
    div.style.opacity = String(bg.opacity ?? 1);
    if (bg.image) {
      div.style.backgroundImage = `url(${bg.image})`;
      div.style.backgroundSize = bg.fit === 'contain' ? 'contain' : 'cover';
      div.style.backgroundRepeat = 'no-repeat';
      div.style.backgroundPosition = 'center';
    }
    parent.append(div);
  }

  function renderSlotNode(parent, template, slot, pageX) {
    const border = slot.border || {};
    const offset = Number(border.offset || 0);
    const div = document.createElement('div');
    div.className = `template-photo-slot ${template.id === state.selectedAppliedId && slot.id === state.selectedSlotId ? 'selected' : ''}`;
    div.textContent = slot.label || 'Фото';
    div.style.left = `${pageX + Number(slot.x || 0) - offset}px`;
    div.style.top = `${Number(slot.y || 0) - offset}px`;
    div.style.width = `${Number(slot.width || 100) + offset * 2}px`;
    div.style.height = `${Number(slot.height || 100) + offset * 2}px`;
    div.style.borderWidth = `${border.enabled === false ? 0 : Number(border.width || 0)}px`;
    div.style.borderColor = border.color || '#ffffff';
    div.style.borderRadius = `${Number(slot.radius || 0)}px`;
    div.style.background = slot.fill || 'rgba(255,255,255,0.12)';
    div.addEventListener('pointerdown', (event) => startSlotDrag(event, template.id, slot.id));
    div.addEventListener('click', (event) => {
      event.stopPropagation();
      state.selectedAppliedId = template.id;
      state.selectedSlotId = slot.id;
      renderNow();
    });
    parent.append(div);
  }

  function renderTemplateTextNode(parent, text, pageX) {
    const div = document.createElement('div');
    div.className = 'template-text-layer';
    div.textContent = text.text || '';
    div.style.left = `${pageX + Number(text.x || 0)}px`;
    div.style.top = `${Number(text.y || 0)}px`;
    div.style.width = `${Number(text.width || 500)}px`;
    div.style.fontFamily = text.fontFamily || "'Collage Caslon Becker', Georgia, serif";
    div.style.fontSize = `${Number(text.fontSize || 72)}px`;
    div.style.fontWeight = String(text.fontWeight || 400);
    div.style.fontStyle = text.fontStyle || 'normal';
    div.style.lineHeight = String(text.lineHeight || 1.1);
    div.style.color = text.color || '#1f2723';
    div.style.textAlign = text.align || 'left';
    parent.append(div);
  }

  function renderTemplateCanvas() {
    const bgLayer = ensureBackgroundLayer();
    const overlayLayer = ensureTemplateOverlay();
    if (!bgLayer || !overlayLayer) return;
    bgLayer.innerHTML = '';
    overlayLayer.innerHTML = '';

    visiblePages().forEach(({ pageNumber, x }) => {
      templatesForPage(pageNumber).forEach((template) => {
        renderBackgroundNode(bgLayer, template, x);
        (template.photoSlots || []).forEach((slot) => renderSlotNode(overlayLayer, template, slot, x));
        (template.texts || []).forEach((text) => renderTemplateTextNode(overlayLayer, text, x));
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

  function findTemplateAndSlot(templateId, slotId) {
    const layers = currentLayers();
    for (const page of Object.values(layers.pages || {})) {
      const template = page?.templates?.find((item) => item.id === templateId);
      const slot = template?.photoSlots?.find((item) => item.id === slotId);
      if (template && slot) return { layers, template, slot };
    }
    return null;
  }

  function startSlotDrag(event, templateId, slotId) {
    if (document.body.dataset.albumMode !== 'templates') return;
    event.preventDefault();
    event.stopPropagation();
    const found = findTemplateAndSlot(templateId, slotId);
    if (!found) return;
    state.selectedAppliedId = templateId;
    state.selectedSlotId = slotId;
    state.dragging = {
      templateId,
      slotId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(found.slot.x || 0),
      startY: Number(found.slot.y || 0),
      scale: stageScale(),
    };
    window.addEventListener('pointermove', moveSlotDrag);
    window.addEventListener('pointerup', stopSlotDrag, { once: true });
    renderNow();
  }

  function moveSlotDrag(event) {
    if (!state.dragging) return;
    const found = findTemplateAndSlot(state.dragging.templateId, state.dragging.slotId);
    if (!found) return;
    const dx = (event.clientX - state.dragging.startClientX) / state.dragging.scale;
    const dy = (event.clientY - state.dragging.startClientY) / state.dragging.scale;
    found.slot.x = Math.round(state.dragging.startX + dx);
    found.slot.y = Math.round(state.dragging.startY + dy);
    setLayers(found.layers);
    renderTemplateCanvas();
  }

  function stopSlotDrag() {
    state.dragging = null;
    window.removeEventListener('pointermove', moveSlotDrag);
    renderNow();
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, fontSize, ratio = 1) {
    ctx.save();
    ctx.fillStyle = text.color || '#1f2723';
    ctx.font = `${text.fontStyle || 'normal'} ${Number(text.fontWeight || 400)} ${fontSize}px ${text.fontFamily || 'Arial, sans-serif'}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = text.align || 'left';
    const lineHeight = fontSize * Number(text.lineHeight || 1.1);
    let currentY = y;
    String(text.text || '').split('\n').forEach((paragraph) => {
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

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  async function drawTemplateToCanvas(ctx, template, pageX, ratio) {
    const canvas = currentCanvas();
    const bg = template.background || {};
    ctx.save();
    if (bg.color) {
      ctx.fillStyle = bg.color;
      ctx.fillRect(pageX * ratio, 0, canvas.width * ratio, canvas.height * ratio);
    }
    if (bg.image) {
      const image = await loadImage(bg.image);
      if (image) ctx.drawImage(image, pageX * ratio, 0, canvas.width * ratio, canvas.height * ratio);
    }
    (template.photoSlots || []).forEach((slot) => {
      const border = slot.border || {};
      const offset = Number(border.offset || 0);
      const x = (pageX + Number(slot.x || 0) - offset) * ratio;
      const y = (Number(slot.y || 0) - offset) * ratio;
      const w = (Number(slot.width || 100) + offset * 2) * ratio;
      const h = (Number(slot.height || 100) + offset * 2) * ratio;
      const radius = Number(slot.radius || 0) * ratio;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
      else ctx.rect(x, y, w, h);
      ctx.fillStyle = slot.fill || 'rgba(255,255,255,0.08)';
      ctx.fill();
      if (border.enabled !== false && Number(border.width || 0) > 0) {
        ctx.lineWidth = Number(border.width || 0) * ratio;
        ctx.strokeStyle = border.color || '#ffffff';
        ctx.stroke();
      }
    });
    (template.texts || []).forEach((text) => {
      drawWrappedText(ctx, text, (pageX + Number(text.x || 0)) * ratio, Number(text.y || 0) * ratio, Number(text.width || 500) * ratio, Number(text.fontSize || 72) * ratio, ratio);
    });
    ctx.restore();
  }

  async function exportCurrentViewWithTemplates() {
    const shell = document.querySelector('.stage-scale-shell');
    const stageCanvas = shell?.querySelector('.konvajs-content canvas');
    if (!shell || !stageCanvas) return showNotice('Не нашла холст для экспорта');
    try {
      await document.fonts?.ready;
    } catch {
      // ignore
    }

    const logicalWidth = Number.parseFloat(shell.style.width) || stageCanvas.width;
    const ratio = stageCanvas.width / logicalWidth;
    const output = document.createElement('canvas');
    output.width = stageCanvas.width;
    output.height = stageCanvas.height;
    const ctx = output.getContext('2d');

    // Template background should be under photos, then original canvas, then template frames/texts.
    for (const { pageNumber, x } of visiblePages()) {
      for (const template of templatesForPage(pageNumber)) {
        const bgOnly = { ...template, photoSlots: [], texts: [] };
        await drawTemplateToCanvas(ctx, bgOnly, x, ratio);
      }
    }
    ctx.drawImage(stageCanvas, 0, 0);
    for (const { pageNumber, x } of visiblePages()) {
      for (const template of templatesForPage(pageNumber)) {
        const withoutBg = { ...template, background: {} };
        await drawTemplateToCanvas(ctx, withoutBg, x, ratio);
      }
    }

    const link = document.createElement('a');
    link.href = output.toDataURL('image/png');
    link.download = 'album-view-with-template.png';
    document.body.append(link);
    link.click();
    link.remove();
    showNotice('PNG текущего вида с шаблоном скачан');
  }

  function renderNow() {
    if (document.body.dataset.albumMode !== 'templates') return;
    renderTopActions();
    renderPanels();
    renderTemplateCanvas();
  }

  window.addEventListener('DOMContentLoaded', () => {
    loadManifest().then(renderNow);
    window.setInterval(() => {
      const mode = document.body.dataset.albumMode || '';
      if (mode !== state.lastRenderMode) {
        state.lastRenderMode = mode;
        if (mode === 'templates') loadManifest().then(renderNow);
      }
      if (mode === 'templates') renderNow();
    }, 350);
  });
})();
