from pathlib import Path


def replace_once(text, old, new, label):
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'Expected source block not found: {label}')

app_path = Path('src/AppLive.jsx')
app = app_path.read_text(encoding='utf-8')

app = replace_once(app,
"import { prepareEditorProject } from './editor/projectLoad';\n",
"import { prepareEditorProject } from './editor/projectLoad';\nimport {\n  MAX_LIBRARY_PHOTOS,\n  createPreparedProjectSnapshot,\n  describeSaveResult,\n  projectJsonFileError,\n  selectPhotoUploads,\n} from './editor/reliability';\n",
'reliability import')

app = replace_once(app,
"const DEFAULT_BOOKLET_PRINT_SETTINGS = {\n  showFoldLine: true,\n  showCropMarks: false,\n  gap: 0,\n  margin: 0,\n};\n\nconst MAX_BOOKLET_PRINT_GAP = 300;\nconst MAX_BOOKLET_PRINT_MARGIN = 300;\nconst CROP_MARK_LENGTH = 56;",
"const DEFAULT_BOOKLET_PRINT_SETTINGS = {\n  showFoldLine: false,\n  showCropMarks: false,\n  gap: 0,\n  margin: 0,\n};\n\nconst MAX_BOOKLET_PRINT_GAP = 300;\nconst MAX_BOOKLET_PRINT_MARGIN = 300;\nconst CROP_MARK_LENGTH = 56;\nconst CROP_MARK_OFFSET = 18;",
'print defaults')

app = replace_once(app,
"      onChange={(event) => {\n        const raw = event.target.value;\n        setDraft(raw);\n        commit(raw, false);\n      }}",
"      onChange={(event) => {\n        const raw = event.target.value;\n        setDraft(raw);\n      }}",
'soft number input')

app = replace_once(app,
"function normalizeBookletPrintSettings(value = {}) {\n  return {\n    showFoldLine: value.showFoldLine !== false,\n    showCropMarks: Boolean(value.showCropMarks),\n    gap: Math.round(clamp(value.gap ?? DEFAULT_BOOKLET_PRINT_SETTINGS.gap, 0, MAX_BOOKLET_PRINT_GAP)),\n    margin: Math.round(clamp(value.margin ?? DEFAULT_BOOKLET_PRINT_SETTINGS.margin, 0, MAX_BOOKLET_PRINT_MARGIN)),\n  };\n}",
"function normalizeBookletPrintSettings(value = {}) {\n  const showCropMarks = Boolean(value.showCropMarks);\n  const requestedMargin = Number(value.margin ?? DEFAULT_BOOKLET_PRINT_SETTINGS.margin) || 0;\n  const minimumMargin = showCropMarks ? CROP_MARK_OFFSET + CROP_MARK_LENGTH : 0;\n  return {\n    showFoldLine: Boolean(value.showFoldLine),\n    showCropMarks,\n    gap: Math.round(clamp(value.gap ?? DEFAULT_BOOKLET_PRINT_SETTINGS.gap, 0, MAX_BOOKLET_PRINT_GAP)),\n    margin: Math.round(clamp(Math.max(requestedMargin, minimumMargin), 0, MAX_BOOKLET_PRINT_MARGIN)),\n  };\n}",
'print settings normalization')

app = replace_once(app,
"function CropMark({ x, y, horizontalDirection, verticalDirection }) {\n  return (\n    <>\n      <Line points={[x, y, x + horizontalDirection * CROP_MARK_LENGTH, y]} stroke=\"#222222\" strokeWidth={2} listening={false} />\n      <Line points={[x, y, x, y + verticalDirection * CROP_MARK_LENGTH]} stroke=\"#222222\" strokeWidth={2} listening={false} />\n    </>\n  );\n}",
"function CropMark({ x, y, horizontalDirection, verticalDirection }) {\n  const horizontalStart = x + horizontalDirection * CROP_MARK_OFFSET;\n  const verticalStart = y + verticalDirection * CROP_MARK_OFFSET;\n  return (\n    <>\n      <Line points={[horizontalStart, y, horizontalStart + horizontalDirection * CROP_MARK_LENGTH, y]} stroke=\"#222222\" strokeWidth={2} listening={false} />\n      <Line points={[x, verticalStart, x, verticalStart + verticalDirection * CROP_MARK_LENGTH]} stroke=\"#222222\" strokeWidth={2} listening={false} />\n    </>\n  );\n}",
'crop mark geometry')

