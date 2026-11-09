import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import { installPreview } from './devPreview';
import { applyTheme } from './theme';
import { platform } from './platform';
document.documentElement.dataset.platform = platform;
installPreview();
applyTheme();
// The floating HUD window shares this storage; keep both windows on the same theme.
window.addEventListener('storage', (e) => {
  if (e.key === 'river.theme') applyTheme();
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
