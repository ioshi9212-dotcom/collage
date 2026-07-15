const LEGACY_ROOT_SELECTOR = '.album-bar, .album-tool-panel, .album-mode-sidebar';

function isolateLegacyRoot(root) {
  if (!(root instanceof HTMLElement)) return;

  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('inert', '');

  Array.from(root.querySelectorAll('.booklet-summary-card')).forEach((card) => {
    card.classList.remove('booklet-summary-card');
    card.classList.add('legacy-booklet-summary-card');
  });

  Array.from(root.querySelectorAll('label')).forEach((label, index) => {
    label.setAttribute('aria-hidden', 'true');
    const caption = label.querySelector(':scope > span');
    if (caption) caption.textContent = `Скрытая устаревшая настройка ${index + 1}`;
  });

  Array.from(root.querySelectorAll('button, input, select, textarea, a[href]')).forEach((control, index) => {
    control.setAttribute('tabindex', '-1');
    control.setAttribute('aria-hidden', 'true');
    control.setAttribute('aria-label', `Скрытый устаревший элемент ${index + 1}`);
    if ('disabled' in control) control.disabled = true;
  });
}

function isolateAllLegacyControls() {
  document.querySelectorAll(LEGACY_ROOT_SELECTOR).forEach(isolateLegacyRoot);
}

export function installLegacyControlIsolation() {
  if (window.__collageLegacyControlIsolationInstalled) return;
  window.__collageLegacyControlIsolationInstalled = true;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      isolateAllLegacyControls();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.__collageLegacyControls = {
    sync: isolateAllLegacyControls,
    getState: () => ({
      roots: document.querySelectorAll(LEGACY_ROOT_SELECTOR).length,
      focusableControls: Array.from(document.querySelectorAll(`${LEGACY_ROOT_SELECTOR} button, ${LEGACY_ROOT_SELECTOR} input, ${LEGACY_ROOT_SELECTOR} select, ${LEGACY_ROOT_SELECTOR} textarea`))
        .filter((control) => !control.disabled && control.tabIndex >= 0).length,
      legacySummaryClassCount: document.querySelectorAll(`${LEGACY_ROOT_SELECTOR} .booklet-summary-card`).length,
    }),
  };

  schedule();
}
