import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/fonts.css';
import './ui/styles.css';
import { App } from './ui/App';
import { installTokens } from './ui/tokens';
import { installNetMonitor } from './data/net-monitor';
import { trackDatabaseConnections } from './data/store';

installTokens(document);
// Before anything can make a request: every cross-origin fetch is recorded for the
// "Leaving your device" bar.
installNetMonitor();
// Lets "Delete everything" close every IndexedDB connection (including the Firebase SDK's) before
// deleting the databases.
trackDatabaseConnections();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline shell (production builds only). The worker caches same-origin files and never
// talks to any other origin.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
