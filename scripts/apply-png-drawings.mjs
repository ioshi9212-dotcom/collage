import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

function read(path) { return readFileSync(path, 'utf8'); }
function write(path, value) { writeFileSync(path, value, 'utf8'); }
function replaceOnce(path, from, to, label) {
  const source = read(path);
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing ${label} in ${path}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous ${label} in ${path}`);
  write(path, source.slice(0, first) + to + source.slice(first + from.length));
}
function replaceRegex(path, regex, replacement, label) {
  const source = read(path);
  const matches = source.match(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`));
  if (!matches || matches.length !== 1) throw new Error(`Expected one ${label} in ${path}, found ${matches?.length || 0}`);
  write(path, source.replace(regex, replacement));
}

write('src/editor/drawingColorization.js', `function parseHexColor(value) {
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
`);

write('src/editor/DrawingImageLayer.jsx', `import React, { useEffect, useRef, useState } from 'react';
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
`);

write('src/editor/drawingCatalog.js', `function apiError(response, payload, fallback) {
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
`);

write('server/drawingCatalog.js', `export function normalizeDrawingCatalogKey(userId, value) {
  const key = String(value || '').replace(/^\\/+/, '');
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
`);

replaceOnce(
  'src/editor/extraLayers.js',
  `function sanitizeDrawingLayer(item, usedIds, idFactory) {\n  const source = objectValue(item);\n  if (!source || source.type !== 'line') return null;\n  return {\n    id: uniqueLayerId(source.id, usedIds, idFactory),\n    type: 'line',\n    x: cleanNumber(source.x, 0, -10_000, 10_000),\n    y: cleanNumber(source.y, 0, -10_000, 10_000),\n    length: cleanNumber(source.length, 300, 1, 10_000),\n    angle: cleanNumber(source.angle, 0, -3_600, 3_600),\n    strokeWidth: cleanNumber(source.strokeWidth, 4, 1, 500),\n    color: cleanString(source.color, '#6f6862', MAX_COLOR_LENGTH),\n    opacity: cleanNumber(source.opacity, 1, 0, 1),\n  };\n}`,
  `function sanitizeDrawingLayer(item, usedIds, idFactory) {\n  const source = objectValue(item);\n  if (!source) return null;\n  if (source.type === 'image') {\n    return {\n      id: uniqueLayerId(source.id, usedIds, idFactory),\n      type: 'image',\n      assetId: cleanString(source.assetId, '', MAX_LAYER_ID_LENGTH),\n      name: cleanString(source.name, 'PNG-рисунок', 500),\n      cloudKey: cleanString(source.cloudKey, '', 2_000),\n      src: cleanString(source.src, '', 4_000),\n      x: cleanNumber(source.x, 0, -10_000, 10_000),\n      y: cleanNumber(source.y, 0, -10_000, 10_000),\n      width: cleanNumber(source.width, 300, 20, 10_000),\n      height: cleanNumber(source.height, 300, 20, 10_000),\n      rotation: cleanNumber(source.rotation, 0, -3_600, 3_600),\n      flipX: source.flipX === true,\n      flipY: source.flipY === true,\n      color: cleanString(source.color, '#000000', MAX_COLOR_LENGTH),\n      opacity: cleanNumber(source.opacity, 1, 0, 1),\n    };\n  }\n  if (source.type !== 'line') return null;\n  return {\n    id: uniqueLayerId(source.id, usedIds, idFactory),\n    type: 'line',\n    x: cleanNumber(source.x, 0, -10_000, 10_000),\n    y: cleanNumber(source.y, 0, -10_000, 10_000),\n    length: cleanNumber(source.length, 300, 1, 10_000),\n    angle: cleanNumber(source.angle, 0, -3_600, 3_600),\n    strokeWidth: cleanNumber(source.strokeWidth, 4, 1, 500),\n    color: cleanString(source.color, '#6f6862', MAX_COLOR_LENGTH),\n    opacity: cleanNumber(source.opacity, 1, 0, 1),\n  };\n}`,
  'drawing layer sanitizer',
);

