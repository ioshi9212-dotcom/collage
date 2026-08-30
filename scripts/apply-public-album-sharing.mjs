import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(from, to);
}

write('server/publicAlbumModel.js', `import { createHash, randomBytes } from 'node:crypto';

export function createPublicAlbumToken() {
  return randomBytes(18).toString('base64url');
}

export function publicPhotoId(key) {
  return createHash('sha256').update(String(key || '')).digest('base64url').slice(0, 24);
}

export function rewritePublicAlbumProject(project, shareToken) {
  const root = structuredClone(project || {});
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value.cloudKey === 'string' && value.cloudKey) {
      value.src = \
        '/api/public-albums/' + encodeURIComponent(shareToken) + '/photos/' + publicPhotoId(value.cloudKey);
      delete value.cloudKey;
      delete value.cloudSchema;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return root;
}

export function referencedPublicPhotoKey(keys, photoId) {
  const target = String(photoId || '');
  return [...new Set(keys || [])].find((key) => publicPhotoId(key) === target) || null;
}
`);

write('server/publicAlbumModel.test.mjs', `import assert from 'node:assert/strict';
import { createPublicAlbumToken, publicPhotoId, referencedPublicPhotoKey, rewritePublicAlbumProject } from './publicAlbumModel.js';

const token = createPublicAlbumToken();
assert.match(token, /^[A-Za-z0-9_-]{20,}$/);
const key = 'users/7/photos/abc/original.jpg';
const photoId = publicPhotoId(key);
assert.equal(photoId.length, 24);
assert.equal(referencedPublicPhotoKey([key], photoId), key);
assert.equal(referencedPublicPhotoKey([key], 'missing'), null);
const rewritten = rewritePublicAlbumProject({ pages: [{ frames: [{ photo: { id: 'p1', cloudKey: key, cloudSchema: 'railway-bucket-v1', src: '/private' } }] }] }, 'share123');
assert.equal(rewritten.pages[0].frames[0].photo.cloudKey, undefined);
assert.equal(rewritten.pages[0].frames[0].photo.cloudSchema, undefined);
assert.equal(rewritten.pages[0].frames[0].photo.src, '/api/public-albums/share123/photos/' + photoId);
console.log('publicAlbumModel tests passed');
`);

write('src/editor/PublicAlbumPage.jsx', `import { useEffect, useState } from 'react';
import AlbumFlipPreview from './AlbumFlipPreview';
import { AlbumPagePreview } from './AlbumFlipPreviewHost';

function publicAlbumToken() {
  const match = window.location.pathname.match(/^\\/album\\/([^/]+)\\/?$/);
  return match ? decodeURIComponent(match[1]) : '';
}

export default function PublicAlbumPage() {
  const [state, setState] = useState({ loading: true, album: null, error: '' });

  useEffect(() => {
    const token = publicAlbumToken();
    if (!token) {
      setState({ loading: false, album: null, error: 'Ссылка на альбом некорректна' });
      return;
    }
    let active = true;
    fetch('/api/public-albums/' + encodeURIComponent(token), { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || 'Альбом недоступен');
        return payload.album;
      })
      .then((album) => {
        if (!active) return;
        document.title = album?.title || 'Фотоальбом';
        setState({ loading: false, album, error: '' });
      })
      .catch((error) => {
        if (active) setState({ loading: false, album: null, error: error?.message || 'Альбом недоступен' });
      });
    return () => { active = false; };
  }, []);

  if (state.loading) return <main className="public-album-status"><div><strong>Открываю альбом…</strong></div></main>;
  if (!state.album?.data?.pages?.length) return <main className="public-album-status"><div><strong>{state.error || 'Альбом недоступен'}</strong><span>Возможно, владелец закрыл доступ к ссылке.</span></div></main>;

  const project = state.album.data;
  return (
    <main className="public-album-page">
      <AlbumFlipPreview
        open
        standalone
        allowZoom
        title={state.album.title || 'Альбом'}
        pageCount={project.pages.length}
        startPageIndex={0}
        pageAspect={(project.canvas?.width || 1480) / Math.max(1, project.canvas?.height || 2100)}
        renderPage={(pageIndex) => <AlbumPagePreview project={project} pageIndex={pageIndex} />}
        onClose={() => {}}
      />
    </main>
  );
}
`);

write('src/editor/PublicAlbumShareControls.jsx', `import { useEffect, useState } from 'react';
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
`);

