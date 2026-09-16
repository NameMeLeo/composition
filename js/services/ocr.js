/* Composition — client for the Supabase Edge Function that reads reports.
   The Gemini API key lives in the function's environment, never here. */

import { Settings } from '../core/settings.js';
import { Auth } from './auth.js';

function base() {
  const url = Settings.get().supabaseUrl;
  return url ? url.replace(/\/+$/, '') + '/functions/v1/ocr' : null;
}

function isConfigured() { return Boolean(base() && Settings.get().supabaseAnonKey); }

async function authFailure() {
  await Auth.signOut();
  const error = new Error('Your Google session expired. Sign in again to continue.');
  error.code = 'AUTH_REQUIRED';
  return error;
}

async function call(payload) {
  const endpoint = base();
  if (!endpoint) throw new Error('The OCR proxy is not configured. Add your Supabase URL in Settings.');

  const headers = {
    'Content-Type': 'application/json',
    apikey: Settings.get().supabaseAnonKey
  };
  const token = await Auth.accessToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  // A ping is allowed with the anon key alone so Settings can test the wiring
  // before anyone has signed in.
  else if (payload.mode === 'ping') headers.Authorization = 'Bearer ' + Settings.get().supabaseAnonKey;
  else throw await authFailure();

  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || ('The proxy replied with ' + res.status + '.');
    if (res.status === 401 && /session is not valid|signed-in user|missing credentials/i.test(msg)) {
      throw await authFailure();
    }
    throw new Error(msg);
  }
  if (data && data.ok === false) throw new Error(data.error || 'The proxy could not read that report.');
  return data || {};
}

export const OcrProxy = {
  isConfigured,
  ping: () => call({ mode: 'ping' }),
  fromReportUrl: (url) => call({ mode: 'report-url', url }),
  fromDocument: (mimeType, data) => call({ mode: 'document', mimeType, data })
};
