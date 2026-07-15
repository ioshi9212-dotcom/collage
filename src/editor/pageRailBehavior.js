const VIEW_LABELS = new Set(['Страница', 'Разворот', 'Брошюра']);

function buttonLabel(button) {
  return String(button?.textContent || '').replace(/\s+/g, ' ').trim();
}

function activeViewLabel() {
  const active = document.querySelector('.app-view-switch-v2 .segmented-v2 button.active');
  const label = buttonLabel(active);
  return VIEW_LABELS.has(label) ? label : null;
}

function viewButton(label) {
  return Array.from(document.querySelectorAll('.app-view-switch-v2 .segmented-v2 button'))
    .find((button) => buttonLabel(button) === label) || null;
}

function isPageCreationButton(button) {
  if (!(button instanceof HTMLButtonElement)) return false;
  if (button.matches('.page-rail-add-v3')) return true;
  if (!button.closest('.editor-left-panel-v2')) return false;
  const label = buttonLabel(button);
  return label === '+ Страница' || label === '+ Пустая страница';
}

function scrollCurrentPageIntoView() {
  const current = document.querySelector('.page-rail-list .current-page-rail-card');
  current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
}

function afterReactPaint(callback) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback);
  });
}

export function installPageRailBehavior() {
  if (window.__collagePageRailBehaviorInstalled) return;
  window.__collagePageRailBehaviorInstalled = true;

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;

    if (isPageCreationButton(button)) {
      const previousView = activeViewLabel();
      afterReactPaint(() => {
        if (previousView && activeViewLabel() !== previousView) {
          viewButton(previousView)?.click();
          afterReactPaint(scrollCurrentPageIntoView);
          return;
        }
        scrollCurrentPageIntoView();
      });
      return;
    }

    if (button?.matches('.page-rail-card')) {
      afterReactPaint(scrollCurrentPageIntoView);
    }
  }, true);
}
