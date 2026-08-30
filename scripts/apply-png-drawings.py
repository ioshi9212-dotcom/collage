from pathlib import Path
import json


def read(path):
    return Path(path).read_text()


def write(path, content):
    Path(path).write_text(content)


def replace_once(path, old, new, label):
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match in {path}, found {count}')
    write(path, source.replace(old, new, 1))


def replace_section(path, start_anchor, end_anchor, replacement, label):
    source = read(path)
    start = source.find(start_anchor)
    if start < 0:
        raise RuntimeError(f'{label}: start anchor missing')
    end = source.find(end_anchor, start)
    if end < 0:
        raise RuntimeError(f'{label}: end anchor missing')
    write(path, source[:start] + replacement + source[end:])


write('src/editor/drawingColorization.js', r'''function parseHexColor(value) {
  const text = String(value || '').trim();
  const short = text.match(/^#([0-9a-f]{3})$/i);
  if (short) return short[1].split('').map((char) => Number.parseInt(char + char, 16));
  const full = text.match(/^#([0-9a-f]{6})$/i);
  if (!full) return [0, 0, 0];
  return [0, 2, 4].map((offset) => Number.parseInt(full[1].slice(offset, offset + 2), 16));
}

export function colorizeDrawingImage(image, color = '#000000') {
  if (!image?.naturalWidth || !image?.naturalHeight || typeof document === 'undefined') return image;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return image;
  try {
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const [red, green, blue] = parseHexColor(color);
    for (let index = 0; index < pixels.data.length; index += 4) {
      if (pixels.data[index + 3] === 0) continue;
      pixels.data[index] = red;
      pixels.data[index + 1] = green;
      pixels.data[index + 2] = blue;
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  } catch {
    return image;
  }
}

export { parseHexColor };
''')

write('src/editor/DrawingImageLayer.jsx', r'''import React, { useEffect, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Transformer } from 'react-konva';
import { colorizeDrawingImage } from './drawingColorization';

export default function DrawingImageLayer({ item, selected = false, editable = false, onSelect = () => {}, onChange = () => {} }) {
  const groupRef = useRef(null);
  const transformerRef = useRef(null);
  const [image, setImage] = useState(null);
  const width = Math.max(20, Number(item?.width) || 240);
  const height = Math.max(20, Number(item?.height) || 240);

  useEffect(() => {
    let cancelled = false;
    const source = new Image();
    source.decoding = 'async';
    source.onload = () => {
      if (!cancelled) setImage(colorizeDrawingImage(source, item?.color || '#000000'));
    };
    source.onerror = () => { if (!cancelled) setImage(null); };
    source.src = String(item?.src || '');
    return () => { cancelled = true; };
  }, [item?.src, item?.color]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const group = groupRef.current;
    if (!transformer) return;
    transformer.nodes(selected && editable && group ? [group] : []);
    transformer.getLayer()?.batchDraw();
  }, [selected, editable, image, width, height]);

  if (!item?.src) return null;

  return (
    <>
      <Group
        ref={groupRef}
        x={Number(item.x) || 0}
        y={Number(item.y) || 0}
        rotation={Number(item.rotation) || 0}
        draggable={editable}
        onClick={(event) => { event.cancelBubble = true; onSelect(item.id); }}
        onTap={(event) => { event.cancelBubble = true; onSelect(item.id); }}
        onDragEnd={(event) => onChange(item.id, { x: event.target.x(), y: event.target.y() })}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          const scaleX = Math.max(0.05, Math.abs(node.scaleX()));
          const scaleY = Math.max(0.05, Math.abs(node.scaleY()));
          node.scaleX(1);
          node.scaleY(1);
          onChange(item.id, {
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            width: Math.max(20, width * scaleX),
            height: Math.max(20, height * scaleY),
          });
        }}
      >
        <KonvaImage
          image={image}
          x={0}
          y={0}
          width={width}
          height={height}
          offsetX={width / 2}
          offsetY={height / 2}
          scaleX={item.flipX ? -1 : 1}
          scaleY={item.flipY ? -1 : 1}
          opacity={Math.max(0, Math.min(1, Number(item.opacity ?? 1)))}
          listening={editable}
        />
      </Group>
      {editable && selected ? (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          keepRatio
          flipEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20 ? oldBox : newBox)}
        />
      ) : null}
    </>
  );
}
''')

