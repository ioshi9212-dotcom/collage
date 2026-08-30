const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function apiError(response, payload, fallback) {
  const error = new Error(payload?.message || payload?.error || fallback);
  error.status = response.status;
  return error;
}

export function isPngDrawingCandidate(file) {
  if (!(file instanceof Blob)) return false;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return type === 'image/png' || name.endsWith('.png');
}

export async function hasPngSignature(file) {
  if (!(file instanceof Blob) || typeof file.slice !== 'function') return false;
  const bytes = new Uint8Array(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer());
  return bytes.length === PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function installDrawingPngInputCompatibility(documentRef = globalThis.document) {
  if (!documentRef?.addEventListener || documentRef.__collageDrawingPngCompatInstalled) return;
  documentRef.__collageDrawingPngCompatInstalled = true;

  documentRef.addEventListener('change', (event) => {
    const input = event?.target;
    if (!input || input.type !== 'file' || !input.closest?.('.drawing-upload-button')) return;

    const files = [...(input.files || [])];
    const needsNormalization = files.some((file) => (
      String(file?.type || '').toLowerCase() !== 'image/png'
      && String(file?.name || '').toLowerCase().endsWith('.png')
    ));
    if (!needsNormalization || typeof globalThis.DataTransfer !== 'function' || typeof globalThis.File !== 'function') return;

    try {
      const transfer = new globalThis.DataTransfer();
      for (const file of files) {
        const isPngName = String(file?.name || '').toLowerCase().endsWith('.png');
        const type = String(file?.type || '').toLowerCase();
        if (isPngName && type !== 'image/png') {
          transfer.items.add(new globalThis.File([file], file.name || 'Рисунок.png', {
            type: 'image/png',
            lastModified: Number(file.lastModified) || Date.now(),
          }));
        } else {
          transfer.items.add(file);
        }
      }
      input.files = transfer.files;
    } catch {
      // Some browsers expose FileList as read-only. In that case the normal validation message remains.
    }
  }, true);
}

installDrawingPngInputCompatibility();

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
  if (!isPngDrawingCandidate(file) || !(await hasPngSignature(file))) {
    throw new Error('Для рисунков нужен настоящий PNG-файл');
  }
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
