/* Composition — Trends.
   Metrics are grouped into tabs, and every metric in the open tab gets a card showing
   its latest value beside the highest, lowest and average for the chosen window.
   Tapping a card charts it, so the grid is both the readout and the picker. */

import { $, el, clear } from '../core/dom.js';
import { METRICS, METRIC_GROUPS, metricsInGroup, RANGES, rangeById } from '../core/metrics.js';
import { metricText, metricDisplay, fmtDate, axisFormat, bucketLabel } from '../core/format.js';
import { latest, latestWith, deltaFor, seriesFor, rawPoints } from '../data/store.js';
import { deltaChip } from '../components/chip.js';
import { scheduleChart } from '../components/chart.js';
import { bindHorizontalSwipe, fillWheel, wheelArrow } from '../components/wheel.js';
import { Route } from '../core/router.js';

// Remembered across visits so switching pages does not reset the user's choice.
const selection = { metric: 'weight', range: 'month', tab: 'composition' };
// Until a range is chosen by hand, the page picks one that actually shows a line.
let rangeChosen = false;

/** A metric is only offered once at least one reading has recorded it. */
const hasData = (key) => rawPoints(key).length > 0;

/* All readings made in one month collapse to a single averaged point, which draws no
   line and gives high, low and average the same value. So the opening range is the
   narrowest window that still holds two points — the recent movement is what someone
   opening Trends wants to see, and they can widen it from there. */
function fittedRange(key) {
  const fit = RANGES.find((range) => seriesFor(key, range.id).length >= 2);
  return fit ? fit.id : RANGES[0].id;
}

export function renderTrends() {
  // A tab holding nothing recorded would be a dead end, so only tabs with data show.
  const groups = METRIC_GROUPS.filter((group) => metricsInGroup(group.id).some(hasData));

  if (!groups.length) {
    $('#trend-card').hidden = true;
    ['#trend-tabs', '#range-rail', '#trend-chart', '#composition-split'].forEach((id) => clear($(id)));
    $('#trend-label').textContent = 'Trends';
    $('#trend-latest').textContent = '—';
    $('#trend-range-note').textContent = '';
    ['#axis-start', '#axis-mid', '#axis-end', '#trend-stat-high', '#trend-stat-low', '#trend-stat-avg']
      .forEach((id) => { $(id).textContent = '—'; });
    return;
  }

  if (!groups.some((group) => group.id === selection.tab)) selection.tab = groups[0].id;
  const group = groups.find((entry) => entry.id === selection.tab);

  // The selected metric has to live in the open tab, or the chart would show
  // something the cards are not offering.
  if (metricsInGroup(group.id).indexOf(selection.metric) === -1) {
    selection.metric = metricsInGroup(group.id).find(hasData) || metricsInGroup(group.id)[0];
  }

  renderTabs(groups);

  if (!rangeChosen) selection.range = fittedRange(selection.metric);

  fillWheel(
    $('#range-rail'),
    RANGES.map((range) => ({ id: range.id, label: range.label })),
    selection.range,
    (id) => { selection.range = id; rangeChosen = true; renderTrends(); },
    { noun: 'range', listLabel: 'Choose a time range' }
  );

  renderTrendCard(group);
  renderCompositionSplit();
}

/* The tab strip. Every tab is always offered for the groups that have data, so the
   shape of the data is visible at a glance rather than hidden behind a menu. */
