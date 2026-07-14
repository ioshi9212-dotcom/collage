import { useEffect, useRef, useState } from 'react';
import { loadPhotoThumbnail } from './photoThumbnails';

const OBSERVER_MARGIN = '240px 0px';

export default function PhotoLibraryThumbnail({ photo }) {
  const holderRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = holderRef.current;
    if (!node) return undefined;
    if (typeof globalThis.IntersectionObserver !== 'function') {
      setVisible(true);
      return undefined;
    }

    const observer = new globalThis.IntersectionObserver((entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting));
    }, { rootMargin: OBSERVER_MARGIN });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPreviewSrc('');
    setFailed(false);
  }, [photo?.src]);

  useEffect(() => {
    let cancelled = false;
    if (!visible) {
      setPreviewSrc('');
      return () => { cancelled = true; };
    }
    if (!photo?.src || failed) return () => { cancelled = true; };

    loadPhotoThumbnail(photo.src)
      .then((src) => {
        if (!cancelled) setPreviewSrc(src);
      })
      .catch((error) => {
        console.warn('Photo thumbnail failed', error);
        if (!cancelled) setFailed(true);
      });

    return () => { cancelled = true; };
  }, [visible, photo?.src, failed]);

  return (
    <div ref={holderRef} className={`photo-thumbnail ${failed ? 'photo-thumbnail-failed' : ''}`}>
      {visible && previewSrc ? (
        <img
          src={previewSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          loading="lazy"
          onError={() => {
            setPreviewSrc('');
            setFailed(true);
          }}
        />
      ) : (
        <span className="photo-thumbnail-placeholder" aria-hidden="true">
          {failed ? 'Нет превью' : 'Фото'}
        </span>
      )}
    </div>
  );
}
