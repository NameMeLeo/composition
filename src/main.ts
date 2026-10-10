/* =====================================================================
   Composition — application entry point.
   Local-first body composition tracker. No secrets live in this file: OCR
   runs server-side behind the Supabase Edge Function proxy
   (see supabase/functions/ocr).

   Thin boot: settings + theme, shell wiring (app/shell-events.ts), cached
   readings, auth, then route. Page rendering lives in pages/*.
   ===================================================================== */

import { Settings } from './core/settings.js';
import { applyI18n } from './core/i18n.js';
import { Auth } from './services/auth.js';
import { applyTheme, applyMotion } from './core/theme.js';
import { loadReadings } from './data/store.js';
import { bindShellEvents } from './app/shell-events.js';
import { consumeShareToken } from './services/share.js';
import { showApp, showAuth } from './core/shell.js';

// Importing a page registers its render function with the router.
import './pages/history.js';
import './pages/settings.js';
import './pages/dashboard.js';
import './pages/trends.js';
import './pages/detail.js';

/* Registered before the first await: boot() does network work (the Supabase
   client is imported lazily), and waiting for the load event here would miss it
   on a slow first paint. Offline support is optional, so failures are ignored. */
function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((registration) => registration.update())
    .catch(() => undefined);
}

async function boot(): Promise<void> {
  Settings.load();
  applyI18n();
  applyTheme();
  applyMotion();

  bindShellEvents();
  registerServiceWorker();

  await loadReadings();

  const session = await Auth.init();
  Auth.onChange((s) => { if (s) showApp(); else showAuth(); });

  if (session) showApp();
  else showAuth();

  // Runs last: a shared report opens the review screen, which needs the shell up.
  await consumeShareToken();
}

// Module scripts are deferred, so this normally runs during parsing, but a cached
// load can race it.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
