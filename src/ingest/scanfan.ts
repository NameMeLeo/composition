/* Composition — the radial menu around the scan button.
   Four ways to add a reading, fanned out on an arc. Hover opens it on a pointer
   device, a long press opens it on touch, and Escape or a tap outside closes it. */

import { $, $input } from '../core/dom.js';
import { Capture } from './capture.js';
import { Route } from '../core/router.js';

const RADIUS = 104;        // distance from the hub out to each option
const FROM = 150;          // degrees: left end of the arc
const TO = 30;             // degrees: right end of the arc
const HOVER_OPEN = 140;    // hover intent, so brushing past does nothing
const HOVER_CLOSE = 240;   // grace period to travel from hub to an option
const LONG_PRESS = 420;

let fan: HTMLElement | null = null;
let hub: HTMLElement | null = null;
let items: HTMLElement[] = [];
let isOpen = false;
let hoverTimer: number | null = null;
let closeTimer: number | null = null;
let pressTimer: number | null = null;
let pressAt: { x: number; y: number } | null = null;
let longPressed = false;

void $input;

function place(): void {
  if (!fan || !hub) return;
  const box = hub.getBoundingClientRect();
  fan.style.left = (box.left + box.width / 2) + 'px';
  fan.style.top = (box.top + box.height / 2) + 'px';
}

function layout(): void {
  const last = Math.max(items.length - 1, 1);
  items.forEach((item, index) => {
    const angle = (FROM + ((TO - FROM) * index) / last) * (Math.PI / 180);
    item.style.setProperty('--dx', (Math.cos(angle) * RADIUS).toFixed(1) + 'px');
    item.style.setProperty('--dy', (-Math.sin(angle) * RADIUS).toFixed(1) + 'px');
    item.style.setProperty('--i', String(index));
  });
}

function clearTimers(): void {
  if (hoverTimer !== null) { clearTimeout(hoverTimer); hoverTimer = null; }
  if (closeTimer !== null) { clearTimeout(closeTimer); closeTimer = null; }
}

function open(): void {
  if (isOpen || !fan) return;
  place();
  isOpen = true;
  fan.dataset.open = 'true';
}

function close(): void {
  clearTimers();
  if (!isOpen || !fan) return;
  isOpen = false;
  fan.dataset.open = 'false';
}

function run(action: string | undefined): void {
  close();
  if (action === 'scan') void Capture.openScanner();
  else if (action === 'upload') ($('#file-picker') as HTMLElement).click();
  else if (action === 'link') Capture.openSheet();
  else if (action === 'manual') void Capture.startReading({ mode: 'manual' });
}

function init(): void {
  fan = $('#scan-fan');
  hub = $('#btn-scan-top');
  if (!fan || !hub) return;
  const fanEl = fan;
  const hubEl = hub;

  items = Array.from(fan.querySelectorAll('[data-scan-fan]')) as HTMLElement[];
  layout();

  if (window.matchMedia('(hover: hover)').matches) {
    hubEl.addEventListener('pointerenter', () => {
      clearTimers();
      hoverTimer = window.setTimeout(open, HOVER_OPEN);
    });
    hubEl.addEventListener('pointerleave', () => {
      clearTimers();
      closeTimer = window.setTimeout(close, HOVER_CLOSE);
    });
    fanEl.addEventListener('pointerenter', clearTimers);
    fanEl.addEventListener('pointerleave', () => {
      clearTimers();
      closeTimer = window.setTimeout(close, HOVER_CLOSE);
    });
  }

  /* Touch and mouse: a long press opens the fan without also firing the tap. */
  hubEl.addEventListener('pointerdown', (event) => {
    const e = event as PointerEvent;
    longPressed = false;
    pressAt = { x: e.clientX, y: e.clientY };
    if (pressTimer !== null) clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      longPressed = true;
      open();
    }, LONG_PRESS);
  });

  function endPress(): void {
    if (pressTimer !== null) { clearTimeout(pressTimer); pressTimer = null; }
    pressAt = null;
  }

  hubEl.addEventListener('pointerup', endPress);
  hubEl.addEventListener('pointercancel', endPress);
  hubEl.addEventListener('pointermove', (event) => {
    const e = event as PointerEvent;
    if (!pressAt) return;
    if (Math.abs(e.clientX - pressAt.x) > 10 || Math.abs(e.clientY - pressAt.y) > 10) endPress();
  });

  hubEl.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    open();
  });

  hubEl.addEventListener('click', (event) => {
    if (longPressed) { longPressed = false; event.preventDefault(); return; }
    if (isOpen) { event.preventDefault(); return; }
    void Capture.openScanner();
  });

  items.forEach((item) => {
    item.addEventListener('click', () => run(item.dataset.scanFan));
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isOpen || !fanEl || !hubEl) return;
    const target = event.target as Node;
    if (fanEl.contains(target) || hubEl.contains(target)) return;
    close();
  });

  document.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') close();
  });

  window.addEventListener('resize', () => { if (isOpen) place(); });
  window.addEventListener('scroll', () => { if (isOpen) place(); }, true);

  // The fan floats above the shell, so leaving a page has to dismiss it.
  Route.onNavigate(close);
}

export const ScanFan = { init, close };
