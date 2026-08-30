function apiError(response, payload, fallback) {
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
    builtin: source.builtin === true || String(source.id || '').startsWith('builtin-'),
  };
}

const BUILTIN_DRAWING_DEFINITIONS = [
  { id: 'builtin-branch-outline-01', name: 'Веточка 1', src: '/drawings/branch-outline-01.png', width: 1254, height: 1254 },
  { id: 'builtin-branch-outline-02', name: 'Веточка 2', src: '/drawings/branch-outline-02.png', width: 1254, height: 1254 },
  { id: 'builtin-branch-outline-03', name: 'Веточка 3', src: '/drawings/branch-outline-03.png', width: 1254, height: 1254 },
  { id: 'builtin-branch-outline-04', name: 'Веточка 4', src: '/drawings/branch-outline-04.png', width: 1254, height: 1254 },
  { id: 'builtin-branch-solid-01', name: 'Веточка силуэт', src: '/drawings/branch-solid-01.png', width: 1254, height: 1254 },
  { id: 'builtin-peony-large-01', name: 'Пион крупный', src: '/drawings/peony-large-01.png', width: 420, height: 487 },
  { id: 'builtin-peony-corner-01', name: 'Пион уголок', src: '/drawings/peony-corner-01.png', width: 1254, height: 1254 },
  { id: 'builtin-peony-horizontal-01', name: 'Пионы горизонтальные 1', src: '/drawings/peony-horizontal-01.png', width: 1448, height: 1086 },
  { id: 'builtin-peony-horizontal-02', name: 'Пионы горизонтальные 2', src: '/drawings/peony-horizontal-02.png', width: 1672, height: 941 },
  { id: 'builtin-peony-stem-01', name: 'Пион на стебле 1', src: '/drawings/peony-stem-01.png', width: 306, height: 465 },
  { id: 'builtin-peony-stem-02', name: 'Пион на стебле 2', src: '/drawings/peony-stem-02.png', width: 1254, height: 1254 },
];

export const BUILTIN_DRAWING_ASSETS = Object.freeze(
  BUILTIN_DRAWING_DEFINITIONS.map((asset) => Object.freeze(normalizeDrawingCatalogAsset({ ...asset, builtin: true }))),
);

export async function loadDrawingCatalog(fetchImpl = fetch) {
  let remoteAssets = [];
  try {
    const response = await fetchImpl('/api/drawing-assets', { credentials: 'include' });
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      remoteAssets = (Array.isArray(payload.assets) ? payload.assets : []).map(normalizeDrawingCatalogAsset);
    }
  } catch {
    // Built-in drawings stay available even if account/cloud API is unavailable.
  }

  const builtinIds = new Set(BUILTIN_DRAWING_ASSETS.map((asset) => asset.id));
  return [
    ...BUILTIN_DRAWING_ASSETS,
    ...remoteAssets.filter((asset) => !builtinIds.has(asset.id)),
  ];
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
  if (String(id || '').startsWith('builtin-')) throw new Error('Встроенный рисунок нельзя удалить');
  const response = await fetchImpl('/api/drawing-assets/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(response, payload, 'Не удалось удалить рисунок');
  return payload;
}
