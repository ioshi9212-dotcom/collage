import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  assert.ok(source.includes(before), `Cannot update ${label}: source pattern not found`);
  return source.replace(before, after);
}

const appPath = 'src/AppLive.jsx';
let app = readFileSync(appPath, 'utf8');

app = replaceOnce(
  app,
  "  ensureLayout,\n  framesFromLayout,\n",
  "  ensureLayout,\n  fitFramesToPadding,\n  framesFromLayout,\n",
  'layout fit import',
);

app = replaceOnce(
  app,
  "import { movePageOrder, pageNumberToIndex, swapPageOrder } from './editor/pageOrder';\n",
  "import { movePageOrder, pageNumberToIndex, swapPageOrder } from './editor/pageOrder';\nimport {\n  commitProjectHistory,\n  createProjectHistory,\n  createProjectHistorySnapshot,\n  redoProjectHistory,\n  sameProjectHistorySnapshot,\n  undoProjectHistory,\n} from './editor/projectHistory';\n",
  'project history import',
);

app = replaceOnce(
  app,
  "  const saveInFlightRef = useRef(null);\n  const exportInFlightRef = useRef(false);\n\n",
  "  const saveInFlightRef = useRef(null);\n  const exportInFlightRef = useRef(false);\n  const projectHistoryRef = useRef(null);\n  const projectHistoryLiveRef = useRef(null);\n  const projectHistoryTimerRef = useRef(null);\n  const projectHistoryPendingRef = useRef(false);\n  const projectHistoryRestoringRef = useRef(false);\n  const projectHistoryResetRef = useRef(false);\n  const [, bumpProjectHistory] = useState(0);\n\n",
  'project history refs',
);

app = replaceOnce(
  app,
  "  const [leftPanel, setLeftPanel] = useState('photos');\n  const [inspectorTab, setInspectorTab] = useState('object');\n\n  useEffect(() => {\n    const next = normalizeAlbumEditorMode(albumMode);\n",
  "  const [leftPanel, setLeftPanel] = useState('photos');\n  const [inspectorTab, setInspectorTab] = useState('object');\n\n  const liveProjectHistorySnapshot = createProjectHistorySnapshot({\n    pages: album.pages,\n    currentPageId: album.currentPageId,\n    library,\n    hiddenLibraryPhotoIds,\n    canvas,\n    settings,\n    extraLayers,\n    bookletSheetsPerBlock,\n    bookletPrintSettings,\n  });\n  projectHistoryLiveRef.current = liveProjectHistorySnapshot;\n  if (!projectHistoryRef.current) projectHistoryRef.current = createProjectHistory(liveProjectHistorySnapshot);\n\n  useEffect(() => {\n    const nextSnapshot = projectHistoryLiveRef.current;\n    window.clearTimeout(projectHistoryTimerRef.current);\n\n    if (projectHistoryResetRef.current) {\n      projectHistoryResetRef.current = false;\n      projectHistoryPendingRef.current = false;\n      projectHistoryRef.current = createProjectHistory(nextSnapshot);\n      bumpProjectHistory((value) => value + 1);\n      return undefined;\n    }\n\n    if (projectHistoryRestoringRef.current) {\n      projectHistoryRestoringRef.current = false;\n      projectHistoryPendingRef.current = false;\n      bumpProjectHistory((value) => value + 1);\n      return undefined;\n    }\n\n    const history = projectHistoryRef.current ?? createProjectHistory(nextSnapshot);\n    projectHistoryRef.current = history;\n    if (sameProjectHistorySnapshot(history.current, nextSnapshot)) {\n      if (history.current?.currentPageId !== nextSnapshot.currentPageId) {\n        projectHistoryRef.current = {\n          ...history,\n          current: { ...history.current, currentPageId: nextSnapshot.currentPageId },\n        };\n      }\n      return undefined;\n    }\n\n    projectHistoryPendingRef.current = true;\n    bumpProjectHistory((value) => value + 1);\n    projectHistoryTimerRef.current = window.setTimeout(() => {\n      projectHistoryRef.current = commitProjectHistory(projectHistoryRef.current, projectHistoryLiveRef.current);\n      projectHistoryPendingRef.current = false;\n      bumpProjectHistory((value) => value + 1);\n    }, 320);\n\n    return () => window.clearTimeout(projectHistoryTimerRef.current);\n  }, [album.pages, album.currentPageId, library, hiddenLibraryPhotoIds, canvas, settings, extraLayers, bookletSheetsPerBlock, bookletPrintSettings]);\n\n  useEffect(() => {\n    const next = normalizeAlbumEditorMode(albumMode);\n",
  'project history effect',
);