replaceOnce(
  'src/AppLive.jsx',
  `import CollagePresetPicker from './editor/CollagePresetPicker';\n`,
  `import CollagePresetPicker from './editor/CollagePresetPicker';\nimport DrawingImageLayer from './editor/DrawingImageLayer';\nimport { deleteDrawingCatalogAsset, loadDrawingCatalog, uploadDrawingCatalogAsset } from './editor/drawingCatalog';\n`,
  'drawing imports',
);

replaceOnce(
  'src/AppLive.jsx',
  `      {drawings.map((item) => {\n        if (item?.type !== 'line') return null;\n`,
  `      {drawings.map((item) => {\n        if (item?.type === 'image') {\n          return (\n            <DrawingImageLayer\n              key={item.id ?? \`${'${pageIndex}'}-image-${'${item.x}'}-${'${item.y}'}\`}\n              item={item}\n              selected={item.id === selectedDrawingId}\n              editable={canEditDrawings}\n              onSelect={onSelectDrawing}\n              onChange={onDrawingDragEnd}\n            />\n          );\n        }\n        if (item?.type !== 'line') return null;\n`,
  'image drawing render branch',
);

replaceOnce(
  'src/AppLive.jsx',
  `  const [selectedDrawingId, setSelectedDrawingId] = useState(null);\n`,
  `  const [selectedDrawingId, setSelectedDrawingId] = useState(null);\n  const [drawingCatalog, setDrawingCatalog] = useState([]);\n  const [drawingCatalogLoading, setDrawingCatalogLoading] = useState(false);\n`,
  'drawing catalog state',
);

replaceOnce(
  'src/AppLive.jsx',
  `    if (next !== 'drawings') setSelectedDrawingId(null);\n`,
  `    if (next !== 'drawings') setSelectedDrawingId(null);\n    if (next === 'drawings') refreshDrawingCatalog();\n`,
  'refresh drawings on mode switch',
);

replaceOnce(
  'src/AppLive.jsx',
  `  function updateDrawing(id, patch) {\n`,
  `  async function refreshDrawingCatalog() {\n    if (!window.__collageCloudAuth?.isAuthenticated?.()) {\n      setDrawingCatalog([]);\n      return;\n    }\n    setDrawingCatalogLoading(true);\n    try {\n      setDrawingCatalog(await loadDrawingCatalog());\n    } catch (error) {\n      if (error?.status !== 401) show(error?.message || 'Не удалось загрузить PNG-рисунки');\n    } finally {\n      setDrawingCatalogLoading(false);\n    }\n  }\n\n  async function uploadDrawingFiles(files) {\n    const list = [...(files || [])].filter((file) => String(file.type).toLowerCase() === 'image/png');\n    if (!list.length) return show('Выбери PNG-файл.');\n    setDrawingCatalogLoading(true);\n    try {\n      for (const file of list) await uploadDrawingCatalogAsset(file);\n      setDrawingCatalog(await loadDrawingCatalog());\n      show(list.length === 1 ? 'PNG добавлен в рисунки.' : \`PNG добавлены: ${'${list.length}'}\`);\n    } catch (error) {\n      show(error?.message || 'Не удалось загрузить PNG');\n    } finally {\n      setDrawingCatalogLoading(false);\n    }\n  }\n\n  function addDrawingAsset(asset) {\n    if (!asset?.src) return;\n    const sourceWidth = Math.max(1, Number(asset.width) || 300);\n    const sourceHeight = Math.max(1, Number(asset.height) || 300);\n    const maxSize = Math.min(460, canvas.width * 0.38, canvas.height * 0.38);\n    const scale = Math.min(1, maxSize / sourceWidth, maxSize / sourceHeight);\n    const item = {\n      id: makeId(), type: 'image', assetId: asset.id, name: asset.name || 'PNG-рисунок',\n      cloudKey: asset.cloudKey || '', src: asset.src,\n      x: Math.round(canvas.width / 2), y: Math.round(canvas.height / 2),\n      width: Math.max(40, Math.round(sourceWidth * scale)), height: Math.max(40, Math.round(sourceHeight * scale)),\n      rotation: 0, flipX: false, flipY: false, color: '#000000', opacity: 1,\n    };\n    updateExtraLayers((layers) => {\n      const { next, page } = createPageLayerDraft(layers, activePageNumber());\n      page.drawings.push(item);\n      return next;\n    });\n    setSelectedTextId(null);\n    setSelectedDrawingId(item.id);\n    setInspectorTab('object');\n    show('PNG добавлен на страницу.');\n  }\n\n  async function removeDrawingCatalogAsset(asset) {\n    if (!asset?.id || !confirm(\`Удалить «${'${asset.name || 'рисунок'}'}» из каталога? Уже вставленные в альбом копии останутся.\`)) return;\n    try {\n      await deleteDrawingCatalogAsset(asset.id);\n      setDrawingCatalog((current) => current.filter((item) => item.id !== asset.id));\n      show('Рисунок удалён из каталога.');\n    } catch (error) {\n      show(error?.message || 'Не удалось удалить рисунок');\n    }\n  }\n\n  function updateDrawing(id, patch) {\n`,
  'drawing catalog actions',
);

