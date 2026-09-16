/* Composition — DOM shorthands and the toast.
   Nothing here depends on any other module. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Builds an element in one line so render code stays scannable. */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

let toastTimer = null;

/** Shows the single shared toast. Errors linger longer than confirmations. */
export function toast(message, kind) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.className = 'toast' + (kind === 'error' ? ' toast--error' : '');
  node.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { node.hidden = true; }, kind === 'error' ? 5200 : 3200);
}

export function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
