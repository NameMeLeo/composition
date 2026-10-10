/* Composition — user preferences, persisted to localStorage. */

import { LS, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, DEFAULT_REPORT_BASE } from './constants.js';
import type { AppSettings } from '../domain/types.js';

const defaults: AppSettings = {
  theme: 'system',
  massUnit: 'kg',
  lang: 'system',
  reduceMotion: false,
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
  reportBase: DEFAULT_REPORT_BASE,
  mirror: false,
  mirrorSyncedAt: null
};

let current: AppSettings = { ...defaults };

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(LS.settings);
    if (raw) current = { ...defaults, ...(JSON.parse(raw) as Partial<AppSettings>) };
    // A blank URL or key in storage means "use the shipped default", not "unset".
    if (!current.supabaseUrl) current.supabaseUrl = defaults.supabaseUrl;
    if (!current.supabaseAnonKey) current.supabaseAnonKey = defaults.supabaseAnonKey;
    if (!current.reportBase) current.reportBase = defaults.reportBase;
  } catch (e) { /* keep the defaults */ }
  return current;
}

function get(): AppSettings { return current; }

function save(patch: Partial<AppSettings>): AppSettings {
  current = { ...current, ...patch };
  try { localStorage.setItem(LS.settings, JSON.stringify(current)); } catch (e) { /* ignore */ }
  return current;
}

export const Settings = { load, get, save, defaults };
