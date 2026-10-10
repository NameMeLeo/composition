/* Composition — DOM shorthands and the toast.
   Nothing here depends on any other module. */

/** Non-null shorthand: every id referenced here exists in index.html. */
export function $(sel: string, root: ParentNode = document): HTMLElement {
  return (root as Document).querySelector(sel) as HTMLElement;
}

export function $$(sel: string, root: ParentNode = document): HTMLElement[] {
  return Array.from((root as Document).querySelectorAll(sel)) as HTMLElement[];
}

/** Typed lookup for form controls. */
export function $input(sel: string, root: ParentNode = document): HTMLInputElement {
  return $(sel, root) as HTMLInputElement;
}

export function $select(sel: string, root: ParentNode = document): HTMLSelectElement {
  return $(sel, root) as HTMLSelectElement;
}

/** Builds an element in one line so render code stays scannable. */
export function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

let toastTimer: number | null = null;

/** Shows the single shared toast. Errors linger longer than confirmations. */
export function toast(message: string, kind?: string): void {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.className = 'toast' + (kind === 'error' ? ' toast--error' : '');
  node.hidden = false;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { node.hidden = true; }, kind === 'error' ? 5200 : 3200);
}

export function uid(): string {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Decodes pasted HTML entities ("&amp;") without touching the real URL. */
export function decodeHtmlEntities(input: unknown): string {
  const holder = document.createElement('textarea');
  holder.innerHTML = String(input ?? '');
  return holder.value;
}