replaceRegex(
  'src/AppLive.jsx',
  /    if \(albumMode === 'drawings'\) \{\n      return \(\n        <>\n          <div className=\\"panel-title compact\\"><div><h2>Рисунки<\/h2><p>Линии и простой декор текущей страницы\.<\/p><\/div><span>\{currentDrawings\.length\}<\/span><\/div>[\s\S]*?      \);\n    \}\n    if \(albumMode === 'templates'\)/,
  `    if (albumMode === 'drawings') {\n      return (\n        <>\n          <div className=\"panel-title compact\"><div><h2>Рисунки</h2><p>PNG-декор и линии. Категории добавим позже.</p></div><span>{currentDrawings.length}</span></div>\n          <div className=\"drawing-catalog-actions\">\n            <label className=\"button full accent drawing-upload-button\">\n              {drawingCatalogLoading ? 'Загружаю…' : '+ Загрузить PNG'}\n              <input type=\"file\" accept=\"image/png\" multiple disabled={drawingCatalogLoading} onChange={(event) => { const files = event.target.files; event.target.value = ''; uploadDrawingFiles(files); }} />\n            </label>\n            <button className=\"button full\" disabled={drawingCatalogLoading} onClick={refreshDrawingCatalog}>Обновить рисунки</button>\n          </div>\n          {!window.__collageCloudAuth?.isAuthenticated?.() ? <div className=\"empty-state small-empty\"><p>Войди в аккаунт, чтобы хранить свою библиотеку PNG.</p></div> : null}\n          {drawingCatalog.length ? (\n            <div className=\"drawing-catalog-grid\">\n              {drawingCatalog.map((asset) => (\n                <div className=\"drawing-catalog-card\" key={asset.id}>\n                  <button className=\"drawing-catalog-preview\" onClick={() => addDrawingAsset(asset)} title={asset.name}>\n                    <img src={asset.src} alt=\"\" />\n                    <span>{asset.name}</span>\n                  </button>\n                  <button className=\"drawing-catalog-delete\" onClick={() => removeDrawingCatalogAsset(asset)} title=\"Удалить из каталога\">×</button>\n                </div>\n              ))}\n            </div>\n          ) : null}\n          <div className=\"panel-subtitle-v3\">Линии</div>\n          <div className=\"insert-tool-grid-v3\">\n            <button className=\"button full accent\" onClick={() => addLine(0)}>+ Горизонтальная линия</button>\n            <button className=\"button full\" onClick={() => addLine(90)}>+ Вертикальная линия</button>\n          </div>\n          {currentDrawings.length === 0 ? <div className=\"empty-state small-empty\"><p>Рисунков на этой странице пока нет.</p></div> : (\n            <div className=\"layer-list\">\n              {currentDrawings.map((item, index) => (\n                <button key={item.id} className={\`layer-card line-layer-card ${'${item.id === selectedDrawingId ? \'active\' : \'\'}'}\`} onClick={() => { setSelectedDrawingId(item.id); setSelectedTextId(null); }}>\n                  {item.type === 'image' ? <img className=\"drawing-layer-thumb\" src={item.src} alt=\"\" /> : <i style={{ background: item.color || '#6f6862' }} />}\n                  <strong>{item.type === 'image' ? (item.name || \`PNG ${'${index + 1}'}\`) : \`Линия ${'${index + 1}'}\`}</strong>\n                  <small>{item.type === 'image' ? \`${'${Math.round(Number(item.width) || 0)}'} × ${'${Math.round(Number(item.height) || 0)}'} px\` : \`${'${Math.round(Number(item.strokeWidth) || 4)}'} px · ${'${Math.round(Number(item.length) || 300)}'} px\`}</small>\n                </button>\n              ))}\n            </div>\n          )}\n        </>\n      );\n    }\n    if (albumMode === 'templates')`,
  'drawings left panel',
);

