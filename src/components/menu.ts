/* Composition — a button-anchored dropdown menu (desktop sidebar actions).
   The radial scan fan is thumb-designed; on desktop the same four capture
   actions live in this plain menu. Generic over [data-add-action] items:
   click runs the action, Escape/outside-click closes, arrows move focus. */

import { $ } from '../core/dom.js';

function menuItems(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(menu.querySelectorAll('[data-add-action]')) as HTMLButtonElement[];
}

/** Wires a button to its menu. Returns a cleanup function. */
export function attachMenu(
  button: HTMLButtonElement,
  menu: HTMLElement,
  onAction: (action: string) => void
): () => void {
  function open(): void {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    menuItems(menu)[0]?.focus();
  }

  function close(restoreFocus = false): void {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
  }

  const onButtonClick = (): void => {
    if (menu.hidden) open();
    else close();
  };

  const onMenuClick = (e: Event): void => {
    const item = (e.target as HTMLElement | null)?.closest?.('[data-add-action]') as HTMLElement | null;
    if (!item) return;
    const action = item.getAttribute('data-add-action');
    close();
    if (action) onAction(action);
  };

  const onDocDown = (e: Event): void => {
    const target = e.target as Node | null;
    if (!target || menu.contains(target) || button.contains(target)) return;
    close();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (menu.hidden) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const items = menuItems(menu);
    if (!items.length) return;
    e.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else next = (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  };

  button.addEventListener('click', onButtonClick);
  menu.addEventListener('click', onMenuClick as EventListener);
  document.addEventListener('pointerdown', onDocDown);
  document.addEventListener('keydown', onKey, true);

  return () => {
    button.removeEventListener('click', onButtonClick);
    menu.removeEventListener('click', onMenuClick as EventListener);
    document.removeEventListener('pointerdown', onDocDown);
    document.removeEventListener('keydown', onKey, true);
  };
}

void $;
