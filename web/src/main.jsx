// ============================================================================
// LumiShelf Web Application Entry Point (Vite + React)
// ============================================================================
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

/**
 * Locate the root DOM node defined in web/index.html (<div id="root"></div>)
 * and mount the LumiShelf React application tree inside StrictMode.
 */
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'Root container (#root) was not found in web/index.html. Please verify your index.html file.'
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);