write('src/editor/drawingCatalog.js', r'''function apiError(response, payload, fallback) {
  const error = new Error(payload?.message || payload?.error || fallback);
  error.status = response.status;
  return error;
}

export function normalizeDrawingCatalogAsset(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    id: String(source.id || ''),
    name: String(source.name || 'PNG-рисунок'),
    cloudKey: String(source.cloudKey || source.key || ''),
    src: String(source.src || ''),
    width: Math.max(1, Number(source.width) || 1),
    height: Math.max(1, Number(source.height) || 1),
  };
}

export async function loadDrawingCatalog(fetchImpl = fetch) {
  const response = await fetchImpl('/api/drawing-assets', { credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(response, payload, 'Не удалось загрузить рисунки');
  return (Array.isArray(payload.assets) ? payload.assets : []).map(normalizeDrawingCatalogAsset);
}

function imageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const result = { width: image.naturalWidth || image.width || 1, height: image.naturalHeight || image.height || 1 };
      URL.revokeObjectURL(url);
      resolve(result);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать PNG')); };
    image.src = url;
  });
}

export async function uploadDrawingCatalogAsset(file, fetchImpl = fetch) {
  if (!(file instanceof Blob) || String(file.type).toLowerCase() !== 'image/png') throw new Error('Для рисунков нужен PNG-файл');
  const dimensions = await imageDimensions(file);
  const upload = await fetchImpl('/api/photo-assets/upload?name=' + encodeURIComponent(file.name || 'Рисунок.png'), {
    method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'image/png' }, body: file,
  });
  const uploadedPayload = await upload.json().catch(() => ({}));
  if (!upload.ok || !uploadedPayload.asset?.cloudKey) throw apiError(upload, uploadedPayload, 'Не удалось загрузить PNG');
  const cloudAsset = uploadedPayload.asset;
  const registration = await fetchImpl('/api/drawing-assets', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cloudKey: cloudAsset.cloudKey, name: file.name || cloudAsset.name, width: dimensions.width, height: dimensions.height }),
  });
  const registeredPayload = await registration.json().catch(() => ({}));
  if (!registration.ok) {
    await fetchImpl('/api/photo-assets/file?key=' + encodeURIComponent(cloudAsset.cloudKey), { method: 'DELETE', credentials: 'include' }).catch(() => {});
    throw apiError(registration, registeredPayload, 'Не удалось добавить PNG в каталог');
  }
  return normalizeDrawingCatalogAsset(registeredPayload.asset);
}

export async function deleteDrawingCatalogAsset(id, fetchImpl = fetch) {
  const response = await fetchImpl('/api/drawing-assets/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(response, payload, 'Не удалось удалить рисунок');
  return payload;
}
''')

write('server/drawingCatalog.js', r'''export function normalizeDrawingCatalogKey(userId, value) {
  const key = String(value || '').replace(/^\/+/, '');
  const prefix = 'users/' + Number(userId) + '/photos/';
  return key.startsWith(prefix) && !key.includes('..') ? key : '';
}

export function normalizeDrawingCatalogDimensions(width, height) {
  return {
    width: Math.max(1, Math.min(20_000, Math.round(Number(width) || 1))),
    height: Math.max(1, Math.min(20_000, Math.round(Number(height) || 1))),
  };
}

export function drawingCatalogAsset(row) {
  if (!row) return null;
  const key = String(row.object_key || row.cloudKey || '');
  return {
    id: String(row.id || ''),
    name: String(row.name || 'PNG-рисунок'),
    cloudKey: key,
    src: '/api/photo-assets/file?key=' + encodeURIComponent(key),
    width: Math.max(1, Number(row.width_px ?? row.width) || 1),
    height: Math.max(1, Number(row.height_px ?? row.height) || 1),
    createdAt: row.created_at || row.createdAt || null,
  };
}
''')