app = replace_once(app,
"          <CropMark key={`crop-${pageIndex}-tl`} x={left} y={top} horizontalDirection={1} verticalDirection={1} />,\n          <CropMark key={`crop-${pageIndex}-tr`} x={right} y={top} horizontalDirection={-1} verticalDirection={1} />,\n          <CropMark key={`crop-${pageIndex}-bl`} x={left} y={bottom} horizontalDirection={1} verticalDirection={-1} />,\n          <CropMark key={`crop-${pageIndex}-br`} x={right} y={bottom} horizontalDirection={-1} verticalDirection={-1} />,
",
"          <CropMark key={`crop-${pageIndex}-tl`} x={left} y={top} horizontalDirection={-1} verticalDirection={-1} />,\n          <CropMark key={`crop-${pageIndex}-tr`} x={right} y={top} horizontalDirection={1} verticalDirection={-1} />,\n          <CropMark key={`crop-${pageIndex}-bl`} x={left} y={bottom} horizontalDirection={-1} verticalDirection={1} />,\n          <CropMark key={`crop-${pageIndex}-br`} x={right} y={bottom} horizontalDirection={1} verticalDirection={1} />,
",
'crop mark directions')

app = replace_once(app,
"  function uploadPhotos(event) {\n    const files = Array.from(event.target.files ?? []);\n    files.forEach((file) => {\n      if (!file.type.startsWith('image/')) return;\n      const reader = new FileReader();\n      reader.onload = () => setLibrary((current) => [...current, { id: makeId(), name: file.name, src: reader.result }]);\n      reader.readAsDataURL(file);\n    });\n    event.target.value = '';\n    if (files.length) show('Фото загружены');\n  }",
"  function uploadPhotos(event) {\n    const files = Array.from(event.target.files ?? []);\n    const selection = selectPhotoUploads(files, library.length);\n    event.target.value = '';\n\n    if (!selection.accepted.length) {\n      if (selection.rejectedSize) return show('Фото слишком большие. Максимум 25 МБ на файл.');\n      if (selection.rejectedLimit) return show(`В библиотеке можно хранить не больше ${MAX_LIBRARY_PHOTOS} фото`);\n      return show('Подходящих изображений не найдено');\n    }\n\n    let completed = 0;\n    let loaded = 0;\n    let failed = 0;\n    const skipped = selection.rejectedType + selection.rejectedSize + selection.rejectedLimit;\n    const finish = () => {\n      completed += 1;\n      if (completed !== selection.accepted.length) return;\n      const suffix = skipped || failed ? ` · пропущено: ${skipped + failed}` : '';\n      show(`Фото загружены: ${loaded}${suffix}`);\n    };\n\n    selection.accepted.forEach((file) => {\n      const reader = new FileReader();\n      reader.onload = () => {\n        if (typeof reader.result !== 'string') {\n          failed += 1;\n          finish();\n          return;\n        }\n        setLibrary((current) => (current.length >= MAX_LIBRARY_PHOTOS\n          ? current\n          : [...current, { id: makeId(), name: file.name, src: reader.result }]));\n        loaded += 1;\n        finish();\n      };\n      reader.onerror = () => {\n        failed += 1;\n        finish();\n      };\n      reader.readAsDataURL(file);\n    });\n    show(`Загружаю фото: ${selection.accepted.length}`);\n  }",
'bounded photo upload')

