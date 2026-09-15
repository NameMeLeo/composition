/* =====================================================================
   Composition — app logic
   Local-first body composition tracker.
   No secrets live in this file: OCR runs server-side behind the
   Supabase Edge Function proxy (see supabase/functions/ocr).
   ===================================================================== */
'use strict';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const APP_VERSION = '1.0.0';
const DB_NAME = 'composition';
const DB_VERSION = 1;
const STORE = 'readings';
const LS = {
  settings: 'composition.settings.v1',
  session: 'composition.local-session.v1',
  seeded: 'composition.seeded.v1',
  mirror: 'composition.mirror.v1'
};

const METRICS = {
  weight:        { label: 'Weight',         unit: 'kg',   digits: 1, group: 'composition', accent: 'var(--c-primary)', better: null,  min: 20, max: 400 },
  bodyFat:       { label: 'Body fat',       unit: '%',    digits: 1, group: 'composition', accent: 'var(--c-amber)',   better: 'down', min: 2,  max: 70 },
  muscleMass:    { label: 'Muscle mass',    unit: 'kg',   digits: 1, group: 'composition', accent: 'var(--c-green)',   better: 'up',  min: 1,  max: 200 },
  fatFreeMass:   { label: 'Fat-free mass',  unit: 'kg',   digits: 1, group: 'composition', accent: 'var(--c-teal)',    better: null,  min: 1,  max: 200 },
  bodyWater:     { label: 'Body water',     unit: '%',    digits: 1, group: 'composition', accent: 'var(--c-blue)',    better: 'up',  min: 5,  max: 80 },
  boneMass:      { label: 'Bone mass',      unit: 'kg',   digits: 2, group: 'composition', accent: 'var(--c-slate)',   better: null,  min: 0.5, max: 10 },
  visceralFat:   { label: 'Visceral fat',   unit: '',     digits: 0, group: 'risk',        accent: 'var(--c-red)',     better: 'down', min: 1,  max: 60 },
  bmi:           { label: 'BMI',            unit: '',     digits: 1, group: 'risk',        accent: 'var(--c-violet)',  better: null,  min: 5,  max: 90 },
  bmr:           { label: 'BMR',            unit: 'kcal', digits: 0, group: 'energy',      accent: 'var(--c-orange)',  better: null,  min: 400, max: 6000 },
  metabolicAge:  { label: 'Metabolic age',  unit: 'yrs',  digits: 0, group: 'energy',      accent: 'var(--c-teal)',    better: 'down', min: 5,  max: 120 },
  muscleQuality: { label: 'Muscle quality', unit: '',     digits: 0, group: 'performance', accent: 'var(--c-green)',   better: 'up',  min: 0,  max: 200 },
  physiqueRating:{ label: 'Physique rating',unit: '',     digits: 0, group: 'performance', accent: 'var(--c-primary)', better: null,  min: 1,  max: 9 }
};
const METRIC_ORDER = Object.keys(METRICS);
const LB_PER_KG = 2.2046226218;

const RANGES = [
  { id: '7d',  label: '7D',  days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
  { id: '1y',  label: '1Y',  days: 365 },
  { id: 'all', label: 'All', days: null }
];

const SOURCE_LABEL = { qr: 'QR scan', file: 'Shared file', share: 'Shared file', manual: 'Entered by hand' };

/* ------------------------------------------------------------------ */
/* Tiny helpers                                                        */
/* ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let toastTimer = null;
function toast(message, kind) {
  const node = $('#toast');
  node.textContent = message;
  node.className = 'toast' + (kind === 'error' ? ' toast--error' : '');
  node.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { node.hidden = true; }, kind === 'error' ? 5200 : 3200);
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

function toDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(value, opts) {
  const d = toDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function fmtDateTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(d);
}

function relDays(value) {
  const d = toDate(value);
  if (!d) return '';
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  const months = Math.round(days / 30);
  return months === 1 ? 'a month ago' : months + ' months ago';
}

function massValue(kg, digits) {
  const unit = Settings.get().massUnit;
  const value = unit === 'lb' ? kg * LB_PER_KG : kg;
  return { value: value.toFixed(digits), unit: unit };
}

function metricDisplay(key, raw) {
  if (raw == null || raw === '' || isNaN(Number(raw))) return { text: '—', unit: '' };
  const meta = METRICS[key];
  if (!meta) return { text: String(raw), unit: '' };
  if (key === 'weight' || key === 'muscleMass' || key === 'fatFreeMass' || key === 'boneMass') {
    const m = massValue(Number(raw), meta.digits);
    return { text: m.value, unit: m.unit };
  }
  return { text: Number(raw).toFixed(meta.digits), unit: meta.unit };
}

function metricText(key, raw) {
  const d = metricDisplay(key, raw);
  return d.unit ? d.text + ' ' + d.unit : d.text;
}

function axisFormat(key) {
  const meta = METRICS[key];
  if (!meta) return (v) => String(v);
  if (key === 'weight' || key === 'muscleMass' || key === 'fatFreeMass' || key === 'boneMass') {
    return (v) => massValue(v, meta.digits).value;
  }
  return (v) => v.toFixed(meta.digits);
}

function parseNumber(input) {
  if (input == null) return null;
  const cleaned = String(input).replace(',', '.').replace(/[^\d.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const Settings = (() => {
  const defaults = {
    theme: 'system',
    massUnit: 'kg',
    reduceMotion: false,
    supabaseUrl: '',
    supabaseAnonKey: '',
    mirror: false
  };
  let current = Object.assign({}, defaults);

  function load() {
    try {
      const raw = localStorage.getItem(LS.settings);
      if (raw) current = Object.assign({}, defaults, JSON.parse(raw));
    } catch (e) { /* keep defaults */ }
    return current;
  }
  function get() { return current; }
  function save(patch) {
    current = Object.assign({}, current, patch);
    try { localStorage.setItem(LS.settings, JSON.stringify(current)); } catch (e) { /* ignore */ }
    return current;
  }
  return { load, get, save, defaults };
})();

/* ------------------------------------------------------------------ */
/* Local database                                                      */
/* ------------------------------------------------------------------ */

const Store = (() => {
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB is unavailable in this browser.')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('measuredAt', 'measuredAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open the local database.'));
    });
    return dbPromise;
  }

  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const os = t.objectStore(STORE);
      let result;
      try { result = fn(os); } catch (err) { reject(err); return; }
      t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function all() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(reading) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(reading);
      t.oncomplete = () => resolve(reading);
      t.onerror = () => reject(t.error);
    });
  }

  async function bulkPut(readings) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      const os = t.objectStore(STORE);
      readings.forEach((r) => os.put(r));
      t.oncomplete = () => resolve(readings.length);
      t.onerror = () => reject(t.error);
    });
  }

  async function remove(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  async function clearAll() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  async function byId(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  return { all, put, bulkPut, remove, clearAll, byId, tx, open };
})();

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

const Auth = (() => {
  let client = null;
  let session = null;
  let listeners = [];

  function isConfigured() {
    const s = Settings.get();
    return Boolean(s.supabaseUrl && s.supabaseAnonKey);
  }

  async function init() {
    if (isConfigured()) {
      try {
        const mod = await import('https://esm.sh/@supabase/supabase-js@2');
        client = mod.createClient(Settings.get().supabaseUrl, Settings.get().supabaseAnonKey, {
          auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' }
        });
        const { data } = await client.auth.getSession();
        session = data.session || null;
        client.auth.onAuthStateChange((_event, next) => {
          session = next;
          emit();
        });
        return session;
      } catch (err) {
        console.warn('Supabase could not start:', err);
        client = null;
      }
    }
    try {
      const raw = localStorage.getItem(LS.session);
      session = raw ? JSON.parse(raw) : null;
    } catch (e) { session = null; }
    return session;
  }

  function emit() { listeners.forEach((fn) => { try { fn(session); } catch (e) { /* ignore */ } }); }
  function onChange(fn) { listeners.push(fn); }
  function getSession() { return session; }
  function user() { return session && session.user ? session.user : null; }
  function isLocal() { return !client; }

  async function signInWithGoogle() {
    if (!client) throw new Error('Supabase is not configured yet.');
    const url = new URL(window.location.href);
    url.hash = '';
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: url.toString(), queryParams: { prompt: 'select_account' } }
    });
    if (error) throw error;
  }

  function signInLocal(name) {
    session = {
      local: true,
      user: { id: 'local-user', email: null, user_metadata: { full_name: name || 'Local mode' } }
    };
    try { localStorage.setItem(LS.session, JSON.stringify(session)); } catch (e) { /* ignore */ }
    emit();
    return session;
  }

  async function signOut() {
    if (client) { try { await client.auth.signOut(); } catch (e) { /* ignore */ } }
    session = null;
    try { localStorage.removeItem(LS.session); } catch (e) { /* ignore */ }
    emit();
  }

  async function accessToken() {
    if (client) {
      const { data } = await client.auth.getSession();
      return data && data.session ? data.session.access_token : null;
    }
    return null;
  }

  async function reset() {
    client = null;
    session = null;
    await init();
    emit();
  }

  return { init, onChange, getSession, user, isLocal, isConfigured, signInWithGoogle, signInLocal, signOut, accessToken, reset };
})();

/* ------------------------------------------------------------------ */
/* OCR proxy client                                                    */
/* ------------------------------------------------------------------ */

