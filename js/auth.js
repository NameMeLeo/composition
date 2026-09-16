/* Composition — Supabase Google sign-in.
   The client library is pulled from esm.sh on demand so nothing auth-related is
   bundled, and no session is ever written by this file. */

import { LS } from './constants.js';
import { Settings } from './settings.js';

let client = null;
let session = null;
const listeners = [];

function isConfigured() {
  const s = Settings.get();
  return Boolean(s.supabaseUrl && s.supabaseAnonKey);
}

function emit() {
  listeners.forEach((fn) => { try { fn(session); } catch (e) { /* ignore a bad listener */ } });
}

async function init() {
  if (!isConfigured()) {
    client = null;
    session = null;
    return null;
  }
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
    session = null;
    return null;
  }
}

function onChange(fn) { listeners.push(fn); }

function user() { return session && session.user ? session.user : null; }

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

async function signOut() {
  if (client) { try { await client.auth.signOut(); } catch (e) { /* ignore */ } }
  session = null;
  try { localStorage.removeItem(LS.session); } catch (e) { /* ignore */ }
  emit();
}

/** A live access token, refreshed when it is within a minute of expiring. */
async function accessToken() {
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    const current = data && data.session ? data.session : null;
    const expiresSoon = current && current.expires_at && current.expires_at <= Math.floor(Date.now() / 1000) + 60;
    if (current && !expiresSoon) {
      session = current;
      return current.access_token;
    }

    const refreshed = await client.auth.refreshSession();
    session = refreshed.data && refreshed.data.session ? refreshed.data.session : null;
    if (!session) emit();
    return session ? session.access_token : null;
  } catch (err) {
    session = null;
    emit();
    return null;
  }
}

/** Rebuilds the client after the Supabase URL or key changes in Settings. */
async function reset() {
  client = null;
  session = null;
  await init();
  emit();
}

export const Auth = { init, onChange, user, isConfigured, signInWithGoogle, signOut, accessToken, reset };
