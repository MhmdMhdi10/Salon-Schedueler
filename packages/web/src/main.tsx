import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n';
import './styles/tokens.css';
import { reportWebVitals } from './utils/webVitals';

// Register service worker for PWA — production only. In dev, vite-plugin-pwa
// does not build `/sw.js` (devOptions.enabled = false), so the raw Workbox
// source (an ES module) would be served and fail to register as a classic
// worker ("Cannot use import statement outside a module"). Skip it in dev.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// Core Web Vitals field reporting (task 11.3; seo §9/§12; R9.4). Consent-aware
// and PII-free: this is a no-op unless analytics consent has been granted, and
// it dynamically imports `web-vitals` so non-consenting visitors never pay for
// it. INP is field-only — no lab tool measures it — so this is how the
// INP < 200ms (and the 75th-percentile LCP/CLS) budgets are actually observed.
reportWebVitals();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Static boot screen exists before React/route chunks download, so cold visits
// never flash blank. Reveal the rendered app after one short branded beat.
const bootLoader = document.getElementById('app-boot-loader');
if (bootLoader) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(
    () => {
      bootLoader.classList.add('is-leaving');
      window.setTimeout(() => bootLoader.remove(), reduced ? 0 : 260);
    },
    reduced ? 0 : 650,
  );
}