app = replace_once(app,
"  async function save() {\n    const data = project();\n    const local = saveLocalProject({ silent: true, data });\n    const storagePromise = Promise.resolve(\n      window.__collageProjectStorage?.storeSnapshot?.(data, { source: 'manual-save' }),\n    ).catch((error) => {\n      console.warn('IndexedDB project save failed', error);\n      return null;\n    });\n\n    try {\n      const result = await saveCloudProject(data);\n      await storagePromise;\n      if (result?.id) {\n        show('Альбом сохранён в аккаунт');\n      } else {\n        show('Альбом сохранён локально');\n      }\n    } catch (error) {\n      console.error(error);\n      await storagePromise;\n      show('Локально сохранено. Облако недоступно');\n    }\n    return local;\n  }",
"  async function save() {\n    const data = project();\n    const local = saveLocalProject({ silent: true, data });\n    const storeSnapshot = window.__collageProjectStorage?.storeSnapshot;\n    const storagePromise = typeof storeSnapshot === 'function'\n      ? Promise.resolve(storeSnapshot(data, { source: 'manual-save' }))\n          .then(() => ({ ok: true }))\n          .catch((error) => {\n            console.warn('IndexedDB project save failed', error);\n            return { ok: false, error };\n          })\n      : Promise.resolve({ ok: false, skipped: true });\n\n    let cloud = null;\n    let cloudError = null;\n    try {\n      cloud = await saveCloudProject(data);\n    } catch (error) {\n      cloudError = error;\n      console.warn('Cloud project save failed', error);\n    }\n\n    const indexedDb = await storagePromise;\n    const outcome = describeSaveResult({ local, indexedDb, cloud, cloudError });\n    show(outcome.message);\n    return { ok: outcome.ok, local, indexedDb, cloud, cloudError, data };\n  }",
'honest save result')

app = replace_once(app,
"      openProject: (data) => {\n        const prepared = applyProjectData(data, 'Проект открыт из аккаунта');\n        saveLocalProject({ silent: true, data });\n        Promise.resolve(\n          window.__collageProjectStorage?.storeSnapshot?.(data, { source: 'cloud-open' }),\n        ).catch((error) => console.warn('IndexedDB cloud project save failed', error));\n        return { ok: true, currentPageId: prepared.currentPageId };\n      },",
"      openProject: (data) => {\n        const prepared = applyProjectData(data, 'Проект открыт из аккаунта');\n        const snapshot = createPreparedProjectSnapshot(prepared);\n        saveLocalProject({ silent: true, data: snapshot });\n        Promise.resolve(\n          window.__collageProjectStorage?.storeSnapshot?.(snapshot, { source: 'cloud-open' }),\n        ).catch((error) => console.warn('IndexedDB cloud project save failed', error));\n        return { ok: true, currentPageId: prepared.currentPageId };\n      },",
'normalized cloud snapshot')

app = replace_once(app,
"  function loadSaved() {\n    const raw = localStorage.getItem(STORAGE_KEY) ?? LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);\n    if (!raw) return show('Сохранённого проекта пока нет');\n    try {\n      const data = JSON.parse(raw);\n      const nextCanvas = data.canvas ?? DEFAULT_CANVAS;\n      const nextSettings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };\n      const nextPages = normalizeProjectPages(data, nextCanvas, nextSettings);\n      setCanvas(nextCanvas);\n      setSettings(nextSettings);\n      setLibrary(Array.isArray(data.library) ? data.library : []);\n      setAlbum({ pages: nextPages, currentPageId: nextPages.some((page) => page.id === data.currentPageId) ? data.currentPageId : nextPages[0].id });\n      setViewMode(['single', 'spread', 'booklet'].includes(data.viewMode) ? data.viewMode : 'spread');\n      setBookletSheetsPerBlock(clampBookletSheetsPerBlock(data.bookletSheetsPerBlock));\n      setBookletPrintSettings(normalizeBookletPrintSettings(data.bookletPrintSettings));\n      setExtraLayers(normalizeExtraLayers(data.extraLayers));\n      setAlbumMode(normalizeAlbumEditorMode(data.albumEditorMode));\n      setSelectedFrameId(null);\n      setSelectedPhotoId(null);\n      setMoveFrameWithPhotoId(null);\n      show('Альбом загружен');\n    } catch {\n      show('Не получилось открыть сохранение');\n    }\n  }",
"  function loadSaved() {\n    const raw = localStorage.getItem(STORAGE_KEY) ?? LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);\n    if (!raw) return show('Сохранённого проекта пока нет');\n    try {\n      const data = JSON.parse(raw);\n      applyProjectData(data, 'Альбом загружен');\n    } catch (error) {\n      console.warn('Local project load failed', error);\n      show('Не получилось открыть сохранение');\n    }\n  }",
'atomic local load')

