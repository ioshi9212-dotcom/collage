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
"""import { saveCloudProject } from './editor/cloudProjects';
import PhotoLibraryThumbnail from './editor/PhotoLibraryThumbnail';
import { readPhotoFilesAsDataUrls } from './editor/photoImportQueue';
import { compactProjectPhotos } from './editor/photoStorage';
import { loadCachedImage as loadImage } from './editor/imageCache';
""",
"""import { saveCloudProject } from './editor/cloudProjects';
import PhotoLibraryThumbnail from './editor/PhotoLibraryThumbnail';
import {
  createLocalPhotoProject,
  createPortablePhotoProject,
  hydratePhotoProject,
  persistPhotoFiles,
  releaseAllPhotoRuntimeUrls,
  releaseUnusedPhotoRuntimeUrls,
} from './editor/photoAssets';
import { loadCachedImage as loadImage } from './editor/imageCache';
""",
'photo asset imports')

app = replace_once(app,
"""  useEffect(() => {
    try { localStorage.removeItem(ALBUM_LAYERS_KEY); } catch { /* ignore localStorage errors */ }
  }, []);

  useEffect(() => {
""",
"""  useEffect(() => {
    try { localStorage.removeItem(ALBUM_LAYERS_KEY); } catch { /* ignore localStorage errors */ }
  }, []);

  useEffect(() => () => releaseAllPhotoRuntimeUrls(), []);

  useEffect(() => {
""",
'photo runtime URL cleanup')

app = replace_once(app,
"""  async function uploadPhotos(event) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (photoUploadInFlightRef.current) return show('Дождись окончания текущей загрузки фото');

    const selection = selectPhotoUploads(files, library.length);
    if (!selection.accepted.length) {
      if (selection.rejectedSize) return show('Фото слишком большие. Максимум 25 МБ на файл.');
      if (selection.rejectedLimit) return show(`В библиотеке можно хранить не больше ${MAX_LIBRARY_PHOTOS} фото`);
      return show('Подходящих изображений не найдено');
    }

    photoUploadInFlightRef.current = true;
    setPhotoImporting(true);
    const skippedBeforeRead = selection.rejectedType + selection.rejectedSize + selection.rejectedLimit;
    show(`Загружаю фото: ${selection.accepted.length}`);

    try {
      const result = await readPhotoFilesAsDataUrls(selection.accepted);
      const availableSlots = Math.max(0, MAX_LIBRARY_PHOTOS - library.length);
      const additions = result.loaded.slice(0, availableSlots).map(({ file, dataUrl }) => ({
        id: makeId(),
        name: file.name,
        src: dataUrl,
      }));
      if (additions.length) {
        setLibrary((current) => [...current, ...additions].slice(0, MAX_LIBRARY_PHOTOS));
      }

      const overflow = Math.max(0, result.loaded.length - additions.length);
      const skipped = skippedBeforeRead + result.failed.length + overflow;
      const suffix = skipped ? ` · пропущено: ${skipped}` : '';
      show(`Фото загружены: ${additions.length}${suffix}`);
    } catch (error) {
      console.warn('Photo import failed', error);
      show('Не удалось загрузить фотографии');
    } finally {
      photoUploadInFlightRef.current = false;
      setPhotoImporting(false);
    }
  }
""",
"""  async function uploadPhotos(event) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (photoUploadInFlightRef.current) return show('Дождись окончания текущей загрузки фото');

    const selection = selectPhotoUploads(files, library.length);
    if (!selection.accepted.length) {
      if (selection.rejectedSize) return show('Фото слишком большие. Максимум 25 МБ на файл.');
      if (selection.rejectedLimit) return show(`В библиотеке можно хранить не больше ${MAX_LIBRARY_PHOTOS} фото`);
      return show('Подходящих изображений не найдено');
    }

    photoUploadInFlightRef.current = true;
    setPhotoImporting(true);
    const skippedBeforeStore = selection.rejectedType + selection.rejectedSize + selection.rejectedLimit;
    show(`Сохраняю оригиналы: ${selection.accepted.length}`);

    try {
      const result = await persistPhotoFiles(selection.accepted, { idFactory: makeId });
      const availableSlots = Math.max(0, MAX_LIBRARY_PHOTOS - library.length);
      const additions = result.loaded.slice(0, availableSlots);
      if (additions.length) {
        setLibrary((current) => [...current, ...additions].slice(0, MAX_LIBRARY_PHOTOS));
      }

      const overflow = Math.max(0, result.loaded.length - additions.length);
      const skipped = skippedBeforeStore + result.failed.length + overflow;
      const suffix = skipped ? ` · пропущено: ${skipped}` : '';
      show(`Фото загружены: ${additions.length}${suffix}`);
    } catch (error) {
      console.warn('Photo import failed', error);
      show('Не удалось загрузить фотографии');
    } finally {
      photoUploadInFlightRef.current = false;
      setPhotoImporting(false);
    }
  }
""",
'Blob photo upload')

