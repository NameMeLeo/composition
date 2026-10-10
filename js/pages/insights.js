/* Composition — plain-language insights for the Today view.
   Pure derivation over readings: first-vs-last deltas, 90-day weight spread,
   30-day cadence. No DOM shell here beyond the insight list host. */

import { $, el, clear } from '../core/dom.js';
import { metricText, relDays, massValue } from '../core/format.js';
import { getReadings, sortedAsc } from '../data/store.js';

export function renderInsights() {
  const host = $('#insight-list');
  clear(host);

  const list = sortedAsc(getReadings());
  const first = list[0];
  const last = list[list.length - 1];

  if (!first || !last || list.length < 2) {
    const only = el('div', 'insight');
    only.appendChild(el('span', 'insight__mark', '•'));
    const body = el('div', 'od-field');
    body.appendChild(el('div', 'insight__title', 'One reading so far'));
    body.appendChild(el('div', 'insight__body', 'Add a second reading and the direction of travel appears here.'));
    only.appendChild(body);
    host.appendChild(only);
    return;
  }

  const items = [];

  const bfDelta = last.metrics.bodyFat != null && first.metrics.bodyFat != null ? last.metrics.bodyFat - first.metrics.bodyFat : null;
  if (bfDelta != null && Math.abs(bfDelta) >= 0.2) {
    items.push({
      accent: 'var(--c-amber-soft)',
      title: bfDelta < 0 ? 'Body fat has moved down' : 'Body fat has moved up',
      body: Math.abs(bfDelta).toFixed(1) + ' points ' + (bfDelta < 0 ? 'lower' : 'higher') + ' than your earliest reading, across ' + list.length + ' readings.'
    });
  }

  const mmDelta = last.metrics.muscleMass != null && first.metrics.muscleMass != null ? last.metrics.muscleMass - first.metrics.muscleMass : null;
  if (mmDelta != null && Math.abs(mmDelta) >= 0.1) {
    const shown = massValue(Math.abs(mmDelta), 1);
    items.push({
      accent: 'var(--c-green-soft)',
      title: mmDelta > 0 ? 'Muscle mass is up' : 'Muscle mass is down',
      body: shown.value + ' ' + shown.unit + ' ' + (mmDelta > 0 ? 'above' : 'below') + ' your earliest reading.'
    });
  }

  // Raw readings from the last 90 days, not the averaged buckets: the point of this
  // insight is how far the measurement itself has swung between readings.
  const since90 = Date.now() - 90 * 86400000;
  const weights = sortedAsc(getReadings())
    .filter((r) => r.metrics && typeof r.metrics.weight === 'number')
    .filter((r) => new Date(r.measuredAt).getTime() >= since90)
    .map((r) => r.metrics.weight);
  if (weights.length >= 3) {
    const spread = Math.max.apply(null, weights) - Math.min.apply(null, weights);
    items.push({
      accent: 'var(--c-primary-soft)',
      title: 'Weight spread over 90 days',
      body: 'A range of ' + metricText('weight', spread) + ' across ' + weights.length + ' readings, with the latest at ' + metricText('weight', weights[weights.length - 1]) + '.'
    });
  }

  const last30 = getReadings().filter((r) => Date.now() - new Date(r.measuredAt).getTime() <= 30 * 86400000);
  items.push({
    accent: 'var(--c-teal-soft)',
    title: 'Cadence',
    body: last30.length + ' reading' + (last30.length === 1 ? '' : 's') + ' in the last 30 days. The most recent was ' + relDays(last.measuredAt) + '.'
  });

  items.forEach((item) => {
    const node = el('div', 'insight');
    const mark = el('span', 'insight__mark');
    mark.style.background = item.accent;
    mark.textContent = '•';
    const body = el('div', 'od-field od-fill');
    body.appendChild(el('div', 'insight__title', item.title));
    body.appendChild(el('div', 'insight__body', item.body));
    node.appendChild(mark);
    node.appendChild(body);
    host.appendChild(node);
  });

  const note = el('p', 'footnote');
  note.style.padding = 'var(--s-2) 0 0';
  note.style.textAlign = 'left';
  note.textContent = 'These lines describe what your own readings show. They are not medical advice.';
  host.appendChild(note);
}
