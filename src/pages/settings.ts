/* Composition — Settings.
   Account, appearance, the optional cloud mirror, the OCR proxy, device storage
   and every export, plus the wiring for all of the controls on this page. */

import { $, toast } from '../core/dom.js';
import { Settings } from '../core/settings.js';
import { Auth } from '../services/auth.js';
import { OcrProxy } from '../services/ocr.js';
import { mirrorSync } from '../data/sync.js';
import { getReadings, setReadings, Store } from '../data/store.js';
import { applyTheme, applyMotion, isStandalone } from '../core/theme.js';
import { fmtDateTime, relDays } from '../core/format.js';
import { exportJSON, exportCSV, exportSamsung, copySummary } from '../data/export.js';
import { Route } from '../core/router.js';
import { showAuth } from '../core/shell.js';

function describeMirrorSync(): string {
  const at = Settings.get().mirrorSyncedAt;
  if (!at) return 'Never synced';
  return fmtDateTime(at) + ' · ' + relDays(at);
}

export function renderSettings(): void {
  const user = Auth.user();
  ($('#account-name') as HTMLElement).textContent = user ? user.user_metadata?.full_name || 'Signed in' : 'Not signed in';
  ($('#account-email') as HTMLElement).textContent = user?.email ? user.email : 'No account connected';
  ($('#btn-account') as HTMLButtonElement).textContent = user ? 'Sign out' : 'Sign in';
  ($('#account-avatar') as HTMLElement).textContent = user ? (user.email || 'U').slice(0, 1).toUpperCase() : '?';

  ($('#sel-theme') as HTMLSelectElement).value = Settings.get().theme;
  ($('#sel-mass') as HTMLSelectElement).value = Settings.get().massUnit;
  ($('#chk-motion') as HTMLInputElement).checked = Boolean(Settings.get().reduceMotion);

  const mirrorOn = Boolean(Settings.get().mirror);
  ($('#chk-mirror') as HTMLInputElement).checked = mirrorOn;
  ($('#mirror-status') as HTMLElement).hidden = !mirrorOn;
  ($('#mirror-last') as HTMLElement).textContent = describeMirrorSync();
  ($('#in-supa-url') as HTMLInputElement).value = Settings.get().supabaseUrl || '';
  ($('#in-supa-key') as HTMLInputElement).value = Settings.get().supabaseAnonKey || '';

  const readings = getReadings();
  const count = readings.length;
  ($('#stat-count') as HTMLElement).textContent = count + ' reading' + (count === 1 ? '' : 's') + (count ? '' : ' on this device');

  let bytes = 0;
  try { bytes = new Blob([JSON.stringify(readings)]).size; } catch (e) { bytes = 0; }
  ($('#stat-size') as HTMLElement).textContent = bytes > 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(2) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';

  const configured = OcrProxy.isConfigured();
  const pill = $('#proxy-pill');
  pill.textContent = configured ? 'Connected' : 'Not configured';
  pill.className = 'pill' + (configured ? ' pill--ok' : ' pill--warn');
  ($('#proxy-sub') as HTMLElement).textContent = configured
    ? 'Readings are read inside your own Supabase project. The key never reaches this app.'
    : 'Configure Supabase before using the OCR proxy.';

  ($('#install-sub') as HTMLElement).textContent = isStandalone() ? 'Installed. Camera and offline use are available.' : '';
}

