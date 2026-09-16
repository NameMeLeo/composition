/* Composition — CORS, JSON responses and the caller's identity.
   Everything in here is about the HTTP conversation, not about reading a report. */

import { createClient } from '@supabase/supabase-js';
import { ALLOWED_ORIGINS, REQUIRE_AUTH, SUPABASE_ANON_KEY, SUPABASE_URL } from './config.ts';

/** Loopback origins always match each other, whatever port the dev server picked —
    but plain http on localhost is the only thing this leniency is for. */
function originsMatch(configured: string, requested: string): boolean {
  if (configured === requested) return true;
  try {
    const expected = new URL(configured);
    const actual = new URL(requested);
    const loopback = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
    return expected.protocol === 'http:' && actual.protocol === 'http:'
      && loopback.has(expected.hostname.toLowerCase())
      && loopback.has(actual.hostname.toLowerCase())
      && expected.port === actual.port;
  } catch {
    return false;
  }
}

export function cors(requestOrigin = '', extra: Record<string, string> = {}): Record<string, string> {
  const allowOrigin = ALLOWED_ORIGINS.includes('*')
    ? '*'
    : requestOrigin && ALLOWED_ORIGINS.some((configured) => originsMatch(configured, requestOrigin))
      ? requestOrigin
      : ALLOWED_ORIGINS[0] ?? '*';

  return Object.assign({
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  }, extra);
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}, requestOrigin = ''): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors(requestOrigin, Object.assign({ 'Content-Type': 'application/json' }, headers))
  });
}

/** Flattens a fetched report page to text, keeping table cells on their own line so
    the model sees the same rows the browser would. */
export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(tr|table|div|p|li|h[1-6])>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Accepts the bare anon key, or a signed-in Supabase user when REQUIRE_AUTH is set. */
export async function authorize(req: Request): Promise<{ ok: true } | { ok: false; error: string }> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, error: 'Missing credentials. Sign in or add the anon key.' };

  if (SUPABASE_ANON_KEY && token === SUPABASE_ANON_KEY) {
    if (REQUIRE_AUTH) return { ok: false, error: 'This proxy requires a signed-in user.' };
    return { ok: true };
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return REQUIRE_AUTH ? { ok: false, error: 'The proxy is not configured for authentication.' } : { ok: true };
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return { ok: false, error: 'That session is not valid any more.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'The session could not be verified.' };
  }
}
