import { useEffect, useMemo, useRef, useState } from 'react';
import AlbumFlipPreview from './AlbumFlipPreview';
import AlbumPageCanvas from './AlbumPageCanvas';
import { fetchPublicAlbum } from './publicAlbum';

const MOBILE_VIEWER_QUERY = '(max-width: 760px), (max-width: 920px) and (pointer: coarse) and (orientation: landscape)';

function useMobileViewer() {
  const [mobile, setMobile] = useState(() => (
    globalThis.matchMedia?.(MOBILE_VIEWER_QUERY).matches ?? globalThis.innerWidth <= 760
  ));

  useEffect(() => {
    const query = globalThis.matchMedia?.(MOBILE_VIEWER_QUERY);
    if (!query) return undefined;
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return mobile;
}

function MobilePublicAlbum({ project }) {
  const pageCount = project.pages.length;
  const [pageIndex, setPageIndex] = useState(0);
  const touchRef = useRef(null);
  const aspect = (project.canvas?.width || 1480) / Math.max(1, project.canvas?.height || 2100);

  useEffect(() => {
    setPageIndex(0);
  }, [project]);

  function go(delta) {
    setPageIndex((current) => Math.max(0, Math.min(pageCount - 1, current + delta)));
  }

  function onTouchStart(event) {
    if (event.touches.length !== 1) {
      touchRef.current = null;
      return;
    }
    const touch = event.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event) {
    const start = touchRef.current;
    touchRef.current = null;
    const touch = event.changedTouches?.[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) go(1);
    else go(-1);
  }

  return (
    <main className="public-album-mobile" aria-label="Публичный просмотр альбома">
      <div
        className="public-album-mobile-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="public-album-mobile-page"
          style={{ '--public-page-aspect': String(aspect) }}
          aria-label={`Страница ${pageIndex + 1} из ${pageCount}`}
        >
          <AlbumPageCanvas project={project} pageIndex={pageIndex} previewWidth={900} />
        </div>
      </div>
      <nav className="public-album-mobile-nav" aria-label="Навигация по альбому">
        <button type="button" aria-label="Предыдущая страница" onClick={() => go(-1)} disabled={pageIndex <= 0}>‹</button>
        <span>{pageIndex + 1} / {pageCount}</span>
        <button type="button" aria-label="Следующая страница" onClick={() => go(1)} disabled={pageIndex >= pageCount - 1}>›</button>
      </nav>
      <p className="public-album-mobile-hint">Свайп листает · двумя пальцами можно увеличить</p>
    </main>
  );
}

export default function PublicAlbumViewer({ token }) {
  const [state, setState] = useState({ loading: true, album: null, error: '' });
  const mobile = useMobileViewer();

  useEffect(() => {
    let active = true;
    setState({ loading: true, album: null, error: '' });
    fetchPublicAlbum(token)
      .then((album) => {
        if (!active) return;
        if (!album?.data?.pages?.length) throw new Error('В альбоме пока нет страниц');
        setState({ loading: false, album, error: '' });
      })
      .catch((error) => {
        if (active) setState({ loading: false, album: null, error: error?.message || 'Альбом недоступен' });
      });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!state.album?.title) return;
    document.title = `${state.album.title} · Альбом`;
    return () => { document.title = 'Collage Creator'; };
  }, [state.album?.title]);

  const project = state.album?.data;
  const pageAspect = useMemo(
    () => (project?.canvas?.width || 1480) / Math.max(1, project?.canvas?.height || 2100),
    [project],
  );

  if (state.loading) {
    return <main className="public-album-status"><div className="public-album-spinner" /><p>Открываю альбом…</p></main>;
  }

  if (state.error || !project) {
    return (
      <main className="public-album-status public-album-error">
        <strong>Альбом недоступен</strong>
        <p>{state.error || 'Ссылка больше не работает.'}</p>
      </main>
    );
  }

  if (mobile) return <MobilePublicAlbum project={project} />;

  return (
    <main className="public-album-desktop">
      <AlbumFlipPreview
        open
        standalone
        pageCount={project.pages.length}
        startPageIndex={0}
        pageAspect={pageAspect}
        renderPage={(pageIndex) => <AlbumPageCanvas project={project} pageIndex={pageIndex} previewWidth={760} />}
      />
    </main>
  );
}
