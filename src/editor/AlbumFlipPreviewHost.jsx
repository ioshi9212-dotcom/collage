import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import AlbumFlipPreview from './AlbumFlipPreview';
import AlbumPageCanvas from './AlbumPageCanvas';
import { hydratePhotoProject } from './photoAssets';

function findCurrentPageIndex(project) {
  const pages = Array.isArray(project?.pages) ? project.pages : [];
  const index = pages.findIndex((page) => page?.id === project?.currentPageId);
  return Math.max(0, index);
}

export default function AlbumFlipPreviewHost() {
  const [headerTarget, setHeaderTarget] = useState(null);
  const [project, setProject] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const findTarget = () => setHeaderTarget(document.querySelector('.app-header-actions-v2'));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function openPreview() {
    if (loading) return;
    const snapshot = window.__collageApp?.getProject?.();
    if (!snapshot?.pages?.length) return;
    setLoading(true);
    try {
      const hydrated = await hydratePhotoProject(snapshot);
      setProject(hydrated);
      setOpen(true);
    } catch (error) {
      console.warn('Album flip preview could not prepare photos', error);
      setProject(snapshot);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  const launcher = headerTarget ? createPortal(
    <button className="button album-flip-open-button" type="button" disabled={loading} onClick={openPreview}>
      {loading ? 'Готовлю альбом…' : 'Листать альбом'}
    </button>,
    headerTarget,
  ) : null;

  return (
    <>
      {launcher}
      {project && (
        <AlbumFlipPreview
          open={open}
          pageCount={project.pages.length}
          startPageIndex={findCurrentPageIndex(project)}
          pageAspect={(project.canvas?.width || 1480) / Math.max(1, project.canvas?.height || 2100)}
          renderPage={(pageIndex) => <AlbumPageCanvas project={project} pageIndex={pageIndex} />}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
