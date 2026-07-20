import Konva from 'konva';

const MOBILE_QUERY = '(max-width: 760px), (max-width: 920px) and (pointer: coarse) and (orientation: landscape)';

let mobileDefaultViewApplied = false;
let refreshScheduled = false;
const lockedCanvasSetters = new Map();

function isMobileViewport() {
  return window.matchMedia?.(MOBILE_QUERY).matches ?? window.innerWidth <= 760;
}

function desktopPreviewPixelRatio() {
  return Math.min(2, Math.max(1.5, Number(window.devicePixelRatio) || 1));
}

function lockCanvasPixelRatio(canvas) {
  if (!canvas?.setPixelRatio) return;

  let originalSetter = lockedCanvasSetters.get(canvas);
  if (!originalSetter) {
    originalSetter = canvas.setPixelRatio;
    lockedCanvasSetters.set(canvas, originalSetter);
    canvas.setPixelRatio = function setMobilePixelRatio() {
      return originalSetter.call(this, 1);
    };
  }

  canvas.setPixelRatio(1);
}

function restoreCanvasPixelRatios() {
  if (!lockedCanvasSetters.size) return;
  const target = desktopPreviewPixelRatio();

  lockedCanvasSetters.forEach((originalSetter, canvas) => {
    canvas.setPixelRatio = originalSetter;
    originalSetter.call(canvas, target);
  });
  lockedCanvasSetters.clear();
}

function enforceMobileCanvasPixelRatio() {
  if (!isMobileViewport()) {
    restoreCanvasPixelRatios();
    return;
  }

  Array.from(Konva.stages || []).forEach((stage) => {
    const container = stage?.container?.();
    if (!container?.closest?.('.stage-frame')) return;

    stage.getLayers?.().forEach((layer) => {
      lockCanvasPixelRatio(layer.getCanvas?.());
      lockCanvasPixelRatio(layer.getHitCanvas?.());
      layer.batchDraw?.();
    });
  });

  if (window.__collageCanvasPerformance) {
    window.__collageCanvasPerformance.activeEditorPixelRatio = 1;
  }
}

function setMobileSheet(sheet = '') {
  const body = document.body;
  if (!body) return;

  body.classList.remove('mobile-left-panel-open', 'mobile-inspector-open', 'mobile-booklet-open');
  if (sheet === 'tools') body.classList.add('mobile-left-panel-open');
  if (sheet === 'inspector') body.classList.add('mobile-inspector-open');
  updateMobileControlState();
}

function closeMobileSheets() {
  setMobileSheet('');
}

function updateMobileControlState() {
  const settings = document.querySelector('.mobile-inspector-toggle');
  const inspectorOpen = document.body?.classList.contains('mobile-inspector-open') ?? false;
  settings?.classList.toggle('active', inspectorOpen);
  settings?.setAttribute('aria-expanded', String(inspectorOpen));
}

function hasDirectCloseButton(panel) {
  return Array.from(panel?.children || []).some((child) => child.classList?.contains('mobile-sheet-close'));
}

function addCloseButton(panel) {
  if (!panel || hasDirectCloseButton(panel)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mobile-sheet-close';
  button.textContent = 'Готово';
  button.setAttribute('aria-label', 'Закрыть панель');
  panel.prepend(button);
}

function createSettingsTool() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'editor-tool-button-v2 mobile-inspector-toggle';
  button.setAttribute('aria-label', 'Настройки');
  button.setAttribute('aria-expanded', 'false');

  const icon = document.createElement('b');
  icon.textContent = '⚙';
  const label = document.createElement('span');
  label.textContent = 'Настройки';
  button.append(icon, label);
  return button;
}

function ensureSettingsTool() {
  const rail = document.querySelector('.editor-tool-rail-v2');
  if (!rail) return;

  let settings = document.querySelector('.mobile-inspector-toggle');
  if (settings && settings.parentElement !== rail) {
    settings.remove();
    settings = null;
  }
  if (!settings) {
    settings = createSettingsTool();
    rail.append(settings);
  }

  document.querySelectorAll('.mobile-booklet-toggle').forEach((node) => node.remove());
  updateMobileControlState();
}

function ensureBackdrop() {
  let backdrop = document.querySelector('.mobile-editor-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'mobile-editor-backdrop';
    backdrop.setAttribute('aria-label', 'Закрыть открытую панель');
    document.body.append(backdrop);
  }
}

function cleanupMobileControls() {
  document.querySelectorAll('.mobile-editor-backdrop, .mobile-inspector-toggle, .mobile-booklet-toggle, .mobile-sheet-close')
    .forEach((node) => node.remove());
}