replaceRegex(
  'src/AppLive.jsx',
  /    if \(albumMode === 'drawings'\) \{\n      return \(\n        <>\n          <div className=\\"panel-title compact\\"><div><h2>Настройки линии<\/h2>[\s\S]*?      \);\n    \}\n    if \(albumMode === 'templates'\)/,
  `    if (albumMode === 'drawings') {\n      const imageDrawing = selectedDrawing?.type === 'image';\n      return (\n        <>\n          <div className=\"panel-title compact\"><div><h2>{imageDrawing ? 'Настройки PNG' : 'Настройки линии'}</h2><p>{selectedDrawing ? (imageDrawing ? 'Размер, поворот, отражение, цвет и прозрачность.' : 'Длина, угол, толщина и цвет.') : 'Выбери рисунок или добавь новый.'}</p></div><span>{selectedDrawing ? 'выбран' : 'нет'}</span></div>\n          {!selectedDrawing ? <div className=\"empty-state small-empty\"><p>Фото-окна в этом режиме только видны.</p></div> : imageDrawing ? (\n            <>\n              <div className=\"inspector-block\"><h3>Внешний вид</h3>\n                <label className=\"field\"><span>Цвет</span><input type=\"color\" value={selectedDrawing.color || '#000000'} onChange={(event) => updateDrawing(selectedDrawing.id, { color: event.target.value })} /></label>\n                <label className=\"field\"><span>Прозрачность</span><SoftNumberInput min={0} max={1} step={0.05} value={Number(selectedDrawing.opacity ?? 1)} onValue={(value) => updateDrawing(selectedDrawing.id, { opacity: value })} /></label>\n              </div>\n              <div className=\"inspector-block\"><h3>Размер и угол</h3><div className=\"geometry-grid\">\n                <label className=\"field\"><span>Ширина</span><SoftNumberInput min={20} max={10000} value={Math.round(Number(selectedDrawing.width) || 300)} onValue={(value) => updateDrawing(selectedDrawing.id, { width: value })} /></label>\n                <label className=\"field\"><span>Высота</span><SoftNumberInput min={20} max={10000} value={Math.round(Number(selectedDrawing.height) || 300)} onValue={(value) => updateDrawing(selectedDrawing.id, { height: value })} /></label>\n                <label className=\"field\"><span>Поворот</span><SoftNumberInput min={-360} max={360} value={Math.round(Number(selectedDrawing.rotation) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { rotation: value })} /></label>\n              </div></div>\n              <div className=\"inspector-block\"><h3>Отражение</h3><div className=\"inspector-actions-grid\">\n                <button className={\`button ${'${selectedDrawing.flipX ? \'accent\' : \'\'}'}\`} onClick={() => updateDrawing(selectedDrawing.id, { flipX: !selectedDrawing.flipX })}>↔ По горизонтали</button>\n                <button className={\`button ${'${selectedDrawing.flipY ? \'accent\' : \'\'}'}\`} onClick={() => updateDrawing(selectedDrawing.id, { flipY: !selectedDrawing.flipY })}>↕ По вертикали</button>\n              </div></div>\n              <button className=\"button full danger-button\" onClick={() => deleteDrawing(selectedDrawing.id)}>Удалить PNG со страницы</button>\n            </>\n          ) : (\n            <>\n              <div className=\"inspector-block\"><h3>Линия</h3>\n                <label className=\"field\"><span>Цвет</span><input type=\"color\" value={selectedDrawing.color || '#6f6862'} onChange={(event) => updateDrawing(selectedDrawing.id, { color: event.target.value })} /></label>\n                <label className=\"field\"><span>Толщина</span><SoftNumberInput min={1} max={120} value={Math.round(Number(selectedDrawing.strokeWidth) || 4)} onValue={(value) => updateDrawing(selectedDrawing.id, { strokeWidth: value })} /></label>\n                <label className=\"field\"><span>Прозрачность</span><SoftNumberInput min={0.05} max={1} step={0.05} value={Number(selectedDrawing.opacity ?? 1)} onValue={(value) => updateDrawing(selectedDrawing.id, { opacity: value })} /></label>\n              </div>\n              <div className=\"inspector-block\"><h3>Положение</h3><div className=\"geometry-grid\">\n                <label className=\"field\"><span>X</span><SoftNumberInput value={Math.round(Number(selectedDrawing.x) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { x: value })} /></label>\n                <label className=\"field\"><span>Y</span><SoftNumberInput value={Math.round(Number(selectedDrawing.y) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { y: value })} /></label>\n                <label className=\"field\"><span>Длина</span><SoftNumberInput min={1} max={5000} value={Math.round(Number(selectedDrawing.length) || 300)} onValue={(value) => updateDrawing(selectedDrawing.id, { length: value })} /></label>\n                <label className=\"field\"><span>Угол</span><SoftNumberInput min={-180} max={180} value={Math.round(Number(selectedDrawing.angle) || 0)} onValue={(value) => updateDrawing(selectedDrawing.id, { angle: value })} /></label>\n              </div></div>\n              <button className=\"button full danger-button\" onClick={() => deleteDrawing(selectedDrawing.id)}>Удалить линию</button>\n            </>\n          )}\n        </>\n      );\n    }\n    if (albumMode === 'templates')`,
  'drawings inspector',
);