app = replaceOnce(
  app,
  "  useEffect(() => () => {\n    releaseAllPhotoRuntimeUrls();\n    window.clearTimeout(photoProgressTimerRef.current);\n  }, []);\n",
  "  useEffect(() => () => {\n    releaseAllPhotoRuntimeUrls();\n    window.clearTimeout(photoProgressTimerRef.current);\n    window.clearTimeout(projectHistoryTimerRef.current);\n  }, []);\n",
  'history timer cleanup',
);

app = replaceOnce(
  app,
  "  function show(text) {\n    setNotice(text);\n    clearTimeout(noticeTimerRef.current);\n    noticeTimerRef.current = setTimeout(() => setNotice(''), 2500);\n  }\n",
  "  function show(text) {\n    setNotice(text);\n    clearTimeout(noticeTimerRef.current);\n    noticeTimerRef.current = setTimeout(() => setNotice(''), 2500);\n  }\n\n  function flushPendingProjectHistory() {\n    window.clearTimeout(projectHistoryTimerRef.current);\n    if (!projectHistoryPendingRef.current) return projectHistoryRef.current;\n    projectHistoryRef.current = commitProjectHistory(projectHistoryRef.current, projectHistoryLiveRef.current);\n    projectHistoryPendingRef.current = false;\n    bumpProjectHistory((value) => value + 1);\n    return projectHistoryRef.current;\n  }\n\n  function restoreProjectHistorySnapshot(snapshot) {\n    if (!snapshot) return;\n    window.clearTimeout(projectHistoryTimerRef.current);\n    projectHistoryPendingRef.current = false;\n    projectHistoryRestoringRef.current = true;\n\n    setAlbum((current) => {\n      const pagesForRestore = snapshot.pages ?? [];\n      const snapshotPageExists = pagesForRestore.some((page) => page.id === snapshot.currentPageId);\n      const currentPageExists = pagesForRestore.some((page) => page.id === current.currentPageId);\n      const currentPageId = snapshotPageExists\n        ? snapshot.currentPageId\n        : currentPageExists\n          ? current.currentPageId\n          : pagesForRestore[0]?.id ?? null;\n      return { pages: pagesForRestore, currentPageId };\n    });\n    setLibrary(snapshot.library ?? []);\n    setHiddenLibraryPhotoIds(snapshot.hiddenLibraryPhotoIds ?? new Set());\n    setCanvas(snapshot.canvas ?? DEFAULT_CANVAS);\n    setSettings(snapshot.settings ?? DEFAULT_SETTINGS);\n    setExtraLayers(snapshot.extraLayers ?? normalizeExtraLayers(null));\n    setBookletSheetsPerBlock(snapshot.bookletSheetsPerBlock ?? DEFAULT_SHEETS_PER_BLOCK);\n    setBookletPrintSettings(snapshot.bookletPrintSettings ?? DEFAULT_BOOKLET_PRINT_SETTINGS);\n    setSelectedFrameId(null);\n    setSelectedPhotoId(null);\n    setSelectedTextId(null);\n    setSelectedDrawingId(null);\n    setMoveFrameWithPhotoId(null);\n    setFrameSnapGuides(null);\n    setBookletSideId(null);\n    setPrintBookletSideId(null);\n    setDragPageIndex(null);\n    setDragOverPageIndex(null);\n  }\n\n  function undoProjectChange() {\n    const history = flushPendingProjectHistory();\n    const result = undoProjectHistory(history);\n    if (!result.target) return;\n    projectHistoryRef.current = result.history;\n    restoreProjectHistorySnapshot(result.target);\n    bumpProjectHistory((value) => value + 1);\n    show('Последнее изменение отменено');\n  }\n\n  function redoProjectChange() {\n    const history = flushPendingProjectHistory();\n    const result = redoProjectHistory(history);\n    if (!result.target) return;\n    projectHistoryRef.current = result.history;\n    restoreProjectHistorySnapshot(result.target);\n    bumpProjectHistory((value) => value + 1);\n    show('Изменение возвращено');\n  }\n\n  function resetProjectHistoryForLoad() {\n    window.clearTimeout(projectHistoryTimerRef.current);\n    projectHistoryPendingRef.current = false;\n    projectHistoryResetRef.current = true;\n    bumpProjectHistory((value) => value + 1);\n  }\n\n  const canUndoProject = projectHistoryPendingRef.current || Boolean(projectHistoryRef.current?.past?.length);\n  const canRedoProject = !projectHistoryPendingRef.current && Boolean(projectHistoryRef.current?.future?.length);\n",
  'project history actions',
);