replace_once('src/editor/extraLayers.js', r'''function sanitizeDrawingLayer(item, usedIds, idFactory) {
  const source = objectValue(item);
  if (!source || source.type !== 'line') return null;
  return {
    id: uniqueLayerId(source.id, usedIds, idFactory),
    type: 'line',
    x: cleanNumber(source.x, 0, -10_000, 10_000),
    y: cleanNumber(source.y, 0, -10_000, 10_000),
    length: cleanNumber(source.length, 300, 1, 10_000),
    angle: cleanNumber(source.angle, 0, -3_600, 3_600),
    strokeWidth: cleanNumber(source.strokeWidth, 4, 1, 500),
    color: cleanString(source.color, '#6f6862', MAX_COLOR_LENGTH),
    opacity: cleanNumber(source.opacity, 1, 0, 1),
  };
}''', r'''function sanitizeDrawingLayer(item, usedIds, idFactory) {
  const source = objectValue(item);
  if (!source) return null;
  if (source.type === 'image') {
    return {
      id: uniqueLayerId(source.id, usedIds, idFactory),
      type: 'image',
      assetId: cleanString(source.assetId, '', MAX_LAYER_ID_LENGTH),
      name: cleanString(source.name, 'PNG-рисунок', 500),
      cloudKey: cleanString(source.cloudKey, '', 2_000),
      src: cleanString(source.src, '', 4_000),
      x: cleanNumber(source.x, 0, -10_000, 10_000),
      y: cleanNumber(source.y, 0, -10_000, 10_000),
      width: cleanNumber(source.width, 300, 20, 10_000),
      height: cleanNumber(source.height, 300, 20, 10_000),
      rotation: cleanNumber(source.rotation, 0, -3_600, 3_600),
      flipX: source.flipX === true,
      flipY: source.flipY === true,
      color: cleanString(source.color, '#000000', MAX_COLOR_LENGTH),
      opacity: cleanNumber(source.opacity, 1, 0, 1),
    };
  }
  if (source.type !== 'line') return null;
  return {
    id: uniqueLayerId(source.id, usedIds, idFactory),
    type: 'line',
    x: cleanNumber(source.x, 0, -10_000, 10_000),
    y: cleanNumber(source.y, 0, -10_000, 10_000),
    length: cleanNumber(source.length, 300, 1, 10_000),
    angle: cleanNumber(source.angle, 0, -3_600, 3_600),
    strokeWidth: cleanNumber(source.strokeWidth, 4, 1, 500),
    color: cleanString(source.color, '#6f6862', MAX_COLOR_LENGTH),
    opacity: cleanNumber(source.opacity, 1, 0, 1),
  };
}''', 'image drawing sanitizer')

replace_once('src/AppLive.jsx', "import CollagePresetPicker from './editor/CollagePresetPicker';\n", "import CollagePresetPicker from './editor/CollagePresetPicker';\nimport DrawingImageLayer from './editor/DrawingImageLayer';\nimport { deleteDrawingCatalogAsset, loadDrawingCatalog, uploadDrawingCatalogAsset } from './editor/drawingCatalog';\n", 'drawing imports')

replace_once('src/AppLive.jsx', "      {drawings.map((item) => {\n        if (item?.type !== 'line') return null;\n", r'''      {drawings.map((item) => {
        if (item?.type === 'image') {
          return (
            <DrawingImageLayer
              key={item.id ?? `${pageIndex}-image-${item.x}-${item.y}`}
              item={item}
              selected={item.id === selectedDrawingId}
              editable={canEditDrawings}
              onSelect={onSelectDrawing}
              onChange={onDrawingDragEnd}
            />
          );
        }
        if (item?.type !== 'line') return null;
''', 'drawing renderer')

replace_once('src/AppLive.jsx', "  const [selectedDrawingId, setSelectedDrawingId] = useState(null);\n", "  const [selectedDrawingId, setSelectedDrawingId] = useState(null);\n  const [drawingCatalog, setDrawingCatalog] = useState([]);\n  const [drawingCatalogLoading, setDrawingCatalogLoading] = useState(false);\n", 'catalog state')