const Proxy = (() => {
  function base() {
    const url = Settings.get().supabaseUrl;
    return url ? url.replace(/\/+$/, '') + '/functions/v1/ocr' : null;
  }

  function isConfigured() { return Boolean(base() && Settings.get().supabaseAnonKey); }

  async function call(payload) {
    const endpoint = base();
    if (!endpoint) throw new Error('The OCR proxy is not configured. Add your Supabase URL in Settings.');
    const headers = {
      'Content-Type': 'application/json',
      apikey: Settings.get().supabaseAnonKey
    };
    const token = await Auth.accessToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    else headers.Authorization = 'Bearer ' + Settings.get().supabaseAnonKey;

    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || ('The proxy replied with ' + res.status + '.');
      throw new Error(msg);
    }
    if (data && data.ok === false) throw new Error(data.error || 'The proxy could not read that report.');
    return data || {};
  }

  return {
    isConfigured,
    ping: () => call({ mode: 'ping' }),
    fromReportUrl: (url) => call({ mode: 'report-url', url }),
    fromDocument: (mimeType, data) => call({ mode: 'document', mimeType, data })
  };
})();

/* ------------------------------------------------------------------ */
/* Report URL parsing                                                  */
/* ------------------------------------------------------------------ */

function parseReportUrl(input) {
  const text = String(input || '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  let url;
  try {
    url = new URL(text, window.location.href);
  } catch (e) {
    return { ok: false, reason: 'not-a-url' };
  }
  if (!/^https?:$/.test(url.protocol)) return { ok: false, reason: 'not-a-url' };
  const playerId = url.searchParams.get('player_id') || url.searchParams.get('playerId') || null;
  const language = url.searchParams.get('language') || url.searchParams.get('lang') || null;
  return { ok: true, url: url.toString(), playerId, language, host: url.hostname };
}

/* ------------------------------------------------------------------ */
/* Sample seed (clearly labelled, removable)                           */
/* ------------------------------------------------------------------ */

function sampleReadings() {
  const base = { weight: 74.8, bodyFat: 19.4, muscleMass: 57.1, bodyWater: 57.2, visceralFat: 8, bmr: 1712, metabolicAge: 33, muscleQuality: 84 };
  const drift = [
    { weight: 0.9,  bodyFat: 0.6,  muscleMass: -0.3, visceralFat: 0 },
    { weight: 0.4,  bodyFat: 0.3,  muscleMass: -0.1, visceralFat: 0 },
    { weight: -0.2, bodyFat: -0.2, muscleMass: 0.2,  visceralFat: -1 },
    { weight: -0.6, bodyFat: -0.5, muscleMass: 0.4,  visceralFat: 0 },
    { weight: -0.9, bodyFat: -0.8, muscleMass: 0.7,  visceralFat: -1 },
    { weight: -1.3, bodyFat: -1.1, muscleMass: 0.9,  visceralFat: 0 },
    { weight: -1.1, bodyFat: -1.4, muscleMass: 1.2,  visceralFat: -1 },
    { weight: -1.6, bodyFat: -1.9, muscleMass: 1.5,  visceralFat: 0 }
  ];
  const now = Date.now();
  return drift.map((d, i) => {
    const daysAgo = (drift.length - 1 - i) * 9;
    const at = new Date(now - daysAgo * 86400000);
    at.setHours(7, 20, 0, 0);
    const weight = Number((base.weight + d.weight).toFixed(1));
    const bodyFat = Number((base.bodyFat + d.bodyFat).toFixed(1));
    const muscleMass = Number((base.muscleMass + d.muscleMass).toFixed(1));
    const fatFree = Number((weight - (weight * bodyFat) / 100).toFixed(1));
    return {
      id: 'sample-' + i,
      createdAt: at.toISOString(),
      measuredAt: at.toISOString(),
      source: 'manual',
      sample: true,
      playerId: null,
      language: null,
      reportUrl: null,
      note: 'Sample reading, loaded so the charts have something to draw.',
      confidence: null,
      raw: null,
      metrics: {
        weight,
        bodyFat,
        muscleMass,
        fatFreeMass: fatFree,
        bodyWater: Number((base.bodyWater + (i - 3) * 0.2).toFixed(1)),
        boneMass: 3.1,
        visceralFat: base.visceralFat + d.visceralFat,
        bmi: Number((weight / (1.78 * 1.78)).toFixed(1)),
        bmr: base.bmr + i * -4,
        metabolicAge: base.metabolicAge - Math.round(i / 2),
        muscleQuality: base.muscleQuality + i
      }
    };
  });
}

/* ------------------------------------------------------------------ */
/* Derived helpers                                                     */
/* ------------------------------------------------------------------ */

let CACHE = [];

function sortedAsc(list) { return list.slice().sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt)); }
function sortedDesc(list) { return list.slice().sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt)); }

function latest() { const d = sortedDesc(CACHE); return d[0] || null; }
function previous() { const d = sortedDesc(CACHE); return d[1] || null; }

function seriesFor(key, rangeId) {  const range = RANGES.find((r) => r.id === rangeId) || RANGES[3];
  const cutoff = range.days ? Date.now() - range.days * 86400000 : null;
  return sortedAsc(CACHE)
    .filter((r) => r.metrics && typeof r.metrics[key] === 'number' && !isNaN(r.metrics[key]))
    .filter((r) => !cutoff || new Date(r.measuredAt).getTime() >= cutoff)
    .map((r) => ({ t: new Date(r.measuredAt).getTime(), v: r.metrics[key], id: r.id }));
}

function latestWith(key) {
  const d = sortedDesc(CACHE).find((r) => r.metrics && typeof r.metrics[key] === 'number');
  return d ? d.metrics[key] : null;
}

function deltaFor(key) {
  const d = sortedDesc(CACHE).filter((r) => r.metrics && typeof r.metrics[key] === 'number');
  if (d.length < 2) return null;
  return d[0].metrics[key] - d[1].metrics[key];
}

function deltaChip(key, delta) {
  const meta = METRICS[key];
  const node = el('span', 'delta');
  if (delta == null) { node.textContent = 'No comparison yet'; node.classList.add('delta--flat'); return node; }
  const shown = (key === 'weight' || key === 'muscleMass' || key === 'fatFreeMass' || key === 'boneMass')
    ? Number(massValue(Math.abs(delta), meta.digits).value)
    : Number(Math.abs(delta).toFixed(meta.digits));
  const unit = (key === 'weight' || key === 'muscleMass' || key === 'fatFreeMass' || key === 'boneMass')
    ? ' ' + massValue(0, 0).unit : (meta.unit ? ' ' + meta.unit : '');
  const flat = shown < Math.pow(10, -meta.digits) / 2;
  if (flat) { node.textContent = 'No change'; node.classList.add('delta--flat'); return node; }
  const rising = delta > 0;
  const good = meta.better ? (meta.better === 'up' ? rising : !rising) : null;
  node.classList.add(good === true ? 'delta--up' : good === false ? 'delta--down' : 'delta--flat');
  node.textContent = (rising ? '▲ ' : '▼ ') + shown + unit;
  return node;
}

/* ------------------------------------------------------------------ */
/* Chart renderer                                                      */
/* ------------------------------------------------------------------ */