replaceOnce(
  'server.js',
  `import { handleSafeProjectVersionApi } from './server/safeProjectVersions.js';\n`,
  `import { handleSafeProjectVersionApi } from './server/safeProjectVersions.js';\nimport { drawingCatalogAsset, normalizeDrawingCatalogDimensions, normalizeDrawingCatalogKey } from './server/drawingCatalog.js';\n`,
  'drawing catalog server import',
);

replaceOnce(
  'server.js',
  `      CREATE INDEX IF NOT EXISTS photo_assets_user_status_idx\n        ON photo_assets(user_id, status, updated_at DESC);\n`,
  `      CREATE INDEX IF NOT EXISTS photo_assets_user_status_idx\n        ON photo_assets(user_id, status, updated_at DESC);\n\n      CREATE TABLE IF NOT EXISTS drawing_assets (\n        id TEXT PRIMARY KEY,\n        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n        object_key TEXT NOT NULL,\n        name TEXT NOT NULL DEFAULT 'PNG-рисунок',\n        width_px INTEGER NOT NULL DEFAULT 1,\n        height_px INTEGER NOT NULL DEFAULT 1,\n        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n        UNIQUE(user_id, object_key)\n      );\n\n      CREATE INDEX IF NOT EXISTS drawing_assets_user_created_idx\n        ON drawing_assets(user_id, created_at DESC);\n`,
  'drawing catalog table',
);