replace_once('src/AppLive.jsx', "    if (next !== 'drawings') setSelectedDrawingId(null);\n", "    if (next !== 'drawings') setSelectedDrawingId(null);\n    if (next === 'drawings') refreshDrawingCatalog();\n", 'refresh on drawing mode')

replace_once('src/AppLive.jsx', "  function updateDrawing(id, patch) {\n", r'''  async function refreshDrawingCatalog() {
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

  function addDrawingAsset(asset) {
    if (!asset?.src) return;
    const sourceWidth = Math.max(1, Number(asset.width) || 300);
    const sourceHeight = Math.max(1, Number(asset.height) || 300);
    const maxSize = Math.min(460, canvas.width * 0.38, canvas.height * 0.38);
    const scale = Math.min(1, maxSize / sourceWidth, maxSize / sourceHeight);
    const item = {
      id: makeId(), type: 'image', assetId: asset.id, name: asset.name || 'PNG-рисунок',
      cloudKey: asset.cloudKey || '', src: asset.src,
      x: Math.round(canvas.width / 2), y: Math.round(canvas.height / 2),
      width: Math.max(40, Math.round(sourceWidth * scale)), height: Math.max(40, Math.round(sourceHeight * scale)),
      rotation: 0, flipX: false, flipY: false, color: '#000000', opacity: 1,
    };
    updateExtraLayers((layers) => {
      const { next, page } = createPageLayerDraft(layers, activePageNumber());
      page.drawings.push(item);
      return next;
    });
    setSelectedTextId(null);
    setSelectedDrawingId(item.id);
    setInspectorTab('object');
    show('PNG добавлен на страницу.');
  }

  async function removeDrawingCatalogAsset(asset) {
    if (!asset?.id || !confirm(`Удалить «${asset.name || 'рисунок'}» из каталога? Уже вставленные в альбом копии останутся.`)) return;
    try {
      await deleteDrawingCatalogAsset(asset.id);
      setDrawingCatalog((current) => current.filter((item) => item.id !== asset.id));
      show('Рисунок удалён из каталога.');
    } catch (error) {
      show(error?.message || 'Не удалось удалить рисунок');
    }
  }

  function updateDrawing(id, patch) {
''', 'drawing catalog actions')

left_start = "    if (albumMode === 'drawings') {\n      return (\n        <>\n          <div className=\"panel-title compact\"><div><h2>Рисунки</h2>"
left_end = "    if (albumMode === 'templates') {"
left_replacement = r'''    if (albumMode === 'drawings') {
      return (
        <>
          <div className="panel-title compact"><div><h2>Рисунки</h2><p>PNG-декор и линии. Категории добавим позже.</p></div><span>{currentDrawings.length}</span></div>
          <div className="drawing-catalog-actions">
            <label className="button full accent drawing-upload-button">
              {drawingCatalogLoading ? 'Загружаю…' : '+ Загрузить PNG'}
              <input type="file" accept="image/png" multiple disabled={drawingCatalogLoading} onChange={(event) => { const files = event.target.files; event.target.value = ''; uploadDrawingFiles(files); }} />
            </label>
            <button className="button full" disabled={drawingCatalogLoading} onClick={refreshDrawingCatalog}>Обновить рисунки</button>
          </div>
          {!window.__collageCloudAuth?.isAuthenticated?.() ? <div className="empty-state small-empty"><p>Войди в аккаунт, чтобы хранить свою библиотеку PNG.</p></div> : null}
          {drawingCatalog.length ? (
            <div className="drawing-catalog-grid">
              {drawingCatalog.map((asset) => (
                <div className="drawing-catalog-card" key={asset.id}>
                  <button className="drawing-catalog-preview" onClick={() => addDrawingAsset(asset)} title={asset.name}>
                    <img src={asset.src} alt="" />
                    <span>{asset.name}</span>
                  </button>
                  <button className="drawing-catalog-delete" onClick={() => removeDrawingCatalogAsset(asset)} title="Удалить из каталога">×</button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="panel-subtitle-v3">Линии</div>
          <div className="insert-tool-grid-v3">
            <button className="button full accent" onClick={() => addLine(0)}>+ Горизонтальная линия</button>
            <button className="button full" onClick={() => addLine(90)}>+ Вертикальная линия</button>
          </div>
          {currentDrawings.length === 0 ? <div className="empty-state small-empty"><p>Рисунков на этой странице пока нет.</p></div> : (
            <div className="layer-list">
              {currentDrawings.map((item, index) => (
                <button key={item.id} className={`layer-card line-layer-card ${item.id === selectedDrawingId ? 'active' : ''}`} onClick={() => { setSelectedDrawingId(item.id); setSelectedTextId(null); }}>
                  {item.type === 'image' ? <img className="drawing-layer-thumb" src={item.src} alt="" /> : <i style={{ background: item.color || '#6f6862' }} />}
                  <strong>{item.type === 'image' ? (item.name || `PNG ${index + 1}`) : `Линия ${index + 1}`}</strong>
                  <small>{item.type === 'image' ? `${Math.round(Number(item.width) || 0)} × ${Math.round(Number(item.height) || 0)} px` : `${Math.round(Number(item.strokeWidth) || 4)} px · ${Math.round(Number(item.length) || 300)} px`}</small>
                </button>
              ))}
            </div>
          )}
        </>
      );
    }
'''
replace_section('src/AppLive.jsx', left_start, left_end, left_replacement, 'drawings left panel')

