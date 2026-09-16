/* Composition — swapping between the sign-in screen and the app shell. */

import { $ } from './dom.js';
import { Auth } from './auth.js';
import { Route, parse } from './router.js';

export function showAuth() {
  $('#shell').hidden = true;
  $('#view-auth').hidden = false;
  const note = $('#auth-note');
  if (!Auth.isConfigured()) {
    note.textContent = 'Google sign-in is unavailable until Supabase is configured.';
  }
}

export function showApp() {
  $('#view-auth').hidden = true;
  $('#shell').hidden = false;
  // The hash is the source of truth, so a deep link survives a sign-in round trip.
  const { name, param } = parse();
  Route.go(name, param);
}