function drawChart(host, options) {
  const opts = Object.assign({
    height: 150,
    accent: 'var(--c-primary)',
    unit: '',
    digits: 1,
    grid: true,
    dots: true,
    scrub: true,
    padLeft: 38,
    padRight: 12,
    padTop: 14,
    padBottom: 18,
    yFormat: null
  }, options || {});

  clear(host);
  const pts = (opts.points || []).filter((p) => p && isFinite(p.v));
  const width = Math.max(240, Math.round(host.clientWidth || host.parentElement.clientWidth || 320));
  const height = opts.height;

  const wrap = el('div', 'chart-wrap');
  host.appendChild(wrap);

  if (!pts.length) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'No data in this range');
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(width / 2));
    t.setAttribute('y', String(height / 2));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'chart__label');
    t.textContent = 'No readings in this range';
    svg.appendChild(t);
    wrap.appendChild(svg);
    return;
  }

  const xs = pts.map((p) => p.t);
  const ys = pts.map((p) => p.v);
  let min = Math.min.apply(null, ys);
  let max = Math.max.apply(null, ys);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.16;
  const lo = min - pad;
  const hi = max + pad;

  const minT = Math.min.apply(null, xs);
  const maxT = Math.max.apply(null, xs);
  const spanT = Math.max(1, maxT - minT);

  const plotW = width - opts.padLeft - opts.padRight;
  const plotH = height - opts.padTop - opts.padBottom;
  const xAt = (t) => opts.padLeft + ((t - minT) / spanT) * plotW;
  const yAt = (v) => opts.padTop + (1 - (v - lo) / (hi - lo)) * plotH;

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  const summary = pts.length + ' readings, from ' + metricText(opts.metricKey || '', ys[0]).trim() +
    ' to ' + metricText(opts.metricKey || '', ys[ys.length - 1]).trim();
  svg.setAttribute('aria-label', summary);

  if (opts.grid) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'chart__grid');
    for (let i = 0; i <= 3; i++) {
      const y = opts.padTop + (plotH / 3) * i;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(opts.padLeft));
      line.setAttribute('x2', String(width - opts.padRight));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      g.appendChild(line);
    }
    svg.appendChild(g);

    [hi - pad, lo + pad].forEach((value, i) => {
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('class', 'chart__label');
      label.setAttribute('x', String(opts.padLeft - 6));
      label.setAttribute('y', String(opts.padTop + (plotH / 3) * i + 3));
      label.setAttribute('text-anchor', 'end');
      label.textContent = opts.yFormat ? opts.yFormat(value) : value.toFixed(opts.digits);
      svg.appendChild(label);
    });
  }

  const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + xAt(p.t).toFixed(1) + ' ' + yAt(p.v).toFixed(1)).join(' ');
  const areaPath = linePath +
    ' L' + xAt(pts[pts.length - 1].t).toFixed(1) + ' ' + (opts.padTop + plotH).toFixed(1) +
    ' L' + xAt(pts[0].t).toFixed(1) + ' ' + (opts.padTop + plotH).toFixed(1) + ' Z';

  const area = document.createElementNS(NS, 'path');
  area.setAttribute('class', 'chart__area');
  area.setAttribute('d', areaPath);
  area.setAttribute('fill', opts.accent);
  svg.appendChild(area);

  const line = document.createElementNS(NS, 'path');
  line.setAttribute('class', 'chart__line');
  line.setAttribute('d', linePath);
  line.setAttribute('stroke', opts.accent);
  svg.appendChild(line);

  if (opts.dots && pts.length <= 40) {
    pts.forEach((p) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', 'chart__dot');
      c.setAttribute('cx', xAt(p.t).toFixed(1));
      c.setAttribute('cy', yAt(p.v).toFixed(1));
      c.setAttribute('r', '3.2');
      c.setAttribute('fill', opts.accent);
      svg.appendChild(c);
    });
  }

  const cursor = document.createElementNS(NS, 'line');
  cursor.setAttribute('class', 'chart__cursor');
  cursor.setAttribute('y1', String(opts.padTop));
  cursor.setAttribute('y2', String(opts.padTop + plotH));
  cursor.setAttribute('opacity', '0');
  svg.appendChild(cursor);

  wrap.appendChild(svg);

  if (!opts.scrub) return;

  const tip = el('div', 'chart-tip');
  tip.hidden = true;
  wrap.appendChild(tip);

  function moveTo(clientX) {
    const box = svg.getBoundingClientRect();
    const localX = ((clientX - box.left) / box.width) * width;
    let best = 0;
    let bestDist = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(xAt(p.t) - localX);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    const point = pts[best];
    const px = xAt(point.t);
    const py = yAt(point.v);
    cursor.setAttribute('x1', px.toFixed(1));
    cursor.setAttribute('x2', px.toFixed(1));
    cursor.setAttribute('opacity', '1');
    const ratio = box.width / width;
    tip.style.left = (px * ratio) + 'px';
    tip.style.top = Math.max(26, py * ratio - 10) + 'px';
    tip.textContent = metricText(opts.metricKey || '', point.v) + ' · ' + fmtDate(point.t, { day: 'numeric', month: 'short' });
    tip.hidden = false;
  }

  function leave() { cursor.setAttribute('opacity', '0'); tip.hidden = true; }

  wrap.addEventListener('pointermove', (e) => moveTo(e.clientX));
  wrap.addEventListener('pointerdown', (e) => { wrap.setPointerCapture(e.pointerId); moveTo(e.clientX); });
  wrap.addEventListener('pointerup', leave);
  wrap.addEventListener('pointercancel', leave);
  wrap.addEventListener('pointerleave', leave);
}

const chartJobs = new Map();
function scheduleChart(host, options) {
  chartJobs.set(host, options);
  if (!scheduleChart.raf) {
    scheduleChart.raf = requestAnimationFrame(() => {
      scheduleChart.raf = null;
      chartJobs.forEach((opts, node) => { if (node.isConnected) drawChart(node, opts); });
      chartJobs.clear();
    });
  }
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (Route.current() === 'dashboard') renderDashboard();
    if (Route.current() === 'trends') renderTrends();
  }, 180);
});

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

