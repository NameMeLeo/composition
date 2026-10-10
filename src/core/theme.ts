/* Composition — theme, motion preference and installed-app detection. */

import { Settings } from './settings.js';

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function applyTheme(): void {
  const choice = Settings.get().theme;
  const dark = choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', dark ? '#0f1418' : '#f6f8fa');
}

export function applyMotion(): void {
  if (Settings.get().reduceMotion) document.documentElement.setAttribute('data-motion', 'reduced');
  else document.documentElement.removeAttribute('data-motion');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (Settings.get().theme === 'system') applyTheme();
});
