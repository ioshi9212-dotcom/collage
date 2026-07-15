const approvedClicks = new WeakSet();

const ACTIONS = {
  'delete-page': {
    labels: new Set(['Удалить страницу']),
    message: projectMessage((project, page, pageNumber) => {
      const layerPage = project?.extraLayers?.pages?.[String(pageNumber)] || {};
      const photoCount = Array.isArray(page?.frames) ? page.frames.filter((frame) => frame?.photo).length : 0;
      const textCount = Array.isArray(layerPage.texts) ? layerPage.texts.length : 0;
      const drawingCount = Array.isArray(layerPage.drawings) ? layerPage.drawings.length : 0;
      const details = [
        photoCount ? `${photoCount} фото` : null,
        textCount ? `${textCount} текст.` : null,
        drawingCount ? `${drawingCount} линий` : null,
      ].filter(Boolean).join(', ');
      return `Удалить страницу ${pageNumber}${details ? ` (${details})` : ''}?\n\nСодержимое страницы будет удалено. Отменить это действие пока нельзя.`;
    }),
  },
  'clear-page-photos': {
    labels: new Set(['Очистить фото', 'Убрать все фото со страницы']),
    message: projectMessage((project, page, pageNumber) => {
      const photoCount = Array.isArray(page?.frames) ? page.frames.filter((frame) => frame?.photo).length : 0;
      return `Убрать ${photoCount || 'все'} фото со страницы ${pageNumber}?\n\nСами загруженные фотографии останутся в разделе «Фото».`;
    }),
  },
  'clear-photo-library': {
    labels: new Set(['Очистить список фото', 'Очистить список загруженных фото']),
    message: () => {
      const project = currentProject();
      const count = Array.isArray(project?.library) ? project.library.length : 0;
      return `Очистить список загруженных фото${count ? ` (${count})` : ''}?\n\nФото, уже размещённые на страницах, останутся в альбоме.`;
    },
  },
  'delete-frame': {
    labels: new Set(['Удалить окно']),
    message: () => {
      const hasPhoto = Boolean(document.querySelector('.workspace > .inspector .photo-name'));
      return hasPhoto
        ? 'Удалить выбранное фото-окно?\n\nФото будет убрано вместе с окном, но останется в разделе «Фото». Отменить это действие пока нельзя.'
        : 'Удалить выбранное фото-окно?\n\nОтменить это действие пока нельзя.';
    },
  },
};

function normalizeLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function currentProject() {
  try {
    return window.__collageApp?.getProject?.() || null;
  } catch {
    return null;
  }
}

function currentPageContext(project = currentProject()) {
  const pages = Array.isArray(project?.pages) ? project.pages : [];
  const index = Math.max(0, pages.findIndex((page) => page?.id === project?.currentPageId));
  return {
    project,
    page: pages[index] || pages[0] || null,
    pageNumber: index + 1,
  };
}

function projectMessage(factory) {
  return () => {
    const { project, page, pageNumber } = currentPageContext();
    return factory(project, page, pageNumber);
  };
}

function visible(button) {
  return button instanceof HTMLButtonElement && button.offsetParent !== null;
}

function buttons() {
  return Array.from(document.querySelectorAll('button'));
}

function buttonByLabel(root, labels) {
  const scope = root || document;
  return Array.from(scope.querySelectorAll('button')).find((button) => labels.has(normalizeLabel(button.textContent))) || null;
}

function setLabel(button, label, actionKey = '') {
  if (!(button instanceof HTMLButtonElement)) return;
  if (normalizeLabel(button.textContent) !== label) button.textContent = label;
  button.setAttribute('aria-label', label);
  if (actionKey) button.dataset.editorAction = actionKey;
}

function actionForButton(button) {
  if (!(button instanceof HTMLButtonElement)) return null;
  const explicit = button.dataset.editorAction;
  if (explicit && ACTIONS[explicit]) return explicit;
  const label = normalizeLabel(button.textContent);
  return Object.entries(ACTIONS).find(([, definition]) => definition.labels.has(label))?.[0] || null;
}