app = replace_once(app,
"  function importJson(event) {\n    const file = event.target.files?.[0];\n    if (!file) return;\n    const reader = new FileReader();\n    reader.onload = () => {\n      try {\n        const data = JSON.parse(reader.result);\n        const nextCanvas = data.canvas ?? DEFAULT_CANVAS;\n        const nextSettings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };\n        const nextPages = normalizeProjectPages(data, nextCanvas, nextSettings);\n        setCanvas(nextCanvas);\n        setSettings(nextSettings);\n        setLibrary(Array.isArray(data.library) ? data.library : []);\n        setAlbum({ pages: nextPages, currentPageId: nextPages.some((page) => page.id === data.currentPageId) ? data.currentPageId : nextPages[0].id });\n        setViewMode(['single', 'spread', 'booklet'].includes(data.viewMode) ? data.viewMode : 'spread');\n        setBookletSheetsPerBlock(clampBookletSheetsPerBlock(data.bookletSheetsPerBlock));\n        setBookletPrintSettings(normalizeBookletPrintSettings(data.bookletPrintSettings));\n        setExtraLayers(normalizeExtraLayers(data.extraLayers));\n        setAlbumMode(normalizeAlbumEditorMode(data.albumEditorMode));\n        setSelectedFrameId(null);\n        setSelectedPhotoId(null);\n        setMoveFrameWithPhotoId(null);\n        show('JSON открыт');\n      } catch {\n        show('Файл не похож на проект');\n      }\n    };\n    reader.readAsText(file);\n    event.target.value = '';\n  }",
"  function importJson(event) {\n    const file = event.target.files?.[0];\n    event.target.value = '';\n    if (!file) return;\n    const fileError = projectJsonFileError(file);\n    if (fileError) return show(fileError);\n\n    const reader = new FileReader();\n    reader.onload = () => {\n      try {\n        const data = JSON.parse(reader.result);\n        applyProjectData(data, 'JSON открыт');\n      } catch (error) {\n        console.warn('Project JSON import failed', error);\n        show('Файл не похож на проект');\n      }\n    };\n    reader.onerror = () => show('Не удалось прочитать JSON');\n    reader.readAsText(file);\n  }",
'atomic JSON import')

app_path.write_text(app, encoding='utf-8')

styles_path = Path('src/styles.css')
styles = styles_path.read_text(encoding='utf-8')

styles = replace_once(styles,
"@media (max-width: 1180px) {\n  .workspace.three-columns,\n  .three-columns,\n  body[data-album-mode='text'] .three-columns,\n  body[data-album-mode='drawings'] .three-columns,\n  body[data-album-mode='templates'] .three-columns {\n    grid-template-columns: 210px max-content !important;\n    grid-template-areas:\n      \"photos pages\"\n      \"photos canvas\" !important;\n  }\n\n  .inspector,\n  .album-mode-inspector {\n    display: none !important;\n  }\n}",
"@media (max-width: 1180px) {\n  .workspace.three-columns,\n  .three-columns,\n  body[data-album-mode='text'] .three-columns,\n  body[data-album-mode='drawings'] .three-columns,\n  body[data-album-mode='templates'] .three-columns {\n    grid-template-columns: 210px minmax(0, 1fr) !important;\n    grid-template-areas:\n      \"photos pages\"\n      \"photos canvas\"\n      \"inspector inspector\" !important;\n  }\n\n  .workspace > .inspector {\n    display: grid !important;\n    grid-area: inspector;\n    width: 100%;\n    max-height: none;\n  }\n}",
'medium collage inspector')