const Route = (() => {
  const routes = ['dashboard', 'trends', 'history', 'settings', 'detail'];
  let current = 'dashboard';

  function go(name, param) {
    if (routes.indexOf(name) === -1) name = 'dashboard';
    current = name;
    $$('.view').forEach((view) => { view.hidden = view.id !== 'view-' + name; });
    $$('[data-route]').forEach((btn) => {
      const target = btn.getAttribute('data-route');
      btn.classList.toggle('is-current', target === name);
      if (target === name) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    const active = $('#view-' + name);
    $('#page-title').textContent = active ? active.dataset.title || '' : '';
    $('#page-sub').textContent = active ? active.dataset.sub || '' : '';
    const hash = param ? '#' + name + '/' + param : '#' + name;
    if (window.location.hash !== hash) {
      history.pushState(null, '', hash);
    }
    $('#main').scrollTop = 0;
    if (name === 'dashboard') renderDashboard();
    if (name === 'trends') renderTrends();
    if (name === 'history') renderHistory();
    if (name === 'settings') renderSettings();
    if (name === 'detail') renderDetail(param);
    if (name !== 'detail') lastRoute = { name, param: null };
  }

  let lastRoute = { name: 'dashboard', param: null };

  function parse() {
    const raw = (window.location.hash || '').replace(/^#\/?/, '');
    const [name, param] = raw.split('/');
    return { name: name || 'dashboard', param: param || null };
  }

  window.addEventListener('popstate', () => {
    const p = parse();
    current = '';
    go(p.name, p.param);
  });

  return {
    go,
    current: () => current,
    back: () => { if (lastRoute.name) go(lastRoute.name); else go('dashboard'); }
  };
})();

/* ------------------------------------------------------------------ */
/* Rendering — shared pieces                                           */
/* ------------------------------------------------------------------ */

function tile(key, reading) {
  const meta = METRICS[key];
  const raw = reading && reading.metrics ? reading.metrics[key] : null;
  const node = el('div', 'tile');
  node.style.setProperty('--tile-accent', meta.accent);

  const label = el('span', 'tile__label', meta.label);
  const value = el('span', 'tile__value');
  const shown = metricDisplay(key, raw);
  value.textContent = shown.text;
  if (shown.unit) {
    const u = el('span', 'unit', shown.unit);
    value.appendChild(u);
  }
  node.appendChild(label);
  node.appendChild(value);

  const delta = deltaFor(key);
  const foot = el('div', 'tile__foot');
  if (delta == null) {
    foot.textContent = raw == null ? 'Not recorded yet' : 'Only one reading so far';
  } else {
    foot.appendChild(deltaChip(key, delta));
  }
  node.appendChild(foot);

  const spark = el('div', 'tile__spark');
  node.appendChild(spark);
  const pts = seriesFor(key, 'all').slice(-12);
  if (pts.length >= 2) {
    scheduleChart(spark, { points: pts, height: 34, accent: meta.accent, digits: meta.digits, grid: false, dots: false, scrub: false, padLeft: 2, padRight: 2, padTop: 4, padBottom: 4, metricKey: key, yFormat: axisFormat(key) });
  }
  return node;
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

function renderDashboard() {
  const has = CACHE.length > 0;
  const last = latest();
  const hasSample = CACHE.some((r) => r.sample);

  $('#banner-sample').hidden = !hasSample;
  $('#banner-setup').hidden = Proxy.isConfigured();
  $('#empty-dashboard').hidden = has;
  $('#hero').hidden = !has;
  $('#block-deltas').hidden = !has;
  $('#block-trend').hidden = !has;
  $('#block-insights').hidden = !has;

  const metricGrid = $('#dashboard-metrics');
  clear(metricGrid);
  METRIC_ORDER.forEach((key) => {
    const meta = METRICS[key];
    const reading = last;
    const raw = reading && reading.metrics ? reading.metrics[key] : null;
    if (raw == null && seriesFor(key, 'all').length === 0) return;
    const node = tile(key, reading);
    node.style.setProperty('--tile-accent', meta.accent);
    metricGrid.appendChild(node);
  });

  if (!has) return;

  /* hero */
  const bf = last.metrics.bodyFat;
  const arc = $('#ring-arc');
  const pct = bf != null ? clamp(bf / 50, 0, 1) : 0;
  arc.setAttribute('stroke-dasharray', '327');
  arc.setAttribute('stroke-dashoffset', String(327 * (1 - pct)));
  $('#hero-bf').textContent = bf != null ? bf.toFixed(1) : '—';
  const w = metricDisplay('weight', last.metrics.weight);
  const m = metricDisplay('muscleMass', last.metrics.muscleMass);
  html('#hero-weight', w.text + (w.unit ? ' ' + w.unit : ''));
  html('#hero-muscle', m.text + (m.unit ? ' ' + m.unit : ''));
  html('#hero-visceral', last.metrics.visceralFat != null ? String(last.metrics.visceralFat) : '—');
  $('#hero-source').textContent = SOURCE_LABEL[last.source] || 'Reading';
  $('#hero-eyebrow').textContent = last.sample ? 'Sample reading' : 'Latest reading';
  $('#hero-meta').textContent = fmtDateTime(last.measuredAt) + ' · ' + relDays(last.measuredAt) +
    (last.playerId ? ' · player ' + last.playerId : '') +
    ' · ' + CACHE.length + ' reading' + (CACHE.length === 1 ? '' : 's') + ' on this device';

  /* deltas */
  const deltaGrid = $('#delta-grid');
  clear(deltaGrid);
  ['weight', 'bodyFat', 'muscleMass', 'visceralFat'].forEach((key) => {
    const meta = METRICS[key];
    const card = el('div', 'tile');
    card.style.setProperty('--tile-accent', meta.accent);
    card.appendChild(el('span', 'tile__label', meta.label));
    const d = deltaFor(key);
    const holder = el('div', 'od-row');
    const chip = deltaChip(key, d);
    chip.classList.add('tile__value');
    chip.style.fontSize = 'var(--fs-sm)';
    chip.style.minHeight = '32px';
    holder.appendChild(chip);
    card.appendChild(holder);
    const foot = el('div', 'tile__foot');
    foot.textContent = d == null ? 'Needs two readings' : 'Compared with your previous reading';
    card.appendChild(foot);
    deltaGrid.appendChild(card);
  });

  /* mini trend */
  const miniPts = seriesFor('weight', '90d');
  $('#mini-chart').dataset.metric = 'weight';
  scheduleChart($('#mini-chart'), {
    points: miniPts.length >= 2 ? miniPts : seriesFor('weight', 'all'),
    height: 158,
    accent: METRICS.weight.accent,
    digits: 1,
    metricKey: 'weight',
    yFormat: axisFormat('weight')
  });

  renderInsights();
}

function html(sel, markup) {
  const node = $(sel);
  if (node) node.innerHTML = markup;
  return node;
}

function renderInsights() {
  const host = $('#insight-list');
  clear(host);
  const list = sortedAsc(CACHE);
  const first = list[0];
  const last = list[list.length - 1];
  if (!first || !last || list.length < 2) {
    const only = el('div', 'insight');
    only.appendChild(el('span', 'insight__mark', '•'));
    const body = el('div', 'od-field');
    body.appendChild(el('div', 'insight__title', 'One reading so far'));
    body.appendChild(el('div', 'insight__body', 'Add a second reading and the direction of travel appears here.'));
    only.appendChild(body);
    host.appendChild(only);
    return;
  }

  const items = [];

  const bfDelta = last.metrics.bodyFat != null && first.metrics.bodyFat != null ? last.metrics.bodyFat - first.metrics.bodyFat : null;
  if (bfDelta != null && Math.abs(bfDelta) >= 0.2) {
    items.push({
      accent: 'var(--c-amber-soft)',
      title: bfDelta < 0 ? 'Body fat has moved down' : 'Body fat has moved up',
      body: Math.abs(bfDelta).toFixed(1) + ' points ' + (bfDelta < 0 ? 'lower' : 'higher') + ' than your earliest reading, across ' + list.length + ' readings.'
    });
  }

  const mmDelta = last.metrics.muscleMass != null && first.metrics.muscleMass != null ? last.metrics.muscleMass - first.metrics.muscleMass : null;
  if (mmDelta != null && Math.abs(mmDelta) >= 0.1) {
    const shown = massValue(Math.abs(mmDelta), 1);
    items.push({
      accent: 'var(--c-green-soft)',
      title: mmDelta > 0 ? 'Muscle mass is up' : 'Muscle mass is down',
      body: shown.value + ' ' + shown.unit + ' ' + (mmDelta > 0 ? 'above' : 'below') + ' your earliest reading.'
    });
  }

  const weights = seriesFor('weight', '90d').map((p) => p.v);
  if (weights.length >= 3) {
    const spread = Math.max.apply(null, weights) - Math.min.apply(null, weights);
    items.push({
      accent: 'var(--c-primary-soft)',
      title: 'Weight spread over 90 days',
      body: 'A range of ' + metricText('weight', spread) + ' across ' + weights.length + ' readings, with the latest at ' + metricText('weight', weights[weights.length - 1]) + '.'
    });
  }

  const last30 = CACHE.filter((r) => Date.now() - new Date(r.measuredAt).getTime() <= 30 * 86400000);
  items.push({
    accent: 'var(--c-teal-soft)',
    title: 'Cadence',
    body: last30.length + ' reading' + (last30.length === 1 ? '' : 's') + ' in the last 30 days. The most recent was ' + relDays(last.measuredAt) + '.'
  });

  items.forEach((item) => {
    const node = el('div', 'insight');
    const mark = el('span', 'insight__mark');
    mark.style.background = item.accent;
    mark.textContent = '•';
    const body = el('div', 'od-field od-fill');
    body.appendChild(el('div', 'insight__title', item.title));
    body.appendChild(el('div', 'insight__body', item.body));
    node.appendChild(mark);
    node.appendChild(body);
    host.appendChild(node);
  });

  const note = el('p', 'footnote');
  note.style.padding = 'var(--s-2) 0 0';
  note.style.textAlign = 'left';
  note.textContent = 'These lines describe what your own readings show. They are not medical advice.';
  host.appendChild(note);
}

/* ------------------------------------------------------------------ */
/* Trends                                                              */
/* ------------------------------------------------------------------ */

const Trends = { metric: 'weight', range: '90d' };

function renderTrends() {
  const available = METRIC_ORDER.filter((key) => seriesFor(key, 'all').length > 0);
  if (!available.length) {
    clear($('#metric-rail'));
    clear($('#range-rail'));
    clear($('#trend-chart'));
    clear($('#trend-summary'));
    clear($('#composition-split'));
    $('#trend-latest').textContent = '—';
    $('#trend-range-note').textContent = '';
    $('#axis-start').textContent = '—';
    $('#axis-mid').textContent = '—';
    $('#axis-end').textContent = '—';
    return;
  }
  if (available.indexOf(Trends.metric) === -1) Trends.metric = available[0];

  const rail = $('#metric-rail');
  clear(rail);
  available.forEach((key) => {
    const btn = el('button', 'chipbtn', METRICS[key].label);
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', key === Trends.metric ? 'true' : 'false');
    btn.addEventListener('click', () => { Trends.metric = key; renderTrends(); });
    rail.appendChild(btn);
  });

  const rangeRail = $('#range-rail');
  clear(rangeRail);
  RANGES.forEach((range) => {
    const btn = el('button', 'chipbtn', range.label);
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', range.id === Trends.range ? 'true' : 'false');
    btn.addEventListener('click', () => { Trends.range = range.id; renderTrends(); });
    rangeRail.appendChild(btn);
  });

  const key = Trends.metric;
  const meta = METRICS[key];
  const pts = seriesFor(key, Trends.range);
  const allPts = seriesFor(key, 'all');

  $('#trend-label').textContent = meta.label;
  const latestValue = allPts.length ? allPts[allPts.length - 1].v : null;
  $('#trend-latest').textContent = metricText(key, latestValue);

  const deltaHost = $('#trend-delta');
  deltaHost.replaceWith(Object.assign(deltaChip(key, deltaFor(key)), { id: 'trend-delta' }));

  const note = $('#trend-range-note');
  note.textContent = pts.length + ' point' + (pts.length === 1 ? '' : 's');

  const axis = [$('#axis-start'), $('#axis-mid'), $('#axis-end')];
  if (pts.length >= 2) {
    const t0 = pts[0].t;
    const t2 = pts[pts.length - 1].t;
    const t1 = t0 + (t2 - t0) / 2;
    axis[0].textContent = fmtDate(t0, { day: 'numeric', month: 'short' });
    axis[1].textContent = fmtDate(t1, { day: 'numeric', month: 'short' });
    axis[2].textContent = fmtDate(t2, { day: 'numeric', month: 'short' });
  } else {
    axis.forEach((n) => { n.textContent = pts.length ? fmtDate(pts[0].t, { day: 'numeric', month: 'short' }) : '—'; });
  }

  scheduleChart($('#trend-chart'), {
    points: pts,
    height: 220,
    accent: meta.accent,
    digits: meta.digits,
    metricKey: key,
    padLeft: 44,
    yFormat: axisFormat(key)
  });

  /* summary */
  const summary = $('#trend-summary');
  clear(summary);
  const values = pts.map((p) => p.v);
  const cards = [];
  if (values.length) {
    cards.push(['Latest', metricText(key, values[values.length - 1])]);
    cards.push(['Average', metricText(key, values.reduce((a, b) => a + b, 0) / values.length)]);
    cards.push(['Lowest', metricText(key, Math.min.apply(null, values))]);
    cards.push(['Highest', metricText(key, Math.max.apply(null, values))]);
    if (values.length >= 2) {
      cards.push(['Change over range', metricText(key, values[values.length - 1] - values[0])]);
      cards.push(['Readings', String(values.length)]);
    }
  }
  if (!cards.length) {
    const empty = el('p', 'empty__body', 'No readings fall inside this range yet.');
    summary.appendChild(empty);
  }
  cards.forEach((pair) => {
    const card = el('div', 'tile');
    card.style.setProperty('--tile-accent', meta.accent);
    card.appendChild(el('span', 'tile__label', pair[0]));
    card.appendChild(el('span', 'tile__value', pair[1]));
    summary.appendChild(card);
  });

  renderCompositionSplit();
}

function renderCompositionSplit() {
  const host = $('#composition-split');
  clear(host);
  const last = latest();
  const weight = last && last.metrics ? last.metrics.weight : null;
  const bf = last && last.metrics ? last.metrics.bodyFat : null;
  if (weight == null || bf == null) {
    const p = el('p', 'empty__body', 'A reading with both weight and body fat is needed for the split.');
    host.appendChild(p);
    return;
  }
  const fatMass = (weight * bf) / 100;
  const leanMass = weight - fatMass;
  const total = fatMass + leanMass;
  const fatPct = (fatMass / total) * 100;

  const bar = el('div', 'split__bar');
  const segFat = el('span', 'split__seg');
  segFat.style.width = fatPct.toFixed(1) + '%';
  segFat.style.background = METRICS.bodyFat.accent;
  const segLean = el('span', 'split__seg');
  segLean.style.width = (100 - fatPct).toFixed(1) + '%';
  segLean.style.background = METRICS.muscleMass.accent;
  bar.appendChild(segLean);
  bar.appendChild(segFat);
  host.appendChild(bar);

  const legend = el('ul', 'split__legend');
  [
    ['Lean and other tissue', METRICS.muscleMass.accent, leanMass],
    ['Fat mass', METRICS.bodyFat.accent, fatMass],
    ['Total', 'var(--c-slate)', total]
  ].forEach((row) => {
    const li = el('li');
    const sw = el('span', 'split__swatch');
    sw.style.background = row[1];
    li.appendChild(sw);
    li.appendChild(el('span', 'split__name', row[0]));
    li.appendChild(el('span', 'split__val', metricText('weight', row[2])));
    legend.appendChild(li);
  });
  host.appendChild(legend);

  const note = el('p', 'footnote');
  note.style.padding = '0';
  note.style.textAlign = 'left';
  note.textContent = 'Fat mass is derived from your weight and body fat percentage. ' + fmtDate(last.measuredAt) + '.';
  host.appendChild(note);
}

/* ------------------------------------------------------------------ */
/* History and detail                                                  */
/* ------------------------------------------------------------------ */

let historyFilter = '';

function renderHistory() {
  const host = $('#history-list');
  clear(host);
  const query = historyFilter.trim().toLowerCase();
  const rows = sortedDesc(CACHE).filter((r) => {
    if (!query) return true;
    const hay = [fmtDate(r.measuredAt), SOURCE_LABEL[r.source] || '', r.playerId || '', r.note || ''].join(' ').toLowerCase();
    return hay.indexOf(query) !== -1;
  });

  $('#empty-history').hidden = rows.length > 0;

  rows.forEach((reading) => {
    const d = toDate(reading.measuredAt);
    const btn = el('button', 'hitem');
    btn.type = 'button';
    btn.addEventListener('click', () => Route.go('detail', reading.id));

    const date = el('div', 'hitem__date');
    date.appendChild(el('span', 'hitem__day', d ? String(d.getDate()) : '—'));
    date.appendChild(el('span', 'hitem__mon', d ? new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d) : ''));
    btn.appendChild(date);

    const mid = el('div', 'hitem__mid');
    const titleRow = el('div', 'od-row');
    titleRow.appendChild(el('span', 'row__title', SOURCE_LABEL[reading.source] || 'Reading'));
    if (reading.sample) titleRow.appendChild(el('span', 'chip chip--soft', 'Sample'));
    mid.appendChild(titleRow);

    const figures = el('div', 'hitem__figures');
    const items = [];
    ['weight', 'bodyFat', 'muscleMass', 'visceralFat'].forEach((key) => {
      if (typeof reading.metrics[key] === 'number') items.push([METRICS[key].label, metricText(key, reading.metrics[key])]);
    });
    items.slice(0, 3).forEach((pair) => {
      const span = el('span');
      span.appendChild(el('b', null, pair[1]));
      span.appendChild(document.createTextNode(' ' + pair[0].toLowerCase()));
      figures.appendChild(span);
    });
    mid.appendChild(figures);
    btn.appendChild(mid);

    const chev = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chev.setAttribute('viewBox', '0 0 24 24');
    chev.setAttribute('width', '20');
    chev.setAttribute('height', '20');
    chev.setAttribute('fill', 'none');
    chev.setAttribute('stroke', 'currentColor');
    chev.setAttribute('stroke-width', '1.75');
    chev.style.color = 'var(--c-muted)';
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M9 5l7 7-7 7');
    chev.appendChild(p);
    btn.appendChild(chev);

    host.appendChild(btn);
  });
}

function renderDetail(id) {
  const host = $('#detail-body');
  clear(host);
  const reading = CACHE.find((r) => r.id === id);
  if (!reading) {
    host.appendChild(el('p', 'empty__body', 'That reading is no longer on this device.'));
    return;
  }

  const card = el('div', 'detail__hero');
  card.appendChild(el('div', 'detail__date', fmtDate(reading.measuredAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })));
  const sub = el('div', 'detail__sub');
  const row = el('div', 'od-cluster');
  row.appendChild(el('span', 'chip chip--soft', SOURCE_LABEL[reading.source] || 'Reading'));
  if (reading.sample) row.appendChild(el('span', 'chip chip--soft', 'Sample'));
  if (reading.confidence != null) row.appendChild(el('span', 'chip chip--soft', 'OCR confidence ' + Math.round(reading.confidence * 100) + '%'));
  sub.appendChild(row);
  card.appendChild(sub);

  const grid = el('div', 'detail__grid');
  METRIC_ORDER.forEach((key) => {
    const value = reading.metrics ? reading.metrics[key] : null;
    if (value == null) return;
    const line = el('div', 'detail__row');
    line.appendChild(el('span', 'detail__k', METRICS[key].label));
    line.appendChild(el('span', 'detail__v', metricText(key, value)));
    grid.appendChild(line);
  });
  card.appendChild(grid);
  host.appendChild(card);

  const meta = el('p', 'detail__meta');
  const bits = ['Saved ' + fmtDateTime(reading.createdAt)];
  if (reading.playerId) bits.push('player_id ' + reading.playerId);
  if (reading.language) bits.push('language ' + reading.language);
  if (reading.reportUrl) bits.push(reading.reportUrl);
  meta.textContent = bits.join(' · ');
  host.appendChild(meta);

  if (reading.note) {
    const note = el('p', 'detail__meta');
    note.textContent = reading.note;
    host.appendChild(note);
  }

  const actions = el('div', 'od-cluster');
  actions.style.marginTop = 'var(--s-5)';
  const del = el('button', 'btn btn--danger btn--small', 'Delete reading');
  del.type = 'button';
  del.addEventListener('click', async () => {
    if (!window.confirm('Delete this reading from this device? This cannot be undone.')) return;
    await Store.remove(reading.id);
    CACHE = CACHE.filter((r) => r.id !== reading.id);
    toast('Reading deleted');
    Route.go('history');
  });
  actions.appendChild(del);
  host.appendChild(actions);

  if (reading.raw) {
    const details = el('details');
    details.style.marginTop = 'var(--s-5)';
    const summary = el('summary', 'linkbtn', 'Raw text returned by Gemini');
    details.appendChild(summary);
    const pre = el('div', 'rawbox', typeof reading.raw === 'string' ? reading.raw : JSON.stringify(reading.raw, null, 2));
    details.appendChild(pre);
    host.appendChild(details);
  }
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function renderSettings() {
  const user = Auth.user();
  $('#account-name').textContent = user ? (user.user_metadata && user.user_metadata.full_name) || (Auth.isLocal() ? 'Local mode' : 'Signed in') : 'Not signed in';
  $('#account-email').textContent = user && user.email ? user.email : (Auth.isLocal() ? 'Readings stay on this device' : 'No account connected');
  $('#btn-account').textContent = user ? 'Sign out' : 'Sign in';
  $('#account-avatar').textContent = user ? (Auth.isLocal() ? 'L' : (user.email || 'U').slice(0, 1).toUpperCase()) : '?';

  $('#sel-theme').value = Settings.get().theme;
  $('#sel-mass').value = Settings.get().massUnit;
  $('#chk-motion').checked = Boolean(Settings.get().reduceMotion);
  $('#chk-mirror').checked = Boolean(Settings.get().mirror);
  $('#in-supa-url').value = Settings.get().supabaseUrl || '';
  $('#in-supa-key').value = Settings.get().supabaseAnonKey || '';

  const count = CACHE.length;
  $('#stat-count').textContent = count + ' reading' + (count === 1 ? '' : 's') + (count ? '' : ' on this device');
  let bytes = 0;
  try { bytes = new Blob([JSON.stringify(CACHE)]).size; } catch (e) { bytes = 0; }
  $('#stat-size').textContent = bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(2) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';

  const configured = Proxy.isConfigured();
  const pill = $('#proxy-pill');
  pill.textContent = configured ? 'Connected' : 'Local mode';
  pill.className = 'pill' + (configured ? ' pill--ok' : ' pill--warn');
  $('#proxy-sub').textContent = configured
    ? 'Readings are read by Gemini inside your own Supabase project. The key never reaches this app.'
    : 'Readings are entered by hand. Add your Supabase URL and anon key, then deploy the OCR function.';

  $('#install-sub').textContent = isStandalone()
    ? 'Installed. Camera and offline use are available.'
    : 'Add to your home screen for camera access and offline use.';
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/* ------------------------------------------------------------------ */
/* Theme and motion                                                    */
/* ------------------------------------------------------------------ */

function applyTheme() {
  const choice = Settings.get().theme;
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', dark ? '#0f1418' : '#f6f8fa');
}

function applyMotion() {
  if (Settings.get().reduceMotion) document.documentElement.setAttribute('data-motion', 'reduced');
  else document.documentElement.removeAttribute('data-motion');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (Settings.get().theme === 'system') applyTheme();
});

/* ------------------------------------------------------------------ */
/* Capture flow                                                        */
/* ------------------------------------------------------------------ */

const Capture = (() => {
  let stream = null;
  let detector = null;
  let scanTimer = null;
  let scanning = false;
  let torchOn = false;
  let lastHit = '';
  let lastHitAt = 0;

  function openSheet() { $('#sheet-capture').hidden = false; }
  function closeSheet() {
    $('#sheet-capture').hidden = true;
    $('#url-form').hidden = true;
  }

  /* ---------- scanner ---------- */

  async function ensureDetector() {
    if (detector) return detector;
    if ('BarcodeDetector' in window) {
      try {
        const supported = (BarcodeDetector.getSupportedFormats && await BarcodeDetector.getSupportedFormats()) || [];
        if (!supported.length || supported.indexOf('qr_code') !== -1) {
          detector = { type: 'native', impl: new window.BarcodeDetector({ formats: ['qr_code'] }) };
          return detector;
        }
      } catch (e) { /* fall through to the script engine */ }
    }
    if (!window.__jsQR) {
      await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
        s.onload = resolve;
        s.onerror = resolve;
        document.head.appendChild(s);
      });
    }
    const impl = window.jsQR || window.jsqr;
    if (impl) detector = { type: 'script', impl };
    return detector;
  }

  async function openScanner() {
    closeSheet();
    $('#view-scanner').hidden = false;
    $('#scanner-engine').textContent = 'Starting camera';
    $('#scanner-hint').textContent = 'Line the QR code up inside the frame';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      const video = $('#scanner-video');
      video.srcObject = stream;
      await video.play();
      scanning = true;
      const engine = await ensureDetector();
      $('#scanner-engine').textContent = engine
        ? (engine.type === 'native' ? 'Camera ready' : 'Camera ready (fallback reader)')
        : 'Camera ready — photo mode';
      if (!engine) $('#scanner-hint').textContent = 'This browser has no in-page decoder. Take a photo of the code instead.';
      if (engine) loop();
    } catch (err) {
      $('#scanner-engine').textContent = 'Camera unavailable';
      $('#scanner-hint').textContent = 'Camera access was refused or is unavailable. Use the report link or a photo instead.';
      toast('Camera unavailable: ' + (err && err.message ? err.message : 'permission denied'), 'error');
    }
  }

  async function loop() {
    if (!scanning) return;
    const video = $('#scanner-video');
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = $('#scanner-canvas');
      const maxSide = 520;
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth || 1, video.videoHeight || 1));
      canvas.width = Math.round((video.videoWidth || 1) * scale);
      canvas.height = Math.round((video.videoHeight || 1) * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const text = await readFrame(canvas, ctx);
        if (text) { onDetected(text); return; }
      } catch (e) { /* keep scanning */ }
    }
    scanTimer = window.setTimeout(loop, 240);
  }

  async function readFrame(canvas, ctx) {
    const engine = detector;
    if (!engine) return null;
    if (engine.type === 'native') {
      const codes = await engine.impl.detect(canvas);
      if (codes && codes.length) return codes[0].rawValue || codes[0].rawText || null;
      return null;
    }
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = engine.impl(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
    return result && result.data ? result.data : null;
  }

  async function scanImageFile(file) {
    if (!file) return null;
    const engine = await ensureDetector();
    if (!engine) return null;
    const bitmap = await createImageBitmap(file);
    const canvas = $('#scanner-canvas');
    const maxSide = 900;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return readFrame(canvas, ctx);
  }

  function onDetected(text) {
    const now = Date.now();
    if (text === lastHit && now - lastHitAt < 2500) return;
    lastHit = text;
    lastHitAt = now;
    stopScanner();
    const parsed = parseReportUrl(text);
    if (!parsed.ok) {
      if (/\d{6,}/.test(text)) {
        startReading({ mode: 'player-id', playerId: text.trim(), language: 'en' });
        return;
      }
      toast('That code is not a report link: ' + text.slice(0, 60), 'error');
      return;
    }
    startReading({ mode: 'report-url', url: parsed.url, playerId: parsed.playerId, language: parsed.language });
  }

  function stopScanner() {
    scanning = false;
    window.clearTimeout(scanTimer);
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    const video = $('#scanner-video');
    if (video) video.srcObject = null;
    $('#view-scanner').hidden = true;
    torchOn = false;
  }

  async function toggleTorch() {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities || !track.getCapabilities().torch) {
      toast('This camera has no torch control.');
      return;
    }
    torchOn = !torchOn;
    try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); }
    catch (e) { toast('The torch could not be switched.'); }
  }

  /* ---------- reading pipeline ---------- */

  async function fileToBase64(file) {
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function setStep(name, state) {
    const node = $('#proc-steps li[data-step="' + name + '"]');
    if (node) node.dataset.state = state;
  }

  function showProcessing(title, body, steps) {
    $('#proc-title').textContent = title;
    $('#proc-body').textContent = body;
    $$('#proc-steps li').forEach((li) => { li.dataset.state = steps.indexOf(li.dataset.step) !== -1 ? 'active' : ''; });
    $('#overlay-processing').hidden = false;
  }
  function hideProcessing() { $('#overlay-processing').hidden = true; }

  async function startReading(job) {
    if (job.mode === 'manual') {
      openReview({
        metrics: {}, measuredAt: new Date().toISOString(), confidence: null, raw: null, notes: '',
        playerId: null, language: null, reportUrl: null, source: 'manual', previewUrl: null,
        note: 'Entered by hand.'
      });
      return;
    }

    showProcessing('Reading the report', 'Fetching the page for you, then handing it to Gemini.', ['fetch']);
    let result = null;
    let previewUrl = null;
    let note = '';

    try {
      if (job.mode === 'file') {
        setStep('fetch', 'done');
        setStep('ocr', 'active');
        $('#proc-title').textContent = 'Reading the attachment';
        $('#proc-body').textContent = 'Sending ' + job.file.name + ' straight to Gemini — no fetching needed.';
        previewUrl = job.file.type && job.file.type.indexOf('image/') === 0 ? URL.createObjectURL(job.file) : null;
        const data = await fileToBase64(job.file);
        result = await Proxy.fromDocument(job.file.type || 'application/octet-stream', data);
        note = 'Read from ' + job.file.name;
      } else if (job.mode === 'report-url') {
        if (!Proxy.isConfigured()) throw new Error('The OCR proxy is not configured, so the report cannot be fetched or read. Add your Supabase details in Settings, or enter the numbers by hand.');
        result = await Proxy.fromReportUrl(job.url);
        note = 'Fetched from ' + parseReportUrl(job.url).host;
      } else if (job.mode === 'player-id') {
        const built = 'http://13.251.17.127/tanita/selftestfitnesscorner/?player_id=' + encodeURIComponent(job.playerId) + '&language=' + encodeURIComponent(job.language || 'en');
        if (!Proxy.isConfigured()) throw new Error('Only a player id was found. The full report link is needed, and the proxy must be configured to fetch it.');
        result = await Proxy.fromReportUrl(built);
        note = 'Fetched from player ' + job.playerId;
      } else {
        result = { metrics: {}, measuredAt: new Date().toISOString() };
      }
      setStep('fetch', 'done');
      setStep('ocr', 'done');
      setStep('done', 'active');
    } catch (err) {
      hideProcessing();
      const message = err && err.message ? err.message : 'The report could not be read.';
      const proceed = window.confirm(message + '\n\nOpen the review screen and type the numbers instead?');
      if (!proceed) return;
      result = { metrics: {}, measuredAt: new Date().toISOString(), failed: true };
      note = 'Entered by hand after: ' + message;
    }

    hideProcessing();
    openReview({
      metrics: normaliseMetrics(result.metrics || {}),
      measuredAt: result.measuredAt || new Date().toISOString(),
      confidence: typeof result.confidence === 'number' ? result.confidence : null,
      raw: result.text || result.raw || null,
      notes: result.notes || '',
      playerId: job.playerId || null,
      language: job.language || null,
      reportUrl: job.url || null,
      source: job.mode === 'file' ? 'file' : job.mode === 'manual' ? 'manual' : 'qr',
      previewUrl,
      note
    });
  }

  function normaliseMetrics(input) {
    const out = {};
    Object.keys(input || {}).forEach((rawKey) => {
      const key = matchMetric(rawKey);
      if (!key) return;
      const value = parseNumber(input[rawKey]);
      if (value == null) return;
      out[key] = value;
    });
    return out;
  }

  function matchMetric(rawKey) {
    if (METRICS[rawKey]) return rawKey;
    const slug = String(rawKey).toLowerCase().replace(/[^a-z]/g, '');
    const table = {
      weight: 'weight', bodyweight: 'weight', mass: 'weight', weightkg: 'weight',
      bodyfat: 'bodyFat', bodyfatpercentage: 'bodyFat', fatpercent: 'bodyFat', bodyfatpct: 'bodyFat', percentfat: 'bodyFat',
      musclemass: 'muscleMass', muscle: 'muscleMass', skeletalmusclemass: 'muscleMass',
      fatfreemass: 'fatFreeMass', leanmass: 'fatFreeMass', fatfree: 'fatFreeMass',
      bodywater: 'bodyWater', water: 'bodyWater', totalbodywater: 'bodyWater', tbw: 'bodyWater',
      bonemass: 'boneMass', bone: 'boneMass',
      visceral: 'visceralFat', visceralfat: 'visceralFat', visceralfatlevel: 'visceralFat', vfl: 'visceralFat',
      bmi: 'bmi', bodymassindex: 'bmi',
      bmr: 'bmr', basalmetabolicrate: 'bmr', basalmetabolism: 'bmr',
      metabolicage: 'metabolicAge', bodyage: 'metabolicAge',
      musclequality: 'muscleQuality', musclequalityscore: 'muscleQuality',
      physiquerating: 'physiqueRating'
    };
    if (table[slug]) return table[slug];
    const keys = Object.keys(METRICS);
    for (let i = 0; i < keys.length; i++) {
      if (slug.indexOf(keys[i].toLowerCase()) !== -1) return keys[i];
    }
    return null;
  }

  return { openSheet, closeSheet, openScanner, stopScanner, toggleTorch, scanImageFile, startReading };
})();