inspector_start = "    if (albumMode === 'drawings') {\n      return (\n        <>\n          <div className=\"panel-title compact\"><div><h2>Настройки линии</h2>"
inspector_end = "    if (albumMode === 'templates') {"
inspector_replacement = r'''    if (albumMode === 'drawings') {
      const imageDrawing = selectedDrawing?.type === 'image';
      return (
        <>
          <div className="panel-title compact"><div><h2>{imageDrawing ? 'Настройки PNG' : 'Настройки линии'}</h2><p>{selectedDrawing ? (imageDrawing ? 'Размер, поворот, отражение, цвет и прозрачность.' : 'Длина, угол, толщина и цвет.') : 'Выбери рисунок или добавь новый.'}</p></div><span>{selectedDrawing ? 'выбран' : 'нет'}</span></div>
          {!selectedDrawing ? <div className="empty-state small-empty"><p>Фото-окна в этом режиме только видны.</p></div> : imageDrawing ? (
            <>
              <div className="inspector-block"><h3>Внешний вид</h3>
                <label className="field"><span>Цвет</span><input type="color" value={selectedDrawing.color || '#000000'} onChange={(event) => updateDrawing(selectedDrawing.id, { color: event.target.value })} /></label>
                <label className="field"><span>Прозрачность</span><SoftNumberInput min={0} max={1} step={0.05} value={Number(selectedDrawing.opacity ?? 1)} onValue={(value) => updateDrawing(selectedDrawing.id, { opacity: value })} /></label>
              </div>
              <div className="inspector-block"><h3>Размер и угол</h3><div className="geometry-grid">
                <label className="field"><span>Ширина</span><SoftNumberInput min={20} max={10000} value={Math.round(Number(selectedDrawing.width) || 300)} onValue={(value) => updateDrawing(selectedDrawing.id, { width: value })} /></label>
                <label className="field"><span>Высота</span><SoftNumberInput min={20} max={10000} value={Math.round(Number(selectedDrawing.height) || 300)} onValue={(value) => updateDrawing(selectedDrawing.id, { height: value })} /></label>
                <label className="field"><span>Поворот</span><SoftNumberInput min={-360} max={360} value={Math.round(Number(selectedDrawing.rotation) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { rotation: value })} /></label>
              </div></div>
              <div className="inspector-block"><h3>Отражение</h3><div className="inspector-actions-grid">
                <button className={`button ${selectedDrawing.flipX ? 'accent' : ''}`} onClick={() => updateDrawing(selectedDrawing.id, { flipX: !selectedDrawing.flipX })}>↔ По горизонтали</button>
                <button className={`button ${selectedDrawing.flipY ? 'accent' : ''}`} onClick={() => updateDrawing(selectedDrawing.id, { flipY: !selectedDrawing.flipY })}>↕ По вертикали</button>
              </div></div>
              <button className="button full danger-button" onClick={() => deleteDrawing(selectedDrawing.id)}>Удалить PNG со страницы</button>
            </>
          ) : (
            <>
              <div className="inspector-block"><h3>Линия</h3>
                <label className="field"><span>Цвет</span><input type="color" value={selectedDrawing.color || '#6f6862'} onChange={(event) => updateDrawing(selectedDrawing.id, { color: event.target.value })} /></label>
                <label className="field"><span>Толщина</span><SoftNumberInput min={1} max={120} value={Math.round(Number(selectedDrawing.strokeWidth) || 4)} onValue={(value) => updateDrawing(selectedDrawing.id, { strokeWidth: value })} /></label>
                <label className="field"><span>Прозрачность</span><SoftNumberInput min={0.05} max={1} step={0.05} value={Number(selectedDrawing.opacity ?? 1)} onValue={(value) => updateDrawing(selectedDrawing.id, { opacity: value })} /></label>
              </div>
              <div className="inspector-block"><h3>Положение</h3><div className="geometry-grid">
                <label className="field"><span>X</span><SoftNumberInput value={Math.round(Number(selectedDrawing.x) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { x: value })} /></label>
                <label className="field"><span>Y</span><SoftNumberInput value={Math.round(Number(selectedDrawing.y) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { y: value })} /></label>
                <label className="field"><span>Длина</span><SoftNumberInput min={1} max={5000} value={Math.round(Number(selectedDrawing.length) || 300)} onValue={(value) => updateDrawing(selectedDrawing.id, { length: value })} /></label>
                <label className="field"><span>Угол</span><SoftNumberInput min={-180} max={180} value={Math.round(Number(selectedDrawing.angle) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { angle: value })} /></label>
              </div></div>
              <button className="button full danger-button" onClick={() => deleteDrawing(selectedDrawing.id)}>Удалить линию</button>
            </>
          )}
        </>
      );
    }
'''
replace_section('src/AppLive.jsx', inspector_start, inspector_end, inspector_replacement, 'drawings inspector')

