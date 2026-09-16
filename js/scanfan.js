/* Composition — the radial menu around the scan button.
   Four ways to add a reading, fanned out on an arc. Hover opens it on a pointer
   device, a long press opens it on touch, and Escape or a tap outside closes it. */

import { $ } from './dom.js';
import { Capture } from './capture.js';
import { Route } from './router.js';

const RADIUS = 104;        // distance from the hub out to each option
const FROM = 150;          // degrees: left end of the arc
const TO = 30;             // degrees: right end of the arc
const HOVER_OPEN = 140;    // hover intent, so brushing past does nothing
const HOVER_CLOSE = 240;   // grace period to travel from hub to an option
const LONG_PRESS = 420;

let fan = null;
let hub = null;
let items = [];
let isOpen = false;
let hoverTimer = null;
let closeTimer = null;
let pressTimer = null;
let pressAt = null;
let longPressed = false;

function place() {
  if (!fan || !hub) return;
  const box = hub.getBoundingClientRect();
  fan.style.left = (box.left + box.width / 2) + 'px';
  fan.style.top = (box.top + box.height / 2) + 'px';
}

function layout() {
  const last = Math.max(items.length - 1, 1);
  items.forEach((item, index) => {
    const angle = (FROM + ((TO - FROM) * index) / last) * (Math.PI / 180);
    item.style.setProperty('--dx', (Math.cos(angle) * RADIUS).toFixed(1) + 'px');
    item.style.setProperty('--dy', (-Math.sin(angle) * RADIUS).toFixed(1) + 'px');
    item.style.setProperty('--i', String(index));
  });
}

function clearTimers() {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
}

function open() {
  if (isOpen) return;
  place();
  isOpen = true;
  fan.dataset.open = 'true';
}

function close() {
  clearTimers();
  if (!isOpen) return;
  isOpen = false;
  fan.dataset.open = 'false';
}

function run(action) {
  close();
  if (action === 'scan') Capture.openScanner();
  else if (action === 'upload') $('#file-picker').click();
  else if (action === 'link') Capture.openSheet();
  else if (action === 'manual') Capture.startReading({ mode: 'manual' });
}

function init() {
  fan = $('#scan-fan');
  hub = $('#btn-scan-top');
  if (!fan || !hub) return;

  items = Array.from(fan.querySelectorAll('[data-scan-fan]'));
  layout();

  if (window.matchMedia('(hover: hover)').matches) {
    hub.addEventListener('pointerenter', () => {
      clearTimers();
      hoverTimer = window.setTimeout(open, HOVER_OPEN);
    });
    hub.addEventListener('pointerleave', () => {
      clearTimers();
      closeTimer = window.setTimeout(close, HOVER_CLOSE);
    });
    fan.addEventListener('pointerenter', clearTimers);
    fan.addEventListener('pointerleave', () => {
      clearTimers();
      closeTimer = window.setTimeout(close, HOVER_CLOSE);
    });
  }

  /* Touch and mouse: a long press opens the fan without also firing the tap. */
  hub.addEventListener('pointerdown', (event) => {
    longPressed = false;
    pressAt = { x: event.clientX, y: event.clientY };
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      longPressed = true;
      open();
    }, LONG_PRESS);
  });

  function endPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    pressAt = null;
  }

  hub.addEventListener('pointerup', endPress);
  hub.addEventListener('pointercancel', endPress);
  hub.addEventListener('pointermove', (event) => {
    if (!pressAt) return;
    if (Math.abs(event.clientX - pressAt.x) > 10 || Math.abs(event.clientY - pressAt.y) > 10) endPress();
  });

  hub.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    open();
  });

  hub.addEventListener('click', (event) => {
    if (longPressed) { longPressed = false; event.preventDefault(); return; }
    if (isOpen) { event.preventDefault(); return; }
    Capture.openScanner();
  });

  items.forEach((item) => {
    item.addEventListener('click', () => run(item.dataset.scanFan));
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isOpen) return;
    if (fan.contains(event.target) || hub.contains(event.target)) return;
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  window.addEventListener('resize', () => { if (isOpen) place(); });
  window.addEventListener('scroll', () => { if (isOpen) place(); }, true);

  // The fan floats above the shell, so leaving a page has to dismiss it.
  Route.onNavigate(close);
}

export const ScanFan = { init, close };
