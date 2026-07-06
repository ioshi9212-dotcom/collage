(() => {
  const STORAGE_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';
  const SPREAD_GAP = 90;

  function clickLocalSave() {
    const saveButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Сохранить');
    saveButton?.click();
  }

  function project() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function currentCanvas() {
    const strong = document.querySelector('.canvas-toolbar strong')?.textContent || '';
    const match = strong.match(/(\d+)×(\d+)px/);
    const saved = project().canvas;
    return {
      width: match ? Number(match[1]) : Number(saved?.width) || 1480,
      height: match ? Number(match[2]) : Number(saved?.height) || 2100,
    };
  }

  function activePageNumber() {
    const text = document.querySelector('.page-chip.active-page-chip b')?.textContent;
    const number = Number(text);
    return Number.isFinite(number) && number > 0 ? number : 1;
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

  function mode() {
    return document.body.dataset.albumMode || localStorage.getItem('collage-album-editor-mode') || 'collage';
  }

  function ensureCover(shell) {
    let cover = shell.querySelector(':scope > .album-layer-cover');
    if (!cover) {
      cover = document.createElement('div');
      cover.className = 'album-layer-cover';
      shell.prepend(cover);
    }
    cover.style.width = shell.style.width || `${shell.offsetWidth}px`;
    cover.style.height = shell.style.height || `${shell.offsetHeight}px`;
    return cover;
  }

  function pageData(pageNumber) {
    const data = project();
    return Array.isArray(data.pages) ? data.pages[pageNumber - 1] : null;
  }

  function addPhotoReplica(cover, frame, pageX) {
    if (!frame?.photo?.src) return;
    const box = document.createElement('div');
    box.className = 'album-photo-replica';
    box.style.left = `${pageX + Number(frame.x || 0)}px`;
    box.style.top = `${Number(frame.y || 0)}px`;
    box.style.width = `${Number(frame.width || 0)}px`;
    box.style.height = `${Number(frame.height || 0)}px`;

    const image = document.createElement('img');
    image.src = frame.photo.src;
    image.alt = '';
    box.append(image);
    cover.append(box);
  }

  function renderCover() {
    const shell = document.querySelector('.stage-scale-shell');
    if (!shell) return;
    const currentMode = mode();
    const existing = shell.querySelector(':scope > .album-layer-cover');

    if (currentMode === 'collage') {
      existing?.remove();
      return;
    }

    const canvas = currentCanvas();
    const cover = ensureCover(shell);
    cover.innerHTML = '';

    visiblePages().forEach(({ pageNumber, x }) => {
      const pageCover = document.createElement('div');
      pageCover.className = 'album-page-cover';
      pageCover.style.left = `${x}px`;
      pageCover.style.width = `${canvas.width}px`;
      cover.append(pageCover);

      const page = pageData(pageNumber);
      (page?.frames || []).forEach((frame) => addPhotoReplica(cover, frame, x));
    });
  }

  function cleanupShiftedPanels() {
    document.querySelectorAll('.workspace > .album-mode-sidebar').forEach((node) => node.remove());
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('.album-mode-tab');
    if (!button) return;
    const text = button.textContent.trim();
    if (text !== 'Коллаж') clickLocalSave();
    setTimeout(() => {
      cleanupShiftedPanels();
      renderCover();
    }, 80);
  }, true);

  window.addEventListener('DOMContentLoaded', () => {
    setInterval(() => {
      cleanupShiftedPanels();
      renderCover();
    }, 350);
  });
})();
