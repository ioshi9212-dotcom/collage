import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './AppFixed.jsx';
import './styles.css';
import './compact.css';
import './export.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
