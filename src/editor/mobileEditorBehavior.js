const MOBILE_QUERY = '(max-width: 760px), (max-width: 920px) and (pointer: coarse) and (orientation: landscape)';

function isMobileViewport() {
  return window.matchMedia?.(MOBILE_QUERY).matches ?? window.innerWidth <= 760;
}

function closeMobileSheets() {
  document.body.classList.remove('mobile-left-panel-open', 'mobile-inspector-open', 'mobile-booklet-open');
}

function addCloseButton(panel, label = 'Закрыть') {
  if (!panel || panel.querySelector(':scope > .mobile-sheet-close')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mobile-sheet-close';
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', closeMobileSheets);
  panel.prepend(button);
}

function ensureMobileControls() {
  if (!isMobileViewport()) {
    document.body.classList.remove('mobile-editor-ready');
    closeMobileSheets();
    return;
  }

  document.body.classList.add('mobile-editor-ready');

  let backdrop = document.querySelector('.mobile-editor-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'mobile-editor-backdrop';
    backdrop.setAttribute('aria-label', 'Закрыть открытую панель');
    backdrop.addEventListener('click', closeMobileSheets);
    document.body.append(backdrop);
  }

  let inspectorToggle = document.querySelector('.mobile-inspector-toggle');
  if (!inspectorToggle) {
    inspectorToggle = document.createElement('button');
    inspectorToggle.type = 'button';
    inspectorToggle.className = 'mobile-inspector-toggle';
    inspectorToggle.textContent = 'Настройки';
    inspectorToggle.setAttribute('aria-label', 'Открыть настройки');
    inspectorToggle.addEventListener('click', () => {
      const isOpen = document.body.classList.contains('mobile-inspector-open');
      closeMobileSheets();
      if (!isOpen) document.body.classList.add('mobile-inspector-open');
    });
    document.body.append(inspectorToggle);
  }

  let bookletToggle = document.querySelector('.mobile-booklet-toggle');
  if (!bookletToggle) {
    bookletToggle = document.createElement('button');
    bookletToggle.type = 'button';
    bookletToggle.className = 'mobile-booklet-toggle';
    bookletToggle.textContent = 'Брошюра';
    bookletToggle.setAttribute('aria-label', 'Открыть настройки брошюры');
    bookletToggle.addEventListener('click', () => {
      const isOpen = document.body.classList.contains('mobile-booklet-open');
      closeMobileSheets();
      if (!isOpen) document.body.classList.add('mobile-booklet-open');
    });
    document.body.append(bookletToggle);
  }

  document.querySelectorAll('.editor-left-panel-v2, .workspace > .sidebar').forEach((panel) => addCloseButton(panel));
  document.querySelectorAll('.workspace > .inspector, .workspace > .album-mode-inspector').forEach((panel) => addCloseButton(panel));
  document.querySelectorAll('.album-bar.booklet-mode-bar').forEach((panel) => addCloseButton(panel, 'Закрыть'));
}

function updateViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--mobile-vh', `${Math.round(height)}px`);
}

function handleDocumentClick(event) {
  if (!isMobileViewport()) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const toolButton = target.closest('.editor-tool-button-v2');
  if (toolButton) {
    const closeActivePanel = toolButton.classList.contains('active') && document.body.classList.contains('mobile-left-panel-open');
    closeMobileSheets();
    if (!closeActivePanel) {
      window.setTimeout(() => document.body.classList.add('mobile-left-panel-open'), 0);
    }
    return;
  }

  if (target.closest('.page-rail-card')) {
    closeMobileSheets();
    return;
  }

  if (target.closest('.stage-frame') && !target.closest('input, select, textarea, button')) {
    closeMobileSheets();
    return;
  }

  const viewButton = target.closest('.segmented-v2 button');
  if (viewButton && viewButton.textContent?.trim() !== 'Брошюра') {
    document.body.classList.remove('mobile-booklet-open');
  }
}

export function installMobileEditorBehavior() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const media = window.matchMedia?.(MOBILE_QUERY);
  const observer = new MutationObserver(() => ensureMobileControls());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const refresh = () => {
    updateViewportHeight();
    ensureMobileControls();
  };

  media?.addEventListener?.('change', refresh);
  window.addEventListener('resize', refresh, { passive: true });
  window.visualViewport?.addEventListener?.('resize', refresh, { passive: true });
  window.visualViewport?.addEventListener?.('scroll', updateViewportHeight, { passive: true });
  document.addEventListener('click', handleDocumentClick);

  refresh();
}
