const TOOL_DEFINITIONS = {
  photos: { label: 'Фото', mode: 'collage' },
  pages: { label: 'Страницы', mode: 'collage' },
  collage: { label: 'Коллаж', mode: 'collage' },
  text: { label: 'Текст', mode: 'text' },
  drawings: { label: 'Рисунки', mode: 'drawings' },
  templates: { label: 'Шаблоны', mode: 'templates' },
};

const LAYER_TOOLS = new Set(['text', 'drawings']);

function normalizeLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toolButtonByKey(key) {
  const definition = TOOL_DEFINITIONS[key];
  if (!definition) return null;
  return Array.from(document.querySelectorAll('.editor-tool-rail-v2 .editor-tool-button-v2'))
    .find((button) => normalizeLabel(button.getAttribute('aria-label') || button.textContent) === definition.label) || null;
}

function keyForToolButton(button) {
  const label = normalizeLabel(button?.getAttribute?.('aria-label') || button?.textContent);
  return Object.entries(TOOL_DEFINITIONS).find(([, definition]) => definition.label === label)?.[0] || null;
}

function activeToolButton() {
  return document.querySelector('.editor-tool-rail-v2 .editor-tool-button-v2.active')
    || document.querySelector('.editor-tool-rail-v2 .editor-tool-button-v2');
}

function currentToolKey() {
  return document.body?.dataset?.activeEditorTool || keyForToolButton(activeToolButton()) || 'photos';
}

function afterReactPaint(callback) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
}

function isPageCreationButton(button) {
  if (!(button instanceof HTMLButtonElement)) return false;
  if (button.matches('.page-rail-add-v3')) return true;
  if (!button.closest('.editor-left-panel-v2')) return false;
  const label = normalizeLabel(button.textContent);
  return label === '+ Страница' || label === '+ Пустая страница';
}

function isLayerSelected(toolKey) {
  const inspector = document.querySelector('.album-mode-inspector');
  if (!inspector) return false;
  if (toolKey === 'text') return Boolean(inspector.querySelector('textarea'));
  if (toolKey === 'drawings') return Boolean(inspector.querySelector('button.danger-button'));
  return false;
}

function visibleSpreadPageCards() {
  return Array.from(document.querySelectorAll('.page-rail-list .page-rail-card.stage-page-rail-card'))
    .filter((card) => card instanceof HTMLElement && card.offsetParent !== null);
}

export function installToolStateBehavior() {
  if (window.__collageToolStateBehaviorInstalled) return;
  window.__collageToolStateBehaviorInstalled = true;

  let syncingMode = false;
  let resettingLayerSelection = false;
  let skipNextPageReset = false;
  let syncScheduled = false;

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    afterReactPaint(() => {
      syncScheduled = false;
      syncFromActiveTool();
    });
  }

  function syncFromActiveTool() {
    const button = activeToolButton();
    const key = keyForToolButton(button);
    if (!key) return;

    document.body.dataset.activeEditorTool = key;
    const expectedMode = TOOL_DEFINITIONS[key].mode;
    const currentMode = document.body.dataset.albumMode;

    if (currentMode === expectedMode || syncingMode) return;
    syncingMode = true;
    button.click();
    afterReactPaint(() => {
      syncingMode = false;
      document.body.dataset.activeEditorTool = key;
    });
  }

  function clearLayerSelectionWithoutChangingTool(toolKey) {
    if (!LAYER_TOOLS.has(toolKey) || resettingLayerSelection) return;
    const original = toolButtonByKey(toolKey);
    const neutral = toolButtonByKey('collage');
    if (!original || !neutral) return;

    resettingLayerSelection = true;
    neutral.click();
    original.click();
    afterReactPaint(() => {
      resettingLayerSelection = false;
      document.body.dataset.activeEditorTool = toolKey;
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button');

    if (button?.matches('.editor-tool-button-v2')) {
      const key = keyForToolButton(button);
      if (key) document.body.dataset.activeEditorTool = key;
      scheduleSync();
      return;
    }

    if (button?.matches('.page-rail-card') || isPageCreationButton(button)) {
      if (skipNextPageReset) {
        skipNextPageReset = false;
        scheduleSync();
        return;
      }

      const toolKey = currentToolKey();
      if (LAYER_TOOLS.has(toolKey)) {
        afterReactPaint(() => clearLayerSelectionWithoutChangingTool(toolKey));
      }
    }
  }, true);

  document.addEventListener('pointerup', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.stage-frame canvas')) return;

    const toolKey = currentToolKey();
    if (!LAYER_TOOLS.has(toolKey)) return;

    const spreadButton = Array.from(document.querySelectorAll('.app-view-switch-v2 .segmented-v2 button'))
      .find((button) => normalizeLabel(button.textContent) === 'Разворот');
    if (!spreadButton?.classList.contains('active')) return;

    const clientX = event.clientX;
    afterReactPaint(() => {
      if (!isLayerSelected(toolKey)) return;

      const shell = document.querySelector('.stage-scale-shell');
      const cards = visibleSpreadPageCards();
      if (!shell || cards.length < 2) return;

      const rect = shell.getBoundingClientRect();
      const sideIndex = clientX < rect.left + rect.width / 2 ? 0 : 1;
      const targetCard = cards[sideIndex];
      if (!targetCard || targetCard.classList.contains('current-page-rail-card')) return;

      skipNextPageReset = true;
      targetCard.click();
    });
  }, true);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-album-mode'],
    childList: true,
    subtree: true,
  });

  scheduleSync();
}