app = replaceOnce(
  app,
  "    rebuildAll(canvas, next);\n  }\n\n  function updatePageNumbering(key, value) {\n",
  "    rebuildAll(canvas, next);\n  }\n\n  function fitCurrentPageFramesToPadding() {\n    if (!currentPage || currentPage.isBlankPage) return show('На пустой странице нет фото-окон');\n    const sourceFrames = Array.isArray(currentPage.frames) ? currentPage.frames : [];\n    if (!sourceFrames.length) return show('На странице нет фото-окон');\n\n    const padding = Math.max(0, Math.round(Number(settings.padding) || 0));\n    const fittedFrames = fitFramesToPadding(sourceFrames, canvas, padding)\n      .map((frame) => ({ ...frame, freeLayoutPadding: padding }));\n\n    if (settings.frameMode !== 'free') setSettings((current) => ({ ...current, frameMode: 'free' }));\n    setAlbum((current) => ({\n      ...current,\n      pages: current.pages.map((page) => (\n        page.id === currentPage.id\n          ? { ...page, frameCount: fittedFrames.length, layout: null, frames: fittedFrames }\n          : page\n      )),\n    }));\n    setSelectedFrameId(null);\n    setMoveFrameWithPhotoId(null);\n    setFrameSnapGuides(null);\n    show('Окна подогнаны к полям страницы');\n  }\n\n  function updatePageNumbering(key, value) {\n",
  'explicit fit to padding action',
);

app = replaceOnce(
  app,
  "    const runtimePrepared = await hydratePhotoProject(prepared);\n    releaseUnusedPhotoRuntimeUrls(runtimePrepared.library.map((photo) => photo?.assetId));\n\n    setCanvas(runtimePrepared.canvas);\n",
  "    const runtimePrepared = await hydratePhotoProject(prepared);\n    releaseUnusedPhotoRuntimeUrls(runtimePrepared.library.map((photo) => photo?.assetId));\n    resetProjectHistoryForLoad();\n\n    setCanvas(runtimePrepared.canvas);\n",
  'history reset on project load',
);

app = replaceOnce(
  app,
  "        <div className=\"app-header-actions-v2 file-actions\">\n          <button className=\"button\" type=\"button\" onClick={loadSaved}>Открыть</button>\n",
  "        <div className=\"app-header-actions-v2 file-actions\">\n          <button className=\"button history-button-v2\" type=\"button\" aria-label=\"Отменить\" title=\"Отменить последнее изменение\" disabled={!canUndoProject} onClick={undoProjectChange}>↶</button>\n          <button className=\"button history-button-v2\" type=\"button\" aria-label=\"Вернуть\" title=\"Вернуть отменённое изменение\" disabled={!canRedoProject} onClick={redoProjectChange}>↷</button>\n          <button className=\"button open-project-button-v2\" type=\"button\" onClick={loadSaved}>Открыть</button>\n",
  'header history buttons',
);

app = replaceOnce(
  app,
  "          <button className=\"button\" type=\"button\" onClick={() => document.querySelector('.cloud-auth-toggle')?.click()}>Аккаунт</button>\n",
  "          <button className=\"button account-button-v2\" type=\"button\" onClick={() => document.querySelector('.cloud-auth-toggle')?.click()}>Аккаунт</button>\n",
  'account button class',
);

