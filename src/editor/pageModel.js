import { buildGridLayout, clamp, cleanFrame, framesFromLayout } from './layout.js';
import { hydrateProjectPhotos } from './photoStorage.js';

export const DEFAULT_PAGE_FRAME_COUNT = 5;
export const MAX_PROJECT_PAGES = 500;
export const MAX_PROJECT_LIBRARY_ITEMS = 5000;
export const MAX_PROJECT_FRAMES_PER_PAGE = 100;
export const MAX_PROJECT_LAYOUT_ROWS = 50;
export const MAX_PROJECT_LAYOUT_COLUMNS = 100;

function cloneDeep(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return value;
  }
}

function makePageId() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function assertProjectCollectionLimits(source) {
  const library = Array.isArray(source?.library) ? source.library : [];
  if (library.length > MAX_PROJECT_LIBRARY_ITEMS) {
    throw new Error(`В проекте слишком много фотографий: максимум ${MAX_PROJECT_LIBRARY_ITEMS}.`);
  }

  const pages = Array.isArray(source?.pages) ? source.pages : [];
  if (pages.length > MAX_PROJECT_PAGES) {
    throw new Error(`В проекте слишком много страниц: максимум ${MAX_PROJECT_PAGES}.`);
  }

  pages.forEach((page, pageIndex) => {
    const frames = Array.isArray(page?.frames) ? page.frames : [];
    if (frames.length > MAX_PROJECT_FRAMES_PER_PAGE) {
      throw new Error(`На странице ${pageIndex + 1} слишком много фото-окон.`);
    }

    const rows = Array.isArray(page?.layout?.rows) ? page.layout.rows : [];
    if (rows.length > MAX_PROJECT_LAYOUT_ROWS) {
      throw new Error(`На странице ${pageIndex + 1} повреждена сетка.`);
    }
    const columnCount = rows.reduce((sum, row) => sum + (Array.isArray(row?.columns) ? row.columns.length : 0), 0);
    if (columnCount > MAX_PROJECT_LAYOUT_COLUMNS) {
      throw new Error(`На странице ${pageIndex + 1} повреждена сетка.`);
    }
  });

  if (Array.isArray(source?.frames) && source.frames.length > MAX_PROJECT_FRAMES_PER_PAGE) {
    throw new Error('В старом проекте слишком много фото-окон.');
  }
}

export function countFramesInLayout(layout) {
  if (!Array.isArray(layout?.rows)) return 0;
  return layout.rows.reduce((sum, row) => sum + (Array.isArray(row?.columns) ? row.columns.length : 0), 0);
}

export function resolvePageFrameCount(page, fallbackSettings = { frameCount: DEFAULT_PAGE_FRAME_COUNT }) {
  if (page?.isBlankPage) return 0;
  const saved = Number(page?.frameCount);
  if (Number.isFinite(saved) && saved >= 0) return clamp(saved, 0, 9);
  const fromLayout = countFramesInLayout(page?.layout);
  if (fromLayout) return clamp(fromLayout, 1, 9);
  const fromFrames = Array.isArray(page?.frames) ? page.frames.length : 0;
  if (fromFrames) return clamp(fromFrames, 1, 9);
  const fallback = Number(fallbackSettings?.frameCount);
  return Number.isFinite(fallback)
    ? clamp(fallback, 0, 9)
    : DEFAULT_PAGE_FRAME_COUNT;
}

export function settingsForPage(settings, page, explicitFrameCount) {
  return {
    ...settings,
    frameCount: explicitFrameCount ?? resolvePageFrameCount(page, settings),
  };
}

export function createPage(canvas, settings, number, previousFrames = [], idFactory = makePageId) {
  const frameCount = clamp(Number(settings?.frameCount) || DEFAULT_PAGE_FRAME_COUNT, 1, 9);
  const built = buildGridLayout(canvas, { ...settings, frameCount }, previousFrames);
  return { id: idFactory(), title: `Страница ${number}`, frameCount, layout: built.layout, frames: built.frames };
}

export function createBlankPage(number, overrides = {}, idFactory = makePageId) {
  return {
    id: overrides.id ?? idFactory(),
    title: overrides.title ?? `Пустая страница ${number}`,
    isBlankPage: true,
    frameCount: 0,
    layout: null,
    frames: [],
  };
}