replace_once('server.js', "import { handleSafeProjectVersionApi } from './server/safeProjectVersions.js';\n", "import { handleSafeProjectVersionApi } from './server/safeProjectVersions.js';\nimport { drawingCatalogAsset, normalizeDrawingCatalogDimensions, normalizeDrawingCatalogKey } from './server/drawingCatalog.js';\n", 'server import')

replace_once('server.js', "      CREATE INDEX IF NOT EXISTS photo_assets_user_status_idx\n        ON photo_assets(user_id, status, updated_at DESC);\n", r'''      CREATE INDEX IF NOT EXISTS photo_assets_user_status_idx
        ON photo_assets(user_id, status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS drawing_assets (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        object_key TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT 'PNG-рисунок',
        width_px INTEGER NOT NULL DEFAULT 1,
        height_px INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, object_key)
      );

      CREATE INDEX IF NOT EXISTS drawing_assets_user_created_idx
        ON drawing_assets(user_id, created_at DESC);
''', 'drawing table')

replace_once('server.js', "  const publicPhotoMatch = path.match(/^\\/api\\/public-albums\\/([^/]+)\\/photos\\/([^/]+)$/);\n", r'''  if (method === 'GET' && path === '/api/drawing-assets') {
    const user = await requireUser(request, response);
    if (!user) return true;
    const result = await pool.query(
      'SELECT id, name, object_key, width_px, height_px, created_at FROM drawing_assets WHERE user_id = $1 ORDER BY created_at DESC',
      [user.id],
    );
    sendJson(response, 200, { assets: result.rows.map(drawingCatalogAsset) });
    return true;
  }

  if (method === 'POST' && path === '/api/drawing-assets') {
    const user = await requireUser(request, response);
    if (!user) return true;
    const body = await readBody(request, authJsonLimitBytes);
    const key = normalizeDrawingCatalogKey(user.id, body.cloudKey);
    if (!key) {
      sendJson(response, 403, { error: 'drawing_asset_access_denied', message: 'Нет доступа к этому PNG' });
      return true;
    }
    const owned = await pool.query(
      `SELECT object_key, name, content_type FROM photo_assets
        WHERE user_id = $1 AND object_key = $2 AND status = 'ready'`,
      [user.id, key],
    );
    if (!owned.rows[0]) {
      sendJson(response, 404, { error: 'drawing_asset_not_found', message: 'PNG не найден в облачном хранилище' });
      return true;
    }
    if (String(owned.rows[0].content_type).toLowerCase() !== 'image/png') {
      sendJson(response, 415, { error: 'drawing_asset_png_required', message: 'Для рисунков поддерживается только PNG' });
      return true;
    }
    const dimensions = normalizeDrawingCatalogDimensions(body.width, body.height);
    const name = String(body.name || owned.rows[0].name || 'PNG-рисунок').slice(0, 500);
    const id = randomUUID();
    const created = await pool.query(
      `INSERT INTO drawing_assets(id, user_id, object_key, name, width_px, height_px)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, object_key) DO UPDATE
         SET name = EXCLUDED.name, width_px = EXCLUDED.width_px, height_px = EXCLUDED.height_px, updated_at = NOW()
       RETURNING id, name, object_key, width_px, height_px, created_at`,
      [id, user.id, key, name, dimensions.width, dimensions.height],
    );
    sendJson(response, 200, { asset: drawingCatalogAsset(created.rows[0]) });
    return true;
  }

  const drawingAssetMatch = path.match(/^\/api\/drawing-assets\/([^/]+)$/);
  if (method === 'DELETE' && drawingAssetMatch) {
    const user = await requireUser(request, response);
    if (!user) return true;
    const id = decodeURIComponent(drawingAssetMatch[1]);
    const deleted = await pool.query(
      'DELETE FROM drawing_assets WHERE id = $1 AND user_id = $2 RETURNING object_key',
      [id, user.id],
    );
    if (!deleted.rows[0]) {
      sendJson(response, 404, { error: 'drawing_asset_not_found', message: 'Рисунок уже удалён' });
      return true;
    }
    const cleanup = await photoAssetGateway.cleanupUnreferenced({ userId: user.id, keys: [deleted.rows[0].object_key] });
    sendJson(response, 200, { ok: true, fileDeleted: cleanup.deleted > 0 });
    return true;
  }

  const publicPhotoMatch = path.match(/^\/api\/public-albums\/([^/]+)\/photos\/([^/]+)$/);
''', 'drawing routes')

