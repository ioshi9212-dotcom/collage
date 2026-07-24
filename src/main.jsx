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
import { installPageRailBehavior } from './editor/pageRailBehavior';
import { installToolStateBehavior } from './editor/toolStateBehavior';
import { installTextEditingBehavior } from './editor/textEditingBehavior';
import { installDestructiveActionBehavior } from './editor/destructiveActionBehavior';
import { installInspectorContextBehavior } from './editor/inspectorContextBehavior';
import { installMobileEditorBehavior } from './editor/mobileEditorBehavior';
import App from './AppLive.jsx';

const MOBILE_CANVAS_QUERY = '(max-width: 760px), (max-width: 920px) and (pointer: coarse) and (orientation: landscape)';

function configureCanvasPerformance() {
  const mobileViewport = window.matchMedia?.(MOBILE_CANVAS_QUERY).matches ?? window.innerWidth <= 760;

  // The editor keeps the real A5 print coordinates (1480×2100) and scales only
  // the DOM preview. On a DPR 3 phone Konva would otherwise allocate both its
  // scene and hit canvases at 3× resolution, which can exceed mobile tab memory.
  if (mobileViewport) Konva.pixelRatio = 1;
  Konva.releaseCanvasOnDestroy = true;

  window.__collageCanvasPerformance = {
    mobileViewport,
    previewPixelRatio: mobileViewport ? 1 : (Konva.pixelRatio || window.devicePixelRatio || 1),
  };
}

configureCanvasPerformance();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
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
