import React from 'react';
import { createRoot } from 'react-dom/client';
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
import { installPageRailBehavior } from './editor/pageRailBehavior';
import { installToolStateBehavior } from './editor/toolStateBehavior';
import { installTextEditingBehavior } from './editor/textEditingBehavior';
import { installDestructiveActionBehavior } from './editor/destructiveActionBehavior';
import { installInspectorContextBehavior } from './editor/inspectorContextBehavior';
import { installLegacyControlIsolation } from './editor/legacyControlIsolation';
import App from './AppLive.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

installLegacyControlIsolation();
installPageRailBehavior();
installToolStateBehavior();
installTextEditingBehavior();
installDestructiveActionBehavior();
installInspectorContextBehavior();