with Path('src/editor-shell-v2.css').open('a') as stream:
    stream.write(r'''
/* PNG drawing catalog */
.drawing-upload-button{position:relative;overflow:hidden;cursor:pointer}.drawing-upload-button input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.drawing-catalog-actions{display:grid;gap:8px;margin-bottom:12px}.drawing-catalog-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0 16px}.drawing-catalog-card{position:relative;min-width:0}.drawing-catalog-preview{width:100%;min-height:88px;border:1px solid var(--border,#d8d8d8);border-radius:10px;background:#fff;padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;overflow:hidden}.drawing-catalog-preview img{width:100%;height:62px;object-fit:contain}.drawing-catalog-preview span{display:block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.drawing-catalog-delete{position:absolute;right:4px;top:4px;width:22px;height:22px;border:0;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(0,0,0,.18);cursor:pointer;font-size:16px;line-height:20px}.drawing-layer-thumb{width:34px;height:34px;object-fit:contain;flex:0 0 auto}.panel-subtitle-v3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;opacity:.58;margin:12px 0 8px}.inspector-actions-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media(max-width:720px){.drawing-catalog-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.drawing-catalog-preview{min-height:74px;padding:6px}.drawing-catalog-preview img{height:50px}}
''')

write('server/drawingCatalog.test.mjs', r'''import assert from 'node:assert/strict';
import { drawingCatalogAsset, normalizeDrawingCatalogDimensions, normalizeDrawingCatalogKey } from './drawingCatalog.js';
assert.equal(normalizeDrawingCatalogKey(7, '/users/7/photos/a/original.png'), 'users/7/photos/a/original.png');
assert.equal(normalizeDrawingCatalogKey(7, 'users/8/photos/a/original.png'), '');
assert.equal(normalizeDrawingCatalogKey(7, 'users/7/photos/../secret.png'), '');
assert.deepEqual(normalizeDrawingCatalogDimensions(400.4, 900.6), { width: 400, height: 901 });
assert.deepEqual(drawingCatalogAsset({ id: 'x', object_key: 'users/7/photos/a/original.png', name: 'Ветка', width_px: 100, height_px: 50 }), { id: 'x', name: 'Ветка', cloudKey: 'users/7/photos/a/original.png', src: '/api/photo-assets/file?key=users%2F7%2Fphotos%2Fa%2Foriginal.png', width: 100, height: 50, createdAt: null });
console.log('drawing catalog server checks passed');
''')

