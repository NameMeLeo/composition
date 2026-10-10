/* Composition — app-frame wiring (not a single page).
   Owns the shell chrome: route delegation, auth button, capture sheet form,
   scanner chrome, review chrome, history/settings init, and global listeners.
   Pages own their rendering; this module owns everything around them. */

import { $, $input, toast } from '../core/dom.js';
import { Auth } from '../services/auth.js';
import { Route } from '../core/router.js';
import { on } from '../core/events.js';
import { parseReportUrl, DEFAULT_REPORT_LANGUAGE } from '../services/report-url.js';
import { Capture } from '../ingest/capture.js';
import { ScanFan } from '../ingest/scanfan.js';
import { closeReview, saveReview } from '../ingest/review.js';
import { initHistory } from '../pages/history.js';
import { initSettings } from '../pages/settings.js';

/** Everything that belongs to the app frame rather than to one page. */
export function bindShellEvents(): void {
  /* Route buttons are handled by delegation because the nav is rebuilt often. */
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const routeBtn = target?.closest?.('[data-route]');
    if (routeBtn) {
      const dest = routeBtn.getAttribute('data-route');
      if (dest === 'capture') Capture.openSheet();
      else if (dest) Route.go(dest);
      return;
    }
    if (target?.closest?.('[data-close-sheet]')) Capture.closeSheet();
  });

  ($('#btn-signin') as HTMLButtonElement).addEventListener('click', async () => {
    try {
      ($('#auth-note') as HTMLElement).textContent = 'Opening Google…';
      await Auth.signInWithGoogle();
    } catch (err) {
      ($('#auth-note') as HTMLElement).textContent = err instanceof Error ? err.message
        : 'Sign-in could not start. Check the Supabase Google provider and redirect URL.';
    }
  });

  ScanFan.init();

  ($('#url-form') as HTMLFormElement).addEventListener('submit', (e) => {
    e.preventDefault();
    const parsed = parseReportUrl($input('#in-report-url').value);
    if (!parsed.ok) {
      toast(parsed.reason === 'no-base'
        ? 'A player id on its own needs a report address. Add one in Settings, or paste the full link.'
        : 'That does not look like a report link', 'error');
      return;
    }
    Capture.closeSheet();
    void Capture.startReading({ mode: 'report-url', url: parsed.url, playerId: parsed.playerId, language: parsed.language });
  });

  ($input('#file-picker') as HTMLInputElement).addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    Capture.closeSheet();
    if (file.size > 18 * 1024 * 1024) { toast('That file is larger than 18 MB', 'error'); return; }
    void Capture.startReading({ mode: 'file', file });
  });

  /* Scanner chrome */
  ($('#btn-scanner-close') as HTMLButtonElement).addEventListener('click', () => Capture.stopScanner());
  ($('#btn-scanner-torch') as HTMLButtonElement).addEventListener('click', () => void Capture.toggleTorch());
  ($('#btn-scanner-image') as HTMLButtonElement).addEventListener('click', () => ($input('#scanner-image') as HTMLInputElement).click());
  ($input('#scanner-image') as HTMLInputElement).addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
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
          void Capture.startReading({ mode: 'player-id', playerId: text.trim(), language: DEFAULT_REPORT_LANGUAGE });
          return;
        }
        toast('That code is not a report link', 'error');
        return;
      }
      Capture.stopScanner();
      void Capture.startReading({ mode: 'report-url', url: parsed.url, playerId: parsed.playerId, language: parsed.language });
    } catch (err) {
      toast('The photo could not be read', 'error');
    }
  });

  /* Review screen chrome */
  ($('#btn-review-close') as HTMLButtonElement).addEventListener('click', closeReview);
  ($('#btn-review-cancel') as HTMLButtonElement).addEventListener('click', closeReview);
  ($('#btn-review-save') as HTMLButtonElement).addEventListener('click', () => void saveReview());
  ($('#btn-detail-back') as HTMLButtonElement).addEventListener('click', () => Route.back());

  initHistory();
  initSettings();

  // A camera left running in a backgrounded tab holds the LED on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !($('#view-scanner') as HTMLElement).hidden) Capture.stopScanner();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!($('#view-scanner') as HTMLElement).hidden) Capture.stopScanner();
    else if (!($('#view-review') as HTMLElement).hidden) closeReview();
    else if (!($('#sheet-capture') as HTMLElement).hidden) Capture.closeSheet();
  });

  /* Charts size themselves from their container, so a resize needs a redraw. */
  let resizeTimer: number | null = null;
  window.addEventListener('resize', () => {
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (Route.current() === 'dashboard' || Route.current() === 'trends') Route.refresh();
    }, 180);
  });

  /* Whatever view is mounted re-renders when the reading set changes. While the
     sign-in screen is up there is nothing to redraw, and rendering into a hidden
     shell would size charts against a zero-width container. */
  on('readings', () => {
    if (($('#shell') as HTMLElement).hidden) return;
    Route.refresh();
  });
}
