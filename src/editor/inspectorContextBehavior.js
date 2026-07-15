const COLLAGE_TOOLS = new Set(['photos', 'pages', 'collage']);
const FRAME_TOOLS = new Set(['photos', 'collage']);

function normalizeLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function afterReactPaint(callback) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
}

function activeTool() {
  return document.body?.dataset?.activeEditorTool || 'photos';
}

function inspector() {
  return document.querySelector('.editor-workspace-v2 > .inspector');
}

function inspectorTab(name) {
  return inspector()?.querySelector(`.inspector-tab-v2[data-tab="${name}"]`) || null;
}

function activeInspectorTab() {
  return inspector()?.querySelector('.inspector-tab-v2.active')?.dataset?.tab || null;
}

function selectedFrameControlsVisible() {
  const root = inspector();
  if (!root || activeInspectorTab() !== 'object') return false;
  return Array.from(root.querySelectorAll('button')).some((button) => (
    normalizeLabel(button.textContent) === 'Удалить окно'
  ));
}

function duplicatedPageControlsVisible() {
  const block = inspector()?.querySelector('.page-only-controls-duplicate:not([hidden])');
  return block ? getComputedStyle(block).display !== 'none' : false;
}

function markDuplicatedPageControls() {
  const root = inspector();
  if (!root || activeInspectorTab() !== 'object') return;

  Array.from(root.querySelectorAll('.inspector-block')).forEach((block) => {
    const heading = normalizeLabel(block.querySelector('h3')?.textContent);
    if (heading === 'Цвет и рамка') {
      block.classList.add('page-only-controls-duplicate');
      block.setAttribute('aria-hidden', 'true');
    }
  });
}

function setObjectAvailability(available) {
  const objectTab = inspectorTab('object');
  if (!objectTab) return;
  objectTab.disabled = !available;
  objectTab.setAttribute('aria-disabled', String(!available));
  objectTab.title = available
    ? 'Настройки выбранного фото-окна'
    : 'Сначала выберите фото-окно на странице';
}

function activateInspectorTab(name) {
  const button = inspectorTab(name);
  if (!button || button.disabled || button.classList.contains('active')) return false;
  button.click();
  return true;
}

function isPageNavigationButton(button) {
  if (!(button instanceof HTMLButtonElement)) return false;
  if (button.matches('.page-rail-card, .page-rail-add-v3')) return true;
  if (!button.closest('.editor-left-panel-v2')) return false;
  const label = normalizeLabel(button.textContent);
  return label === '+ Страница'
    || label === '+ Пустая страница'
    || label === 'Сделать копию'
    || label === 'Удалить страницу';
}

export function installInspectorContextBehavior() {
  if (window.__collageInspectorContextBehaviorInstalled) return;
  window.__collageInspectorContextBehaviorInstalled = true;

  let selectedFrameKnown = false;
  let probingFrame = false;
  let scheduled = false;

  function sync() {
    scheduled = false;
    const tool = activeTool();
    if (!COLLAGE_TOOLS.has(tool)) return;

    markDuplicatedPageControls();

    if (tool === 'pages') {
      selectedFrameKnown = false;
      setObjectAvailability(false);
      activateInspectorTab('page');
      return;
    }

    if (probingFrame) return;

    if (activeInspectorTab() === 'object') {
      selectedFrameKnown = selectedFrameControlsVisible();
    }

    setObjectAvailability(selectedFrameKnown);
    if (!selectedFrameKnown) activateInspectorTab('page');
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    afterReactPaint(sync);
  }

  function resetToPage() {
    selectedFrameKnown = false;
    probingFrame = false;
    setObjectAvailability(false);
    activateInspectorTab('page');
    scheduleSync();
  }

  function probeCanvasSelection() {
    const tool = activeTool();
    if (!FRAME_TOOLS.has(tool)) return;

    probingFrame = true;
    setObjectAvailability(true);
    activateInspectorTab('object');

    afterReactPaint(() => {
      selectedFrameKnown = selectedFrameControlsVisible();
      probingFrame = false;
      setObjectAvailability(selectedFrameKnown);
      markDuplicatedPageControls();
      if (!selectedFrameKnown) activateInspectorTab('page');
      scheduleSync();
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button');

    if (button?.matches('.editor-tool-button-v2')) {
      afterReactPaint(resetToPage);
      return;
    }

    if (isPageNavigationButton(button)) {
      afterReactPaint(resetToPage);
      return;
    }

    if (button?.matches('.inspector-tab-v2[data-tab="page"]')) {
      scheduleSync();
    }
  }, true);

  document.addEventListener('pointerup', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.stage-frame canvas')) return;
    afterReactPaint(probeCanvasSelection);
  }, true);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-active-editor-tool', 'class'],
    childList: true,
    subtree: true,
  });

  window.__collageInspectorContext = {
    sync,
    getState: () => ({
      tool: activeTool(),
      activeTab: activeInspectorTab(),
      objectAvailable: !Boolean(inspectorTab('object')?.disabled),
      selectedFrameKnown,
      duplicatedPageControlsVisible: duplicatedPageControlsVisible(),
    }),
  };

  scheduleSync();
}