write('src/editor/extraLayers.image.test.mjs', r'''import assert from 'node:assert/strict';
import { cloneExtraLayerPage, sanitizeExtraLayers } from './extraLayers.js';
const layers = sanitizeExtraLayers({ pages: { 1: { drawings: [{ id: 'png', type: 'image', assetId: 'asset', name: 'Ветка', cloudKey: 'users/1/photos/a/original.png', src: '/api/photo-assets/file?key=x', x: 200, y: 300, width: 420, height: 180, rotation: 17, flipX: true, flipY: false, color: '#aa8877', opacity: 0.42 }] } } }, { idFactory: () => 'fresh' });
const item = layers.pages[1].drawings[0];
assert.equal(item.type, 'image');
assert.equal(item.assetId, 'asset');
assert.equal(item.width, 420);
assert.equal(item.rotation, 17);
assert.equal(item.flipX, true);
assert.equal(item.color, '#aa8877');
assert.equal(item.opacity, 0.42);
let n = 0;
const cloned = cloneExtraLayerPage(layers.pages[1], () => 'clone-' + ++n);
assert.equal(cloned.drawings[0].id, 'clone-1');
assert.equal(cloned.drawings[0].cloudKey, item.cloudKey);
console.log('PNG drawing extra-layer checks passed');
''')

write('src/editor/drawingColorization.test.mjs', r'''import assert from 'node:assert/strict';
import { parseHexColor } from './drawingColorization.js';
assert.deepEqual(parseHexColor('#abc'), [170,187,204]);
assert.deepEqual(parseHexColor('#102030'), [16,32,48]);
assert.deepEqual(parseHexColor('broken'), [0,0,0]);
console.log('drawing colorization checks passed');
''')

write('e2e/png-drawings.spec.js', r'''import { test, expect } from '@playwright/test';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDEAAUADikBAf3aW9sAAAAASUVORK5CYII=';
test('PNG catalog inserts a transformable drawing', async ({ page }) => {
  await page.route('**/api/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 1, email: 'test@example.com' } }) }));
  await page.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) }));
  await page.route('**/api/drawing-assets', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assets: [{ id: 'branch', name: 'Ветка', cloudKey: 'users/1/photos/a/original.png', src: png, width: 200, height: 80 }] }) });
    return route.continue();
  });
  await page.goto('/');
  await page.getByText('Рисунки', { exact: true }).first().click();
  await expect(page.getByText('Ветка', { exact: true })).toBeVisible();
  await page.getByText('Ветка', { exact: true }).click();
  await expect(page.getByText('Настройки PNG', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '↔ По горизонтали' })).toBeVisible();
  await expect(page.getByRole('button', { name: '↕ По вертикали' })).toBeVisible();
});
''')

pkg_path = Path('package.json')
pkg = json.loads(pkg_path.read_text())
pkg['scripts']['test'] = pkg['scripts']['test'].replace('node server/publicAlbumModel.test.mjs &&', 'node server/publicAlbumModel.test.mjs && node server/drawingCatalog.test.mjs &&').replace('node src/editor/extraLayers.test.mjs &&', 'node src/editor/extraLayers.test.mjs && node src/editor/extraLayers.image.test.mjs && node src/editor/drawingColorization.test.mjs &&')
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')

print('PNG drawings implementation applied')
