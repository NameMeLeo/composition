/* Composition — Today (the default view).
   Latest reading, the four headline deltas, a 90-day mini trend, every metric
   that has ever been recorded, and the plain-language insights. */

import { $, el, clear, clamp } from '../core/dom.js';
import { METRICS, METRIC_ORDER, rangeById } from '../core/metrics.js';
import { metricDisplay, metricText, fmtDateTime, relDays, massValue, axisFormat, bucketLabel } from '../core/format.js';
import { getReadings, latest, deltaFor, seriesFor, rawPoints, sortedAsc } from '../data/store.js';
import { deltaChip } from '../components/chip.js';
import { scheduleChart } from '../components/chart.js';
import { tile } from '../components/tile.js';
import { Route } from '../core/router.js';

function html(sel, markup) {
  const node = $(sel);
  if (node) node.innerHTML = markup;
  return node;
}

export function renderDashboard() {
  const readings = getReadings();
  const has = readings.length > 0;
  const last = latest();

  $('#banner-setup').hidden = true;
  $('#empty-dashboard').hidden = has;
  $('#hero').hidden = !has;
  $('#block-deltas').hidden = !has;
  $('#block-trend').hidden = !has;
  $('#block-insights').hidden = !has;

  const metricGrid = $('#dashboard-metrics');
  clear(metricGrid);
  METRIC_ORDER.forEach((key) => {
    const meta = METRICS[key];
    const raw = last && last.metrics ? last.metrics[key] : null;
    // A metric nobody has ever recorded gets no tile at all.
    if (raw == null && rawPoints(key).length === 0) return;
    const node = tile(key, last);
    node.style.setProperty('--tile-accent', meta.accent);
    metricGrid.appendChild(node);
  });

  if (!has) return;

  /* hero */
  const bf = last.metrics.bodyFat;
  const arc = $('#ring-arc');
  // The ring is a 327-unit circumference, mapped to a 0–50% body-fat scale.
  const pct = bf != null ? clamp(bf / 50, 0, 1) : 0;
  arc.setAttribute('stroke-dasharray', '327');
  arc.setAttribute('stroke-dashoffset', String(327 * (1 - pct)));
  $('#hero-bf').textContent = bf != null ? bf.toFixed(1) : '—';

  const w = metricDisplay('weight', last.metrics.weight);
  const m = metricDisplay('muscleMass', last.metrics.muscleMass);
  html('#hero-weight', w.text + (w.unit ? ' ' + w.unit : ''));
  html('#hero-muscle', m.text + (m.unit ? ' ' + m.unit : ''));
  html('#hero-visceral', last.metrics.visceralFat != null ? String(last.metrics.visceralFat) : '—');
  $('#hero-eyebrow').textContent = 'Latest reading';
  $('#hero-meta').textContent = fmtDateTime(last.measuredAt) + ' · ' + relDays(last.measuredAt) +
    (last.playerId ? ' · player ' + last.playerId : '') +
    ' · ' + readings.length + ' reading' + (readings.length === 1 ? '' : 's') + ' on this device';

  /* deltas */
  const deltaGrid = $('#delta-grid');
  clear(deltaGrid);
  ['weight', 'bodyFat', 'muscleMass', 'visceralFat'].forEach((key) => {
    const meta = METRICS[key];
    const card = el('div', 'tile');
    card.style.setProperty('--tile-accent', meta.accent);
    card.appendChild(el('span', 'tile__label', meta.label));

    const d = deltaFor(key);
    const holder = el('div', 'od-row');
    const chip = deltaChip(key, d);
    chip.classList.add('tile__value');
    chip.style.fontSize = 'var(--fs-sm)';
    chip.style.minHeight = '32px';
    holder.appendChild(chip);
    card.appendChild(holder);

    const foot = el('div', 'tile__foot');
    foot.textContent = d == null ? 'Needs two readings' : 'Compared with your previous reading';
    card.appendChild(foot);
    deltaGrid.appendChild(card);
  });

  /* mini trend — four weekly averages, falling back to every reading when there is
     too little history to fill a single week. */
  const miniPts = seriesFor('weight', 'week');
  const miniRange = rangeById('week');
  $('#mini-chart').dataset.metric = 'weight';
  scheduleChart($('#mini-chart'), {
    points: miniPts.length >= 2 ? miniPts : rawPoints('weight'),
    height: 158,
    accent: METRICS.weight.accent,
    digits: 1,
    metricKey: 'weight',
    yFormat: axisFormat('weight'),
    pointLabel: (point) => bucketLabel(miniRange.bucket, point.t)
  });

  renderInsights();
}

function renderInsights() {
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

Route.page('dashboard', renderDashboard);
