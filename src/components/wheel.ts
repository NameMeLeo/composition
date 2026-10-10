/* Composition — the one-at-a-time picker used by the metric and range rails.
   The chevrons, the arrow keys and a horizontal swipe all step through items and
   wrap around at both ends. */

import { el, clear } from '../core/dom.js';

export interface WheelItem { id: string; label: string; }
export interface WheelConfig { noun?: string; listLabel?: string; ignoreSelector?: string; }

interface SwipeHandlers { down: (e: Event) => void; up: (e: Event) => void; cancel: () => void; }

function hostState(host: HTMLElement): Record<string, unknown> {
  return host as unknown as Record<string, unknown>;
}

export function wheelArrow(direction: number): SVGElement {
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
  return svg as unknown as SVGElement;
}

/** Adds the same horizontal gesture used by the picker to another surface. */
export function bindHorizontalSwipe(host: HTMLElement | null, onStep: (step: number) => void, options?: WheelConfig): void {
  const config = options || {};
  if (!host) return;
  const state = hostState(host);

  if (state.__swipeHandlers) {
    const prev = state.__swipeHandlers as SwipeHandlers;
    host.removeEventListener('pointerdown', prev.down as EventListener);
    host.removeEventListener('pointerup', prev.up as EventListener);
    host.removeEventListener('pointercancel', prev.cancel as EventListener);
  }

  let startX: number | null = null;
  let startY: number | null = null;
  let startTarget: EventTarget | null = null;
  const ignored = (target: EventTarget | null): boolean =>
    Boolean(config.ignoreSelector && target instanceof Element && target.closest(config.ignoreSelector));

  const down = (event: Event): void => {
    const e = event as PointerEvent;
    if (ignored(e.target)) return;
    startX = e.clientX;
    startY = e.clientY;
    startTarget = e.target;
  };

  const reset = (): void => {
    startX = null;
    startY = null;
    startTarget = null;
  };

  const up = (event: Event): void => {
    const e = event as PointerEvent;
    if (startX == null || ignored(startTarget)) { reset(); return; }
    const dx = e.clientX - startX;
    const dy = e.clientY - (startY as number);
    reset();
    // A mostly-vertical drag belongs to page scrolling, not metric selection.
    if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    event.preventDefault();
    onStep(dx < 0 ? 1 : -1);
  };

  const cancel = reset;
  state.__swipeHandlers = { down, up, cancel };
  host.addEventListener('pointerdown', down as EventListener);
  host.addEventListener('pointerup', up as EventListener);
  host.addEventListener('pointercancel', cancel as EventListener);
}

/**
 * Renders a wheel into `host`, replacing whatever was there.
 */
export function fillWheel(host: HTMLElement, items: WheelItem[], selectedId: string, onPick: (id: string) => void, config?: WheelConfig): void {
  const options = config || {};
  const noun = options.noun || 'option';
  const listLabel = options.listLabel || 'Options';
  const state = hostState(host);

  // A re-render replaces the focused tab, so remember whether focus was inside
  // and restore it afterwards. `focusPending` carries that across a keyboard step.
  const hadFocus = host.contains(document.activeElement) || host.dataset.focusPending === 'true';

  if (state.__wheelKeys) host.removeEventListener('keydown', state.__wheelKeys as EventListener);
  if (state.__wheelPointerDown) host.removeEventListener('pointerdown', state.__wheelPointerDown as EventListener);
  if (state.__wheelPointerUp) host.removeEventListener('pointerup', state.__wheelPointerUp as EventListener);
  if (state.__wheelClick) host.removeEventListener('click', state.__wheelClick as EventListener, true);

  clear(host);
  const selectedIndex = Math.max(0, items.findIndex((item) => item.id === selectedId));
  const selected = items[selectedIndex];
  if (!selected) return;

  const previousLive = el('button', 'wheel__nav', '') as HTMLButtonElement;
  previousLive.type = 'button';
  previousLive.setAttribute('aria-label', 'Previous ' + noun);
  previousLive.title = 'Previous ' + noun;
  previousLive.appendChild(wheelArrow(-1));
  previousLive.addEventListener('click', () => onPick(items[(selectedIndex - 1 + items.length) % items.length].id));

  const viewport = el('div', 'wheel__viewport');
  viewport.setAttribute('role', 'tablist');
  viewport.setAttribute('aria-label', listLabel);
  const tab = el('button', 'wheel__item', selected.label) as HTMLButtonElement;
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'true');
  tab.tabIndex = 0;
  tab.addEventListener('click', () => onPick(selected.id));
  viewport.appendChild(tab);

  const nextLive = el('button', 'wheel__nav', '') as HTMLButtonElement;
  nextLive.type = 'button';
  nextLive.setAttribute('aria-label', 'Next ' + noun);
  nextLive.title = 'Next ' + noun;
  nextLive.appendChild(wheelArrow(1));
  nextLive.addEventListener('click', () => onPick(items[(selectedIndex + 1) % items.length].id));

  host.appendChild(previousLive);
  host.appendChild(viewport);
  host.appendChild(nextLive);

  if (hadFocus) tab.focus();

  const onKeys = (event: Event): void => {
    const e = event as KeyboardEvent;
    const step = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1
      : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1
        : 0;
    let to: number | null = null;
    if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = items.length - 1;
    else if (step) to = (selectedIndex + step + items.length) % items.length;
    if (to == null) return;
    e.preventDefault();
    host.dataset.focusPending = 'true';
    onPick(items[to].id);
  };
  state.__wheelKeys = onKeys;
  host.addEventListener('keydown', onKeys as EventListener);

  let startX: number | null = null;
  let startY: number | null = null;

  const onPointerDown = (event: Event): void => {
    const e = event as PointerEvent;
    startX = e.clientX;
    startY = e.clientY;
  };

  const onPointerUp = (event: Event): void => {
    const e = event as PointerEvent;
    if (startX == null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - (startY as number);
    startX = null;
    startY = null;
    // A mostly-vertical drag is a scroll, not a swipe.
    if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    e.preventDefault();
    host.dataset.suppressClick = 'true';
    const step = dx < 0 ? 1 : -1;
    onPick(items[(selectedIndex + step + items.length) % items.length].id);
  };

  // A swipe that stepped the wheel must not also fire the tab's click.
  const onClickCapture = (event: Event): void => {
    if (host.dataset.suppressClick !== 'true') return;
    host.dataset.suppressClick = 'false';
    event.preventDefault();
    event.stopPropagation();
  };

  state.__wheelPointerDown = onPointerDown;
  state.__wheelPointerUp = onPointerUp;
  state.__wheelClick = onClickCapture;

  host.addEventListener('pointerdown', onPointerDown as EventListener);
  host.addEventListener('pointerup', onPointerUp as EventListener);
  host.addEventListener('click', onClickCapture as EventListener, true);
}