app = replaceOnce(
  app,
  "              <label className=\"field\"><span>Поля макета</span><SoftNumberInput min={0} max={300} value={settings.padding} onValue={(value) => updateSetting('padding', value)} /></label>\n              <button className={`button full ${locked ? 'active-mode' : ''}`} onClick={() => updateSetting('frameMode', locked ? 'free' : 'locked')}>{locked ? 'Сетка окон включена' : 'Свободные окна'}</button>\n",
  "              <label className=\"field\"><span>Поля макета</span><SoftNumberInput min={0} max={300} value={settings.padding} onValue={(value) => updateSetting('padding', value)} /></label>\n              <button className=\"button full\" onClick={fitCurrentPageFramesToPadding} disabled={Boolean(currentPage?.isBlankPage) || currentPageFrameCount <= 0}>Подогнать окна к полям</button>\n              <p className=\"hint\">Подтягивает крайние фото-окна к заданным полям страницы. Это та самая подгонка всей композиции к краям.</p>\n              <button className={`button full ${locked ? 'active-mode' : ''}`} onClick={() => updateSetting('frameMode', locked ? 'free' : 'locked')}>{locked ? 'Сетка окон включена' : 'Свободные окна'}</button>\n",
  'left fit to padding button',
);

app = replaceOnce(
  app,
  "                <label className=\"field\"><span>Поля макета</span><SoftNumberInput min={0} max={300} value={settings.padding} onValue={(value) => updateSetting('padding', value)} /></label>\n                <button className={`button full ${settings.showGuides ? 'active-mode' : ''}`} onClick={() => updateSetting('showGuides', !settings.showGuides)}>Направляющие</button>\n",
  "                <label className=\"field\"><span>Поля макета</span><SoftNumberInput min={0} max={300} value={settings.padding} onValue={(value) => updateSetting('padding', value)} /></label>\n                <button className=\"button full\" onClick={fitCurrentPageFramesToPadding} disabled={Boolean(currentPage?.isBlankPage) || currentPageFrameCount <= 0}>Подогнать окна к полям</button>\n                <button className={`button full ${settings.showGuides ? 'active-mode' : ''}`} onClick={() => updateSetting('showGuides', !settings.showGuides)}>Направляющие</button>\n",
  'inspector fit to padding button',
);

writeFileSync(appPath, app);

const shellCssPath = 'src/editor-shell-v2.css';
let shellCss = readFileSync(shellCssPath, 'utf8');
shellCss += `\n\n.history-button-v2 {\n  min-width: 34px;\n  width: 34px;\n  padding-inline: 0 !important;\n  font-size: 18px !important;\n  line-height: 1;\n}\n\n.history-button-v2:disabled {\n  opacity: .38;\n  cursor: default;\n}\n`;
writeFileSync(shellCssPath, shellCss);

const mobileCssPath = 'src/editor-mobile.css';
let mobileCss = readFileSync(mobileCssPath, 'utf8');
mobileCss = replaceOnce(
  mobileCss,
  "    grid-template-columns: repeat(4, 44px);\n",
  "    grid-template-columns: repeat(6, 36px);\n",
  'mobile header action columns',
);
mobileCss = replaceOnce(
  mobileCss,
  "    width: 44px;\n    min-width: 44px;\n    max-width: 44px;\n",
  "    width: 36px;\n    min-width: 36px;\n    max-width: 36px;\n",
  'mobile header action widths',
);
mobileCss = replaceOnce(
  mobileCss,
  "  .app-header-actions-v2 > button:first-of-type::after {\n    content: \"Откр.\";\n    font-size: 9px;\n  }\n",
  "  .app-header-actions-v2 .open-project-button-v2::after {\n    content: \"Откр.\";\n    font-size: 9px;\n  }\n",
  'mobile open button label',
);
mobileCss = replaceOnce(
  mobileCss,
  "  .app-header-actions-v2 > button:last-of-type::after {\n    content: \"Акк.\";\n    font-size: 9px;\n  }\n",
  "  .app-header-actions-v2 .account-button-v2::after {\n    content: \"Акк.\";\n    font-size: 9px;\n  }\n\n  .app-header-v2 .app-header-actions-v2 .history-button-v2 {\n    font-size: 17px !important;\n    padding: 0 !important;\n  }\n",
  'mobile account and history labels',
);
writeFileSync(mobileCssPath, mobileCss);