let host = read('src/editor/AlbumFlipPreviewHost.jsx');
host = replaceOnce(host, 'function AlbumPagePreview({ project, pageIndex }) {', 'export function AlbumPagePreview({ project, pageIndex }) {', 'export AlbumPagePreview');
write('src/editor/AlbumFlipPreviewHost.jsx', host);

let preview = read('src/editor/AlbumFlipPreview.jsx');
preview = replaceOnce(preview, `export default function AlbumFlipPreview({\n  open,\n  pageCount,\n  startPageIndex = 0,\n  pageAspect = 0.705,\n  renderPage,\n  onClose,\n}) {`, `export default function AlbumFlipPreview({\n  open,\n  pageCount,\n  startPageIndex = 0,\n  pageAspect = 0.705,\n  renderPage,\n  onClose,\n  standalone = false,\n  allowZoom = false,\n  title = 'Альбом',\n}) {`, 'viewer props');
preview = replaceOnce(preview, `  const [turnProgress, setTurnProgress] = useState(0);`, `  const [turnProgress, setTurnProgress] = useState(0);\n  const [zoomed, setZoomed] = useState(false);`, 'zoom state');
preview = replaceOnce(preview, `    setTurn(null);\n    setTurnProgress(0);\n  }, [open, startPageIndex, pageCount]);`, `    setTurn(null);\n    setTurnProgress(0);\n    setZoomed(false);\n  }, [open, startPageIndex, pageCount]);`, 'reset zoom');
preview = replaceOnce(preview, `      if (event.key === 'Escape') onClose?.();`, `      if (event.key === 'Escape' && !standalone) onClose?.();`, 'standalone escape');
preview = replaceOnce(preview, `  }, [open, onClose]);`, `  }, [open, onClose, standalone]);`, 'effect deps');
preview = replaceOnce(preview, `  function beginSwipe(event) {\n    if (turn || event.button > 0 || event.target.closest?.('button, input')) return;`, `  function beginSwipe(event) {\n    if (zoomed || turn || event.button > 0 || event.target.closest?.('button, input')) return;`, 'disable swipe zoom');
preview = replaceOnce(preview, `<div className="album-flip-overlay" role="dialog" aria-modal="true" aria-label="Просмотр альбома">`, `<div className={\`album-flip-overlay \${standalone ? 'is-standalone' : ''} \${zoomed ? 'is-zoomed' : ''}\`} role="dialog" aria-modal="true" aria-label="Просмотр альбома">`, 'overlay classes');
preview = replaceOnce(preview, `<strong>Альбом</strong>`, `<strong>{title}</strong>`, 'viewer title');
preview = replaceOnce(preview, `<button type="button" className="album-flip-close" onClick={onClose} aria-label="Закрыть просмотр">×</button>`, `{!standalone && <button type="button" className="album-flip-close" onClick={onClose} aria-label="Закрыть просмотр">×</button>}`, 'hide close');
preview = replaceOnce(preview, `<button type="button" onClick={() => requestTurn('next')} disabled={spreadIndex >= maxSpread || Boolean(turn)}>Вперёд →</button>`, `{allowZoom && <button type="button" className="album-flip-zoom-toggle" onClick={() => setZoomed((value) => !value)}>{zoomed ? 'Уменьшить' : 'Увеличить'}</button>}\n          <button type="button" onClick={() => requestTurn('next')} disabled={spreadIndex >= maxSpread || Boolean(turn)}>Вперёд →</button>`, 'zoom button');
preview = replaceOnce(preview, `<p className="album-flip-help">Потяни внешний край листа: страница поднимется, согнётся и перевернётся. На телефоне работает свайп.</p>`, `<p className="album-flip-help">{zoomed ? 'Перемещай увеличенный альбом пальцем. Нажми «Уменьшить», чтобы снова листать.' : 'Листай свайпом. Для деталей можно увеличить альбом.'}</p>`, 'zoom help');
write('src/editor/AlbumFlipPreview.jsx', preview);

