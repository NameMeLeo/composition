/* =====================================================================
   Composition — application entry point.
   Local-first body composition tracker. No secrets live in this file: OCR
   runs server-side behind the Supabase Edge Function proxy
   (see supabase/functions/ocr).

   This module owns the shell: it loads settings, wires the chrome that is not
   part of any single page, and then hands over to the router.
   ===================================================================== */

import { $, toast } from './core/dom.js';
import { Settings } from './core/settings.js';
import { Auth } from './services/auth.js';
import { Route } from './core/router.js';
import { applyTheme, applyMotion } from './core/theme.js';
import { loadReadings } from './data/store.js';
import { on } from './core/events.js';
import { parseReportUrl, DEFAULT_REPORT_LANGUAGE } from './services/report-url.js';
import { Capture } from './ingest/capture.js';
import { ScanFan } from './ingest/scanfan.js';
import { closeReview, saveReview } from './ingest/review.js';
import { consumeShareToken } from './services/share.js';
import { showApp, showAuth } from './core/shell.js';

// Importing a page registers its render function with the router.
import { initHistory } from './pages/history.js';
import { initSettings } from './pages/settings.js';
import './pages/dashboard.js';
import './pages/trends.js';
import './pages/detail.js';

/** Everything that belongs to the app frame rather than to one page. */
function bindShellEvents() {
  /* Route buttons are handled by delegation because the nav is rebuilt often. */
  document.addEventListener('click', (e) => {
    const routeBtn = e.target.closest('[data-route]');
    if (routeBtn) {
      const target = routeBtn.getAttribute('data-route');
      if (target === 'capture') Capture.openSheet();
      else Route.go(target);
      return;
    }
    if (e.target.closest('[data-close-sheet]')) Capture.closeSheet();
  });

  $('#btn-signin').addEventListener('click', async () => {
    try {
      $('#auth-note').textContent = 'Opening Google…';
      await Auth.signInWithGoogle();
    } catch (err) {
      $('#auth-note').textContent = err && err.message ? err.message
        : 'Sign-in could not start. Check the Supabase Google provider and redirect URL.';
    }
  });

  ScanFan.init();

  $('#url-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const parsed = parseReportUrl($('#in-report-url').value);
    if (!parsed.ok) {
      toast(parsed.reason === 'no-base'
        ? 'A player id on its own needs a report address. Add one in Settings, or paste the full link.'
        : 'That does not look like a report link', 'error');
      return;
    }
    Capture.closeSheet();
    Capture.startReading({ mode: 'report-url', url: parsed.url, playerId: parsed.playerId, language: parsed.language });
  });

  $('#file-picker').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    Capture.closeSheet();
    if (file.size > 18 * 1024 * 1024) { toast('That file is larger than 18 MB', 'error'); return; }
    Capture.startReading({ mode: 'file', file });
  });

  /* Scanner chrome */
  $('#btn-scanner-close').addEventListener('click', () => Capture.stopScanner());
  $('#btn-scanner-torch').addEventListener('click', () => Capture.toggleTorch());
  $('#btn-scanner-image').addEventListener('click', () => $('#scanner-image').click());
  $('#scanner-image').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await Capture.scanImageFile(file);
      if (!text) { toast('No QR code found in that photo', 'error'); return; }

      const parsed = parseReportUrl(text);
      if (!parsed.ok) {
        // A bare player id is still useful, but anything else is not a report.
        if (/\d{6,}/.test(text)) {
          Capture.stopScanner();
          if (parsed.reason === 'no-base') {
            toast('A player id on its own needs a report address to look up. Add one in Settings.', 'error');
            return;
          }
          Capture.startReading({ mode: 'player-id', playerId: text.trim(), language: DEFAULT_REPORT_LANGUAGE });
          return;
        }
        toast('That code is not a report link', 'error');
        return;
      }
      Capture.stopScanner();
      Capture.startReading({ mode: 'report-url', url: parsed.url, playerId: parsed.playerId, language: parsed.language });
    } catch (err) {
      toast('The photo could not be read', 'error');
    }
  });

  /* Review screen chrome */
  $('#btn-review-close').addEventListener('click', closeReview);
  $('#btn-review-cancel').addEventListener('click', closeReview);
  $('#btn-review-save').addEventListener('click', saveReview);
  $('#btn-detail-back').addEventListener('click', () => Route.back());

  initHistory();
  initSettings();

  // A camera left running in a backgrounded tab holds the LED on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !$('#view-scanner').hidden) Capture.stopScanner();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#view-scanner').hidden) Capture.stopScanner();
    else if (!$('#view-review').hidden) closeReview();
    else if (!$('#sheet-capture').hidden) Capture.closeSheet();
  });

  /* Charts size themselves from their container, so a resize needs a redraw. */
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (Route.current() === 'dashboard' || Route.current() === 'trends') Route.refresh();
    }, 180);
  });

  /* Whatever view is mounted re-renders when the reading set changes. While the
     sign-in screen is up there is nothing to redraw, and rendering into a hidden
     shell would size charts against a zero-width container. */
  on('readings', () => {
    if ($('#shell').hidden) return;
    Route.refresh();
  });
}

/* Registered before the first await: boot() does network work (the Supabase
   client is imported lazily), and waiting for the load event here would miss it
   on a slow first paint. Offline support is optional, so failures are ignored. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function boot() {
  Settings.load();
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
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