function renderTabs(groups) {
  const host = $('#trend-tabs');
  clear(host);

  groups.forEach((group) => {
    const on = group.id === selection.tab;
    const tab = el('button', 'tab' + (on ? ' tab--on' : ''), group.label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.addEventListener('click', () => {
      if (group.id === selection.tab) return;
      selection.tab = group.id;
      const first = metricsInGroup(group.id).find(hasData);
      if (first) selection.metric = first;
      renderTrends();
    });
    host.appendChild(tab);
  });
}

function metricItems(group) {
  return metricsInGroup(group.id).filter(hasData);
}

function selectAdjacentMetric(group, step) {
  const items = metricItems(group);
  if (items.length < 2) return;
  const index = items.indexOf(selection.metric);
  selection.metric = items[(Math.max(0, index) + step + items.length) % items.length];
  renderTrends();
}

function renderTrendCard(group) {
  const card = $('#trend-card');
  const items = metricItems(group);
  const meta = METRICS[selection.metric];
  card.hidden = false;
  card.style.setProperty('--trend-accent', meta.accent);
  card.setAttribute('aria-label', meta.label + ' trend');

  const previous = $('#trend-prev');
  previous.replaceChildren(wheelArrow(-1));
  previous.disabled = items.length < 2;
  previous.setAttribute('aria-label', 'Previous measure');
  previous.title = 'Previous measure';
  previous.onclick = () => selectAdjacentMetric(group, -1);

  const next = $('#trend-next');
  next.replaceChildren(wheelArrow(1));
  next.disabled = items.length < 2;
  next.setAttribute('aria-label', 'Next measure');
  next.title = 'Next measure';
  next.onclick = () => selectAdjacentMetric(group, 1);

  bindHorizontalSwipe(card, (step) => selectAdjacentMetric(group, step), {
    ignoreSelector: '.trend-card__nav, button'
  });
  renderChart();
}

function setMetricValue(node, key, value) {
  clear(node);
  const shown = metricDisplay(key, value);
  node.appendChild(document.createTextNode(shown.text));
  if (shown.unit) node.appendChild(el('span', 'unit', shown.unit));
}

function spread(values) {
  if (!values.length) return null;
  let min = values[0];
  let max = values[0];
  let sum = 0;
  values.forEach((value) => {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  });
  return { min, max, mean: sum / values.length };
}

function renderChart() {
  const key = selection.metric;
  const meta = METRICS[key];
  const range = rangeById(selection.range);
  const pts = seriesFor(key, selection.range);
  const label = (point) => bucketLabel(range.bucket, point.t);

  $('#trend-label').textContent = meta.label;
  setMetricValue($('#trend-latest'), key, latestWith(key));

  const stats = spread(pts.map((point) => point.v));
  setMetricValue($('#trend-stat-high'), key, stats ? stats.max : null);
  setMetricValue($('#trend-stat-low'), key, stats ? stats.min : null);
  setMetricValue($('#trend-stat-avg'), key, stats ? stats.mean : null);

  const deltaHost = $('#trend-delta');
  deltaHost.replaceWith(Object.assign(deltaChip(key, deltaFor(key)), { id: 'trend-delta' }));

  // The note counts the readings behind the line, not just the points, because one
  // monthly point standing for six readings is a different claim from a single one.
  const readings = pts.reduce((total, point) => total + (point.readings || 1), 0);
  const parts = [pts.length + (pts.length === 1 ? ' point' : ' points')];
  if (readings > pts.length) parts.push(readings + ' readings averaged');
  if (pts.length >= 2) parts.push(metricText(key, pts[pts.length - 1].v - pts[0].v) + ' over the window');
  $('#trend-range-note').textContent = parts.join(' · ');

  const axis = [$('#axis-start'), $('#axis-mid'), $('#axis-end')];
  if (pts.length >= 2) {
    // Snapped to real buckets rather than an interpolated date, so the middle label
    // always names a point that is actually plotted.
    axis[0].textContent = label(pts[0]);
    axis[1].textContent = label(pts[Math.floor((pts.length - 1) / 2)]);
    axis[2].textContent = label(pts[pts.length - 1]);
  } else if (pts.length === 1) {
    axis.forEach((node) => { node.textContent = label(pts[0]); });
  } else {
    axis.forEach((node) => { node.textContent = '—'; });
  }

  scheduleChart($('#trend-chart'), {
    points: pts,
    height: 220,
    accent: meta.accent,
    digits: meta.digits,
    metricKey: key,
    padLeft: 44,
    yFormat: axisFormat(key),
    pointLabel: label
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