/* ------------------------------------------------------------------ */
/* Review screen                                                       */
/* ------------------------------------------------------------------ */

let reviewState = null;

function openReview(state) {
  reviewState = Object.assign({ extras: [] }, state);
  const host = $('#review-body');
  clear(host);

  const sourceChip = el('span', 'chip chip--soft', SOURCE_LABEL[state.source] || 'Reading');
  const head = el('div', 'od-cluster');
  head.appendChild(sourceChip);
  if (state.confidence != null) head.appendChild(el('span', 'chip chip--soft', 'OCR confidence ' + Math.round(state.confidence * 100) + '%'));
  host.appendChild(head);

  if (state.note) {
    const p = el('p', 'rev__hint');
    p.style.marginTop = 'var(--s-2)';
    p.textContent = state.note;
    host.appendChild(p);
  }

  if (state.previewUrl) {
    const wrap = el('div', 'rev__preview');
    const img = document.createElement('img');
    img.src = state.previewUrl;
    img.alt = 'The attachment being read';
    img.width = 800;
    img.height = 600;
    wrap.appendChild(img);
    host.appendChild(wrap);
  }

  const form = el('form', 'rev');
  form.id = 'review-form';
  form.noValidate = true;
  form.style.marginTop = 'var(--s-3)';

  const h = el('div', 'rev__head');
  h.appendChild(el('div', 'rev__title', 'Measurement'));
  form.appendChild(h);

  const dateField = el('div', 'rev__field');
  const dateLabel = el('label', 'rev__label', 'Measured at');
  dateLabel.setAttribute('for', 'rev-date');
  dateField.appendChild(dateLabel);
  const dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.className = 'rev__input';
  dateInput.id = 'rev-date';
  dateInput.value = toLocalInput(state.measuredAt);
  dateField.appendChild(dateInput);
  form.appendChild(dateField);

  const grid = el('div', 'rev__grid');
  grid.id = 'rev-grid';
  grid.style.marginTop = 'var(--s-3)';
  form.appendChild(grid);

  Object.keys(state.metrics).forEach((key) => { grid.appendChild(reviewField(key, state.metrics[key])); });

  const addRow = el('div', 'od-row');
  addRow.style.marginTop = 'var(--s-3)';
  const select = document.createElement('select');
  select.className = 'rev__input od-fill';
  select.id = 'rev-add';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = 'Add another metric';
  select.appendChild(opt0);
  METRIC_ORDER.forEach((key) => {
    if (state.metrics[key] != null) return;
    const o = document.createElement('option');
    o.value = key;
    o.textContent = METRICS[key].label + (METRICS[key].unit ? ' (' + METRICS[key].unit + ')' : '');
    select.appendChild(o);
  });
  select.addEventListener('change', () => {
    const key = select.value;
    if (!key) return;
    grid.appendChild(reviewField(key, ''));
    const existing = Array.from(select.options).find((o) => o.value === key);
    if (existing) existing.remove();
    select.value = '';
  });
  addRow.appendChild(select);
  form.appendChild(addRow);
  host.appendChild(form);

  const errBox = el('p', 'rev__error');
  errBox.id = 'rev-error';
  errBox.hidden = true;
  host.appendChild(errBox);

  if (state.raw) {
    const details = el('details');
    details.style.marginTop = 'var(--s-4)';
    details.appendChild(el('summary', 'linkbtn', 'What Gemini returned'));
    details.appendChild(el('div', 'rawbox', typeof state.raw === 'string' ? state.raw : JSON.stringify(state.raw, null, 2)));
    host.appendChild(details);
  }

  $('#view-review').hidden = false;
  $('#review-sub').textContent = state.failed
    ? 'The report could not be read, so the fields are empty. Fill in what you know and save.'
    : 'Correct anything Gemini misread before it is saved.';
  const first = $('#rev-grid input');
  if (first) first.focus();
}

