/* Composition — History.
   Every reading, newest first, searchable by date, source, player id or note. */

import { $, $$, el, clear } from '../core/dom.js';
import { metricLabel, sourceLabel, appLocaleTag } from '../core/i18n.js';
import { METRICS, SOURCE_LABEL } from '../core/metrics.js';
import { fmtDate, fmtTime, metricText, toDate } from '../core/format.js';
import { getReadings, readingSerialNumber, sortedDesc } from '../data/store.js';
import { exportCSV } from '../data/export.js';
import { renderDetail } from './detail.js';
import { Route } from '../core/router.js';

let filter = '';
/* Pending master–detail selection (desktop split mode). `undefined` means "leave
   the selection alone" (filter typing); a string (possibly null) is set by the
   router's split handler or a plain history visit before renderHistory runs. */
let pendingSplit: string | null | undefined;
let splitSelected: string | null = null;

function splitMode(): boolean {
  return window.matchMedia('(min-width: 1280px)').matches;
}

function chevron(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  (svg as unknown as HTMLElement).style.color = 'var(--c-muted)';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9 5l7 7-7 7');
  svg.appendChild(path);
  return svg as unknown as SVGElement;
}

export function renderHistory(): void {
  const host = $('#history-list');
  clear(host);
  if (pendingSplit !== undefined) {
    splitSelected = pendingSplit;
    pendingSplit = undefined;
  }

  const query = filter.trim().toLowerCase();
  const rows = sortedDesc(getReadings()).filter((r) => {
    if (!query) return true;
    const hay = [fmtDate(r.measuredAt), sourceLabel(r.source, SOURCE_LABEL[r.source] || ''), r.playerId || '', readingSerialNumber(r), r.note || ''].join(' ').toLowerCase();
    return hay.indexOf(query) !== -1;
  });

  ($('#empty-history') as HTMLElement).hidden = rows.length > 0;

  rows.forEach((reading) => {
    const d = toDate(reading.measuredAt);

    const btn = el('button', 'hitem' + (splitSelected === reading.id ? ' is-current' : '')) as HTMLButtonElement;
    btn.type = 'button';
    btn.dataset.id = reading.id;
    btn.addEventListener('click', () => Route.go('detail', reading.id));

    const date = el('div', 'hitem__date');
    date.appendChild(el('span', 'hitem__day', d ? String(d.getDate()) : '—'));
    date.appendChild(el('span', 'hitem__mon', d ? new Intl.DateTimeFormat(appLocaleTag(), { month: 'short' }).format(d) : ''));
    // Several readings can share a day, so the time is what tells them apart.
    date.appendChild(el('span', 'hitem__time', d ? fmtTime(d) : ''));
    btn.appendChild(date);

    const mid = el('div', 'hitem__mid');
    const figures = el('div', 'hitem__figures');
    const items: Array<[string, string]> = [];
    ['weight', 'bodyFat', 'muscleMass', 'visceralFat'].forEach((key) => {
      if (typeof reading.metrics[key] === 'number') items.push([metricLabel(key, METRICS[key].label), metricText(key, reading.metrics[key])]);
    });
    items.slice(0, 3).forEach((pair) => {
      const span = el('span');
      span.appendChild(el('b', undefined, pair[1]));
      span.appendChild(document.createTextNode(' ' + pair[0].toLowerCase()));
      figures.appendChild(span);
    });
    mid.appendChild(figures);
    btn.appendChild(mid);

    btn.appendChild(chevron());
    host.appendChild(btn);
  });

  if (splitSelected && splitMode()) showSplitPane(splitSelected);
}

/** Renders a reading into the desktop side pane (master–detail split). */
function showSplitPane(id: string | null): void {
  const wrap = $('#history-detail-wrap');
  const pane = $('#history-detail');
  if (!wrap || !pane) return;
  if (!id) { wrap.hidden = true; return; }
  wrap.hidden = false;
  renderDetail(id, pane);
  $$('#history-list .hitem').forEach((node) => {
    node.classList.toggle('is-current', (node as HTMLElement).dataset.id === id);
  });
}

/** Wires the search box, its clear button and the CSV export on this page. */
export function initHistory(): void {
  $('#history-search').addEventListener('input', (e) => {
    filter = (e.target as HTMLInputElement).value;
    renderHistory();
  });
  $('#btn-clear-filter').addEventListener('click', () => {
    filter = '';
    ($('#history-search') as HTMLInputElement).value = '';
    renderHistory();
  });
  ($('#btn-export-history') as HTMLButtonElement).addEventListener('click', exportCSV);

  // Master–detail split: the router stays on history and hands detail ids here.
  Route.onSplitDetail((id) => {
    pendingSplit = id;
    renderHistory();
  });
  // Crossing the breakpoint re-renders: entering split with a detail hash shows
  // the pane; leaving split hides it again.
  window.matchMedia('(min-width: 1280px)').addEventListener('change', () => Route.refresh());
}

Route.page('history', renderHistory);