/** Wires every control on the Settings page. Called once at boot. */
export function initSettings(): void {
  ($('#sel-theme') as HTMLSelectElement).addEventListener('change', (e) => {
    Settings.save({ theme: (e.target as HTMLSelectElement).value });
    applyTheme();
  });

  ($('#sel-mass') as HTMLSelectElement).addEventListener('change', (e) => {
    Settings.save({ massUnit: (e.target as HTMLSelectElement).value });
    renderSettings();
    // Every displayed mass changes unit, so the dashboard is stale now.
    if (Route.current() === 'dashboard') Route.refresh();
  });

  ($('#chk-motion') as HTMLInputElement).addEventListener('change', (e) => {
    Settings.save({ reduceMotion: (e.target as HTMLInputElement).checked });
    applyMotion();
  });

  ($('#chk-mirror') as HTMLInputElement).addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    Settings.save({ mirror: checked });
    toast(checked ? 'Cloud mirror on — new readings copy to your project' : 'Cloud mirror off');
    renderSettings();
  });

  ($('#btn-sync-now') as HTMLButtonElement).addEventListener('click', async () => {
    const btn = $('#btn-sync-now') as HTMLButtonElement;
    if (!Auth.user()) { toast('Sign in before mirroring readings', 'error'); return; }
    if (!Settings.get().supabaseUrl || !Settings.get().supabaseAnonKey) {
      toast('Add your Supabase URL and anon key first', 'error');
      return;
    }

    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Syncing…';
    const result = await mirrorSync();
    btn.disabled = false;
    btn.textContent = label;

    renderSettings();
    if (result.ok) {
      toast('Synced ' + result.count + ' reading' + (result.count === 1 ? '' : 's') +
        ' · ' + (result.uploaded || 0) + ' up · ' + (result.downloaded || 0) + ' down');
    } else {
      toast(result.error || 'The mirror did not answer', 'error');
    }
  });

  ($('#btn-save-config') as HTMLButtonElement).addEventListener('click', async () => {
    Settings.save({
      supabaseUrl: (($('#in-supa-url') as HTMLInputElement).value || '').trim().replace(/\/+$/, ''),
      supabaseAnonKey: (($('#in-supa-key') as HTMLInputElement).value || '').trim()
    });
    toast('Configuration saved — reconnecting');
    await Auth.reset();
    renderSettings();
    Route.refresh();
  });

  ($('#btn-test-proxy') as HTMLButtonElement).addEventListener('click', async () => {
    Settings.save({
      supabaseUrl: (($('#in-supa-url') as HTMLInputElement).value || '').trim().replace(/\/+$/, ''),
      supabaseAnonKey: (($('#in-supa-key') as HTMLInputElement).value || '').trim()
    });
    if (!OcrProxy.isConfigured()) { toast('Add the URL and anon key first', 'error'); return; }

    toast('Testing the proxy…');
    try {
      const res = await OcrProxy.ping();
      toast('Proxy is live' + (res && (res.model as string) ? ' · ' + res.model : ''));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The proxy did not answer', 'error');
    }
    renderSettings();
  });

  ($('#btn-account') as HTMLButtonElement).addEventListener('click', async () => {
    if (Auth.user()) {
      if (!window.confirm('Sign out? Readings stay on this device.')) return;
      await Auth.signOut();
      return;
    }
    showAuth();
  });

  ($('#btn-export-json') as HTMLButtonElement).addEventListener('click', exportJSON);
  ($('#btn-export-csv') as HTMLButtonElement).addEventListener('click', exportCSV);
  ($('#btn-export-samsung') as HTMLButtonElement).addEventListener('click', exportSamsung);
  ($('#btn-copy-summary') as HTMLButtonElement).addEventListener('click', () => void copySummary());

  ($('#btn-erase') as HTMLButtonElement).addEventListener('click', async () => {
    if (!window.confirm('Delete every reading from this device? Export first if you want a copy.')) return;
    await Store.clearAll();
    setReadings([]);
    toast('All readings erased');
    Route.go('dashboard');
  });

  /* Install prompt: the browser only offers it after the app has been used a
     little, so the button stays hidden until the event actually fires. */
  let installEvent: Event & { prompt?: () => void; userChoice?: Promise<unknown> } | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as typeof installEvent;
    ($('#btn-install') as HTMLElement).hidden = false;
  });
  ($('#btn-install') as HTMLButtonElement).addEventListener('click', async () => {
    if (!installEvent?.prompt) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    ($('#btn-install') as HTMLElement).hidden = true;
  });
}

Route.page('settings', renderSettings);