function pagePhotoCount() {
  const { page } = currentPageContext();
  return Array.isArray(page?.frames) ? page.frames.filter((frame) => frame?.photo).length : 0;
}

function syncLabelsAndStates() {
  const header = document.querySelector('.app-header-actions-v2');
  const openButton = buttonByLabel(header, new Set(['Открыть', 'Открыть последнее сохранение']));
  setLabel(openButton, 'Открыть последнее сохранение', 'open-last-save');
  if (openButton) openButton.title = 'Открывает последнее сохранение этого проекта на устройстве';

  const collagePanel = document.body.dataset.activeEditorTool === 'collage'
    ? document.querySelector('.editor-left-panel-v2')
    : null;
  const clearPageButton = buttonByLabel(collagePanel, ACTIONS['clear-page-photos'].labels);
  setLabel(clearPageButton, 'Убрать все фото со страницы', 'clear-page-photos');
  if (clearPageButton) {
    const count = pagePhotoCount();
    clearPageButton.disabled = count === 0;
    clearPageButton.title = count === 0 ? 'На текущей странице нет фотографий' : `Убрать фото со страницы: ${count}`;
  }

  const photoPanel = document.body.dataset.activeEditorTool === 'photos'
    ? document.querySelector('.editor-left-panel-v2')
    : null;
  const clearLibraryButton = buttonByLabel(photoPanel, ACTIONS['clear-photo-library'].labels);
  setLabel(clearLibraryButton, 'Очистить список загруженных фото', 'clear-photo-library');

  const templatesPanel = document.body.dataset.activeEditorTool === 'templates'
    ? document.querySelector('.editor-left-panel-v2 .template-save-grid')
    : null;
  if (templatesPanel) {
    setLabel(buttonByLabel(templatesPanel, new Set(['Сохранить весь альбом', 'Сохранить альбом как шаблон'])), 'Сохранить альбом как шаблон');
    setLabel(buttonByLabel(templatesPanel, new Set(['Сохранить страницу', 'Сохранить страницу как шаблон'])), 'Сохранить страницу как шаблон');
    setLabel(buttonByLabel(templatesPanel, new Set(['Сохранить разворот', 'Сохранить разворот как шаблон'])), 'Сохранить разворот как шаблон');
    setLabel(buttonByLabel(templatesPanel, new Set(['Загрузить JSON', 'Загрузить шаблон JSON'])), 'Загрузить шаблон JSON');
  }

  buttons().forEach((button) => {
    const key = actionForButton(button);
    if (!key) return;
    button.dataset.editorAction = key;
    if (!button.title && key !== 'clear-page-photos') button.title = 'Действие потребует подтверждения';
  });
}

export function installDestructiveActionBehavior() {
  if (window.__collageDestructiveActionBehaviorInstalled) return;
  window.__collageDestructiveActionBehaviorInstalled = true;

  let scheduled = false;
  const scheduleSync = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      syncLabelsAndStates();
    });
  };

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;

    const actionKey = actionForButton(button);
    if (!actionKey) {
      scheduleSync();
      return;
    }

    if (approvedClicks.has(button)) {
      approvedClicks.delete(button);
      scheduleSync();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const message = ACTIONS[actionKey].message();
    if (!window.confirm(message)) return;

    approvedClicks.add(button);
    queueMicrotask(() => {
      if (button.isConnected && !button.disabled) button.click();
      else approvedClicks.delete(button);
    });
  }, true);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-active-editor-tool', 'disabled'],
    childList: true,
    subtree: true,
  });

  document.addEventListener('input', scheduleSync, true);
  document.addEventListener('change', scheduleSync, true);
  document.addEventListener('drop', scheduleSync, true);

  window.__collageSafety = {
    sync: syncLabelsAndStates,
    getState: () => ({
      currentPagePhotos: pagePhotoCount(),
      visibleActions: buttons()
        .filter(visible)
        .map((button) => ({ label: normalizeLabel(button.textContent), action: actionForButton(button), disabled: button.disabled })),
    }),
  };

  scheduleSync();
}
