from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


app_path = Path('src/AppLive.jsx')
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    "import { loadCachedImage as loadImage } from './editor/imageCache';\n",
    "import { loadCachedImage as loadImage } from './editor/imageCache';\nimport { prepareEditorProject } from './editor/projectLoad';\n",
    'project load import',
)

app = replace_once(
    app,
    """    window.__collageApp = {
      getProject: () => project(),
      saveLocal: () => saveLocalProject({ silent: true }),
    };
""",
    """    window.__collageApp = {
      getProject: () => project(),
      saveLocal: () => saveLocalProject({ silent: true }),
      openProject: (data) => {
        const prepared = applyProjectData(data, 'Проект открыт из аккаунта');
        saveLocalProject({ silent: true, data });
        Promise.resolve(
          window.__collageProjectStorage?.storeSnapshot?.(data, { source: 'cloud-open' }),
        ).catch((error) => console.warn('IndexedDB cloud project save failed', error));
        return { ok: true, currentPageId: prepared.currentPageId };
      },
    };
""",
    'editor bridge',
)

app = replace_once(
    app,
    """    return [createPage(nextCanvas, nextSettings, 1), createPage(nextCanvas, nextSettings, 2)];
  }

  function loadSaved() {
""",
    """    return [createPage(nextCanvas, nextSettings, 1), createPage(nextCanvas, nextSettings, 2)];
  }

  function applyProjectData(data, message) {
    const prepared = prepareEditorProject(data, {
      defaultCanvas: DEFAULT_CANVAS,
      defaultSettings: DEFAULT_SETTINGS,
      normalizePages,
      normalizeBookletSheets: clampBookletSheetsPerBlock,
      normalizeBookletPrintSettings,
      normalizeExtraLayers,
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

  function loadSaved() {
""",
    'atomic project apply function',
)

app_path.write_text(app, encoding='utf-8')

cloud_path = Path('public/cloud-auth.js')
cloud = cloud_path.read_text(encoding='utf-8')
cloud = replace_once(
    cloud,
    """  async function openProject(id) {
    if (!confirm('Открыть проект из аккаунта? Текущий несохранённый макет заменится.')) return;
    setStatus('Открываю проект…');
    try {
      const result = await api(`/api/projects/${id}`);
      const project = result.project;
      localStorage.setItem(CURRENT_STORAGE_KEY, JSON.stringify(project.data));
      localStorage.setItem(CURRENT_PROJECT_ID_KEY, project.id);
      localStorage.setItem(CURRENT_PROJECT_TITLE_KEY, project.title);
      location.reload();
    } catch (error) {
      setStatus(error.message);
    }
  }
""",
    """  async function openProject(id) {
    if (state.busy) return;
    if (!confirm('Открыть проект из аккаунта? Текущий несохранённый макет заменится.')) return;
    state.busy = true;
    setStatus('Открываю проект…');
    render();

    try {
      const result = await api(`/api/projects/${id}`);
      const project = result.project;
      if (!project?.data || typeof project.data !== 'object' || Array.isArray(project.data)) {
        throw new Error('Проект повреждён или имеет неподдерживаемый формат.');
      }

      const bridge = window.__collageApp;
      if (typeof bridge?.openProject === 'function') {
        const opened = await bridge.openProject(project.data);
        if (opened === false || opened?.ok === false) {
          throw new Error('Редактор не смог открыть проект.');
        }
        localStorage.setItem(CURRENT_PROJECT_ID_KEY, project.id);
        localStorage.setItem(CURRENT_PROJECT_TITLE_KEY, project.title);
        setStatus('Проект открыт');
        return;
      }

      localStorage.setItem(CURRENT_STORAGE_KEY, JSON.stringify(project.data));
      localStorage.setItem(CURRENT_PROJECT_ID_KEY, project.id);
      localStorage.setItem(CURRENT_PROJECT_TITLE_KEY, project.title);
      location.reload();
    } catch (error) {
      setStatus(error.message);
    } finally {
      state.busy = false;
      render();
    }
  }
""",
    'cloud open flow',
)
cloud_path.write_text(cloud, encoding='utf-8')
