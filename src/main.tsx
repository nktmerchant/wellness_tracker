import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startSync } from './sync';

startSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Production only: in dev a service worker would cache Vite's modules and
 * fight hot reload. Registered relative to the page, so it works whether the
 * site is served from a domain root or a GitHub Pages /<repo>/ path.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js');
  });
}