let main = read('src/main.jsx');
main = replaceOnce(main, `import AlbumFlipPreviewHost from './editor/AlbumFlipPreviewHost';\nimport App from './AppLive.jsx';`, `import AlbumFlipPreviewHost from './editor/AlbumFlipPreviewHost';\nimport PublicAlbumPage from './editor/PublicAlbumPage';\nimport PublicAlbumShareControls from './editor/PublicAlbumShareControls';\nimport App from './AppLive.jsx';`, 'main imports');
main = replaceOnce(main, `createRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n    <AlbumFlipPreviewHost />\n  </React.StrictMode>,\n);\n\ninstallPageRailBehavior();\ninstallToolStateBehavior();\n// Install the mobile guard before text behavior, which otherwise sharpens the\n// visible editor canvas after startup. Export stages are deliberately excluded.\ninstallMobileEditorBehavior();\ninstallTextEditingBehavior();\ninstallDestructiveActionBehavior();\ninstallInspectorContextBehavior();`, `const isPublicAlbumRoute = /^\\/album\\/[^/]+\\/?$/.test(window.location.pathname);\n\ncreateRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    {isPublicAlbumRoute ? (\n      <PublicAlbumPage />\n    ) : (\n      <>\n        <App />\n        <AlbumFlipPreviewHost />\n        <PublicAlbumShareControls />\n      </>\n    )}\n  </React.StrictMode>,\n);\n\nif (!isPublicAlbumRoute) {\n  installPageRailBehavior();\n  installToolStateBehavior();\n  // Install the mobile guard before text behavior, which otherwise sharpens the\n  // visible editor canvas after startup. Export stages are deliberately excluded.\n  installMobileEditorBehavior();\n  installTextEditingBehavior();\n  installDestructiveActionBehavior();\n  installInspectorContextBehavior();\n}`, 'public route');
write('src/main.jsx', main);

let app = read('src/AppLive.jsx');
app = replaceOnce(app, `      saveLocal: () => saveLocalProject({ silent: true }),`, `      saveProject: () => save(),\n      saveLocal: () => saveLocalProject({ silent: true }),`, 'expose saveProject');
write('src/AppLive.jsx', app);

let gateway = read('server/bucketGateway.js');
gateway = replaceOnce(gateway, `  return {\n    handle,\n    cleanupUnreferenced,\n    config,\n  };`, `  async function servePublicPhoto({ response, userId, key }) {\n    if (!config.configured) {\n      sendBucketError(response, 503, 'bucket_not_configured', 'Облачное хранилище фотографий не подключено.');\n      return;\n    }\n    if (!isOwnedPhotoKey(userId, key)) {\n      sendBucketError(response, 403, 'photo_access_denied', 'Нет доступа к этой фотографии.');\n      return;\n    }\n    const request = { url: '/api/photo-assets/file?key=' + encodeURIComponent(key) };\n    await proxyDownload({ request, response, user: { id: Number(userId) }, config, fetchImpl, assetStore });\n  }\n\n  return {\n    handle,\n    cleanupUnreferenced,\n    servePublicPhoto,\n    config,\n  };`, 'public photo gateway');
write('server/bucketGateway.js', gateway);

let store = read('server/photoAssetStore.js');
store = replaceOnce(store, `      \`SELECT EXISTS(\n         SELECT 1\n           FROM projects\n          WHERE user_id = $1\n            AND POSITION($2 IN data_json::text) > 0\n       ) AS referenced\`,`, `      \`SELECT (\n         EXISTS(\n           SELECT 1\n             FROM projects\n            WHERE user_id = $1\n              AND POSITION($2 IN data_json::text) > 0\n         )\n         OR EXISTS(\n           SELECT 1\n             FROM public_albums\n            WHERE user_id = $1\n              AND POSITION($2 IN data_json::text) > 0\n         )\n       ) AS referenced\`,`, 'public album photo references');
write('server/photoAssetStore.js', store);