const historyModule = `export const PROJECT_HISTORY_LIMIT = 60;\n\nconst CONTENT_KEYS = [\n  'pages',\n  'library',\n  'hiddenLibraryPhotoIds',\n  'canvas',\n  'settings',\n  'extraLayers',\n  'bookletSheetsPerBlock',\n  'bookletPrintSettings',\n];\n\nexport function createProjectHistorySnapshot(state = {}) {\n  return {\n    pages: state.pages ?? [],\n    currentPageId: state.currentPageId ?? null,\n    library: state.library ?? [],\n    hiddenLibraryPhotoIds: state.hiddenLibraryPhotoIds ?? new Set(),\n    canvas: state.canvas ?? null,\n    settings: state.settings ?? null,\n    extraLayers: state.extraLayers ?? null,\n    bookletSheetsPerBlock: state.bookletSheetsPerBlock ?? null,\n    bookletPrintSettings: state.bookletPrintSettings ?? null,\n  };\n}\n\nexport function sameProjectHistorySnapshot(left, right) {\n  if (!left || !right) return false;\n  return CONTENT_KEYS.every((key) => left[key] === right[key]);\n}\n\nexport function createProjectHistory(initialSnapshot) {\n  return {\n    past: [],\n    current: initialSnapshot,\n    future: [],\n  };\n}\n\nfunction trimPast(items, limit) {\n  return items.length > limit ? items.slice(items.length - limit) : items;\n}\n\nfunction trimFuture(items, limit) {\n  return items.length > limit ? items.slice(0, limit) : items;\n}\n\nexport function commitProjectHistory(history, nextSnapshot, limit = PROJECT_HISTORY_LIMIT) {\n  if (!history) return createProjectHistory(nextSnapshot);\n  if (sameProjectHistorySnapshot(history.current, nextSnapshot)) {\n    if (history.current?.currentPageId === nextSnapshot?.currentPageId) return history;\n    return { ...history, current: { ...history.current, currentPageId: nextSnapshot?.currentPageId ?? null } };\n  }\n\n  return {\n    past: trimPast([...history.past, history.current], limit),\n    current: nextSnapshot,\n    future: [],\n  };\n}\n\nexport function undoProjectHistory(history, limit = PROJECT_HISTORY_LIMIT) {\n  if (!history?.past?.length) return { history, target: null };\n  const target = history.past[history.past.length - 1];\n  return {\n    history: {\n      past: history.past.slice(0, -1),\n      current: target,\n      future: trimFuture([history.current, ...history.future], limit),\n    },\n    target,\n  };\n}\n\nexport function redoProjectHistory(history, limit = PROJECT_HISTORY_LIMIT) {\n  if (!history?.future?.length) return { history, target: null };\n  const target = history.future[0];\n  return {\n    history: {\n      past: trimPast([...history.past, history.current], limit),\n      current: target,\n      future: history.future.slice(1),\n    },\n    target,\n  };\n}\n`;
writeFileSync('src/editor/projectHistory.js', historyModule);