replaceOnce(
  'server.js',
  `  const publicPhotoMatch = path.match(/^\\/api\\/public-albums\\/([^/]+)\\/photos\\/([^/]+)$/);\n`,
  `  if (method === 'GET' && path === '/api/drawing-assets') {\n    const user = await requireUser(request, response);\n    if (!user) return true;\n    const result = await pool.query(\n      'SELECT id, name, object_key, width_px, height_px, created_at FROM drawing_assets WHERE user_id = $1 ORDER BY created_at DESC',\n      [user.id],\n    );\n    sendJson(response, 200, { assets: result.rows.map(drawingCatalogAsset) });\n    return true;\n  }\n\n  if (method === 'POST' && path === '/api/drawing-assets') {\n    const user = await requireUser(request, response);\n    if (!user) return true;\n    const body = await readBody(request, authJsonLimitBytes);\n    const key = normalizeDrawingCatalogKey(user.id, body.cloudKey);\n    if (!key) {\n      sendJson(response, 403, { error: 'drawing_asset_access_denied', message: 'Нет доступа к этому PNG' });\n      return true;\n    }\n    const owned = await pool.query(\n      \`SELECT object_key, name, content_type FROM photo_assets\n        WHERE user_id = $1 AND object_key = $2 AND status = 'ready'\`,\n      [user.id, key],\n    );\n    if (!owned.rows[0]) {\n      sendJson(response, 404, { error: 'drawing_asset_not_found', message: 'PNG не найден в облачном хранилище' });\n      return true;\n    }\n    if (String(owned.rows[0].content_type).toLowerCase() !== 'image/png') {\n      sendJson(response, 415, { error: 'drawing_asset_png_required', message: 'Для рисунков поддерживается только PNG' });\n      return true;\n    }\n    const dimensions = normalizeDrawingCatalogDimensions(body.width, body.height);\n    const name = String(body.name || owned.rows[0].name || 'PNG-рисунок').slice(0, 500);\n    const id = randomUUID();\n    const created = await pool.query(\n      \`INSERT INTO drawing_assets(id, user_id, object_key, name, width_px, height_px)\n       VALUES ($1, $2, $3, $4, $5, $6)\n       ON CONFLICT (user_id, object_key) DO UPDATE\n         SET name = EXCLUDED.name, width_px = EXCLUDED.width_px, height_px = EXCLUDED.height_px, updated_at = NOW()\n       RETURNING id, name, object_key, width_px, height_px, created_at\`,\n      [id, user.id, key, name, dimensions.width, dimensions.height],\n    );\n    sendJson(response, 200, { asset: drawingCatalogAsset(created.rows[0]) });\n    return true;\n  }\n\n  const drawingAssetMatch = path.match(/^\\/api\\/drawing-assets\\/([^/]+)$/);\n  if (method === 'DELETE' && drawingAssetMatch) {\n    const user = await requireUser(request, response);\n    if (!user) return true;\n    const id = decodeURIComponent(drawingAssetMatch[1]);\n    const deleted = await pool.query(\n      'DELETE FROM drawing_assets WHERE id = $1 AND user_id = $2 RETURNING object_key',\n      [id, user.id],\n    );\n    if (!deleted.rows[0]) {\n      sendJson(response, 404, { error: 'drawing_asset_not_found', message: 'Рисунок уже удалён' });\n      return true;\n    }\n    const cleanup = await photoAssetGateway.cleanupUnreferenced({ userId: user.id, keys: [deleted.rows[0].object_key] });\n    sendJson(response, 200, { ok: true, fileDeleted: cleanup.deleted > 0 });\n    return true;\n  }\n\n  const publicPhotoMatch = path.match(/^\\/api\\/public-albums\\/([^/]+)\\/photos\\/([^/]+)$/);\n`,
  'drawing catalog API routes',
);

appendFileSync('src/editor-shell-v2.css', `\n/* PNG drawing catalog */\n.drawing-upload-button{position:relative;overflow:hidden;cursor:pointer}.drawing-upload-button input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.drawing-catalog-actions{display:grid;gap:8px;margin-bottom:12px}.drawing-catalog-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0 16px}.drawing-catalog-card{position:relative;min-width:0}.drawing-catalog-preview{width:100%;min-height:88px;border:1px solid var(--border,#d8d8d8);border-radius:10px;background:#fff;padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;overflow:hidden}.drawing-catalog-preview img{width:100%;height:62px;object-fit:contain}.drawing-catalog-preview span{display:block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.drawing-catalog-delete{position:absolute;right:4px;top:4px;width:22px;height:22px;border:0;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(0,0,0,.18);cursor:pointer;font-size:16px;line-height:20px}.drawing-layer-thumb{width:34px;height:34px;object-fit:contain;flex:0 0 auto}.panel-subtitle-v3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;opacity:.58;margin:12px 0 8px}.inspector-actions-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}\n@media(max-width:720px){.drawing-catalog-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.drawing-catalog-preview{min-height:74px;padding:6px}.drawing-catalog-preview img{height:50px}}\n`, 'utf8');