styles = replace_once(styles,
"@media (max-width: 1180px) {\n  body[data-album-mode='text'] .workspace.three-columns,\n  body[data-album-mode='drawings'] .workspace.three-columns,\n  body[data-album-mode='templates'] .workspace.three-columns,\n  body[data-album-mode='text'] .three-columns,\n  body[data-album-mode='drawings'] .three-columns,\n  body[data-album-mode='templates'] .three-columns {\n    grid-template-columns: 210px max-content !important;\n    grid-template-areas:\n      \"mode-sidebar pages\"\n      \"mode-sidebar canvas\" !important;\n  }\n\n  body[data-album-mode='text'] .workspace > .album-mode-inspector,\n  body[data-album-mode='drawings'] .workspace > .album-mode-inspector,\n  body[data-album-mode='templates'] .workspace > .album-mode-inspector {\n    display: none !important;\n  }\n}",
"@media (max-width: 1180px) {\n  body[data-album-mode='text'] .workspace.three-columns,\n  body[data-album-mode='drawings'] .workspace.three-columns,\n  body[data-album-mode='templates'] .workspace.three-columns,\n  body[data-album-mode='text'] .three-columns,\n  body[data-album-mode='drawings'] .three-columns,\n  body[data-album-mode='templates'] .three-columns {\n    grid-template-columns: 210px minmax(0, 1fr) !important;\n    grid-template-areas:\n      \"mode-sidebar pages\"\n      \"mode-sidebar canvas\"\n      \"mode-inspector mode-inspector\" !important;\n  }\n\n  body[data-album-mode='text'] .workspace > .album-mode-inspector,\n  body[data-album-mode='drawings'] .workspace > .album-mode-inspector,\n  body[data-album-mode='templates'] .workspace > .album-mode-inspector {\n    display: grid !important;\n    grid-area: mode-inspector;\n    width: 100%;\n    max-height: none;\n  }\n}",
'medium mode inspector')

styles = replace_once(styles,
"@media (max-width: 980px) {\n  .album-tool-panel {\n    grid-template-columns: 1fr;\n  }\n\n  body[data-album-mode='text'] .workspace.three-columns,\n  body[data-album-mode='drawings'] .workspace.three-columns,\n  body[data-album-mode='templates'] .workspace.three-columns,\n  body[data-album-mode='text'] .three-columns,\n  body[data-album-mode='drawings'] .three-columns,\n  body[data-album-mode='templates'] .three-columns {\n    display: flex !important;\n    flex-direction: column;\n  }\n\n  body[data-album-mode='text'] .workspace > .page-rail,\n  body[data-album-mode='drawings'] .workspace > .page-rail,\n  body[data-album-mode='templates'] .workspace > .page-rail {\n    width: 100%;\n  }\n}",
"@media (max-width: 980px) {\n  .album-tool-panel {\n    grid-template-columns: 1fr;\n  }\n\n  body[data-album-mode='text'] .workspace.three-columns,\n  body[data-album-mode='drawings'] .workspace.three-columns,\n  body[data-album-mode='templates'] .workspace.three-columns,\n  body[data-album-mode='text'] .three-columns,\n  body[data-album-mode='drawings'] .three-columns,\n  body[data-album-mode='templates'] .three-columns {\n    display: flex !important;\n    flex-direction: column;\n  }\n\n  body[data-album-mode='text'] .workspace > .page-rail,\n  body[data-album-mode='drawings'] .workspace > .page-rail,\n  body[data-album-mode='templates'] .workspace > .page-rail {\n    width: 100%;\n  }\n\n  .workspace > .inspector,\n  .workspace > .album-mode-inspector {\n    display: grid !important;\n    width: 100%;\n    max-height: none;\n  }\n}",
'narrow inspectors')

styles_path.write_text(styles, encoding='utf-8')