app = replace_once(app,
"""  function project() {
    const compactedPhotos = compactProjectPhotos(library, pages);
    return {
      version: 'live-23-photo-library-references',
      canvas,
      settings,
      library: compactedPhotos.library,
      pages: compactedPhotos.pages,
      currentPageId: album.currentPageId,
      viewMode,
      bookletSheetsPerBlock,
      bookletPrintSettings: normalizedBookletPrintSettings,
      extraLayers: sanitizeExtraLayers(extraLayers),
      albumEditorMode: albumMode,
      savedAt: new Date().toISOString(),
    };
  }
""",
"""  function project() {
    return createLocalPhotoProject({
      canvas,
      settings,
      library,
      pages,
      currentPageId: album.currentPageId,
      viewMode,
      bookletSheetsPerBlock,
      bookletPrintSettings: normalizedBookletPrintSettings,
      extraLayers: sanitizeExtraLayers(extraLayers),
      albumEditorMode: albumMode,
      savedAt: new Date().toISOString(),
    });
  }

  async function portableProject() {
    return createPortablePhotoProject(project());
  }

  async function downloadProjectJson() {
    show('Собираю переносимый JSON…');
    try {
      const data = await portableProject();
      downloadText('collage-album-project.json', JSON.stringify(data, null, 2));
      show('JSON скачан');
    } catch (error) {
      console.warn('Portable JSON export failed', error);
      show(error?.message || 'Не удалось собрать переносимый JSON');
    }
  }
""",
'local and portable project snapshots')

app = replace_once(app,
"""      if (!silent) show('Не удалось сохранить: проект слишком большой. Скачай JSON или очисти лишние фото.');
""",
"""      if (!silent) show('Не удалось сохранить локальный снимок. Скачай JSON, чтобы не потерять работу.');
""",
'local save error')

app = replace_once(app,
"""      cloud = await saveCloudProject(data);
""",
"""      cloud = await saveCloudProject(await portableProject());
""",
'portable cloud save')

app = replace_once(app,
"""    window.__collageApp = {
      getProject: () => project(),
      saveLocal: () => saveLocalProject({ silent: true }),
      openProject: (data) => {
        const prepared = applyProjectData(data, 'Проект открыт из аккаунта');
        const snapshot = createPreparedProjectSnapshot(prepared);
        saveLocalProject({ silent: true, data: snapshot });
        Promise.resolve(
          window.__collageProjectStorage?.storeSnapshot?.(snapshot, { source: 'cloud-open' }),
        ).catch((error) => console.warn('IndexedDB cloud project save failed', error));
        return { ok: true, currentPageId: prepared.currentPageId };
      },
    };
""",
"""    window.__collageApp = {
      getProject: () => project(),
      getPortableProject: () => portableProject(),
      saveLocal: () => saveLocalProject({ silent: true }),
      openProject: async (data) => {
        const prepared = await applyProjectData(data, 'Проект открыт из аккаунта');
        const snapshot = createPreparedProjectSnapshot(prepared);
        saveLocalProject({ silent: true, data: snapshot });
        Promise.resolve(
          window.__collageProjectStorage?.storeSnapshot?.(snapshot, { source: 'cloud-open' }),
        ).catch((error) => console.warn('IndexedDB cloud project save failed', error));
        return { ok: true, currentPageId: prepared.currentPageId };
      },
    };
""",
'editor storage bridge')

