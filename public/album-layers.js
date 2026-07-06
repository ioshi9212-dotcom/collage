(() => {
  const STORAGE_KEY = 'collage-album-extra-layers-v1';
  const MODE_KEY = 'collage-album-editor-mode';
  const PROJECT_PREFIX = 'collage-creator-album';
  const SPREAD_GAP = 90;

  const state = {
    mode: localStorage.getItem(MODE_KEY) || 'collage',
    selectedTextId: null,
    layers: loadLayers(),
    dragging: null,
  };

  function makeId() {
    return globalThis.crypto?.randomUUID?.() || `text_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.layers));
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

  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    if (typeof key === 'string' && key.startsWith(PROJECT_PREFIX) && typeof value === 'string') {
      try {
        const data = JSON.parse(value);
        if (data && Array.isArray(data.pages)) {
          data.extraLayers = state.layers;
          data.albumEditorMode = state.mode;
          value = JSON.stringify(data);
        }
      } catch {
        // pass original value
      }
    }
    return originalSetItem(key, value);
  };

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

  function pageItems(pageNumber) {
    const key = String(pageNumber);
    if (!state.layers.pages[key]) state.layers.pages[key] = { texts: [], drawings: [], templates: [] };
    if (!Array.isArray(state.layers.pages[key].texts)) state.layers.pages[key].texts = [];
    return state.layers.pages[key].texts;
  }

  function selectedItem() {
    for (const page of Object.values(state.layers.pages)) {
      const item = page?.texts?.find((text) => text.id === state.selectedTextId);
      if (item) return item;
    }
    return null;
  }

  function setMode(mode) {
    state.mode = mode;
    state.selectedTextId = null;
    localStorage.setItem(MODE_KEY, mode);
    render();
    const messages = {
      collage: 'Режим коллажа: рамки и фото снова редактируются.',
      text: 'Режим текста: коллаж не меняется, можно двигать и редактировать текст.',
      drawings: 'Рисунки пока пустые. Кнопка уже подготовлена.',
      templates: 'Шаблоны пока пустые. Кнопка уже подготовлена.',
    };
    showNotice(messages[mode] || 'Режим переключён');
  }

  function showNotice(text) {
    const notice = document.querySelector('.notice');
    if (notice) {
      notice.textContent = text;
      return;
    }
    console.info(text);
  }

  function addText() {
    const canvas = currentCanvas();
    const pageNumber = activePageNumber();
    const item = {
      id: makeId(),
      x: Math.round(canvas.width * 0.12),
      y: Math.round(canvas.height * 0.12),
      width: Math.min(680, Math.round(canvas.width * 0.62)),
      text: 'Новый текст',
      fontSize: 56,
      color: '#1f2723',
    };
    pageItems(pageNumber).push(item);
    state.selectedTextId = item.id;
    saveLayers();
    state.mode = 'text';
    localStorage.setItem(MODE_KEY, 'text');
    render();
  }

  function updateSelected(patch) {
    const item = selectedItem();
    if (!item) return;
    Object.assign(item, patch);
    saveLayers();
    render();
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

  function ensurePanel() {
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

  function button(label, mode) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `album-mode-tab ${state.mode === mode ? 'active' : ''}`;
    node.textContent = label;
    node.addEventListener('click', () => setMode(mode));
    return node;
  }

  function action(label, fn, extra = '') {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `album-mode-button ${extra}`.trim();
    node.textContent = label;
    node.addEventListener('click', fn);
    return node;
  }

  function renderPanel() {
    const panel = ensurePanel();
    if (!panel) return;
    const selected = selectedItem();
    panel.className = `album-tool-panel ${selected ? 'has-selected-text' : ''}`;
    panel.innerHTML = '';

    const tabs = document.createElement('div');
    tabs.className = 'album-mode-tabs';
    tabs.append(
      button('Коллаж', 'collage'),
      button('Текст', 'text'),
      button('Рисунки', 'drawings'),
      button('Шаблоны', 'templates')
    );

    const note = document.createElement('div');
    note.className = 'album-mode-note';
    note.textContent = state.mode === 'text'
      ? 'Текст редактируется отдельным слоем. Рамки коллажа не меняются.'
      : state.mode === 'collage'
        ? 'Коллаж редактируется как раньше. Текст остаётся на странице.'
        : 'Раздел подготовлен, наполнение добавим позже.';

    const actions = document.createElement('div');
    actions.className = 'album-mode-actions';
    if (state.mode === 'text') {
      actions.append(action('+ Текст', addText, 'primary'), action('PNG вида + текст', exportCurrentViewWithText));
      if (selected) actions.append(action('Удалить текст', deleteSelected));
    } else if (state.mode === 'drawings') {
      const empty = action('+ Рисунок', () => showNotice('Рисунки пока пустые. Потом добавим библиотеку.'), '');
      actions.append(empty);
    } else if (state.mode === 'templates') {
      const empty = action('+ Шаблон', () => showNotice('Шаблоны пока пустые. Потом добавим библиотеку.'), '');
      actions.append(empty);
    }

    const inspector = document.createElement('div');
    inspector.className = 'album-text-inspector';
    if (selected) {
      inspector.append(
        field('Текст', textarea(selected.text, (value) => updateSelected({ text: value }))),
        field('Размер', input('number', selected.fontSize, (value) => updateSelected({ fontSize: clampNumber(value, 12, 220) }))),
        field('Цвет', input('color', selected.color, (value) => updateSelected({ color: value }))),
        action('Удалить', deleteSelected)
      );
    }

    panel.append(tabs, note, actions, inspector);
  }

  function field(label, control) {
    const wrapper = document.createElement('label');
    const caption = document.createElement('span');
    caption.textContent = label;
    wrapper.append(caption, control);
    return wrapper;
  }

  function input(type, value, onChange) {
    const node = document.createElement('input');
    node.type = type;
    node.value = value;
    node.addEventListener('input', () => onChange(node.value));
    return node;
  }

  function textarea(value, onChange) {
    const node = document.createElement('textarea');
    node.value = value;
    node.addEventListener('input', () => onChange(node.value));
    return node;
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function ensureOverlay() {
    const shell = document.querySelector('.stage-scale-shell');
    if (!shell) return null;
    shell.style.position = shell.style.position || 'relative';
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
    const visible = visiblePages();

    visible.forEach(({ pageNumber, x }) => {
      pageItems(pageNumber).forEach((item) => {
        const div = document.createElement('div');
        div.className = `album-text-item ${item.id === state.selectedTextId ? 'selected' : ''}`;
        div.textContent = item.text || '';
        div.style.left = `${x + Number(item.x || 0)}px`;
        div.style.top = `${Number(item.y || 0)}px`;
        div.style.width = `${Number(item.width || 500)}px`;
        div.style.fontSize = `${Number(item.fontSize || 56)}px`;
        div.style.color = item.color || '#1f2723';
        div.dataset.id = item.id;
        div.dataset.page = String(pageNumber);
        div.addEventListener('pointerdown', (event) => startTextDrag(event, item, pageNumber));
        div.addEventListener('dblclick', () => {
          if (state.mode !== 'text') return;
          div.setAttribute('contenteditable', 'true');
          div.focus();
        });
        div.addEventListener('blur', () => {
          if (div.getAttribute('contenteditable') === 'true') {
            item.text = div.textContent || '';
            div.removeAttribute('contenteditable');
            saveLayers();
            render();
          }
        });
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
    if (event.target.getAttribute('contenteditable') === 'true') return;
    event.preventDefault();
    event.stopPropagation();
    state.selectedTextId = item.id;
    const scale = stageScale();
    state.dragging = {
      id: item.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(item.x || 0),
      startY: Number(item.y || 0),
      scale,
    };
    window.addEventListener('pointermove', moveTextDrag);
    window.addEventListener('pointerup', stopTextDrag, { once: true });
    render();
  }

  function moveTextDrag(event) {
    if (!state.dragging) return;
    const item = selectedItem();
    if (!item) return;
    item.x = Math.round(state.dragging.startX + (event.clientX - state.dragging.startClientX) / state.dragging.scale);
    item.y = Math.round(state.dragging.startY + (event.clientY - state.dragging.startClientY) / state.dragging.scale);
    saveLayers();
    renderOverlay();
  }

  function stopTextDrag() {
    state.dragging = null;
    window.removeEventListener('pointermove', moveTextDrag);
    saveLayers();
    render();
  }

  function exportCurrentViewWithText() {
    const shell = document.querySelector('.stage-scale-shell');
    const stageCanvas = shell?.querySelector('.konvajs-content canvas');
    if (!shell || !stageCanvas) return showNotice('Не нашла холст для экспорта');

    const logicalWidth = Number.parseFloat(shell.style.width) || stageCanvas.width;
    const logicalHeight = Number.parseFloat(shell.style.height) || stageCanvas.height;
    const ratio = stageCanvas.width / logicalWidth;
    const output = document.createElement('canvas');
    output.width = stageCanvas.width;
    output.height = stageCanvas.height;
    const ctx = output.getContext('2d');
    ctx.drawImage(stageCanvas, 0, 0);

    visiblePages().forEach(({ pageNumber, x }) => {
      pageItems(pageNumber).forEach((item) => {
        drawWrappedText(ctx, item.text || '', (x + Number(item.x || 0)) * ratio, Number(item.y || 0) * ratio, Number(item.width || 500) * ratio, Number(item.fontSize || 56) * ratio, item.color || '#1f2723');
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
    renderPanel();
    renderOverlay();
  }

  window.addEventListener('DOMContentLoaded', () => {
    extractLayersFromCurrentProject();
    render();
    setInterval(render, 700);
  });
})();
