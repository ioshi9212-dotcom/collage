export const PROJECT_HISTORY_LIMIT = 60;

const CONTENT_KEYS = [
  'pages',
  'library',
  'hiddenLibraryPhotoIds',
  'canvas',
  'settings',
  'extraLayers',
  'bookletSheetsPerBlock',
  'bookletPrintSettings',
];

export function createProjectHistorySnapshot(state = {}) {
  return {
    pages: state.pages ?? [],
    currentPageId: state.currentPageId ?? null,
    library: state.library ?? [],
    hiddenLibraryPhotoIds: state.hiddenLibraryPhotoIds ?? new Set(),
    canvas: state.canvas ?? null,
    settings: state.settings ?? null,
    extraLayers: state.extraLayers ?? null,
    bookletSheetsPerBlock: state.bookletSheetsPerBlock ?? null,
    bookletPrintSettings: state.bookletPrintSettings ?? null,
  };
}

export function sameProjectHistorySnapshot(left, right) {
  if (!left || !right) return false;
  return CONTENT_KEYS.every((key) => left[key] === right[key]);
}

export function createProjectHistory(initialSnapshot) {
  return {
    past: [],
    current: initialSnapshot,
    future: [],
  };
}

function trimPast(items, limit) {
  return items.length > limit ? items.slice(items.length - limit) : items;
}

function trimFuture(items, limit) {
  return items.length > limit ? items.slice(0, limit) : items;
}

export function commitProjectHistory(history, nextSnapshot, limit = PROJECT_HISTORY_LIMIT) {
  if (!history) return createProjectHistory(nextSnapshot);
  if (sameProjectHistorySnapshot(history.current, nextSnapshot)) {
    if (history.current?.currentPageId === nextSnapshot?.currentPageId) return history;
    return { ...history, current: { ...history.current, currentPageId: nextSnapshot?.currentPageId ?? null } };
  }

  return {
    past: trimPast([...history.past, history.current], limit),
    current: nextSnapshot,
    future: [],
  };
}

export function undoProjectHistory(history, limit = PROJECT_HISTORY_LIMIT) {
  if (!history?.past?.length) return { history, target: null };
  const target = history.past[history.past.length - 1];
  return {
    history: {
      past: history.past.slice(0, -1),
      current: target,
      future: trimFuture([history.current, ...history.future], limit),
    },
    target,
  };
}

export function redoProjectHistory(history, limit = PROJECT_HISTORY_LIMIT) {
  if (!history?.future?.length) return { history, target: null };
  const target = history.future[0];
  return {
    history: {
      past: trimPast([...history.past, history.current], limit),
      current: target,
      future: history.future.slice(1),
    },
    target,
  };
}