const historyTest = `import assert from 'node:assert/strict';\nimport {\n  commitProjectHistory,\n  createProjectHistory,\n  createProjectHistorySnapshot,\n  redoProjectHistory,\n  sameProjectHistorySnapshot,\n  undoProjectHistory,\n} from './projectHistory.js';\n\nconst shared = {\n  library: [],\n  hiddenLibraryPhotoIds: new Set(),\n  canvas: { width: 100, height: 200 },\n  settings: { padding: 10 },\n  extraLayers: { pages: {} },\n  bookletSheetsPerBlock: 4,\n  bookletPrintSettings: { margin: 0 },\n};\n\nconst first = createProjectHistorySnapshot({\n  ...shared,\n  pages: [{ id: 'a' }, { id: 'b' }],\n  currentPageId: 'a',\n});\nconst navigationOnly = createProjectHistorySnapshot({\n  ...shared,\n  pages: first.pages,\n  currentPageId: 'b',\n});\nassert.equal(sameProjectHistorySnapshot(first, navigationOnly), true, 'page navigation must not create an undo step');\n\nconst second = createProjectHistorySnapshot({\n  ...shared,\n  pages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],\n  currentPageId: 'c',\n});\nlet history = createProjectHistory(first);\nhistory = commitProjectHistory(history, second);\nassert.equal(history.past.length, 1);\nassert.equal(history.current, second);\nassert.equal(history.future.length, 0);\n\nconst undone = undoProjectHistory(history);\nassert.equal(undone.target, first);\nassert.equal(undone.history.current, first);\nassert.equal(undone.history.future[0], second);\n\nconst redone = redoProjectHistory(undone.history);\nassert.equal(redone.target, second);\nassert.equal(redone.history.current, second);\n\nconst changedSettings = createProjectHistorySnapshot({\n  ...shared,\n  pages: second.pages,\n  currentPageId: 'c',\n  settings: { padding: 40 },\n});\nhistory = commitProjectHistory(redone.history, changedSettings);\nassert.equal(history.future.length, 0, 'new edits after redo must clear future history');\n\nlet limited = createProjectHistory(first);\nfor (let index = 0; index < 80; index += 1) {\n  limited = commitProjectHistory(limited, createProjectHistorySnapshot({\n    ...shared,\n    pages: [{ id: 'page-' + index }],\n    currentPageId: 'page-' + index,\n  }));\n}\nassert.equal(limited.past.length, 60, 'history should stay bounded');\n\nconsole.log('project history checks passed');\n`;
writeFileSync('src/editor/projectHistory.test.mjs', historyTest);

const packagePath = 'package.json';
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
if (!packageJson.scripts.test.includes('src/editor/projectHistory.test.mjs')) {
  packageJson.scripts.test = packageJson.scripts.test.replace(
    'node src/editor/pageOrder.test.mjs',
    'node src/editor/projectHistory.test.mjs && node src/editor/pageOrder.test.mjs',
  );
}
writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

const e2eTest = `import { expect, test } from '@playwright/test';\nimport { openEditor } from './helpers.mjs';\n\nasync function project(page) {\n  return page.evaluate(() => structuredClone(window.__collageApp.getProject()));\n}\n\ntest('global undo and redo cover page and layout changes', async ({ page }) => {\n  await openEditor(page);\n\n  const initial = await project(page);\n  const initialPageCount = initial.pages.length;\n  const initialPadding = initial.settings.padding;\n\n  await page.locator('.page-rail-add-v3').click();\n  await expect.poll(async () => (await project(page)).pages.length).toBe(initialPageCount + 1);\n\n  const undo = page.getByRole('button', { name: 'Отменить', exact: true });\n  const redo = page.getByRole('button', { name: 'Вернуть', exact: true });\n  await expect(undo).toBeEnabled();\n\n  await undo.click();\n  await expect.poll(async () => (await project(page)).pages.length).toBe(initialPageCount);\n  await expect(redo).toBeEnabled();\n\n  await redo.click();\n  await expect.poll(async () => (await project(page)).pages.length).toBe(initialPageCount + 1);\n\n  await page.locator('.editor-tool-button-v2[aria-label=\"Коллаж\"]').click();\n  const paddingField = page.locator('label.field').filter({ hasText: 'Поля макета' }).first().locator('input');\n  await paddingField.fill(String(initialPadding + 25));\n  await paddingField.blur();\n\n  await expect.poll(async () => (await project(page)).settings.padding).toBe(initialPadding + 25);\n  await undo.click();\n  await expect.poll(async () => (await project(page)).settings.padding).toBe(initialPadding);\n  await redo.click();\n  await expect.poll(async () => (await project(page)).settings.padding).toBe(initialPadding + 25);\n\n  await expect(page.getByRole('button', { name: 'Подогнать окна к полям', exact: true }).first()).toBeVisible();\n});\n`;
writeFileSync('e2e/global-history.spec.js', e2eTest);

console.log('Global history migration applied');
