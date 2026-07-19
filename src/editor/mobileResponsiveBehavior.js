const MOBILE_MEDIA_QUERY = '(max-width: 760px)';

function normalizeLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function afterReactPaint(callback) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
}

function viewButton(label) {
  return Array.from(document.querySelectorAll('.app-view-switch-v2 .segmented-v2 button'))
    .find((button) => normalizeLabel(button.textContent) === label) || null;
}

export function installMobileResponsiveBehavior() {
  if (window.__collageMobileResponsiveBehaviorInstalled) return;
  window.__collageMobileResponsiveBehaviorInstalled = true;

  const media = window.matchMedia(MOBILE_MEDIA_QUERY);
  let mobileDefaultViewApplied = false;
  let syncScheduled = false;

  function isMobile() {
    return media.matches;
  }

  function currentPanel() {
    return document.body?.dataset?.mobilePanel || '';
  }

  function updateControlState() {
    const panel = currentPanel();
    const settingsButton = document.querySelector('.mobile-inspector-trigger');
    const closeButton = document.querySelector('.mobile-sheet-close');
    const backdrop = document.querySelector('.mobile-editor-backdrop');

    settingsButton?.setAttribute('aria-expanded', String(panel === 'inspector'));
    closeButton?.setAttribute('aria-hidden', String(!panel));
    backdrop?.setAttribute('aria-hidden', String(!panel));
  }

  function setPanel(panel = '') {
    if (!document.body) return;
    if (!isMobile() || !panel) delete document.body.dataset.mobilePanel;
    else document.body.dataset.mobilePanel = panel;
    updateControlState();
  }

  function createButton(className, label, text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    button.textContent = text;
    return button;
  }

  function ensureControls() {
    const shell = document.querySelector('.app-shell');
    if (!shell) return false;

    if (!shell.querySelector('.mobile-editor-backdrop')) {
      const backdrop = createButton('mobile-editor-backdrop', 'Закрыть панель', '');
      backdrop.setAttribute('aria-hidden', 'true');
      shell.append(backdrop);
    }

    if (!shell.querySelector('.mobile-inspector-trigger')) {
      const settings = createButton('mobile-inspector-trigger', 'Открыть настройки', 'Настройки');
      settings.setAttribute('aria-expanded', 'false');
      shell.append(settings);
    }

    if (!shell.querySelector('.mobile-sheet-close')) {
      const close = createButton('mobile-sheet-close', 'Свернуть панель', 'Свернуть');
      close.setAttribute('aria-hidden', 'true');
      shell.append(close);
    }

    updateControlState();
    return true;
  }

  function applyMobileDefaultView() {
    if (!isMobile() || mobileDefaultViewApplied) return;
    const single = viewButton('Страница');
    if (!single) return;
    mobileDefaultViewApplied = true;
    if (!single.classList.contains('active')) single.click();
  }

  function syncLayout() {
    syncScheduled = false;
    if (!document.body) return;

    ensureControls();
    document.body.dataset.mobileLayout = String(isMobile());

    if (!isMobile()) {
      setPanel('');
      mobileDefaultViewApplied = false;
      return;
    }

    applyMobileDefaultView();
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    afterReactPaint(syncLayout);
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('.mobile-editor-backdrop, .mobile-sheet-close')) {
      setPanel('');
      return;
    }

    if (target.closest('.mobile-inspector-trigger')) {
      setPanel(currentPanel() === 'inspector' ? '' : 'inspector');
      return;
    }

    if (!isMobile()) return;

    const toolButton = target.closest('.editor-tool-button-v2');
    if (toolButton) {
      // Other editor behaviors use HTMLElement.click() during startup to sync
      // React state. Only a real pointer/keyboard activation should open a sheet.
      if (!event.isTrusted) return;
      const wasActive = toolButton.classList.contains('active');
      const wasOpen = currentPanel() === 'tools';
      afterReactPaint(() => setPanel(wasOpen && wasActive ? '' : 'tools'));
      return;
    }

    if (target.closest('.page-rail-card')) {
      setPanel('');
      return;
    }

    if (target.closest('.photo-card')) {
      afterReactPaint(() => setPanel(''));
      return;
    }

    const leftPanelButton = target.closest('.editor-left-panel-v2 button');
    if (leftPanelButton) {
      const label = normalizeLabel(leftPanelButton.textContent);
      const opensInspector = label.startsWith('+ Обычный текст')
        || label.startsWith('+ Заголовок')
        || label.startsWith('+ Подпись')
        || label.startsWith('+ Горизонтальная линия')
        || label.startsWith('+ Вертикальная линия');

      if (opensInspector) afterReactPaint(() => setPanel('inspector'));
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentPanel()) setPanel('');
  });

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-album-mode', 'class'],
    childList: true,
    subtree: true,
  });

  if (typeof media.addEventListener === 'function') media.addEventListener('change', scheduleSync);
  else media.addListener(scheduleSync);

  window.__collageMobileResponsive = {
    isMobile,
    openTools: () => setPanel('tools'),
    openInspector: () => setPanel('inspector'),
    close: () => setPanel(''),
    getState: () => ({ mobile: isMobile(), panel: currentPanel() }),
  };

  scheduleSync();
}