function reviewField(key, value) {
  const meta = METRICS[key];
  const field = el('div', 'rev__field');
  const label = el('label', 'rev__label', meta.label + (meta.unit ? ' · ' + meta.unit : ''));
  const id = 'rev-' + key;
  label.setAttribute('for', id);
  field.appendChild(label);
  const input = document.createElement('input');
  input.className = 'rev__input';
  input.id = id;
  input.dataset.metric = key;
  input.type = 'number';
  input.step = meta.digits === 0 ? '1' : (meta.digits === 1 ? '0.1' : '0.01');
  input.min = String(meta.min);
  input.max = String(meta.max);
  input.inputMode = 'decimal';
  input.value = value == null || value === '' ? '' : String(value);
  input.setAttribute('aria-describedby', id + '-hint');
  field.appendChild(input);
  const hint = el('span', 'rev__hint', 'Typical range ' + meta.min + '–' + meta.max + (meta.unit ? ' ' + meta.unit : '') + '.');
  hint.id = id + '-hint';
  field.appendChild(hint);
  return field;
}

function toLocalInput(iso) {
  const d = toDate(iso) || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function closeReview() {
  $('#view-review').hidden = true;
  if (reviewState && reviewState.previewUrl) URL.revokeObjectURL(reviewState.previewUrl);
  reviewState = null;
}

async function saveReview() {
  if (!reviewState) return;
  const errBox = $('#rev-error');
  const errs = [];
  const metrics = {};

  $$('#rev-grid input[data-metric]').forEach((input) => {
    const key = input.dataset.metric;
    const meta = METRICS[key];
    input.removeAttribute('aria-invalid');
    const value = parseNumber(input.value);
    if (input.value.trim() === '') return;
    if (value == null || isNaN(value)) {
      errs.push(meta.label + ' is not a number.');
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    if (value < meta.min || value > meta.max) {
      errs.push(meta.label + ' should sit between ' + meta.min + ' and ' + meta.max + (meta.unit ? ' ' + meta.unit : '') + '.');
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    metrics[key] = value;
  });

  const measuredAt = toDate($('#rev-date').value);
  if (!measuredAt) errs.push('The measurement date is missing.');

  if (errs.length) {
    errBox.hidden = false;
    errBox.textContent = errs.join(' ');
    errBox.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (!Object.keys(metrics).length) {
    errBox.hidden = false;
    errBox.textContent = 'Add at least one measurement before saving.';
    return;
  }

  const reading = {
    id: uid(),
    createdAt: new Date().toISOString(),
    measuredAt: measuredAt.toISOString(),
    source: reviewState.source || 'manual',
    sample: false,
    playerId: reviewState.playerId || null,
    language: reviewState.language || null,
    reportUrl: reviewState.reportUrl || null,
    note: reviewState.notes || reviewState.note || '',
    confidence: reviewState.confidence,
    raw: reviewState.raw,
    metrics
  };

  try {
    await Store.put(reading);
  } catch (err) {
    errBox.hidden = false;
    errBox.textContent = 'Could not save to this device: ' + (err && err.message ? err.message : 'unknown error');
    return;
  }

  CACHE = CACHE.concat([reading]);
  closeReview();
  toast('Reading saved');
  Route.go('dashboard');
  if (Settings.get().mirror && Auth.isConfigured && Auth.isConfigured()) mirrorPush([reading]);
}

async function mirrorPush(readings) {
  const client = Auth.getSession();
  if (!client || !client.local) {
    // Use the raw REST endpoint so the app never needs to hold a client instance here.
    try {
      const url = Settings.get().supabaseUrl.replace(/\/+$/, '') + '/rest/v1/readings';
      const token = await Auth.accessToken();
      if (!token) return;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: Settings.get().supabaseAnonKey,
          Authorization: 'Bearer ' + token,
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify(readings.map((r) => ({
          id: r.id,
          measured_at: r.measuredAt,
          source: r.source,
          payload: r
        })))
      });
    } catch (e) { /* the mirror is best effort */ }
  }
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
}

function exportJSON() {
  download('composition-readings-' + stamp() + '.json', JSON.stringify({ app: 'composition', version: APP_VERSION, exportedAt: new Date().toISOString(), readings: sortedAsc(CACHE) }, null, 2), 'application/json');
  toast('JSON exported');
}

function toCSV(rows, headers, mapper) {
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => {
      const v = mapper(row, h);
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(','));
  });
  return lines.join('\n');
}

