const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const HEIC_EXTENSION = /\.(?:heic|heif)$/i;
const bypassInputs = new WeakSet();
let conversionInProgress = false;

function cleanType(value) {
  return String(value || '').trim().toLowerCase().split(';')[0];
}

export function isHeicFileLike(file) {
  return HEIC_TYPES.has(cleanType(file?.type)) || HEIC_EXTENSION.test(String(file?.name || ''));
}

export function jpegNameForUpload(name) {
  const source = String(name || 'Фото').slice(0, 500);
  return HEIC_EXTENSION.test(source) ? source.replace(HEIC_EXTENSION, '.jpg') : `${source}.jpg`;
}

function showStatus(message) {
  document.querySelectorAll('.cloud-auth-status').forEach((node) => {
    node.textContent = message;
  });

  let toast = document.querySelector('.local-heic-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'local-heic-toast';
    Object.assign(toast.style, {
      position: 'fixed',
      left: '50%',
      bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
      transform: 'translateX(-50%)',
      zIndex: '100001',
      maxWidth: 'min(620px, calc(100vw - 24px))',
      padding: '11px 16px',
      borderRadius: '12px',
      color: '#fff',
      background: '#2f6f52',
      font: '600 14px/1.35 Arial, sans-serif',
      boxShadow: '0 10px 30px rgba(0,0,0,.24)',
      pointerEvents: 'none',
      textAlign: 'center',
    });
    document.body.append(toast);
  }

  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => { toast.style.display = 'none'; }, 5000);
}

function isPhotoInput(input) {
  return input instanceof HTMLInputElement
    && input.type === 'file'
    && String(input.accept || '').toLowerCase().includes('image');
}

async function parseErrorResponse(response) {
  const payload = await response.json().catch(() => ({}));
  return payload?.message || payload?.error || `Ошибка преобразования ${response.status}`;
}

export async function convertHeicThroughServer(file, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(`/api/heic/convert?name=${encodeURIComponent(file?.name || 'Фото.HEIC')}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': cleanType(file?.type) || 'image/heic',
    },
    body: file,
  });

  if (!response.ok) throw new Error(await parseErrorResponse(response));
  const blob = await response.blob();
  if (!blob.size || cleanType(blob.type) !== 'image/jpeg') {
    throw new Error('Сервер не вернул готовый JPEG');
  }

  return new File([blob], jpegNameForUpload(file?.name), {
    type: 'image/jpeg',
    lastModified: Number(file?.lastModified) || Date.now(),
  });
}

async function prepareFiles(files) {
  const source = Array.from(files || []);
  const prepared = [];
  const failed = [];
  let converted = 0;

  for (let index = 0; index < source.length; index += 1) {
    const file = source[index];
    if (!isHeicFileLike(file)) {
      prepared.push(file);
      continue;
    }

    showStatus(`Преобразую HEIC: ${index + 1} из ${source.length} · ${file.name || 'Фото'}`);
    try {
      prepared.push(await convertHeicThroughServer(file));
      converted += 1;
    } catch (error) {
      failed.push({ file, error });
    }
  }

  return { prepared, failed, converted };
}

async function handlePhotoSelection(event) {
  const input = event.target;
  if (!isPhotoInput(input) || bypassInputs.has(input)) return;

  const files = Array.from(input.files || []);
  if (!files.some(isHeicFileLike)) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (conversionInProgress) {
    input.value = '';
    showStatus('Дождись окончания преобразования HEIC');
    return;
  }

  conversionInProgress = true;
  try {
    const result = await prepareFiles(files);
    if (!result.prepared.length) {
      const first = result.failed[0];
      throw new Error(`Не удалось преобразовать HEIC «${first?.file?.name || 'Фото'}»: ${first?.error?.message || 'неизвестная ошибка'}`);
    }

    if (typeof DataTransfer !== 'function') {
      throw new Error('Этот браузер не позволяет передать преобразованный файл редактору');
    }

    const transfer = new DataTransfer();
    result.prepared.forEach((file) => transfer.items.add(file));
    bypassInputs.add(input);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    queueMicrotask(() => bypassInputs.delete(input));

    if (result.failed.length) {
      showStatus(`HEIC → JPEG: ${result.converted}. Не удалось преобразовать: ${result.failed.length}`);
    } else {
      showStatus(`HEIC → JPEG: ${result.converted}. Сохраняю фото в браузере…`);
    }
  } catch (error) {
    input.value = '';
    showStatus(error?.message || 'Не удалось преобразовать HEIC');
  } finally {
    conversionInProgress = false;
  }
}

export function installLocalHeicUploadBridge() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.addEventListener('change', handlePhotoSelection, true);
}
