import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_PREFIX = 'collage-public-album-share-v1:';
const CURRENT_PROJECT_ID_KEY = 'collage-cloud-current-project-id';

function storageKey(projectId) { return STORAGE_PREFIX + (projectId || 'local'); }
function loadSavedShare(projectId) {
  try { return JSON.parse(localStorage.getItem(storageKey(projectId)) || 'null'); } catch { return null; }
}
function saveShare(projectId, value) {
  try { localStorage.setItem(storageKey(projectId), JSON.stringify(value)); } catch { /* ignore */ }
}
function clearShare(projectId) {
  try { localStorage.removeItem(storageKey(projectId)); } catch { /* ignore */ }
}

export default function PublicAlbumShareControls() {
  const [target, setTarget] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [share, setShare] = useState(() => loadSavedShare(localStorage.getItem(CURRENT_PROJECT_ID_KEY)));

  useEffect(() => {
    const find = () => setTarget(document.querySelector('.app-header-actions-v2'));
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function publish() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const saveResult = await window.__collageApp?.saveProject?.();
      if (!saveResult?.cloud?.id) throw new Error('Для публикации войди в аккаунт и сохрани проект в облако.');
      const projectId = String(saveResult.cloud.id);
      const previous = loadSavedShare(projectId);
      const response = await fetch('/api/public-albums', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          shareToken: previous?.token || share?.token || null,
          title: saveResult.cloud.title || 'Фотоальбом',
          data: saveResult.data,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'Не удалось опубликовать альбом');
      const info = {
        token: payload.album.token,
        url: new URL(payload.album.url, window.location.origin).href,
        projectId,
      };
      saveShare(projectId, info);
      setShare(info);
      setOpen(true);
    } catch (publishError) {
      setError(publishError?.message || 'Не удалось опубликовать альбом');
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!share?.url) return;
    await navigator.clipboard?.writeText?.(share.url);
  }

  async function revoke() {
    if (!share?.token || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/public-albums/' + encodeURIComponent(share.token), {
        method: 'DELETE',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'Не удалось закрыть доступ');
      clearShare(share.projectId || localStorage.getItem(CURRENT_PROJECT_ID_KEY));
      setShare(null);
    } catch (revokeError) {
      setError(revokeError?.message || 'Не удалось закрыть доступ');
    } finally {
      setBusy(false);
    }
  }

  if (!target) return null;
  return createPortal(
    <>
      <button className="button public-album-share-open" type="button" disabled={busy} onClick={() => share ? setOpen(true) : publish()}>{busy ? 'Публикую…' : 'Поделиться'}</button>
      {open && (
        <div className="public-album-share-popover">
          <strong>Ссылка для клиента</strong>
          {error && <p className="public-album-share-error">{error}</p>}
          {share?.url ? (
            <>
              <input value={share.url} readOnly aria-label="Публичная ссылка на альбом" />
              <div className="public-album-share-actions">
                <button className="button primary-save-v2" type="button" onClick={copyLink}>Копировать</button>
                <button className="button" type="button" disabled={busy} onClick={publish}>Обновить</button>
                <button className="button danger-button" type="button" disabled={busy} onClick={revoke}>Закрыть доступ</button>
              </div>
              <p>Клиент увидит только альбом. Редактор и аккаунт по этой ссылке недоступны.</p>
            </>
          ) : (
            <button className="button primary-save-v2" type="button" disabled={busy} onClick={publish}>Создать ссылку</button>
          )}
          <button className="public-album-share-close" type="button" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
        </div>
      )}
    </>,
    target,
  );
}
