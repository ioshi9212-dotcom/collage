import { useEffect, useMemo, useRef, useState } from 'react';
import {
  albumMaxSpread,
  albumSpreadForPage,
  albumSpreadPages,
  albumTurningLeafPages,
  albumTurningLeafVisibleFace,
  albumVisiblePageLabel,
} from './albumFlipModel';

const TURN_MS = 760;
const TURN_COMMIT_PROGRESS = 0.2;
const MAX_STACK_LAYERS = 8;

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function easeInOutCubic(value) {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function PageFace({ pageIndex, side, renderPage, cover = false }) {
  const empty = pageIndex == null;
  return (
    <div className={`album-flip-face album-flip-face-${side} ${empty ? 'is-empty' : ''} ${cover ? 'is-cover' : ''}`}>
      {empty ? <div className="album-flip-empty-page" /> : renderPage(pageIndex)}
      <span className="album-flip-paper-grain" aria-hidden="true" />
      <span className="album-flip-paper-edge album-flip-paper-edge-bottom" aria-hidden="true" />
      <span className="album-flip-paper-edge album-flip-paper-edge-outer" aria-hidden="true" />
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

function PaperStack({ side, depth }) {
  const visibleLayers = Math.min(MAX_STACK_LAYERS, Math.max(0, Math.ceil(Number(depth) || 0)));
  if (!visibleLayers) return null;
  return (
    <div className={`album-flip-paper-stack album-flip-paper-stack-${side}`} aria-hidden="true">
      {Array.from({ length: visibleLayers }, (_, index) => (
        <span
          key={`${side}-${index}`}
          style={{
            '--album-stack-index': String(index + 1),
            '--album-stack-opacity': String(0.95 - index * 0.055),
          }}
        />
      ))}
    </div>
  );
}

function TurningLeaf({ turn, progress, current, adjacent, renderPage }) {
  if (!turn) return null;
  const forward = turn === 'next';
  const { front: frontIndex, back: backIndex } = albumTurningLeafPages(turn, current, adjacent);
  const safeProgress = clamp01(progress);
  const visibleFace = albumTurningLeafVisibleFace(safeProgress);
  const wave = Math.sin(safeProgress * Math.PI);
  const angle = (forward ? -180 : 180) * safeProgress;
  const lift = wave * 34;
  const tilt = (forward ? -1 : 1) * wave * 1.7;
  const curl = (forward ? -1 : 1) * wave * 34;
  const radius = wave * 26;
  const pinch = 1 - wave * 0.035;
  const shadow = Math.min(1, wave * 1.35);

  return (
    <div
      className={`album-flip-turning-leaf ${forward ? 'turn-next' : 'turn-prev'}`}
      style={{
        '--album-turn-angle': `${angle}deg`,
        '--album-turn-lift': `${lift}px`,
        '--album-turn-tilt': `${tilt}deg`,
        '--album-turn-curl': `${curl}deg`,
        '--album-turn-radius': `${radius}px`,
        '--album-turn-pinch': String(pinch),
        '--album-turn-shadow': String(shadow),
      }}
      aria-hidden="true"
    >
      <div className="album-flip-turning-inner">
        <div
          className="album-flip-turning-front"
          data-album-leaf-side="front"
          data-page-index={frontIndex ?? ''}
          aria-hidden={visibleFace !== 'front'}
          style={{ visibility: visibleFace === 'front' ? 'visible' : 'hidden' }}
        >
          <PageFace
            key={`leaf-front-${frontIndex ?? 'empty'}`}
            pageIndex={frontIndex}
            side={forward ? 'right' : 'left'}
            renderPage={renderPage}
            cover={frontIndex === 0}
          />
        </div>
        <div
          className="album-flip-turning-back"
          data-album-leaf-side="back"
          data-page-index={backIndex ?? ''}
          aria-hidden={visibleFace !== 'back'}
          style={{ visibility: visibleFace === 'back' ? 'visible' : 'hidden' }}
        >
          <PageFace
            key={`leaf-back-${backIndex ?? 'empty'}`}
            pageIndex={backIndex}
            side={forward ? 'left' : 'right'}
            renderPage={renderPage}
          />
        </div>
        <span className="album-flip-fold-shadow" aria-hidden="true" />
        <span className="album-flip-leaf-curl" aria-hidden="true"><i /><b /></span>
        <span className="album-flip-leaf-rim" aria-hidden="true" />
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
  standalone = false,
  allowZoom = false,
  title = 'Альбом',
}) {
  const maxSpread = albumMaxSpread(pageCount);
  const [spreadIndex, setSpreadIndex] = useState(() => albumSpreadForPage(startPageIndex, pageCount));
  const [turn, setTurn] = useState(null);
  const [turnProgress, setTurnProgress] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const animationRef = useRef(0);
  const requestTurnRef = useRef(null);
  const dragRef = useRef(null);
  const dialogRef = useRef(null);
  const bookRef = useRef(null);

  function commitProgress(value) {
    setTurnProgress(clamp01(value));
  }

  function stopAnimation() {
    window.cancelAnimationFrame(animationRef.current);
    animationRef.current = 0;
  }

  function finishTurn(direction) {
    const forward = direction === 'next';
    setSpreadIndex((value) => Math.min(maxSpread, Math.max(0, value + (forward ? 1 : -1))));
    setTurn(null);
    commitProgress(0);
  }

  function animateTurn(direction, from, to, { commit = false } = {}) {
    stopAnimation();
    setTurn(direction);
    commitProgress(from);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      if (commit) finishTurn(direction);
      else {
        setTurn(null);
        commitProgress(0);
      }
      return;
    }

    const startedAt = performance.now();
    const distance = Math.max(0.08, Math.abs(to - from));
    const duration = Math.max(150, TURN_MS * distance);

    const tick = (now) => {
      const elapsed = Math.min(1, (now - startedAt) / duration);
      const eased = easeInOutCubic(elapsed);
      commitProgress(from + (to - from) * eased);
      if (elapsed < 1) {
        animationRef.current = window.requestAnimationFrame(tick);
        return;
      }
      animationRef.current = 0;
      if (commit) finishTurn(direction);
      else {
        setTurn(null);
        commitProgress(0);
      }
    };

    animationRef.current = window.requestAnimationFrame(tick);
  }

  function requestTurn(direction) {
    if (turn) return;
    const forward = direction === 'next';
    if (forward && spreadIndex >= maxSpread) return;
    if (!forward && spreadIndex <= 0) return;
    animateTurn(direction, 0, 1, { commit: true });
  }

  requestTurnRef.current = requestTurn;

  useEffect(() => {
    if (!open) return;
    window.cancelAnimationFrame(animationRef.current);
    animationRef.current = 0;
    setSpreadIndex(albumSpreadForPage(startPageIndex, pageCount));
    setTurn(null);
    setTurnProgress(0);
    setZoomed(false);
  }, [open, startPageIndex, pageCount]);

  useEffect(() => () => {
    window.cancelAnimationFrame(animationRef.current);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !standalone) onClose?.();
      if (event.key === 'ArrowRight') requestTurnRef.current?.('next');
      if (event.key === 'ArrowLeft') requestTurnRef.current?.('prev');
    };
    window.addEventListener('keydown', onKeyDown);
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, standalone]);

  const current = useMemo(() => albumSpreadPages(spreadIndex, pageCount), [spreadIndex, pageCount]);
  const previous = useMemo(() => albumSpreadPages(spreadIndex - 1, pageCount), [spreadIndex, pageCount]);
  const next = useMemo(() => albumSpreadPages(spreadIndex + 1, pageCount), [spreadIndex, pageCount]);

  if (!open) return null;

  function beginSwipe(event) {
    if (zoomed || turn || event.button > 0 || event.target.closest?.('button, input')) return;
    const rect = bookRef.current?.getBoundingClientRect();
    if (!rect || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    const direction = event.clientX >= rect.left + rect.width / 2 ? 'next' : 'prev';
    if (direction === 'next' && spreadIndex >= maxSpread) return;
    if (direction === 'prev' && spreadIndex <= 0) return;

    stopAnimation();
    setTurn(direction);
    commitProgress(0);
    dragRef.current = {
      direction,
      startX: event.clientX,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0,
      progress: 0,
      width: Math.max(1, rect.width / 2),
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveSwipe(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.lastTime);
    drag.velocity = (event.clientX - drag.lastX) / elapsed;
    drag.lastX = event.clientX;
    drag.lastTime = now;
    const distance = drag.direction === 'next'
      ? drag.startX - event.clientX
      : event.clientX - drag.startX;
    drag.progress = clamp01(distance / (drag.width * 0.82));
    commitProgress(drag.progress);
  }

  function finishSwipe() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const velocityCommits = drag.direction === 'next' ? drag.velocity < -0.35 : drag.velocity > 0.35;
    const shouldCommit = drag.progress >= TURN_COMMIT_PROGRESS || velocityCommits;
    animateTurn(drag.direction, drag.progress, shouldCommit ? 1 : 0, { commit: shouldCommit });
  }

  function cancelSwipe() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    animateTurn(drag.direction, drag.progress, 0, { commit: false });
  }

  const baseLeft = turn === 'prev' ? previous.left : current.left;
  const baseRight = turn === 'next' ? next.right : current.right;
  const adjacent = turn === 'next' ? next : previous;
  const progress = maxSpread ? Math.round((spreadIndex / maxSpread) * 100) : 100;
  const safeAspect = Math.min(2, Math.max(0.25, Number(pageAspect) || 0.705));
  const bookAspect = safeAspect * 2;
  const virtualSpread = spreadIndex + (turn === 'next' ? turnProgress : turn === 'prev' ? -turnProgress : 0);
  const leftStackDepth = Math.max(0, virtualSpread);
  const rightStackDepth = Math.max(0, maxSpread - virtualSpread);

  return (
    <div className={`album-flip-overlay ${standalone ? 'is-standalone' : ''} ${zoomed ? 'is-zoomed' : ''}`} role="dialog" aria-modal="true" aria-label="Просмотр альбома">
      <div className="album-flip-dialog" ref={dialogRef} tabIndex={-1}>
        <header className="album-flip-header">
          <div>
            <strong>{title}</strong>
            <span>{albumVisiblePageLabel(spreadIndex, pageCount)} · всего {pageCount}</span>
          </div>
          {!standalone && <button type="button" className="album-flip-close" onClick={onClose} aria-label="Закрыть просмотр">×</button>}
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
          onPointerMove={moveSwipe}
          onPointerUp={finishSwipe}
          onPointerCancel={cancelSwipe}
        >
          <div className="album-flip-book-shadow" aria-hidden="true" />
          <div className="album-flip-book" ref={bookRef}>
            <div className="album-flip-cover-back" aria-hidden="true" />
            <PaperStack side="left" depth={leftStackDepth} />
            <PaperStack side="right" depth={rightStackDepth} />
            <StaticPage pageIndex={baseLeft} side="left" renderPage={renderPage} />
            <StaticPage pageIndex={baseRight} side="right" renderPage={renderPage} />
            <TurningLeaf turn={turn} progress={turnProgress} current={current} adjacent={adjacent} renderPage={renderPage} />
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
          {allowZoom && <button type="button" className="album-flip-zoom-toggle" onClick={() => setZoomed((value) => !value)}>{zoomed ? 'Уменьшить' : 'Увеличить'}</button>}
          <button type="button" onClick={() => requestTurn('next')} disabled={spreadIndex >= maxSpread || Boolean(turn)}>Вперёд →</button>
        </footer>
        <p className="album-flip-help">{zoomed ? 'Перемещай увеличенный альбом пальцем. Нажми «Уменьшить», чтобы снова листать.' : 'Потяни внешний край листа или листай свайпом. Для деталей можно увеличить альбом.'}</p>
      </div>
    </div>
  );
}
