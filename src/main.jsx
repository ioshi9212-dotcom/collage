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
import { installPageRailBehavior } from './editor/pageRailBehavior';
import App from './AppLive.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

installPageRailBehavior();
