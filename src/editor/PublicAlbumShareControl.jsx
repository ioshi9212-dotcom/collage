import { useState } from 'react';
import {
  publishPublicAlbum,
  publicAlbumUrl,
  revokePublicAlbum,
} from './publicAlbum';

export default function PublicAlbumShareControl({ saveProject, showNotice }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [token, setToken] = useState('');

  const show = (message) => showNotice?.(message);

  async function copyLink(value = link) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      show('Ссылка на альбом скопирована');
    } catch {
      show('Не удалось скопировать автоматически. Выдели ссылку вручную.');
    }
  }

  async function publish({ copy = true } = {}) {
    if (busy) return;
    if (window.__collageCloudAuth?.isAuthenticated?.() !== true) {
      show('Для клиентской ссылки сначала войди в аккаунт');
      document.querySelector('.cloud-auth-toggle')?.click();
      return;
    }

    setBusy(true);
    try {
      const saved = await saveProject?.();
      const projectId = saved?.cloud?.id;
      if (!saved?.ok || !projectId) {
        throw new Error('Не удалось сохранить облачную версию альбома');
      }

      const share = await publishPublicAlbum(projectId);
      const nextToken = String(share?.token || '');
      const nextLink = publicAlbumUrl(nextToken);
      if (!nextToken || !nextLink) throw new Error('Сервер не вернул публичную ссылку');

      setToken(nextToken);
      setLink(nextLink);
      setOpen(true);

      if (copy) {
        try {
          await navigator.clipboard.writeText(nextLink);
          show('Клиентская ссылка создана и скопирована');
        } catch {
          show('Клиентская ссылка создана');
        }
      } else {
        show('Публичный альбом обновлён');
      }
    } catch (error) {
      console.warn('Public album publish failed', error);
      show(error?.message || 'Не удалось создать клиентскую ссылку');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!token || busy) return;
    if (!window.confirm('Закрыть доступ по этой клиентской ссылке?')) return;

    setBusy(true);
    try {
      await revokePublicAlbum(token);
      setToken('');
      setLink('');
      setOpen(false);
      show('Доступ по ссылке закрыт');
    } catch (error) {
      console.warn('Public album revoke failed', error);
      show(error?.message || 'Не удалось закрыть доступ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-album-menu-v2">
      <button
        className="button share-album-button-v2"
        type="button"
        disabled={busy}
        onClick={() => publish({ copy: true })}
      >
        {busy ? 'Готовлю…' : 'Поделиться'}
      </button>
      {open && link && (
        <div className="share-album-popover-v2">
          <strong>Ссылка для клиента</strong>
          <p>По этой ссылке открывается только альбом. После обычного «Сохранить» клиент увидит последнюю сохранённую версию.</p>
          <div className="share-album-link-row-v2">
            <input
              aria-label="Клиентская ссылка на альбом"
              value={link}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
            <button className="button" type="button" onClick={() => copyLink()}>Копировать</button>
          </div>
          <div className="share-album-popover-actions-v2">
            <button className="button" type="button" disabled={busy} onClick={() => publish({ copy: false })}>Обновить</button>
            <button className="button danger-button" type="button" disabled={busy} onClick={revoke}>Закрыть доступ</button>
          </div>
        </div>
      )}
    </div>
  );
}