app = replace_once(app,
"""  function applyProjectData(data, message) {
    const prepared = prepareEditorProject(data, {
      defaultCanvas: DEFAULT_CANVAS,
      defaultSettings: DEFAULT_SETTINGS,
      normalizePages: normalizeProjectPages,
      normalizeBookletSheets: clampBookletSheetsPerBlock,
      normalizeBookletPrintSettings,
      normalizeExtraLayers: sanitizeExtraLayers,
    });

    setCanvas(prepared.canvas);
    setSettings(prepared.settings);
    setLibrary(prepared.library);
    setAlbum({ pages: prepared.pages, currentPageId: prepared.currentPageId });
    setViewMode(prepared.viewMode);
    setBookletSheetsPerBlock(prepared.bookletSheetsPerBlock);
    setBookletPrintSettings(prepared.bookletPrintSettings);
    setExtraLayers(prepared.extraLayers);
    setAlbumMode(prepared.albumEditorMode);
    setBookletSideId(null);
    setPrintBookletSideId(null);
    setSelectedFrameId(null);
    setSelectedPhotoId(null);
    setMoveFrameWithPhotoId(null);
    setSelectedTextId(null);
    setSelectedDrawingId(null);
    setDragPageIndex(null);
    setDragOverPageIndex(null);
    show(message);
    return prepared;
  }
""",
"""  async function applyProjectData(data, message) {
    const prepared = prepareEditorProject(data, {
      defaultCanvas: DEFAULT_CANVAS,
      defaultSettings: DEFAULT_SETTINGS,
      normalizePages: normalizeProjectPages,
      normalizeBookletSheets: clampBookletSheetsPerBlock,
      normalizeBookletPrintSettings,
      normalizeExtraLayers: sanitizeExtraLayers,
    });
    const runtimePrepared = await hydratePhotoProject(prepared);
    releaseUnusedPhotoRuntimeUrls(runtimePrepared.library.map((photo) => photo?.assetId));

    setCanvas(runtimePrepared.canvas);
    setSettings(runtimePrepared.settings);
    setLibrary(runtimePrepared.library);
    setAlbum({ pages: runtimePrepared.pages, currentPageId: runtimePrepared.currentPageId });
    setViewMode(runtimePrepared.viewMode);
    setBookletSheetsPerBlock(runtimePrepared.bookletSheetsPerBlock);
    setBookletPrintSettings(runtimePrepared.bookletPrintSettings);
    setExtraLayers(runtimePrepared.extraLayers);
    setAlbumMode(runtimePrepared.albumEditorMode);
    setBookletSideId(null);
    setPrintBookletSideId(null);
    setSelectedFrameId(null);
    setSelectedPhotoId(null);
    setMoveFrameWithPhotoId(null);
    setSelectedTextId(null);
    setSelectedDrawingId(null);
    setDragPageIndex(null);
    setDragOverPageIndex(null);
    show(runtimePrepared.missingPhotoCount ? `${message} · не найдено оригиналов: ${runtimePrepared.missingPhotoCount}` : message);
    return runtimePrepared;
  }
""",
'async project hydration')

app = replace_once(app,
"""  function loadSaved() {
    const raw = localStorage.getItem(STORAGE_KEY) ?? LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) return show('Сохранённого проекта пока нет');
    try {
      const data = JSON.parse(raw);
      applyProjectData(data, 'Альбом загружен');
    } catch (error) {
      console.warn('Local project load failed', error);
      show('Не получилось открыть сохранение');
    }
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fileError = projectJsonFileError(file);
    if (fileError) return show(fileError);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        applyProjectData(data, 'JSON открыт');
      } catch (error) {
        console.warn('Project JSON import failed', error);
        show('Файл не похож на проект');
      }
    };
    reader.onerror = () => show('Не удалось прочитать JSON');
    reader.readAsText(file);
  }
""",
"""  async function loadSaved() {
    const raw = localStorage.getItem(STORAGE_KEY) ?? LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) return show('Сохранённого проекта пока нет');
    try {
      const data = JSON.parse(raw);
      await applyProjectData(data, 'Альбом загружен');
    } catch (error) {
      console.warn('Local project load failed', error);
      show(error?.message || 'Не получилось открыть сохранение');
    }
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fileError = projectJsonFileError(file);
    if (fileError) return show(fileError);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        await applyProjectData(data, 'JSON открыт');
      } catch (error) {
        console.warn('Project JSON import failed', error);
        show(error?.message || 'Файл не похож на проект');
      }
    };
    reader.onerror = () => show('Не удалось прочитать JSON');
    reader.readAsText(file);
  }
""",
'async local and JSON open')