function exportCSV() {
  const rows = sortedAsc(CACHE);
  const headers = ['measured_at', 'source', 'player_id', 'note',
    'weight_kg', 'body_fat_pct', 'muscle_mass_kg', 'fat_free_mass_kg', 'body_water_pct',
    'bone_mass_kg', 'visceral_fat', 'bmi', 'bmr_kcal', 'metabolic_age', 'muscle_quality', 'physique_rating'];
  const text = toCSV(rows, headers, (row, h) => {
    if (h === 'measured_at') return row.measuredAt;
    if (h === 'source') return row.source;
    if (h === 'player_id') return row.playerId;
    if (h === 'note') return row.note;
    const map = {
      weight_kg: 'weight', body_fat_pct: 'bodyFat', muscle_mass_kg: 'muscleMass', fat_free_mass_kg: 'fatFreeMass',
      body_water_pct: 'bodyWater', bone_mass_kg: 'boneMass', visceral_fat: 'visceralFat', bmi: 'bmi',
      bmr_kcal: 'bmr', metabolic_age: 'metabolicAge', muscle_quality: 'muscleQuality', physique_rating: 'physiqueRating'
    };
    return row.metrics ? row.metrics[map[h]] : null;
  });
  download('composition-readings-' + stamp() + '.csv', text, 'text/csv;charset=utf-8');
  toast('CSV exported');
}

