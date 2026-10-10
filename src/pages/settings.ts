/* Composition — Settings.
   Account, appearance, the optional cloud mirror, the OCR proxy, device storage
   and every export, plus the wiring for all of the controls on this page. */

import { $, toast } from '../core/dom.js';
import { t, applyI18n } from '../core/i18n.js';
import { Settings } from '../core/settings.js';
import { Auth } from '../services/auth.js';
import { OcrProxy } from '../services/ocr.js';
import { mirrorSync } from '../data/sync.js';
import { getReadings, setReadings, Store } from '../data/store.js';
import { applyTheme, applyMotion, isStandalone } from '../core/theme.js';
import { fmtDateTime, relDays } from '../core/format.js';
import { exportJSON, exportCSV, exportSamsung, copySummary } from '../data/export.js';
import { previewCsvImport, importReadings } from '../data/import.js';
import { Route } from '../core/router.js';
import { showAuth } from '../core/shell.js';

function describeMirrorSync(): string {
  const at = Settings.get().mirrorSyncedAt;
  if (!at) return t('set.never');
  return fmtDateTime(at) + ' · ' + relDays(at);
}

export function renderSettings(): void {
  const user = Auth.user();
  ($('#account-name') as HTMLElement).textContent = user ? user.user_metadata?.full_name || t('set.signed.in') : t('set.signed.out');
  ($('#account-email') as HTMLElement).textContent = user?.email ? user.email : t('set.noaccount');
  ($('#btn-account') as HTMLButtonElement).textContent = user ? t('set.signout') : t('set.signin');
  ($('#account-avatar') as HTMLElement).textContent = user ? (user.email || 'U').slice(0, 1).toUpperCase() : '?';

  ($('#sel-theme') as HTMLSelectElement).value = Settings.get().theme;
  ($('#sel-mass') as HTMLSelectElement).value = Settings.get().massUnit;
  ($('#sel-lang') as HTMLSelectElement).value = Settings.get().lang || 'system';
  ($('#chk-motion') as HTMLInputElement).checked = Boolean(Settings.get().reduceMotion);

  const mirrorOn = Boolean(Settings.get().mirror);
  ($('#chk-mirror') as HTMLInputElement).checked = mirrorOn;
  ($('#mirror-status') as HTMLElement).hidden = !mirrorOn;
  ($('#mirror-last') as HTMLElement).textContent = describeMirrorSync();
  ($('#in-supa-url') as HTMLInputElement).value = Settings.get().supabaseUrl || '';
  ($('#in-supa-key') as HTMLInputElement).value = Settings.get().supabaseAnonKey || '';

  const readings = getReadings();
  const count = readings.length;
  ($('#stat-count') as HTMLElement).textContent = count === 0
    ? t('set.count.none')
    : t('set.count.n', { n: count, s: count === 1 ? '' : 's' });

  let bytes = 0;
  try { bytes = new Blob([JSON.stringify(readings)]).size; } catch (e) { bytes = 0; }
  ($('#stat-size') as HTMLElement).textContent = bytes > 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(2) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';

  const configured = OcrProxy.isConfigured();
  const pill = $('#proxy-pill');
  pill.textContent = configured ? t('set.pill.ok') : t('set.pill.warn');
  pill.className = 'pill' + (configured ? ' pill--ok' : ' pill--warn');
  ($('#proxy-sub') as HTMLElement).textContent = configured ? t('set.proxy.ok') : t('set.proxy.need');

  ($('#install-sub') as HTMLElement).textContent = isStandalone() ? t('set.installed') : '';
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

  ($('#sel-lang') as HTMLSelectElement).addEventListener('change', (e) => {
    Settings.save({ lang: (e.target as HTMLSelectElement).value });
    applyI18n();
    renderSettings();
    Route.refresh();
  });

  ($('#chk-motion') as HTMLInputElement).addEventListener('change', (e) => {
    Settings.save({ reduceMotion: (e.target as HTMLInputElement).checked });
    applyMotion();
  });

  ($('#chk-mirror') as HTMLInputElement).addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    Settings.save({ mirror: checked });
    toast(checked ? t('set.mirror.on') : t('set.mirror.off'));
    renderSettings();
  });

  ($('#btn-sync-now') as HTMLButtonElement).addEventListener('click', async () => {
    const btn = $('#btn-sync-now') as HTMLButtonElement;
    if (!Auth.user()) { toast(t('set.signin.mirror'), 'error'); return; }
    if (!Settings.get().supabaseUrl || !Settings.get().supabaseAnonKey) {
      toast(t('set.need.supa'), 'error');
      return;
    }

    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('set.syncing');
    const result = await mirrorSync();
    btn.disabled = false;
    btn.textContent = label;

    renderSettings();
    if (result.ok) {
      toast(t('set.synced', { n: result.count, s: result.count === 1 ? '' : 's', u: result.uploaded || 0, d: result.downloaded || 0 }));
    } else {
      toast(result.error || t('set.mirror.fail'), 'error');
    }
  });

  ($('#btn-save-config') as HTMLButtonElement).addEventListener('click', async () => {
    Settings.save({
      supabaseUrl: (($('#in-supa-url') as HTMLInputElement).value || '').trim().replace(/\/+$/, ''),
      supabaseAnonKey: (($('#in-supa-key') as HTMLInputElement).value || '').trim()
    });
    toast(t('set.saved'));
    await Auth.reset();
    renderSettings();
    Route.refresh();
  });

  ($('#btn-test-proxy') as HTMLButtonElement).addEventListener('click', async () => {
    Settings.save({
      supabaseUrl: (($('#in-supa-url') as HTMLInputElement).value || '').trim().replace(/\/+$/, ''),
      supabaseAnonKey: (($('#in-supa-key') as HTMLInputElement).value || '').trim()
    });
    if (!OcrProxy.isConfigured()) { toast(t('set.need.supa'), 'error'); return; }

    toast(t('set.testing'));
    try {
      const res = await OcrProxy.ping();
      toast(t('set.live') + (res && (res.model as string) ? ' · ' + res.model : ''));
    } catch (err) {
      toast(err instanceof Error ? err.message : t('set.proxy.fail'), 'error');
    }
    renderSettings();
  });

  ($('#btn-account') as HTMLButtonElement).addEventListener('click', async () => {
    if (Auth.user()) {
      if (!window.confirm(t('set.signout.confirm'))) return;
      await Auth.signOut();
      return;
    }
    showAuth();
  });

  ($('#btn-export-json') as HTMLButtonElement).addEventListener('click', () => exportJSON());
  ($('#btn-export-csv') as HTMLButtonElement).addEventListener('click', () => exportCSV());
  ($('#btn-export-samsung') as HTMLButtonElement).addEventListener('click', exportSamsung);
  ($('#btn-copy-summary') as HTMLButtonElement).addEventListener('click', () => void copySummary());

  ($('#btn-import-csv') as HTMLButtonElement).addEventListener('click', () => {
    ($('#import-picker') as HTMLInputElement).click();
  });
  ($('#import-picker') as HTMLInputElement).addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 18 * 1024 * 1024) { toast(t('shell.toobig'), 'error'); return; }
    const text = await file.text();
    const { staged, skipped } = previewCsvImport(text);
    if (!staged.length) {
      toast(skipped[0]?.reason ?? t('import.none'), 'error');
      return;
    }
    const lines = [
      t('import.confirm.title'),
      '',
      t('import.ready', { n: staged.length, s: staged.length === 1 ? '' : 's' })
    ];
    if (skipped.length) {
      lines.push(t('import.skipped', { n: skipped.length }));
      skipped.slice(0, 3).forEach((s) => lines.push(t('import.row', { n: s.row }) + ': ' + s.reason));
    }
    if (!window.confirm(lines.join('\n'))) return;
    const res = await importReadings(staged);
    const total = res.added + res.updated;
    toast(t('import.done', { n: total, s: total === 1 ? '' : 's' }));
    renderSettings();
    Route.refresh();
  });

  ($('#btn-erase') as HTMLButtonElement).addEventListener('click', async () => {
    if (!window.confirm(t('set.erase.confirm'))) return;
    await Store.clearAll();
    setReadings([]);
    toast(t('set.erased'));
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
