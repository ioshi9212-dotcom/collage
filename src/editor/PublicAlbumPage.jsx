import { useEffect, useState } from 'react';
import AlbumFlipPreview from './AlbumFlipPreview';
import { AlbumPagePreview } from './AlbumFlipPreviewHost';

function publicAlbumToken() {
  const match = window.location.pathname.match(/^\/album\/([^/]+)\/?$/);
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