function applyMobileDefaultView() {
  if (!isMobileViewport() || mobileDefaultViewApplied) return;
  const singlePageButton = Array.from(document.querySelectorAll('.app-view-switch-v2 .segmented-v2 button'))
    .find((button) => button.textContent?.trim() === 'Страница');
  if (!singlePageButton) return;

  mobileDefaultViewApplied = true;
  if (!singlePageButton.classList.contains('active')) singlePageButton.click();
}

function ensureMobileControls() {
  if (!document.body) return;

  if (!isMobileViewport()) {
    document.body.classList.remove('mobile-editor-ready');
    closeMobileSheets();
    mobileDefaultViewApplied = false;
    cleanupMobileControls();
    restoreCanvasPixelRatios();
    return;
  }

  document.body.classList.add('mobile-editor-ready');
  ensureBackdrop();
  ensureSettingsTool();

  document.querySelectorAll('.editor-left-panel-v2, .workspace > .sidebar, .workspace > .inspector, .workspace > .album-mode-inspector')
    .forEach(addCloseButton);

  applyMobileDefaultView();
  enforceMobileCanvasPixelRatio();
}

function updateViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--mobile-vh', `${Math.round(height)}px`);
}

function afterReactPaint(callback) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
}

function handleDocumentClick(event) {
  if (!isMobileViewport()) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  if (target.closest('.mobile-editor-backdrop, .mobile-sheet-close')) {
    closeMobileSheets();
    return;
  }

  const settingsButton = target.closest('.mobile-inspector-toggle');
  if (settingsButton) {
    if (!event.isTrusted) return;
    const isOpen = document.body.classList.contains('mobile-inspector-open');
    setMobileSheet(isOpen ? '' : 'inspector');
    return;
  }

  const toolButton = target.closest('.editor-tool-button-v2');
  if (toolButton) {
    // Other editor behaviors use HTMLElement.click() during startup.
    // Only a real pointer/keyboard activation should open a mobile sheet.
    if (!event.isTrusted) return;
    setMobileSheet('tools');
    return;
  }

  if (target.closest('.page-rail-card, .photo-card')) {
    closeMobileSheets();
    return;
  }

  if (target.closest('.stage-frame') && !target.closest('input, select, textarea, button')) {
    closeMobileSheets();
    return;
  }

  const leftPanelButton = target.closest('.editor-left-panel-v2 button');
  if (leftPanelButton) {
    const label = String(leftPanelButton.textContent || '').replace(/\s+/g, ' ').trim();
    const opensInspector = label.startsWith('+ Обычный текст')
      || label.startsWith('+ Заголовок')
      || label.startsWith('+ Подпись')
      || label.startsWith('+ Горизонтальная линия')
      || label.startsWith('+ Вертикальная линия');
    if (opensInspector) afterReactPaint(() => setMobileSheet('inspector'));
  }

  const viewButton = target.closest('.app-view-switch-v2 .segmented-v2 button');
  if (viewButton) closeMobileSheets();
}

function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  window.requestAnimationFrame(() => {
    refreshScheduled = false;
    updateViewportHeight();
    ensureMobileControls();
    window.requestAnimationFrame(enforceMobileCanvasPixelRatio);
  });
}

export function installMobileEditorBehavior() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__collageMobileEditorBehaviorInstalled) return;
  window.__collageMobileEditorBehaviorInstalled = true;

  const media = window.matchMedia?.(MOBILE_QUERY);
  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (typeof media?.addEventListener === 'function') media.addEventListener('change', scheduleRefresh);
  else media?.addListener?.(scheduleRefresh);

  window.addEventListener('resize', scheduleRefresh, { passive: true });
  window.visualViewport?.addEventListener?.('resize', scheduleRefresh, { passive: true });
  window.visualViewport?.addEventListener?.('scroll', updateViewportHeight, { passive: true });
  document.addEventListener('click', handleDocumentClick, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMobileSheets();
  });

  window.__collageMobileLayout = {
    isMobile: isMobileViewport,
    close: closeMobileSheets,
    openTools: () => setMobileSheet('tools'),
    openInspector: () => setMobileSheet('inspector'),
    getState: () => ({
      mobile: isMobileViewport(),
      toolsOpen: document.body.classList.contains('mobile-left-panel-open'),
      inspectorOpen: document.body.classList.contains('mobile-inspector-open'),
    }),
  };

  scheduleRefresh();
}
