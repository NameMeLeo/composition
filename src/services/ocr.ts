/* Composition — client for the Supabase Edge Function that reads reports.
   The Gemini API key lives in the function's environment, never here. */

import { Settings } from '../core/settings.js';
import { t } from '../core/i18n.js';
import { Auth } from './auth.js';

interface OcrPayload {
  mode: 'ping' | 'report-url' | 'document' | 'report-asset';
  url?: string;
  reportUrl?: string;
  name?: string;
  mimeType?: string;
  data?: string;
}

export interface ReportAsset {
  ok: true;
  name: string;
  mime: string;
  data: string;
}

function base(): string | null {
  const url = Settings.get().supabaseUrl;
  return url ? url.replace(/\/+$/, '') + '/functions/v1/ocr' : null;
}

function isConfigured(): boolean { return Boolean(base() && Settings.get().supabaseAnonKey); }

class AuthRequiredError extends Error {
  code = 'AUTH_REQUIRED';
}

async function authFailure(): Promise<never> {
  await Auth.signOut();
  throw new AuthRequiredError(t('svc.expired'));
}

async function call(payload: OcrPayload): Promise<Record<string, unknown>> {
  const endpoint = base();
  if (!endpoint) throw new Error(t('svc.noproxy'));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: Settings.get().supabaseAnonKey
  };
  const token = await Auth.accessToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  // A ping and a public overlay icon are allowed with the anon key alone so
  // Settings can test the wiring before anyone has signed in, and so the report
  // image renders without a session. Icons carry no medical data.
  else if (payload.mode === 'ping' || payload.mode === 'report-asset') headers.Authorization = 'Bearer ' + Settings.get().supabaseAnonKey;
  else await authFailure();

  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
  let data: Record<string, unknown> | null = null;
  try { data = (await res.json()) as Record<string, unknown>; } catch (e) { data = null; }

  if (!res.ok) {
    const msg = (data && ((data.error as string) || (data.message as string))) || t('svc.replied', { status: res.status });
    if (res.status === 401 && /session is not valid|signed-in user|missing credentials/i.test(msg)) {
      await authFailure();
    }
    throw new Error(msg);
  }
  if (data && data.ok === false) throw new Error((data.error as string) || t('svc.unreadable'));
  return data || {};
}

export const OcrProxy = {
  isConfigured,
  ping: (): Promise<Record<string, unknown>> => call({ mode: 'ping' }),
  fromReportUrl: (url: string): Promise<Record<string, unknown>> => call({ mode: 'report-url', url }),
  fromDocument: (mimeType: string, data: string): Promise<Record<string, unknown>> => call({ mode: 'document', mimeType, data }),
  reportAsset: (reportUrl: string, name: string): Promise<ReportAsset> =>
    call({ mode: 'report-asset', reportUrl, name }) as unknown as Promise<ReportAsset>
};
