/* Composition — the one-at-a-time picker used by the metric and range rails.
   The chevrons, the arrow keys and a horizontal swipe all step through items and
   wrap around at both ends. */

import { el, clear } from '../dom.js';

function wheelArrow(direction) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', direction < 0 ? 'M14.5 5 7.5 12l7 7' : 'm9.5 5 7 7-7 7');
  svg.appendChild(path);
  return svg;
}

/**
 * Renders a wheel into `host`, replacing whatever was there.
 * @param {HTMLElement} host
 * @param {{id: string, label: string}[]} items
 * @param {string} selectedId
 * @param {(id: string) => void} onPick Called with the newly chosen id.
 * @param {{noun?: string, listLabel?: string}} [config] Labels used in ARIA text.
 */
export function fillWheel(host, items, selectedId, onPick, config) {
  const options = config || {};
  const noun = options.noun || 'option';
  const listLabel = options.listLabel || 'Options';

  // A re-render replaces the focused tab, so remember whether focus was inside
  // and restore it afterwards. `focusPending` carries that across a keyboard step.
  const hadFocus = host.contains(document.activeElement) || host.dataset.focusPending === 'true';

  if (host.__wheelKeys) host.removeEventListener('keydown', host.__wheelKeys);
  if (host.__wheelPointerDown) host.removeEventListener('pointerdown', host.__wheelPointerDown);
  if (host.__wheelPointerUp) host.removeEventListener('pointerup', host.__wheelPointerUp);
  if (host.__wheelClick) host.removeEventListener('click', host.__wheelClick, true);

  clear(host);
  const selectedIndex = Math.max(0, items.findIndex((item) => item.id === selectedId));
  const selected = items[selectedIndex];
  if (!selected) return;

  const previousLive = el('button', 'wheel__nav', '');
  previousLive.type = 'button';
  previousLive.setAttribute('aria-label', 'Previous ' + noun);
  previousLive.title = 'Previous ' + noun;
  previousLive.appendChild(wheelArrow(-1));
  previousLive.addEventListener('click', () => onPick(items[(selectedIndex - 1 + items.length) % items.length].id));

  const viewport = el('div', 'wheel__viewport');
  viewport.setAttribute('role', 'tablist');
  viewport.setAttribute('aria-label', listLabel);
  const tab = el('button', 'wheel__item', selected.label);
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'true');
  tab.tabIndex = 0;
  tab.addEventListener('click', () => onPick(selected.id));
  viewport.appendChild(tab);

  const nextLive = el('button', 'wheel__nav', '');
  nextLive.type = 'button';
  nextLive.setAttribute('aria-label', 'Next ' + noun);
  nextLive.title = 'Next ' + noun;
  nextLive.appendChild(wheelArrow(1));
  nextLive.addEventListener('click', () => onPick(items[(selectedIndex + 1) % items.length].id));

  host.appendChild(previousLive);
  host.appendChild(viewport);
  host.appendChild(nextLive);

  if (hadFocus) tab.focus();

  host.__wheelKeys = (event) => {
    const step = (event.key === 'ArrowRight' || event.key === 'ArrowDown') ? 1
      : (event.key === 'ArrowLeft' || event.key === 'ArrowUp') ? -1
        : 0;
    let to = null;
    if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = items.length - 1;
    else if (step) to = (selectedIndex + step + items.length) % items.length;
    if (to == null) return;
    event.preventDefault();
    host.dataset.focusPending = 'true';
    onPick(items[to].id);
  };
  host.addEventListener('keydown', host.__wheelKeys);

  let startX = null;
  let startY = null;

  host.__wheelPointerDown = (event) => {
    startX = event.clientX;
    startY = event.clientY;
  };

  host.__wheelPointerUp = (event) => {
    if (startX == null) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    startX = null;
    startY = null;
    // A mostly-vertical drag is a scroll, not a swipe.
    if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    event.preventDefault();
    host.dataset.suppressClick = 'true';
    const step = dx < 0 ? 1 : -1;
    onPick(items[(selectedIndex + step + items.length) % items.length].id);
  };

  // A swipe that stepped the wheel must not also fire the tab's click.
  host.__wheelClick = (event) => {
    if (host.dataset.suppressClick !== 'true') return;
    host.dataset.suppressClick = 'false';
    event.preventDefault();
    event.stopPropagation();
  };

  host.addEventListener('pointerdown', host.__wheelPointerDown);
  host.addEventListener('pointerup', host.__wheelPointerUp);
  host.addEventListener('click', host.__wheelClick, true);
}
