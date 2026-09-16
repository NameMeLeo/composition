/* Composition — Trends.
   One metric over one time range, chosen with two wheels that sit on a single
   row, plus the lean/fat split for the latest reading. */

import { $, el, clear } from '../dom.js';
import { METRICS, METRIC_ORDER, RANGES } from '../metrics.js';
import { metricText, fmtDate, axisFormat } from '../format.js';
import { latest, deltaFor, seriesFor } from '../store.js';
import { deltaChip } from '../components/chip.js';
import { scheduleChart } from '../components/chart.js';
import { fillWheel } from '../components/wheel.js';
import { Route } from '../router.js';

// Remembered across visits so switching pages does not reset the user's choice.
const selection = { metric: 'weight', range: '90d' };

export function renderTrends() {
  const available = METRIC_ORDER.filter((key) => seriesFor(key, 'all').length > 0);

  if (!available.length) {
    clear($('#metric-rail'));
    clear($('#range-rail'));
    clear($('#trend-chart'));
    clear($('#trend-summary'));
    clear($('#composition-split'));
    $('#trend-latest').textContent = '—';
    $('#trend-range-note').textContent = '';
    $('#axis-start').textContent = '—';
    $('#axis-mid').textContent = '—';
    $('#axis-end').textContent = '—';
    return;
  }

  if (available.indexOf(selection.metric) === -1) selection.metric = available[0];

  fillWheel(
    $('#metric-rail'),
    available.map((key) => ({ id: key, label: METRICS[key].label })),
    selection.metric,
    (id) => { selection.metric = id; renderTrends(); },
    { noun: 'metric', listLabel: 'Choose a metric' }
  );

  fillWheel(
    $('#range-rail'),
    RANGES.map((range) => ({ id: range.id, label: range.label })),
    selection.range,
    (id) => { selection.range = id; renderTrends(); },
    { noun: 'range', listLabel: 'Choose a time range' }
  );

  const key = selection.metric;
  const meta = METRICS[key];
  const pts = seriesFor(key, selection.range);
  const allPts = seriesFor(key, 'all');

  $('#trend-label').textContent = meta.label;
  const latestValue = allPts.length ? allPts[allPts.length - 1].v : null;
  $('#trend-latest').textContent = metricText(key, latestValue);

  const deltaHost = $('#trend-delta');
  deltaHost.replaceWith(Object.assign(deltaChip(key, deltaFor(key)), { id: 'trend-delta' }));

  $('#trend-range-note').textContent = pts.length + ' point' + (pts.length === 1 ? '' : 's');

  const axis = [$('#axis-start'), $('#axis-mid'), $('#axis-end')];
  if (pts.length >= 2) {
    const t0 = pts[0].t;
    const t2 = pts[pts.length - 1].t;
    const t1 = t0 + (t2 - t0) / 2;
    axis[0].textContent = fmtDate(t0, { day: 'numeric', month: 'short' });
    axis[1].textContent = fmtDate(t1, { day: 'numeric', month: 'short' });
    axis[2].textContent = fmtDate(t2, { day: 'numeric', month: 'short' });
  } else {
    axis.forEach((n) => { n.textContent = pts.length ? fmtDate(pts[0].t, { day: 'numeric', month: 'short' }) : '—'; });
  }

  scheduleChart($('#trend-chart'), {
    points: pts,
    height: 220,
    accent: meta.accent,
    digits: meta.digits,
    metricKey: key,
    padLeft: 44,
    yFormat: axisFormat(key)
  });

  renderSummary(key, meta, pts);
  renderCompositionSplit();
}

function renderSummary(key, meta, pts) {
  const summary = $('#trend-summary');
  clear(summary);

  const values = pts.map((p) => p.v);
  const cards = [];
  if (values.length) {
    cards.push(['Latest', metricText(key, values[values.length - 1])]);
    cards.push(['Average', metricText(key, values.reduce((a, b) => a + b, 0) / values.length)]);
    cards.push(['Lowest', metricText(key, Math.min.apply(null, values))]);
    cards.push(['Highest', metricText(key, Math.max.apply(null, values))]);
    // A change across a single point would always read as zero, so it is hidden.
    if (values.length >= 2) {
      cards.push(['Change over range', metricText(key, values[values.length - 1] - values[0])]);
      cards.push(['Readings', String(values.length)]);
    }
  }

  if (!cards.length) {
    summary.appendChild(el('p', 'empty__body', 'No readings fall inside this range yet.'));
    return;
  }

  cards.forEach((pair) => {
    const card = el('div', 'tile');
    card.style.setProperty('--tile-accent', meta.accent);
    card.appendChild(el('span', 'tile__label', pair[0]));
    card.appendChild(el('span', 'tile__value', pair[1]));
    summary.appendChild(card);
  });
}

export function renderCompositionSplit() {
  const host = $('#composition-split');
  clear(host);

  const last = latest();
  const weight = last && last.metrics ? last.metrics.weight : null;
  const bf = last && last.metrics ? last.metrics.bodyFat : null;

  if (weight == null || bf == null) {
    host.appendChild(el('p', 'empty__body', 'A reading with both weight and body fat is needed for the split.'));
    return;
  }

  // Fat mass is derived from weight and body-fat percentage.
  const fatMass = (weight * bf) / 100;
  const leanMass = weight - fatMass;
  const total = fatMass + leanMass;
  const fatPct = (fatMass / total) * 100;

  const bar = el('div', 'split__bar');
  const segFat = el('span', 'split__seg');
  segFat.style.width = fatPct.toFixed(1) + '%';
  segFat.style.background = METRICS.bodyFat.accent;
  const segLean = el('span', 'split__seg');
  segLean.style.width = (100 - fatPct).toFixed(1) + '%';
  segLean.style.background = METRICS.muscleMass.accent;
  bar.appendChild(segLean);
  bar.appendChild(segFat);
  host.appendChild(bar);

  const legend = el('ul', 'split__legend');
  [
    ['Lean and other tissue', METRICS.muscleMass.accent, leanMass],
    ['Fat mass', METRICS.bodyFat.accent, fatMass],
    ['Total', 'var(--c-slate)', total]
  ].forEach((row) => {
    const li = el('li');
    const sw = el('span', 'split__swatch');
    sw.style.background = row[1];
    li.appendChild(sw);
    li.appendChild(el('span', 'split__name', row[0]));
    li.appendChild(el('span', 'split__val', metricText('weight', row[2])));
    legend.appendChild(li);
  });
  host.appendChild(legend);

  const note = el('p', 'footnote');
  note.style.padding = '0';
  note.style.textAlign = 'left';
  note.textContent = 'Fat mass is derived from your weight and body fat percentage. ' + fmtDate(last.measuredAt) + '.';
  host.appendChild(note);
}

Route.page('trends', renderTrends);
