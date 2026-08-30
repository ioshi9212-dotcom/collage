#!/usr/bin/env python3
from pathlib import Path
import zipfile

ROOT = Path.cwd()
ARCHIVE = ROOT / 'scripts' / 'builtin-drawings.zip'
DRAWINGS_DIR = ROOT / 'public' / 'drawings'


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)


DRAWINGS_DIR.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(ARCHIVE) as archive:
    archive.extractall(DRAWINGS_DIR)

app_path = ROOT / 'src' / 'AppLive.jsx'
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    "import { deleteDrawingCatalogAsset, loadDrawingCatalog, uploadDrawingCatalogAsset } from './editor/drawingCatalog';",
    "import { BUILTIN_DRAWING_ASSETS, deleteDrawingCatalogAsset, loadDrawingCatalog, uploadDrawingCatalogAsset } from './editor/drawingCatalog';",
    'drawing catalog import',
)

app = replace_once(
    app,
    'const [drawingCatalog, setDrawingCatalog] = useState([]);',
    'const [drawingCatalog, setDrawingCatalog] = useState(() => [...BUILTIN_DRAWING_ASSETS]);',
    'drawing catalog initial state',
)

old_refresh = """  async function refreshDrawingCatalog() {
    if (!window.__collageCloudAuth?.isAuthenticated?.()) {
      setDrawingCatalog([]);
      return;
    }
    setDrawingCatalogLoading(true);
    try {
      setDrawingCatalog(await loadDrawingCatalog());
    } catch (error) {
      if (error?.status !== 401) show(error?.message || 'Не удалось загрузить PNG-рисунки');
    } finally {
      setDrawingCatalogLoading(false);
    }
  }"""
new_refresh = """  async function refreshDrawingCatalog() {
    setDrawingCatalogLoading(true);
    try {
      setDrawingCatalog(await loadDrawingCatalog());
    } catch (error) {
      show(error?.message || 'Не удалось обновить библиотеку рисунков');
    } finally {
      setDrawingCatalogLoading(false);
    }
  }"""
app = replace_once(app, old_refresh, new_refresh, 'refresh drawing catalog')

app = replace_once(
    app,
    '          {!window.__collageCloudAuth?.isAuthenticated?.() ? <div className="empty-state small-empty"><p>Войди в аккаунт, чтобы хранить свою библиотеку PNG.</p></div> : null}',
    '          {!window.__collageCloudAuth?.isAuthenticated?.() ? <div className="empty-state small-empty"><p>Встроенные рисунки доступны всегда. Войди в аккаунт только если хочешь загружать свои PNG.</p></div> : null}',
    'drawing account hint',
)

app = replace_once(
    app,
    '                  <button className="drawing-catalog-delete" onClick={() => removeDrawingCatalogAsset(asset)} title="Удалить из каталога">×</button>',
    '                  {!asset.builtin && <button className="drawing-catalog-delete" onClick={() => removeDrawingCatalogAsset(asset)} title="Удалить из каталога">×</button>}',
    'built-in delete button',
)

app_path.write_text(app, encoding='utf-8')

ARCHIVE.unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
(ROOT / '.github' / 'workflows' / 'install-builtin-drawings.yml').unlink(missing_ok=True)

print('Installed 11 built-in drawing PNGs and editor wiring.')
