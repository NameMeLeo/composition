/* Composition — one reading in full, with the raw report fields behind it. */

import { $, el, clear, toast } from '../dom.js';
import { METRICS, METRIC_ORDER } from '../metrics.js';
import { fmtDate, fmtDateTime, metricText } from '../format.js';
import { getReadings, deleteReading } from '../store.js';
import { Route } from '../router.js';

export function renderDetail(id) {
  const host = $('#detail-body');
  clear(host);

  const reading = getReadings().find((r) => r.id === id);
  if (!reading) {
    host.appendChild(el('p', 'empty__body', 'That reading is no longer on this device.'));
    return;
  }

  const card = el('div', 'detail__hero');
  card.appendChild(el('div', 'detail__date', fmtDate(reading.measuredAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })));

  const grid = el('div', 'detail__grid');
  METRIC_ORDER.forEach((key) => {
    const value = reading.metrics ? reading.metrics[key] : null;
    if (value == null) return;
    const line = el('div', 'detail__row');
    line.appendChild(el('span', 'detail__k', METRICS[key].label));
    line.appendChild(el('span', 'detail__v', metricText(key, value)));
    grid.appendChild(line);
  });
  card.appendChild(grid);
  host.appendChild(card);

  const meta = el('p', 'detail__meta');
  const bits = ['Saved ' + fmtDateTime(reading.createdAt)];
  if (reading.playerId) bits.push('player_id ' + reading.playerId);
  if (reading.language) bits.push('language ' + reading.language);
  if (reading.reportUrl) bits.push(reading.reportUrl);
  meta.textContent = bits.join(' · ');
  host.appendChild(meta);

  if (reading.note) {
    host.appendChild(Object.assign(el('p', 'detail__meta'), { textContent: reading.note }));
  }

  const actions = el('div', 'od-cluster');
  actions.style.marginTop = 'var(--s-5)';
  const del = el('button', 'btn btn--danger btn--small', 'Delete reading');
  del.type = 'button';
  del.addEventListener('click', async () => {
    if (!window.confirm('Delete this reading from this device? This cannot be undone.')) return;
    await deleteReading(reading.id);
    toast('Reading deleted');
    Route.go('history');
  });
  actions.appendChild(del);
  host.appendChild(actions);
}

Route.page('detail', renderDetail);
