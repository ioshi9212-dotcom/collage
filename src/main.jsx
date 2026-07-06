import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './compact.css';
import './canvas-scale-fix.css';
import './button-cleanup.css';
import './inspector-cleanup.css';
import App from './AppLive.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
