import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  albumMaxSpread,
  albumSpreadForPage,
  albumSpreadPages,
  albumVisiblePageLabel,
} from './albumFlipModel';

const TURN_MS = 720;

function PageFace({ pageIndex, side, renderPage, cover = false }) {
  const empty = pageIndex == null;
  return (
    <div className={`album-flip-face album-flip-face-${side} ${empty ? 'is-empty' : ''} ${cover ? 'is-cover' : ''}`}>
      {empty ? <div className="album-flip-empty-page" /> : renderPage(pageIndex)}
      <span className="album-flip-paper-edge" aria-hidden="true" />
    </div>
  );
}

function StaticPage({ pageIndex, side, renderPage }) {
  return (
    <div className={`album-flip-static-page album-flip-static-${side} ${pageIndex == null ? 'is-empty' : ''}`}>
      <PageFace pageIndex={pageIndex} side={side} renderPage={renderPage} cover={pageIndex === 0} />
    </div>
  );
}

function TurningLeaf({ turn, current, adjacent, renderPage }) {
  if (!turn) return null;
  const forward = turn === 'next';
  const frontIndex = forward ? current.right : current.left;
  const backIndex = forward ? adjacent.left : adjacent.right;
  return (
    <div className={`album-flip-turning-leaf ${forward ? 'turn-next' : 'turn-prev'}`} aria-hidden="true">
      <div className="album-flip-turning-inner">
        <PageFace pageIndex={frontIndex} side={forward ? 'right' : 'left'} renderPage={renderPage} cover={frontIndex === 0} />
        <div className="album-flip-back-face">
          <PageFace pageIndex={backIndex} side={forward ? 'left' : 'right'} renderPage={renderPage} />
        </div>
      </div>
    </div>
  );
}

export default function AlbumFlipPreview({
  open,
  pageCount,
  startPageIndex = 0,
  pageAspect = 0.705,
  renderPage,
  onClose,
}) {
  const maxSpread = albumMaxSpread(pageCount);
  const [spreadIndex, setSpreadIndex] = useState(() => albumSpreadForPage(startPageIndex, pageCount));
  const [turn, setTurn] = useState(null);
  const timerRef = useRef(null);
  const dragRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSpreadIndex(albumSpreadForPage(startPageIndex, pageCount));
    setTurn(null);
  }, [open, startPageIndex, pageCount]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowRight') requestTurn('next');
      if (event.key === 'ArrowLeft') requestTurn('prev');
    };
    window.addEventListener('keydown', onKeyDown);
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  const current = useMemo(() => albumSpreadPages(spreadIndex, pageCount), [spreadIndex, pageCount]);
  const previous = useMemo(() => albumSpreadPages(spreadIndex - 1, pageCount), [spreadIndex, pageCount]);
  const next = useMemo(() => albumSpreadPages(spreadIndex + 1, pageCount), [spreadIndex, pageCount]);

  if (!open) return null;

  function requestTurn(direction) {
    if (turn) return;
    const forward = direction === 'next';
    if (forward && spreadIndex >= maxSpread) return;
    if (!forward && spreadIndex <= 0) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setSpreadIndex((value) => value + (forward ? 1 : -1));
      return;
    }
    setTurn(direction);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setSpreadIndex((value) => value + (forward ? 1 : -1));
      setTurn(null);
    }, TURN_MS);
  }

  function beginSwipe(event) {
    dragRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function finishSwipe(event) {
    const start = dragRef.current;
    dragRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const elapsed = Date.now() - start.time;
    if (elapsed > 900 || Math.abs(dx) < 46 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    requestTurn(dx < 0 ? 'next' : 'prev');
  }

  const baseLeft = turn === 'prev' ? previous.left : current.left;
  const baseRight = turn === 'next' ? next.right : current.right;
  const adjacent = turn === 'next' ? next : previous;
  const progress = maxSpread ? Math.round((spreadIndex / maxSpread) * 100) : 100;
  const safeAspect = Math.min(2, Math.max(0.25, Number(pageAspect) || 0.705));
  const bookAspect = safeAspect * 2;

  return (
    <div className="album-flip-overlay" role="dialog" aria-modal="true" aria-label="Просмотр альбома">
      <div className="album-flip-dialog" ref={dialogRef} tabIndex={-1}>
        <header className="album-flip-header">
          <div>
            <strong>Альбом</strong>
            <span>{albumVisiblePageLabel(spreadIndex, pageCount)} · всего {pageCount}</span>
          </div>
          <button type="button" className="album-flip-close" onClick={onClose} aria-label="Закрыть просмотр">×</button>
        </header>

        <div
          className="album-flip-scene"
          style={{
            '--album-page-aspect': String(safeAspect),
            '--album-book-aspect': String(bookAspect),
            '--album-book-width-by-height': `${74 * bookAspect}dvh`,
            '--album-book-mobile-width-by-height': `${68 * bookAspect}dvh`,
          }}
          onPointerDown={beginSwipe}
          onPointerUp={finishSwipe}
          onPointerCancel={() => { dragRef.current = null; }}
        >
          <div className="album-flip-book-shadow" aria-hidden="true" />
          <div className="album-flip-book">
            <div className="album-flip-cover-back" aria-hidden="true" />
            <StaticPage pageIndex={baseLeft} side="left" renderPage={renderPage} />
            <StaticPage pageIndex={baseRight} side="right" renderPage={renderPage} />
            <TurningLeaf turn={turn} current={current} adjacent={adjacent} renderPage={renderPage} />
            <div className="album-flip-spine" aria-hidden="true" />
          </div>
          <button type="button" className="album-flip-hit album-flip-hit-prev" onClick={() => requestTurn('prev')} disabled={spreadIndex <= 0 || Boolean(turn)} aria-label="Предыдущий разворот">‹</button>
          <button type="button" className="album-flip-hit album-flip-hit-next" onClick={() => requestTurn('next')} disabled={spreadIndex >= maxSpread || Boolean(turn)} aria-label="Следующий разворот">›</button>
        </div>

        <footer className="album-flip-footer">
          <button type="button" onClick={() => requestTurn('prev')} disabled={spreadIndex <= 0 || Boolean(turn)}>← Назад</button>
          <label className="album-flip-progress">
            <span>{progress}%</span>
            <input
              type="range"
              min="0"
              max={Math.max(0, maxSpread)}
              value={spreadIndex}
              disabled={Boolean(turn)}
              onChange={(event) => setSpreadIndex(Number(event.target.value))}
              aria-label="Перейти к развороту"
            />
          </label>
          <button type="button" onClick={() => requestTurn('next')} disabled={spreadIndex >= maxSpread || Boolean(turn)}>Вперёд →</button>
        </footer>
        <p className="album-flip-help">Тяни страницу или листай стрелками. На телефоне работает свайп.</p>
      </div>
    </div>
  );
}
