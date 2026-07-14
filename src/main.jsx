import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './editor-shell-v1.css';
import App from './AppLive.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