function exportSamsung() {
  const rows = sortedAsc(CACHE).filter((r) => r.metrics && r.metrics.weight != null && r.metrics.bodyFat != null);
  if (!rows.length) { toast('Samsung Health import needs weight and body fat', 'error'); return; }
  const headers = ['start_time', 'end_time', 'weight', 'body_fat', 'skeletal_muscle', 'body_water', 'visceral_fat', 'bmi', 'basal_metabolic_rate'];
  const text = toCSV(rows, headers, (row, h) => {
    const m = row.metrics;
    if (h === 'start_time' || h === 'end_time') return row.measuredAt;
    if (h === 'weight') return m.weight;
    if (h === 'body_fat') return m.bodyFat;
    if (h === 'skeletal_muscle') return m.muscleMass;
    if (h === 'body_water') return m.bodyWater;
    if (h === 'visceral_fat') return m.visceralFat;
    if (h === 'bmi') return m.bmi;
    if (h === 'basal_metabolic_rate') return m.bmr;
    return null;
  });
  download('samsung-health-body-composition-' + stamp() + '.csv', text, 'text/csv;charset=utf-8');
  toast('Samsung-shaped CSV exported');
}

async function copySummary() {
  const last = latest();
  if (!last) { toast('Nothing to summarise yet'); return; }
  const lines = ['Body composition — ' + fmtDateTime(last.measuredAt)];
  METRIC_ORDER.forEach((key) => {
    if (typeof last.metrics[key] === 'number') lines.push(METRICS[key].label + ': ' + metricText(key, last.metrics[key]));
  });
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('Summary copied');
  } catch (e) {
    const holder = $('#clipboard-holder');
    holder.value = text;
    holder.select();
    toast('Summary selected — copy it from the text field');
  }
}

/* ------------------------------------------------------------------ */
/* Shared-in file (Cloudflare share inbox)                             */
/* ------------------------------------------------------------------ */

async function consumeShareToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('share');
  if (!token) return;

  const url = new URL(window.location.href);
  url.searchParams.delete('share');

  try {
    const res = await fetch('./share/' + encodeURIComponent(token), { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      toast((data && data.error) || 'That shared file could not be collected.', 'error');
      return;
    }
    const record = data.record || {};
    if (record.kind === 'text') {
      const parsed = parseReportUrl(record.text);
      if (parsed.ok) {
        Capture.startReading({ mode: 'report-url', url: parsed.url, playerId: parsed.playerId, language: parsed.language });
      } else {
        toast('The shared text was not a report link.', 'error');
      }
      return;
    }
    const binary = atob(record.data || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], record.name || 'shared-report', { type: record.type || 'application/octet-stream' });
    Capture.startReading({ mode: 'file', file });
  } catch (err) {
    toast('That shared file could not be collected.', 'error');
  } finally {
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function loadReadings() {
  try {
    CACHE = await Store.all();
  } catch (err) {
    CACHE = [];
    toast('Local storage is unavailable in this browser. Readings cannot be saved.', 'error');
  }
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const routeBtn = e.target.closest('[data-route]');
    if (routeBtn) {
      const target = routeBtn.getAttribute('data-route');
      if (target === 'capture') Capture.openSheet();
      else Route.go(target);
      return;
    }
    if (e.target.closest('[data-close-sheet]')) { Capture.closeSheet(); return; }
  });

  $('#btn-signin').addEventListener('click', async () => {
    try {
      $('#auth-note').textContent = 'Opening Google…';
      await Auth.signInWithGoogle();
    } catch (err) {
      $('#auth-note').textContent = err && err.message ? err.message : 'Sign-in could not start. Use local mode instead.';
    }
  });

  $('#btn-demo').addEventListener('click', () => { Auth.signInLocal('Local mode'); });

  $('#btn-scan-top').addEventListener('click', () => Capture.openScanner());
  $('#opt-scan').addEventListener('click', () => Capture.openScanner());
  $('#fab-add').addEventListener('click', () => Capture.openSheet());
  $('#opt-share').addEventListener('click', () => $('#file-picker').click());
  $('#opt-manual').addEventListener('click', () => {
    Capture.closeSheet();
    Capture.startReading({ mode: 'manual' });
  });
  $('#opt-url').addEventListener('click', () => { $('#url-form').hidden = false; $('#in-report-url').focus(); });
  $('#btn-url-cancel').addEventListener('click', () => { $('#url-form').hidden = true; });

  $('#url-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const parsed = parseReportUrl($('#in-report-url').value);
    if (!parsed.ok) { toast('That does not look like a report link', 'error'); return; }
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
        if (/\d{6,}/.test(text)) { Capture.stopScanner(); Capture.startReading({ mode: 'player-id', playerId: text.trim(), language: 'en' }); return; }
        toast('That code is not a report link', 'error');
        return;
      }
      Capture.stopScanner();
      Capture.startReading({ mode: 'report-url', url: parsed.url, playerId: parsed.playerId, language: parsed.language });
    } catch (err) {
      toast('The photo could not be read', 'error');
    }
  });

  $('#btn-review-close').addEventListener('click', closeReview);
  $('#btn-review-cancel').addEventListener('click', closeReview);
  $('#btn-review-save').addEventListener('click', saveReview);

  $('#btn-theme').addEventListener('click', () => {
    const now = document.documentElement.getAttribute('data-theme');
    Settings.save({ theme: now === 'dark' ? 'light' : 'dark' });
    applyTheme();
  });

  $('#btn-clear-sample').addEventListener('click', async () => {
    const samples = CACHE.filter((r) => r.sample);
    for (const s of samples) await Store.remove(s.id);
    CACHE = CACHE.filter((r) => !r.sample);
    toast('Sample data removed');
    renderDashboard();
  });

  $('#btn-detail-back').addEventListener('click', () => Route.back());

  $('#history-search').addEventListener('input', (e) => { historyFilter = e.target.value; renderHistory(); });
  $('#btn-clear-filter').addEventListener('click', () => { historyFilter = ''; $('#history-search').value = ''; renderHistory(); });
  $('#btn-export-history').addEventListener('click', exportCSV);

  $('#sel-theme').addEventListener('change', (e) => { Settings.save({ theme: e.target.value }); applyTheme(); });
  $('#sel-mass').addEventListener('change', (e) => {
    Settings.save({ massUnit: e.target.value });
    renderSettings();
    if (Route.current() === 'dashboard') renderDashboard();
  });
  $('#chk-motion').addEventListener('change', (e) => { Settings.save({ reduceMotion: e.target.checked }); applyMotion(); });
  $('#chk-mirror').addEventListener('change', (e) => {
    Settings.save({ mirror: e.target.checked });
    toast(e.target.checked ? 'Cloud mirror on — new readings copy to your project' : 'Cloud mirror off');
  });

  $('#btn-save-config').addEventListener('click', async () => {
    Settings.save({
      supabaseUrl: $('#in-supa-url').value.trim().replace(/\/+$/, ''),
      supabaseAnonKey: $('#in-supa-key').value.trim()
    });
    toast('Configuration saved — reconnecting');
    await Auth.reset();
    renderSettings();
    renderDashboard();
  });

  $('#btn-test-proxy').addEventListener('click', async () => {
    Settings.save({
      supabaseUrl: $('#in-supa-url').value.trim().replace(/\/+$/, ''),
      supabaseAnonKey: $('#in-supa-key').value.trim()
    });
    if (!Proxy.isConfigured()) { toast('Add the URL and anon key first', 'error'); return; }
    toast('Testing the proxy…');
    try {
      const res = await Proxy.ping();
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
      showAuth();
    } else {
      showAuth();
    }
  });

  $('#btn-export-json').addEventListener('click', exportJSON);
  $('#btn-export-csv').addEventListener('click', exportCSV);
  $('#btn-export-samsung').addEventListener('click', exportSamsung);
  $('#btn-copy-summary').addEventListener('click', copySummary);

  $('#btn-erase').addEventListener('click', async () => {
    if (!window.confirm('Delete every reading from this device? Export first if you want a copy.')) return;
    await Store.clearAll();
    CACHE = [];
    toast('All readings erased');
    renderSettings();
    Route.go('dashboard');
  });

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

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !$('#view-scanner').hidden) Capture.stopScanner();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#view-scanner').hidden) Capture.stopScanner();
      else if (!$('#view-review').hidden) closeReview();
      else if (!$('#sheet-capture').hidden) Capture.closeSheet();
    }
  });
}

function showAuth() {
  $('#shell').hidden = true;
  $('#view-auth').hidden = false;
  const note = $('#auth-note');
  if (!Auth.isConfigured()) {
    note.textContent = 'Supabase is not configured yet, so Google sign-in is off. Use local mode — everything below still works, and the README shows how to switch it on.';
  } else {
    note.textContent = 'Signed in accounts can mirror readings to your own Supabase project.';
  }
}

function showApp() {
  $('#view-auth').hidden = true;
  $('#shell').hidden = false;
  const parsed = (window.location.hash || '').replace(/^#\/?/, '').split('/');
  Route.go(parsed[0] || 'dashboard', parsed[1]);
}

async function boot() {
  Settings.load();
  applyTheme();
  applyMotion();

  bindEvents();
  await loadReadings();

  if (!localStorage.getItem(LS.seeded) && CACHE.length === 0) {
    const samples = sampleReadings();
    try {
      await Store.bulkPut(samples);
      CACHE = samples;
      localStorage.setItem(LS.seeded, '1');
    } catch (e) { /* seeding is optional */ }
  }

  const session = await Auth.init();
  Auth.onChange((s) => { if (s) showApp(); else showAuth(); });

  if (session) showApp();
  else showAuth();

  await consumeShareToken();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
    });
  }
}

document.addEventListener('DOMContentLoaded', boot);
