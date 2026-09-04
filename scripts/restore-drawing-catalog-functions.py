from pathlib import Path

path = Path('src/AppLive.jsx')
source = path.read_text(encoding='utf-8')

if '  async function refreshDrawingCatalog() {' in source and '  async function uploadDrawingFiles(files) {' in source:
    print('Drawing catalog helpers already present')
    raise SystemExit(0)

anchor = '  function addDrawingAsset(asset) {'
index = source.find(anchor)
if index < 0:
    raise RuntimeError('Missing addDrawingAsset anchor')

helpers = r'''  async function refreshDrawingCatalog() {
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
  }

  async function uploadDrawingFiles(files) {
    const list = [...(files || [])].filter((file) => String(file.type).toLowerCase() === 'image/png');
    if (!list.length) return show('Выбери PNG-файл.');
    setDrawingCatalogLoading(true);
    try {
      for (const file of list) await uploadDrawingCatalogAsset(file);
      setDrawingCatalog(await loadDrawingCatalog());
      show(list.length === 1 ? 'PNG добавлен в рисунки.' : `PNG добавлены: ${list.length}`);
    } catch (error) {
      show(error?.message || 'Не удалось загрузить PNG');
    } finally {
      setDrawingCatalogLoading(false);
    }
  }

'''

source = source[:index] + helpers + source[index:]
path.write_text(source, encoding='utf-8')
print('Drawing catalog helpers restored')
