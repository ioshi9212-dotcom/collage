const LEGACY_ROOT_SELECTOR = '.album-bar, .album-tool-panel, .album-mode-sidebar';
const LEGACY_CONTROL_SELECTOR = [
  '.album-bar button',
  '.album-bar input',
  '.album-bar select',
  '.album-bar textarea',
  '.album-tool-panel button',
  '.album-tool-panel input',
  '.album-tool-panel select',
  '.album-tool-panel textarea',
  '.album-mode-sidebar button',
  '.album-mode-sidebar input',
  '.album-mode-sidebar select',
  '.album-mode-sidebar textarea',
].join(', ');
const LEGACY_SUMMARY_SELECTOR = [
  '.album-bar .booklet-summary-card',
  '.album-tool-panel .booklet-summary-card',
  '.album-mode-sidebar .booklet-summary-card',
].join(', ');

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
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true,
  });

  window.__collageLegacyControls = {
    sync: isolateAllLegacyControls,
    getState: () => ({
      roots: document.querySelectorAll(LEGACY_ROOT_SELECTOR).length,
      focusableControls: Array.from(document.querySelectorAll(LEGACY_CONTROL_SELECTOR))
        .filter((control) => !control.disabled && control.tabIndex >= 0).length,
      legacySummaryClassCount: document.querySelectorAll(LEGACY_SUMMARY_SELECTOR).length,
    }),
  };

  schedule();
}
