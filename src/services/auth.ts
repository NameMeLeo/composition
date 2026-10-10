/* Composition — Supabase Google sign-in.
   The client library is pulled from esm.sh on demand so nothing auth-related is
   bundled, and no session is ever written by this file. */

import { LS } from '../core/constants.js';
import { Settings } from '../core/settings.js';

interface SupabaseSession {
  access_token: string;
  expires_at?: number;
  user?: SupabaseUser;
}

interface SupabaseUser {
  email?: string;
  user_metadata?: { full_name?: string };
}

interface SupabaseClient {
  auth: {
    getSession(): Promise<{ data: { session: SupabaseSession | null } }>;
    onAuthStateChange(cb: (event: string, session: SupabaseSession | null) => void): void;
    signInWithOAuth(opts: unknown): Promise<{ error: Error | null }>;
    signOut(): Promise<void>;
    refreshSession(): Promise<{ data: { session: SupabaseSession | null } }>;
  };
}

let client: SupabaseClient | null = null;
let session: SupabaseSession | null = null;
const listeners: Array<(s: SupabaseSession | null) => void> = [];

function isConfigured(): boolean {
  const s = Settings.get();
  return Boolean(s.supabaseUrl && s.supabaseAnonKey);
}

function emit(): void {
  listeners.forEach((fn) => { try { fn(session); } catch (e) { /* ignore a bad listener */ } });
}

async function init(): Promise<SupabaseSession | null> {
  if (!isConfigured()) {
    client = null;
    session = null;
    return null;
  }
  try {
    // CDN import: esm.sh has no bundled types; treated as any by design.
    // @ts-expect-error - remote CDN module without type declarations
    const mod = await import('https://esm.sh/@supabase/supabase-js@2') as {
      createClient(url: string, key: string, opts: unknown): SupabaseClient;
    };
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
    session = null;
    return null;
  }
}

function onChange(fn: (s: SupabaseSession | null) => void): void { listeners.push(fn); }

function user(): SupabaseUser | null { return session?.user ?? null; }

async function signInWithGoogle(): Promise<void> {
  if (!client) throw new Error('Supabase is not configured yet.');
  const url = new URL(window.location.href);
  url.hash = '';
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: url.toString(), queryParams: { prompt: 'select_account' } }
  });
  if (error) throw error;
}

async function signOut(): Promise<void> {
  if (client) { try { await client.auth.signOut(); } catch (e) { /* ignore */ } }
  session = null;
  try { localStorage.removeItem(LS.session); } catch (e) { /* ignore */ }
  emit();
}

/** A live access token, refreshed when it is within a minute of expiring. */
async function accessToken(): Promise<string | null> {
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    const current = data?.session ?? null;
    const expiresSoon = current?.expires_at != null && current.expires_at <= Math.floor(Date.now() / 1000) + 60;
    if (current && !expiresSoon) {
      session = current;
      return current.access_token;
    }

    const refreshed = await client.auth.refreshSession();
    session = refreshed.data?.session ?? null;
    if (!session) emit();
    return session ? session.access_token : null;
  } catch (err) {
    session = null;
    emit();
    return null;
  }
}

/** Rebuilds the client after the Supabase URL or key changes in Settings. */
async function reset(): Promise<void> {
  client = null;
  session = null;
  await init();
  emit();
}

export const Auth = { init, onChange, user, isConfigured, signInWithGoogle, signOut, accessToken, reset };
export type { SupabaseSession, SupabaseUser };