write('server/drawingCatalog.test.mjs', `import assert from 'node:assert/strict';\nimport { drawingCatalogAsset, normalizeDrawingCatalogDimensions, normalizeDrawingCatalogKey } from './drawingCatalog.js';\nassert.equal(normalizeDrawingCatalogKey(7, '/users/7/photos/a/original.png'), 'users/7/photos/a/original.png');\nassert.equal(normalizeDrawingCatalogKey(7, 'users/8/photos/a/original.png'), '');\nassert.equal(normalizeDrawingCatalogKey(7, 'users/7/photos/../secret.png'), '');\nassert.deepEqual(normalizeDrawingCatalogDimensions(400.4, 900.6), { width: 400, height: 901 });\nassert.deepEqual(drawingCatalogAsset({ id: 'x', object_key: 'users/7/photos/a/original.png', name: 'Ветка', width_px: 100, height_px: 50 }), { id: 'x', name: 'Ветка', cloudKey: 'users/7/photos/a/original.png', src: '/api/photo-assets/file?key=users%2F7%2Fphotos%2Fa%2Foriginal.png', width: 100, height: 50, createdAt: null });\nconsole.log('drawing catalog server checks passed');\n`);

write('src/editor/extraLayers.image.test.mjs', `import assert from 'node:assert/strict';\nimport { cloneExtraLayerPage, sanitizeExtraLayers } from './extraLayers.js';\nconst layers = sanitizeExtraLayers({ pages: { 1: { drawings: [{ id: 'png', type: 'image', assetId: 'asset', name: 'Ветка', cloudKey: 'users/1/photos/a/original.png', src: '/api/photo-assets/file?key=x', x: 200, y: 300, width: 420, height: 180, rotation: 17, flipX: true, flipY: false, color: '#aa8877', opacity: 0.42 }] } } }, { idFactory: () => 'fresh' });\nconst item = layers.pages[1].drawings[0];\nassert.equal(item.type, 'image');\nassert.equal(item.assetId, 'asset');\nassert.equal(item.width, 420);\nassert.equal(item.rotation, 17);\nassert.equal(item.flipX, true);\nassert.equal(item.color, '#aa8877');\nassert.equal(item.opacity, 0.42);\nlet n = 0;\nconst cloned = cloneExtraLayerPage(layers.pages[1], () => 'clone-' + ++n);\nassert.equal(cloned.drawings[0].id, 'clone-1');\nassert.equal(cloned.drawings[0].cloudKey, item.cloudKey);\nconsole.log('PNG drawing extra-layer checks passed');\n`);

write('src/editor/drawingColorization.test.mjs', `import assert from 'node:assert/strict';\nimport { parseHexColor } from './drawingColorization.js';\nassert.deepEqual(parseHexColor('#abc'), [170,187,204]);\nassert.deepEqual(parseHexColor('#102030'), [16,32,48]);\nassert.deepEqual(parseHexColor('broken'), [0,0,0]);\nconsole.log('drawing colorization checks passed');\n`);

write('e2e/png-drawings.spec.js', `import { test, expect } from '@playwright/test';\nconst png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDEAAUADikBAf3aW9sAAAAASUVORK5CYII=';\ntest('PNG catalog inserts a transformable drawing', async ({ page }) => {\n  await page.route('**/api/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 1, email: 'test@example.com' } }) }));\n  await page.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) }));\n  await page.route('**/api/drawing-assets', (route) => {\n    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assets: [{ id: 'branch', name: 'Ветка', cloudKey: 'users/1/photos/a/original.png', src: png, width: 200, height: 80 }] }) });\n    return route.continue();\n  });\n  await page.goto('/');\n  await page.getByText('Рисунки', { exact: true }).first().click();\n  await expect(page.getByText('Ветка', { exact: true })).toBeVisible();\n  await page.getByText('Ветка', { exact: true }).click();\n  await expect(page.getByText('Настройки PNG', { exact: true })).toBeVisible();\n  await expect(page.getByRole('button', { name: '↔ По горизонтали' })).toBeVisible();\n  await expect(page.getByRole('button', { name: '↕ По вертикали' })).toBeVisible();\n});\n`);

const pkg = JSON.parse(read('package.json'));
pkg.scripts.test = pkg.scripts.test.replace('node server/publicAlbumModel.test.mjs &&', 'node server/publicAlbumModel.test.mjs && node server/drawingCatalog.test.mjs &&').replace('node src/editor/extraLayers.test.mjs &&', 'node src/editor/extraLayers.test.mjs && node src/editor/extraLayers.image.test.mjs && node src/editor/drawingColorization.test.mjs &&');
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

console.log('PNG drawings implementation applied');
