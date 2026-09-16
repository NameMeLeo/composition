/* Composition — Settings.
   Account, appearance, the optional cloud mirror, the OCR proxy, device storage
   and every export, plus the wiring for all of the controls on this page. */

import { $, toast } from '../dom.js';
import { Settings } from '../settings.js';
import { Auth } from '../auth.js';
import { OcrProxy } from '../ocr.js';
import { mirrorSync } from '../sync.js';
import { getReadings, setReadings, Store } from '../store.js';
import { applyTheme, applyMotion, isStandalone } from '../theme.js';
import { fmtDateTime, relDays } from '../format.js';
import { exportJSON, exportCSV, exportSamsung, copySummary } from '../export.js';
import { Route } from '../router.js';
import { showAuth } from '../shell.js';

function describeMirrorSync() {
  const at = Settings.get().mirrorSyncedAt;
  if (!at) return 'Never synced';
  return fmtDateTime(at) + ' · ' + relDays(at);
}

export function renderSettings() {
  const user = Auth.user();
  $('#account-name').textContent = user ? (user.user_metadata && user.user_metadata.full_name) || 'Signed in' : 'Not signed in';
  $('#account-email').textContent = user && user.email ? user.email : 'No account connected';
  $('#btn-account').textContent = user ? 'Sign out' : 'Sign in';
  $('#account-avatar').textContent = user ? (user.email || 'U').slice(0, 1).toUpperCase() : '?';

  $('#sel-theme').value = Settings.get().theme;
  $('#sel-mass').value = Settings.get().massUnit;
  $('#chk-motion').checked = Boolean(Settings.get().reduceMotion);

  const mirrorOn = Boolean(Settings.get().mirror);
  $('#chk-mirror').checked = mirrorOn;
  $('#mirror-status').hidden = !mirrorOn;
  $('#mirror-last').textContent = describeMirrorSync();
  $('#in-supa-url').value = Settings.get().supabaseUrl || '';
  $('#in-supa-key').value = Settings.get().supabaseAnonKey || '';

  const readings = getReadings();
  const count = readings.length;
  $('#stat-count').textContent = count + ' reading' + (count === 1 ? '' : 's') + (count ? '' : ' on this device');

  let bytes = 0;
  try { bytes = new Blob([JSON.stringify(readings)]).size; } catch (e) { bytes = 0; }
  $('#stat-size').textContent = bytes > 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(2) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';

  const configured = OcrProxy.isConfigured();
  const pill = $('#proxy-pill');
  pill.textContent = configured ? 'Connected' : 'Not configured';
  pill.className = 'pill' + (configured ? ' pill--ok' : ' pill--warn');
  $('#proxy-sub').textContent = configured
    ? 'Readings are read inside your own Supabase project. The key never reaches this app.'
    : 'Configure Supabase before using the OCR proxy.';

  $('#install-sub').textContent = isStandalone() ? 'Installed. Camera and offline use are available.' : '';
}

/** Wires every control on the Settings page. Called once at boot. */
export function initSettings() {
  $('#sel-theme').addEventListener('change', (e) => {
    Settings.save({ theme: e.target.value });
    applyTheme();
  });

  $('#sel-mass').addEventListener('change', (e) => {
    Settings.save({ massUnit: e.target.value });
    renderSettings();
    // Every displayed mass changes unit, so the dashboard is stale now.
    if (Route.current() === 'dashboard') Route.refresh();
  });

  $('#chk-motion').addEventListener('change', (e) => {
    Settings.save({ reduceMotion: e.target.checked });
    applyMotion();
  });

  $('#chk-mirror').addEventListener('change', (e) => {
    Settings.save({ mirror: e.target.checked });
    toast(e.target.checked ? 'Cloud mirror on — new readings copy to your project' : 'Cloud mirror off');
    renderSettings();
  });

  $('#btn-sync-now').addEventListener('click', async () => {
    const btn = $('#btn-sync-now');
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

  $('#btn-save-config').addEventListener('click', async () => {
    Settings.save({
      supabaseUrl: $('#in-supa-url').value.trim().replace(/\/+$/, ''),
      supabaseAnonKey: $('#in-supa-key').value.trim()
    });
    toast('Configuration saved — reconnecting');
    await Auth.reset();
    renderSettings();
    Route.refresh();
  });

  $('#btn-test-proxy').addEventListener('click', async () => {
    Settings.save({
      supabaseUrl: $('#in-supa-url').value.trim().replace(/\/+$/, ''),
      supabaseAnonKey: $('#in-supa-key').value.trim()
    });
    if (!OcrProxy.isConfigured()) { toast('Add the URL and anon key first', 'error'); return; }

    toast('Testing the proxy…');
    try {
      const res = await OcrProxy.ping();
      toast('Proxy is live' + (res && res.model ? ' · ' + res.model : ''));
    } catch (err) {
      toast(err && err.message ? err.message : 'The proxy did not answer', 'error');
    }
    renderSettings();
  });

  $('#btn-account').addEventListener('click', async () => {
    if (Auth.user()) {
      if (!window.confirm('Sign out? Readings stay on this device.')) return;
      await Auth.signOut();
      return;
    }
    showAuth();
  });

  $('#btn-export-json').addEventListener('click', exportJSON);
  $('#btn-export-csv').addEventListener('click', exportCSV);
  $('#btn-export-samsung').addEventListener('click', exportSamsung);
  $('#btn-copy-summary').addEventListener('click', copySummary);

  $('#btn-erase').addEventListener('click', async () => {
    if (!window.confirm('Delete every reading from this device? Export first if you want a copy.')) return;
    await Store.clearAll();
    setReadings([]);
    toast('All readings erased');
    Route.go('dashboard');
  });

  /* Install prompt: the browser only offers it after the app has been used a
     little, so the button stays hidden until the event actually fires. */
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    $('#btn-install').hidden = false;
  });
  $('#btn-install').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    $('#btn-install').hidden = true;
  });
}

Route.page('settings', renderSettings);
