/* Composition — History.
   Every reading, newest first, searchable by date, source, player id or note. */

import { $, $$, el, clear, toast } from '../core/dom.js';
import { t, metricLabel, sourceLabel, appLocaleTag } from '../core/i18n.js';
import { METRICS, SOURCE_LABEL } from '../core/metrics.js';
import { fmtDate, fmtTime, metricText, toDate } from '../core/format.js';
import { getReadings, readingSerialNumber, sortedDesc, deleteReading } from '../data/store.js';
import { exportCSV, exportJSON } from '../data/export.js';
import { renderDetail } from './detail.js';
import { Route } from '../core/router.js';

let filter = '';
/* Bulk selection: a working set of reading ids plus select mode. */
let selecting = false;
const selected = new Set<string>();
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

    if (selecting) {
      // A checkbox cannot live inside the <button> card, so select mode wraps
      // the row: checkbox sibling + the unchanged card button.
      const row = el('div', 'hitem-row');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'hitem__check';
      check.checked = selected.has(reading.id);
      check.setAttribute('aria-label', t('bulk.pick', { date: fmtDate(reading.measuredAt) }));
      check.addEventListener('change', () => {
        if (check.checked) selected.add(reading.id);
        else selected.delete(reading.id);
        updateBulkBar();
      });
      row.appendChild(check);
      row.appendChild(btn);
      host.appendChild(row);
    } else {
      host.appendChild(btn);
    }
  });

  updateBulkBar();
  if (splitSelected && splitMode()) showSplitPane(splitSelected);
}

/** Refreshes the bulk bar: visibility, count, and action availability. */
function updateBulkBar(): void {
  const bar = $('#bulk-bar');
  if (!bar) return;
  bar.hidden = !selecting;
  ($('#bulk-count') as HTMLElement).textContent = t('bulk.count', { n: selected.size });
  const some = selected.size > 0;
  ($('#bulk-csv') as HTMLButtonElement).disabled = !some;
  ($('#bulk-json') as HTMLButtonElement).disabled = !some;
  ($('#bulk-delete') as HTMLButtonElement).disabled = !some;
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
  ($('#btn-export-history') as HTMLButtonElement).addEventListener('click', () => exportCSV());
  ($('#btn-select') as HTMLButtonElement).addEventListener('click', () => {
    selecting = !selecting;
    if (!selecting) selected.clear();
    renderHistory();
  });
  ($('#bulk-csv') as HTMLButtonElement).addEventListener('click', () => {
    if (selected.size) exportCSV(Array.from(selected));
  });
  ($('#bulk-json') as HTMLButtonElement).addEventListener('click', () => {
    if (selected.size) exportJSON(Array.from(selected));
  });
  ($('#bulk-delete') as HTMLButtonElement).addEventListener('click', async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!window.confirm(t('bulk.confirm', { n: ids.length }))) return;
    for (const id of ids) await deleteReading(id);
    selected.clear();
    selecting = false;
    toast(t('bulk.deleted', { n: ids.length, s: ids.length === 1 ? '' : 's' }));
    renderHistory();
  });
  ($('#bulk-done') as HTMLButtonElement).addEventListener('click', () => {
    selecting = false;
    selected.clear();
    renderHistory();
  });

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
