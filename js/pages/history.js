/* Composition — History.
   Every reading, newest first, searchable by date, source, player id or note. */

import { $, el, clear } from '../core/dom.js';
import { METRICS, SOURCE_LABEL } from '../core/metrics.js';
import { fmtDate, fmtTime, metricText, toDate } from '../core/format.js';
import { getReadings, sortedDesc } from '../data/store.js';
import { exportCSV } from '../data/export.js';
import { Route } from '../core/router.js';

let filter = '';

function chevron() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.style.color = 'var(--c-muted)';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9 5l7 7-7 7');
  svg.appendChild(path);
  return svg;
}

export function renderHistory() {
  const host = $('#history-list');
  clear(host);

  const query = filter.trim().toLowerCase();
  const rows = sortedDesc(getReadings()).filter((r) => {
    if (!query) return true;
    const hay = [fmtDate(r.measuredAt), SOURCE_LABEL[r.source] || '', r.playerId || '', r.note || ''].join(' ').toLowerCase();
    return hay.indexOf(query) !== -1;
  });

  $('#empty-history').hidden = rows.length > 0;

  rows.forEach((reading) => {
    const d = toDate(reading.measuredAt);

    const btn = el('button', 'hitem');
    btn.type = 'button';
    btn.addEventListener('click', () => Route.go('detail', reading.id));

    const date = el('div', 'hitem__date');
    date.appendChild(el('span', 'hitem__day', d ? String(d.getDate()) : '—'));
    date.appendChild(el('span', 'hitem__mon', d ? new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d) : ''));
    // Several readings can share a day, so the time is what tells them apart.
    date.appendChild(el('span', 'hitem__time', d ? fmtTime(d) : ''));
    btn.appendChild(date);

    const mid = el('div', 'hitem__mid');
    const figures = el('div', 'hitem__figures');
    const items = [];
    ['weight', 'bodyFat', 'muscleMass', 'visceralFat'].forEach((key) => {
      if (typeof reading.metrics[key] === 'number') items.push([METRICS[key].label, metricText(key, reading.metrics[key])]);
    });
    items.slice(0, 3).forEach((pair) => {
      const span = el('span');
      span.appendChild(el('b', null, pair[1]));
      span.appendChild(document.createTextNode(' ' + pair[0].toLowerCase()));
      figures.appendChild(span);
    });
    mid.appendChild(figures);
    btn.appendChild(mid);

    btn.appendChild(chevron());
    host.appendChild(btn);
  });
}

/** Wires the search box, its clear button and the CSV export on this page. */
export function initHistory() {
  $('#history-search').addEventListener('input', (e) => {
    filter = e.target.value;
    renderHistory();
  });
  $('#btn-clear-filter').addEventListener('click', () => {
    filter = '';
    $('#history-search').value = '';
    renderHistory();
  });
  $('#btn-export-history').addEventListener('click', exportCSV);
}

Route.page('history', renderHistory);
