/* Composition — user preferences, persisted to localStorage. */

import { LS, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, DEFAULT_REPORT_BASE } from './constants.js';

const defaults = {
  theme: 'system',
  massUnit: 'kg',
  reduceMotion: false,
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
  reportBase: DEFAULT_REPORT_BASE,
  mirror: false,
  mirrorSyncedAt: null
};

let current = Object.assign({}, defaults);

function load() {
  try {
    const raw = localStorage.getItem(LS.settings);
    if (raw) current = Object.assign({}, defaults, JSON.parse(raw));
    // A blank URL or key in storage means "use the shipped default", not "unset".
    if (!current.supabaseUrl) current.supabaseUrl = defaults.supabaseUrl;
    if (!current.supabaseAnonKey) current.supabaseAnonKey = defaults.supabaseAnonKey;
    if (!current.reportBase) current.reportBase = defaults.reportBase;
  } catch (e) { /* keep the defaults */ }
  return current;
}

function get() { return current; }

function save(patch) {
  current = Object.assign({}, current, patch);
  try { localStorage.setItem(LS.settings, JSON.stringify(current)); } catch (e) { /* ignore */ }
  return current;
}

export const Settings = { load, get, save, defaults };