let server = read('server.js');
server = replaceOnce(server, `import { describeSessionSecretState, resolveSessionSecret } from './server/sessionSecret.js';`, `import { describeSessionSecretState, resolveSessionSecret } from './server/sessionSecret.js';\nimport { createPublicAlbumToken, referencedPublicPhotoKey, rewritePublicAlbumProject } from './server/publicAlbumModel.js';`, 'server public model import');
server = replaceOnce(server, `      CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON projects(user_id, updated_at DESC);\n\n      CREATE TABLE IF NOT EXISTS photo_assets (`, `      CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON projects(user_id, updated_at DESC);\n\n      CREATE TABLE IF NOT EXISTS public_albums (\n        share_token TEXT PRIMARY KEY,\n        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,\n        title TEXT NOT NULL DEFAULT 'Фотоальбом',\n        data_json JSONB NOT NULL,\n        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n      );\n\n      CREATE UNIQUE INDEX IF NOT EXISTS public_albums_user_project_idx\n        ON public_albums(user_id, project_id)\n        WHERE project_id IS NOT NULL;\n\n      CREATE INDEX IF NOT EXISTS public_albums_updated_idx ON public_albums(updated_at DESC);\n\n      CREATE TABLE IF NOT EXISTS photo_assets (`, 'public album table');
const routesMarker = `  if (method === 'GET' && path === '/api/projects') {`;
const publicRoutes = `  const publicPhotoMatch = path.match(/^\\/api\\/public-albums\\/([^/]+)\\/photos\\/([^/]+)$/);\n  if (method === 'GET' && publicPhotoMatch) {\n    const shareToken = decodeURIComponent(publicPhotoMatch[1]);\n    const photoId = decodeURIComponent(publicPhotoMatch[2]);\n    const result = await pool.query(\n      'SELECT user_id, data_json AS data FROM public_albums WHERE share_token = $1',\n      [shareToken],\n    );\n    const album = result.rows[0];\n    if (!album) {\n      sendJson(response, 404, { error: 'public_album_not_found', message: 'Альбом недоступен' });\n      return true;\n    }\n    const key = referencedPublicPhotoKey(extractCloudPhotoKeys(album.data, album.user_id), photoId);\n    if (!key) {\n      sendJson(response, 404, { error: 'public_photo_not_found', message: 'Фотография недоступна' });\n      return true;\n    }\n    await photoAssetGateway.servePublicPhoto({ response, userId: album.user_id, key });\n    return true;\n  }\n\n  const publicAlbumMatch = path.match(/^\\/api\\/public-albums\\/([^/]+)$/);\n  if (method === 'GET' && publicAlbumMatch) {\n    const shareToken = decodeURIComponent(publicAlbumMatch[1]);\n    const result = await pool.query(\n      'SELECT title, data_json AS data, updated_at FROM public_albums WHERE share_token = $1',\n      [shareToken],\n    );\n    const album = result.rows[0];\n    if (!album) {\n      sendJson(response, 404, { error: 'public_album_not_found', message: 'Альбом недоступен' });\n      return true;\n    }\n    sendJson(response, 200, {\n      album: {\n        title: album.title,\n        updatedAt: album.updated_at,\n        data: rewritePublicAlbumProject(album.data, shareToken),\n      },\n    });\n    return true;\n  }\n\n  if (method === 'POST' && path === '/api/public-albums') {\n    const user = await requireUser(request, response);\n    if (!user) return true;\n    const body = await readBody(request);\n    const data = body.data || {};\n    if (!Array.isArray(data.pages) || !data.pages.length) {\n      sendJson(response, 400, { error: 'invalid_album', message: 'В альбоме нет страниц для публикации' });\n      return true;\n    }\n    const title = String(body.title || 'Фотоальбом').trim().slice(0, 120) || 'Фотоальбом';\n    const projectId = body.projectId ? String(body.projectId) : null;\n    let shareToken = body.shareToken ? String(body.shareToken) : '';\n\n    if (projectId) {\n      const ownedProject = await pool.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, user.id]);\n      if (!ownedProject.rows[0]) {\n        sendJson(response, 404, { error: 'project_not_found', message: 'Сначала сохрани проект в облако' });\n        return true;\n      }\n      const existing = await pool.query(\n        'SELECT share_token FROM public_albums WHERE user_id = $1 AND project_id = $2',\n        [user.id, projectId],\n      );\n      if (existing.rows[0]?.share_token) shareToken = existing.rows[0].share_token;\n    }\n\n    if (shareToken) {\n      const updated = await pool.query(\n        \`UPDATE public_albums\n            SET project_id = $3, title = $4, data_json = $5, updated_at = NOW()\n          WHERE share_token = $1 AND user_id = $2\n          RETURNING share_token, title, updated_at\`,\n        [shareToken, user.id, projectId, title, data],\n      );\n      if (updated.rows[0]) {\n        await touchProjectPhotoAssets(user.id, data);\n        sendJson(response, 200, { album: { token: shareToken, url: '/album/' + shareToken, title, updatedAt: updated.rows[0].updated_at } });\n        return true;\n      }\n    }\n\n    shareToken = createPublicAlbumToken();\n    const created = await pool.query(\n      \`INSERT INTO public_albums(share_token, user_id, project_id, title, data_json)\n       VALUES ($1, $2, $3, $4, $5)\n       RETURNING share_token, title, updated_at\`,\n      [shareToken, user.id, projectId, title, data],\n    );\n    await touchProjectPhotoAssets(user.id, data);\n    sendJson(response, 200, { album: { token: shareToken, url: '/album/' + shareToken, title, updatedAt: created.rows[0].updated_at } });\n    return true;\n  }\n\n  if (method === 'DELETE' && publicAlbumMatch) {\n    const user = await requireUser(request, response);\n    if (!user) return true;\n    const shareToken = decodeURIComponent(publicAlbumMatch[1]);\n    const deleted = await pool.query(\n      'DELETE FROM public_albums WHERE share_token = $1 AND user_id = $2 RETURNING share_token',\n      [shareToken, user.id],\n    );\n    if (!deleted.rows[0]) {\n      sendJson(response, 404, { error: 'public_album_not_found', message: 'Публичная ссылка уже недоступна' });\n      return true;\n    }\n    sendJson(response, 200, { ok: true });\n    return true;\n  }\n\n`;
server = replaceOnce(server, routesMarker, publicRoutes + routesMarker, 'public album routes');
write('server.js', server);

