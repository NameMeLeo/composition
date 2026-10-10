/* Composition — a page changing under the user's feet.
   Pages register themselves by name, so adding a view means adding one file and
   one import in main.ts, not editing a switch statement in here. */

import { $, $$ } from './dom.js';

const ROUTES = ['dashboard', 'trends', 'history', 'settings', 'detail'];
const pages = new Map<string, (param?: string | null) => void>();
const navigateHooks = new Set<(name: string) => void>();

let current = 'dashboard';
let currentParam: string | null = null;
let lastRoute: { name: string; param: string | null } = { name: 'dashboard', param: null };

/** Registers the render function for a route name. */
function page(name: string, render: (param?: string | null) => void): void {
  if (ROUTES.indexOf(name) === -1) throw new Error('Unknown route: ' + name);
  pages.set(name, render);
}

/** Runs on every navigation, before the incoming page renders. */
function onNavigate(fn: (name: string) => void): () => void {
  navigateHooks.add(fn);
  return () => { navigateHooks.delete(fn); };
}

export function parse(): { name: string; param: string | null } {
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  const [name, param] = raw.split('/');
  return { name: name || 'dashboard', param: param || null };
}

function go(name: string, param?: string | null): void {
  if (ROUTES.indexOf(name) === -1) name = 'dashboard';
  current = name;
  currentParam = param || null;

  $$('.view').forEach((view) => { (view as HTMLElement).hidden = view.id !== 'view-' + name; });

  $$('[data-route]').forEach((btn) => {
    const target = btn.getAttribute('data-route');
    btn.classList.toggle('is-current', target === name);
    if (target === name) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  const active = $('#view-' + name);
  const title = $('#page-title');
  if (title) title.textContent = active ? (active as HTMLElement).dataset.title || '' : '';

  const hash = param ? '#' + name + '/' + param : '#' + name;
  if (window.location.hash !== hash) history.pushState(null, '', hash);

  const main = $('#main');
  if (main) main.scrollTop = 0;

  navigateHooks.forEach((fn) => {
    try { fn(name); } catch (err) { console.error('Navigation hook failed', err); }
  });

  const render = pages.get(name);
  if (render) render(param ?? null);

  if (name !== 'detail') lastRoute = { name, param: null };
}

/** Re-renders the current route, for when the data changed underneath it. */
function refresh(): void {
  const render = pages.get(current);
  if (render) render(currentParam);
}

export const Route = {
  page,
  onNavigate,
  go,
  refresh,
  current: (): string => current,
  back: (): void => { if (lastRoute.name) go(lastRoute.name); else go('dashboard'); }
};

window.addEventListener('popstate', () => {
  const p = parse();
  current = '';
  go(p.name, p.param);
});