app = replace_once(app,
"""            <button className="button" onClick={() => downloadText('collage-album-project.json', JSON.stringify(project(), null, 2))}>Скачать JSON</button>
""",
"""            <button className="button" onClick={downloadProjectJson}>Скачать JSON</button>
""",
'portable JSON button')

app = replace_once(app,
"""<small>{photoImporting ? 'Оригиналы читаются по очереди' : 'Можно сразу несколько'}</small>
""",
"""<small>{photoImporting ? 'Оригиналы сохраняются по очереди' : 'Можно сразу несколько'}</small>
""",
'photo upload status copy')

app_path.write_text(app, encoding='utf-8')

cloud_path = Path('public/cloud-auth.js')
cloud = cloud_path.read_text(encoding='utf-8')
cloud = replace_once(cloud,
"""  function getEditorProject() {
    const bridge = window.__collageApp;
    if (bridge && typeof bridge.getProject === 'function') {
      const data = bridge.getProject();
      if (data && typeof data === 'object') return { source: 'bridge', data };
    }

    const localProject = getLatestLocalProject();
    if (localProject?.data) return { source: 'localStorage', data: localProject.data };
    return null;
  }
""",
"""  async function getEditorProject() {
    const bridge = window.__collageApp;
    if (bridge && typeof bridge.getPortableProject === 'function') {
      const data = await bridge.getPortableProject();
      if (data && typeof data === 'object') return { source: 'bridge', data };
    }
    if (bridge && typeof bridge.getProject === 'function') {
      const data = bridge.getProject();
      if (data && typeof data === 'object') return { source: 'bridge', data };
    }

    const localProject = getLatestLocalProject();
    if (localProject?.data) {
      const requiresAssets = Array.isArray(localProject.data.library)
        && localProject.data.library.some((photo) => photo?.assetId && !photo?.src);
      if (requiresAssets) throw new Error('Редактор ещё загружается. Повтори сохранение через несколько секунд.');
      return { source: 'localStorage', data: localProject.data };
    }
    return null;
  }
""",
'portable cloud bridge')
cloud = replace_once(cloud,
"""      const editorProject = getEditorProject();
""",
"""      const editorProject = await getEditorProject();
""",
'await portable cloud snapshot')
cloud_path.write_text(cloud, encoding='utf-8')

cloud_test_path = Path('public/cloud-auth.test.mjs')
cloud_test = cloud_test_path.read_text(encoding='utf-8')
cloud_test = replace_once(cloud_test,
"""    __collageApp: {
      getProject: () => ({ title: 'Проект', pages: [{ id: 'page-1' }] }),
      ...(options.bridge || {}),
    },
""",
"""    __collageApp: {
      getProject: () => ({ title: 'Локальный проект', pages: [{ id: 'page-1' }] }),
      getPortableProject: async () => ({ title: 'Проект', pages: [{ id: 'page-1' }] }),
      ...(options.bridge || {}),
    },
""",
'cloud test portable bridge')
cloud_test = replace_once(cloud_test,
"""assert.match(source, /typeof bridge\?\.openProject === 'function'/);
assert.match(source, /await bridge\.openProject\(project\.data\)/);
""",
"""assert.match(source, /typeof bridge\?\.openProject === 'function'/);
assert.match(source, /await bridge\.openProject\(project\.data\)/);
assert.match(source, /typeof bridge\.getPortableProject === 'function'/);
assert.match(source, /await bridge\.getPortableProject\(\)/);
""",
'cloud portable source assertions')
cloud_test_path.write_text(cloud_test, encoding='utf-8')

index_path = Path('index.html')
index = index_path.read_text(encoding='utf-8')
index = replace_once(index,
"""    <script src="/cloud-auth.js?v=20260707-4" defer></script>
""",
"""    <script src="/cloud-auth.js?v=20260714-photo-assets-v1" defer></script>
""",
'cloud auth cache bust')
index_path.write_text(index, encoding='utf-8')