let css = read('src/album-flip-preview.css');
css += `\n\n/* Public client album and sharing controls */\n.album-flip-book { transition: transform 180ms ease; }\n.album-flip-overlay.is-zoomed .album-flip-scene { overflow: auto; touch-action: pan-x pan-y; cursor: grab; }\n.album-flip-overlay.is-zoomed .album-flip-book { transform: rotateX(2deg) scale(1.62) translateZ(0); }\n.album-flip-overlay.is-standalone { background: #151718; backdrop-filter: none; }\n.album-flip-overlay.is-standalone .album-flip-dialog { max-width: none; }\n.public-album-status { position: fixed; inset: 0; display: grid; place-items: center; background: #151718; color: #fff; font-family: Arial, sans-serif; }\n.public-album-status > div { display: grid; gap: 8px; text-align: center; padding: 24px; }\n.public-album-status span { color: rgba(255,255,255,.64); font-size: 13px; }\n.public-album-share-open { white-space: nowrap; }\n.public-album-share-popover { position: fixed; z-index: 6000; top: 64px; right: 14px; width: min(430px, calc(100vw - 28px)); display: grid; gap: 10px; border: 1px solid var(--shell-line-strong, #adb4b8); border-radius: 8px; background: #fff; color: #272b2e; padding: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.25); }\n.public-album-share-popover > strong { padding-right: 34px; }\n.public-album-share-popover input { width: 100%; min-height: 38px; box-sizing: border-box; border: 1px solid #cfd4d7; border-radius: 5px; padding: 7px 9px; font-size: 12px; }\n.public-album-share-popover p { margin: 0; color: #70767a; font-size: 11px; line-height: 1.4; }\n.public-album-share-popover .public-album-share-error { color: #a43d3d; }\n.public-album-share-actions { display: flex; flex-wrap: wrap; gap: 6px; }\n.public-album-share-close { position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; border: 0; border-radius: 50%; background: #eef0f1; font-size: 20px; cursor: pointer; }\n@media (max-width: 760px) {\n  .public-album-share-open { display: none !important; }\n  .album-flip-overlay.is-standalone .album-flip-header { padding: 10px 12px; }\n  .album-flip-overlay.is-standalone .album-flip-header strong { font-size: 15px; }\n  .album-flip-overlay.is-standalone .album-flip-help { padding: 0 12px 10px; font-size: 10px; }\n  .album-flip-overlay.is-zoomed .album-flip-book { transform: rotateX(1deg) scale(1.9) translateZ(0); }\n}\n`;
write('src/album-flip-preview.css', css);

let pkg = JSON.parse(read('package.json'));
pkg.scripts.test = pkg.scripts.test.replace('node server/auth.test.mjs', 'node server/publicAlbumModel.test.mjs && node server/auth.test.mjs');
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

write('e2e/public-album-route.spec.js', `import { test, expect } from '@playwright/test';

test('public album route does not render editor chrome', async ({ page }) => {
  await page.route('**/api/public-albums/demo-token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ album: { title: 'Клиентский альбом', data: { canvas: { width: 1480, height: 2100 }, settings: {}, pages: [{ id: 'p1', frames: [] } } } }),
    });
  });
  await page.goto('/album/demo-token');
  await expect(page.getByText('Клиентский альбом')).toBeVisible();
  await expect(page.locator('.app-header-v2')).toHaveCount(0);
  await expect(page.locator('.editor-workspace-v2')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Увеличить' })).toBeVisible();
});
`);

console.log('Public album sharing migration applied');