export function clonePageForDuplicate(page, number, idFactory = makePageId) {
  const next = cloneDeep(page) || {};
  const frameIdMap = new Map();
  const remapFrameId = (frameId) => {
    if (frameId == null) return idFactory();
    if (!frameIdMap.has(frameId)) frameIdMap.set(frameId, idFactory());
    return frameIdMap.get(frameId);
  };

  const frames = Array.isArray(next.frames)
    ? next.frames.map((frame) => ({ ...frame, id: remapFrameId(frame?.id) }))
    : [];

  let layout = next.layout ?? null;
  if (layout && Array.isArray(layout.rows)) {
    layout = {
      ...layout,
      rows: layout.rows.map((row) => ({
        ...row,
        id: idFactory(),
        columns: Array.isArray(row?.columns)
          ? row.columns.map((column) => ({
            ...column,
            id: idFactory(),
            frameId: remapFrameId(column?.frameId),
          }))
          : [],
      })),
    };
  }

  return {
    ...next,
    id: idFactory(),
    title: page?.isBlankPage ? `Пустая страница ${number}` : `Страница ${number}`,
    layout,
    frames,
  };
}

export function createPageFromTemplate(page, index, idFactory = makePageId) {
  const next = clonePageForDuplicate(page, index + 1, idFactory);
  return {
    ...next,
    title: `Страница ${index + 1}`,
    frames: Array.isArray(next?.frames) ? next.frames.map((frame) => ({ ...frame, photo: null })) : [],
  };
}

export function createInitialAlbum(canvas, settings, idFactory = makePageId) {
  const first = createPage(canvas, settings, 1, [], idFactory);
  const second = createPage(canvas, settings, 2, [], idFactory);
  return { pages: [first, second], currentPageId: first.id };
}

export function normalizeProjectPages(data, nextCanvas, nextSettings, idFactory = makePageId) {
  const source = data && typeof data === 'object' ? data : {};
  assertProjectCollectionLimits(source);
  const hydratedPages = hydrateProjectPhotos(source.library, source.pages);
  if (hydratedPages.length) {
    return hydratedPages.map((page, index) => {
      if (page?.isBlankPage) {
        return createBlankPage(index + 1, { id: page.id, title: page.title }, idFactory);
      }
      const frames = Array.isArray(page?.frames)
        ? page.frames.filter((frame) => frame && typeof frame === 'object').map((frame) => cleanFrame(frame, nextCanvas))
        : [];
      const existingLayoutCount = countFramesInLayout(page?.layout);
      const savedFrameCount = Number(page?.frameCount);
      const frameCount = Number.isFinite(savedFrameCount) && savedFrameCount >= 0
        ? clamp(savedFrameCount, 0, 9)
        : clamp(existingLayoutCount || frames.length || nextSettings?.frameCount, 1, 9);
      if (frameCount <= 0) {
        return {
          id: page?.id ?? idFactory(),
          title: page?.title ?? `Страница ${index + 1}`,
          frameCount: 0,
          layout: null,
          frames: [],
        };
      }
      const trustLayout = page?.layout?.type === 'grid' && existingLayoutCount === frameCount;
      const pageSettings = { ...nextSettings, frameCount };
      const layout = trustLayout ? page.layout : buildGridLayout(nextCanvas, pageSettings, frames).layout;
      const preserveFreeGeometry = nextSettings?.frameMode === 'free' && frames.length === frameCount;
      return {
        id: page?.id ?? idFactory(),
        title: page?.title ?? `Страница ${index + 1}`,
        frameCount,
        layout,
        frames: preserveFreeGeometry ? frames : framesFromLayout(layout, frames),
      };
    });
  }

  if (Array.isArray(source.frames)) {
    const [legacyPage] = hydrateProjectPhotos(source.library, [{ frames: source.frames }]);
    const legacyFrames = Array.isArray(legacyPage?.frames)
      ? legacyPage.frames.filter((frame) => frame && typeof frame === 'object')
      : [];
    return [createPage(
      nextCanvas,
      nextSettings,
      1,
      legacyFrames.map((frame) => cleanFrame(frame, nextCanvas)),
      idFactory,
    )];
  }

  return [
    createPage(nextCanvas, nextSettings, 1, [], idFactory),
    createPage(nextCanvas, nextSettings, 2, [], idFactory),
  ];
}
