import React from 'react';
import { createRoot } from 'react-dom/client';
import Konva from 'konva';
import './styles.css';
import './editor-shell-v1.css';
import './editor-shell-v1-compat.css';
import './editor-shell-v2.css';
import './button-audit.css';
import './editor-shell-stage1-structure.css';
import './editor-shell-stage2-deduplicate.css';
import './editor-shell-stage3-page-rail.css';
import './editor-shell-stage4a-tool-state.css';
import './editor-shell-stage4b-text-rendering.css';
import './editor-shell-stage6-inspector-context.css';
import './editor-regression-fixes.css';
import './editor-shell-stage4c-larger-canvas.css';
import './font-picker-live.css';
import './editor-mobile.css';
import './editor-mobile-mode-fixes.css';
import './photo-upload-progress.css';
import './photo-import-report.css';
import './album-flip-preview.css';
import './album-flip-leaf-surface.css';
import './public-album.css';
import { installPageRailBehavior } from './editor/pageRailBehavior';
import { installToolStateBehavior } from './editor/toolStateBehavior';
import { installTextEditingBehavior } from './editor/textEditingBehavior';
import { installDestructiveActionBehavior } from './editor/destructiveActionBehavior';
import { installInspectorContextBehavior } from './editor/inspectorContextBehavior';
import { installMobileEditorBehavior } from './editor/mobileEditorBehavior';
import { publicAlbumTokenFromPath } from './editor/publicAlbum';
import PublicAlbumViewer from './editor/PublicAlbumViewer';
import AlbumFlipPreviewHost from './editor/AlbumFlipPreviewHost';
import App from './AppLive.jsx';

const publicAlbumToken = publicAlbumTokenFromPath(window.location.pathname);
if (publicAlbumToken) document.body.classList.add('public-album-route');

if (!publicAlbumToken) {
  try {
    localStorage.setItem('collage-cloud-panel-collapsed', '1');
  } catch {
    // The editor remains usable when storage is blocked by the browser.
  }
}

const MOBILE_CANVAS_QUERY = '(max-width: 760px), (max-width: 920px) and (pointer: coarse) and (orientation: landscape)';

function configureCanvasPerformance({ publicViewer = false } = {}) {
  const mobileViewport = window.matchMedia?.(MOBILE_CANVAS_QUERY).matches ?? window.innerWidth <= 760;

  // The editor keeps the real print coordinates and scales only the DOM preview.
  // The public viewer renders a single high-resolution page on phones, so it can
  // afford a little more pixel density than the full editor.
  if (mobileViewport) {
    Konva.pixelRatio = publicViewer
      ? Math.min(2, Math.max(1, window.devicePixelRatio || 1))
      : 1;
  }
  Konva.releaseCanvasOnDestroy = true;

  window.__collageCanvasPerformance = {
    mobileViewport,
    previewPixelRatio: Konva.pixelRatio || window.devicePixelRatio || 1,
    publicViewer,
  };
}

configureCanvasPerformance({ publicViewer: Boolean(publicAlbumToken) });

const root = createRoot(document.getElementById('root'));

if (publicAlbumToken) {
  root.render(
    <React.StrictMode>
      <PublicAlbumViewer token={publicAlbumToken} />
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
      <AlbumFlipPreviewHost />
    </React.StrictMode>,
  );

  installPageRailBehavior();
  installToolStateBehavior();
  // Install the mobile guard before text behavior, which otherwise sharpens the
  // visible editor canvas after startup. Export stages are deliberately excluded.
  installMobileEditorBehavior();
  installTextEditingBehavior();
  installDestructiveActionBehavior();
  installInspectorContextBehavior();
}
