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
"""  reorderExtraLayerPages,
  textLayersForPage,
} from './editor/extraLayers';
""",
"""  reorderExtraLayerPages,
  sanitizeExtraLayers,
  textLayersForPage,
} from './editor/extraLayers';
import {
  MAX_TEMPLATE_RECORDS,
  sanitizeTemplateRecord,
  sanitizeTemplateRecords,
  templateJsonFileError,
} from './editor/templateRecords';
""",
'extra layer and template imports')

app = replace_once(app,
"""      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
""",
"""      const parsed = raw ? JSON.parse(raw) : [];
      return sanitizeTemplateRecords(parsed);
""",
'template storage startup sanitization')

app = replace_once(app,
"""      extraLayers: normalizeExtraLayers(extraLayers),
""",
"""      extraLayers: sanitizeExtraLayers(extraLayers),
""",
'project layer sanitization')

app = replace_once(app,
"""      normalizeBookletPrintSettings,
      normalizeExtraLayers,
""",
"""      normalizeBookletPrintSettings,
      normalizeExtraLayers: sanitizeExtraLayers,
""",
'project load layer sanitization')

app = replace_once(app,
"""  function movePage(direction) {
    setAlbum((current) => {
      const index = current.pages.findIndex((page) => page.id === current.currentPageId);
      const target = direction === 'left' ? index - 1 : index + 1;
      if (target < 0 || target >= current.pages.length) return current;
      const next = [...current.pages];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, pages: next };
    });
    setMoveFrameWithPhotoId(null);
  }


""",
""",
'remove unused page mover')

app = replace_once(app,
"""  }, [canvas, settings, library, pages, album.currentPageId, viewMode, bookletSheetsPerBlock, normalizedBookletPrintSettings, albumMode, extraLayers]);
""",
"""  });
""",
'bridge effect dependency cleanup')

app = replace_once(app,
"""  const visibleLayerPageNumbers = entries
    .map((entry) => entry.pageIndex + 1)
    .filter((number) => Number.isFinite(number) && number > 0);
""",
""",
'remove unused visible layer page list')

app = replace_once(app,
"""    const record = {
      version: 2,
      id: makeId(),
      title,
      scope,
      pageCount: sourceIndexes.length,
      canvas: cloneDeep(canvas),
      settings: cloneDeep(settings),
      pages: sourceIndexes.map((sourceIndex, index) => {
        const page = cloneDeep(pages[sourceIndex]);
        return {
          ...page,
          id: makeId(),
          title: `Страница ${index + 1}`,
          frames: Array.isArray(page?.frames) ? page.frames.map((frame) => ({ ...frame, photo: null })) : [],
        };
      }),
      extraLayers: { version: 1, pages: layerPages },
      createdAt: new Date().toISOString(),
    };
    setTemplateRecords((current) => [record, ...current]);
""",
"""    const record = sanitizeTemplateRecord({
      version: 2,
      id: makeId(),
      title,
      scope,
      pageCount: sourceIndexes.length,
      canvas: cloneDeep(canvas),
      settings: cloneDeep(settings),
      pages: sourceIndexes.map((sourceIndex, index) => {
        const page = cloneDeep(pages[sourceIndex]);
        return {
          ...page,
          id: makeId(),
          title: `Страница ${index + 1}`,
          frames: Array.isArray(page?.frames) ? page.frames.map((frame) => ({ ...frame, photo: null })) : [],
        };
      }),
      extraLayers: { version: 1, pages: layerPages },
      createdAt: new Date().toISOString(),
    });
    if (!record) return show('Не удалось подготовить шаблон');
    setTemplateRecords((current) => [record, ...current].slice(0, MAX_TEMPLATE_RECORDS));
""",
'saved template sanitization')

app = replace_once(app,
"""  function importTemplateJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const records = (Array.isArray(data) ? data : [data]).filter((item) => item && Array.isArray(item.pages));
        if (!records.length) throw new Error('empty templates');
        const cleaned = records.map((record) => ({ ...record, id: record.id || makeId(), createdAt: record.createdAt || new Date().toISOString() }));
        setTemplateRecords((current) => [...cleaned, ...current]);
        setSelectedTemplateId(cleaned[0].id);
        show(`Импортировано шаблонов: ${cleaned.length}`);
      } catch {
        show('Файл не похож на шаблон');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }
""",
"""  function importTemplateJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fileError = templateJsonFileError(file);
    if (fileError) return show(fileError);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const cleaned = sanitizeTemplateRecords(data);
        if (!cleaned.length) throw new Error('empty templates');
        setTemplateRecords((current) => sanitizeTemplateRecords([...cleaned, ...current]));
        setSelectedTemplateId(cleaned[0].id);
        show(`Импортировано шаблонов: ${cleaned.length}`);
      } catch (error) {
        console.warn('Template import failed', error);
        show('Файл не похож на шаблон');
      }
    };
    reader.onerror = () => show('Не удалось прочитать шаблон');
    reader.readAsText(file);
  }
""",
'atomic template import')

app_path.write_text(app, encoding='utf-8')


test_path = Path('src/editor/extraLayers.test.mjs')
test = test_path.read_text(encoding='utf-8')
test = replace_once(test,
"""  const bridge = { version: 1, pages: { 2: { drawings: [{ id: 'bridge' }] } } };
  const storage = new FakeStorage({ [ALBUM_LAYERS_KEY]: JSON.stringify(local) });
  assert.deepEqual(readExtraLayers({ storage, bridge: { getLayers: () => bridge } }), bridge, 'non-empty bridge layers must win');
  assert.deepEqual(readExtraLayers({ storage, bridge: { getLayers: () => ({ pages: {} }) } }), local, 'non-empty local layers must survive an empty bridge');
  assert.deepEqual(readExtraLayers({ storage: new FakeStorage({ [ALBUM_LAYERS_KEY]: '{broken' }), bridge: { getLayers: () => null } }), { version: 1, pages: {} });
  assert.deepEqual(readExtraLayers({ storage, bridge: { getLayers() { throw new Error('bridge failed'); } } }), local);
""",
"""  const bridge = { version: 1, pages: { 2: { drawings: [{ id: 'bridge', type: 'line' }] } } };
  const storage = new FakeStorage({ [ALBUM_LAYERS_KEY]: JSON.stringify(local) });
  const bridgeResult = readExtraLayers({ storage, bridge: { getLayers: () => bridge } });
  assert.equal(bridgeResult.pages[2].drawings[0].id, 'bridge', 'non-empty bridge layers must win');
  const localResult = readExtraLayers({ storage, bridge: { getLayers: () => ({ pages: {} }) } });
  assert.equal(localResult.pages[1].texts[0].id, 'local', 'non-empty local layers must survive an empty bridge');
  assert.deepEqual(readExtraLayers({ storage: new FakeStorage({ [ALBUM_LAYERS_KEY]: '{broken' }), bridge: { getLayers: () => null } }), { version: 1, pages: {} });
  const failedBridgeResult = readExtraLayers({ storage, bridge: { getLayers() { throw new Error('bridge failed'); } } });
  assert.equal(failedBridgeResult.pages[1].texts[0].id, 'local');
""",
'extra layer bridge sanitization test')
test_path.write_text(test, encoding='utf-8')
