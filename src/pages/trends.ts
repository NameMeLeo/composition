/* Composition — Trends.
   Metrics are grouped into tabs, and every metric in the open tab gets a card showing
   its latest value beside the highest, lowest and average for the chosen window.
   Tapping a card charts it, so the grid is both the readout and the picker. */

import { $, el, clear } from '../core/dom.js';
import { t, metricLabel, groupLabel, rangeLabel } from '../core/i18n.js';
import { METRICS, METRIC_GROUPS, metricsInGroup, RANGES } from '../core/metrics.js';
import type { MetricGroup } from '../core/metrics.js';
import { metricText, metricDisplay, fmtDate, axisFormat, bucketLabel } from '../core/format.js';
import { getReadings, latest, latestWith, deltaFor, seriesForPeriod, rawPoints, sortedAsc } from '../data/store.js';
import { tile } from '../components/tile.js';
import { deltaChip } from '../components/chip.js';
import { scheduleChart } from '../components/chart.js';
import { bindHorizontalSwipe, fillWheel, wheelArrow } from '../components/wheel.js';
import { Route } from '../core/router.js';
import type { ChartPoint, TrendBucket } from '../domain/types.js';

// Remembered across visits so switching pages does not reset the user's choice.
// The plotted period is explicit [from, to] timestamps; the bucket follows the span.
// Narrow screens pick it via preset wheel, wide screens via date inputs + snip.
const selection = {
  metric: 'weight',
  tab: 'composition',
  preset: null as string | null,
  from: null as number | null,
  to: null as number | null
};

/** A metric is only offered once at least one reading has recorded it. */
const hasData = (key: string): boolean => rawPoints(key).length > 0;

const DAY_MS = 86400000;

function startOfDay(time: number): number {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function endOfDay(time: number): number {
  return startOfDay(time) + DAY_MS - 1;
}

function toInputDate(time: number): string {
  const d = new Date(time);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function fromInputDate(value: string, fallback: number): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return fallback;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

/* Default window: last 90 days, widened to the earliest reading so sparse
   histories still draw a line on first visit. */
function defaultPeriod(): { from: number; to: number } {
  const to = endOfDay(Date.now());
  const times = sortedAsc(getReadings())
    .map((r) => new Date(r.measuredAt).getTime())
    .filter((time) => Number.isFinite(time));
  const earliest = times.length ? times[0] : to;
  return { from: Math.min(startOfDay(to - 89 * DAY_MS), startOfDay(earliest)), to };
}

/* Preset wheel windows as explicit bounds. Spans sit just inside the bucket
   edges so each preset lands in its intended aggregation (7d→raw, 28d→weekly,
   364d→monthly, open-ended→yearly-or-shorter). */
function presetBounds(id: string): { from: number; to: number } {
  const to = endOfDay(Date.now());
  const day = startOfDay(to);
  if (id === 'day') return { from: day - 6 * DAY_MS, to };
  if (id === 'week') return { from: day - 27 * DAY_MS, to };
  if (id === 'year') {
    const times = sortedAsc(getReadings())
      .map((r) => new Date(r.measuredAt).getTime())
      .filter((time) => Number.isFinite(time));
    return { from: times.length ? startOfDay(times[0]) : day - 364 * DAY_MS, to };
  }
  return { from: day - 364 * DAY_MS, to };
}

function applyPreset(id: string): void {
  selection.preset = id;
  const bounds = presetBounds(id);
  selection.from = bounds.from;
  selection.to = bounds.to;
  renderTrends();
}

/** The explicit plotted period, falling back to the default window. */
function period(): { from: number; to: number } {
  if (selection.from != null && selection.to != null) return { from: selection.from, to: selection.to };
  return defaultPeriod();
}

export function renderTrends(): void {
  // A tab holding nothing recorded would be a dead end, so only tabs with data show.
  const groups = METRIC_GROUPS.filter((group) => metricsInGroup(group.id).some(hasData));

  if (!groups.length) {
    ($('#trend-card') as HTMLElement).hidden = true;
    ['#trend-tabs', '#range-rail', '#trend-chart', '#composition-split', '#metric-rail'].forEach((id) => { const n = $(id); if (n) clear(n); });
    ($('#trend-label') as HTMLElement).textContent = t('view.trends');
    ($('#trend-latest') as HTMLElement).textContent = '—';
    ($('#trend-range-note') as HTMLElement).textContent = '';
    ['#axis-start', '#axis-mid', '#axis-end', '#trend-stat-high', '#trend-stat-low', '#trend-stat-avg']
      .forEach((id) => { ($(id) as HTMLElement).textContent = '—'; });
    return;
  }

  if (!groups.some((group) => group.id === selection.tab)) selection.tab = groups[0].id;
  const group = groups.find((entry) => entry.id === selection.tab) as MetricGroup;

  // The selected metric has to live in the open tab, or the chart would show
  // something the cards are not offering.
  if (metricsInGroup(group.id).indexOf(selection.metric) === -1) {
    selection.metric = metricsInGroup(group.id).find(hasData) || metricsInGroup(group.id)[0];
  }

  renderTabs(groups);

  // Narrow screens live on presets: without one, or after a desktop-side custom
  // period, snap back to the highlighted preset so wheel and plot never disagree.
  if (window.matchMedia('(min-width: 1024px)').matches) {
    if (selection.from == null || selection.to == null) {
      const d = defaultPeriod();
      selection.from = d.from;
      selection.to = d.to;
    }
  } else {
    if (!selection.preset) selection.preset = 'month';
    applyPresetBounds(selection.preset);
    fillWheel(
      $('#range-rail'),
      RANGES.map((range) => ({ id: range.id, label: rangeLabel(range.id, range.label) })),
      selection.preset,
      (id) => applyPreset(id),
      { noun: t('range.noun'), listLabel: t('trends.range.label') }
    );
  }

  renderTrendCard(group);
  renderMetricRail(group);
  renderCompositionSplit();
}

/** Sets the explicit period from a preset without re-rendering (caller renders). */
function applyPresetBounds(id: string): void {
  const bounds = presetBounds(id);
  selection.from = bounds.from;
  selection.to = bounds.to;
}

/* The tab strip. Every tab is always offered for the groups that have data, so the
   shape of the data is visible at a glance rather than hidden behind a menu. */
function renderTabs(groups: MetricGroup[]): void {
  const host = $('#trend-tabs');
  clear(host);

  groups.forEach((group) => {
    const on = group.id === selection.tab;
    const tab = el('button', 'tab' + (on ? ' tab--on' : ''), groupLabel(group.id, group.label)) as HTMLButtonElement;
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

function metricItems(group: MetricGroup): string[] {
  return metricsInGroup(group.id).filter(hasData);
}

function selectAdjacentMetric(group: MetricGroup, step: number): void {
  const items = metricItems(group);
  if (items.length < 2) return;
  const index = items.indexOf(selection.metric);
  selection.metric = items[(Math.max(0, index) + step + items.length) % items.length];
  renderTrends();
}

function renderTrendCard(group: MetricGroup): void {
  const card = $('#trend-card');
  const items = metricItems(group);
  const meta = METRICS[selection.metric];
  (card as HTMLElement).hidden = false;
  card.style.setProperty('--trend-accent', meta.accent);
  card.setAttribute('aria-label', metricLabel(selection.metric, meta.label) + ' trend');

  const previous = $('#trend-prev') as HTMLButtonElement;
  previous.replaceChildren(wheelArrow(-1));
  previous.disabled = items.length < 2;
  previous.setAttribute('aria-label', t('trends.prev'));
  previous.title = t('trends.prev');
  previous.onclick = () => selectAdjacentMetric(group, -1);

  const next = $('#trend-next') as HTMLButtonElement;
  next.replaceChildren(wheelArrow(1));
  next.disabled = items.length < 2;
  next.setAttribute('aria-label', t('trends.next'));
  next.title = t('trends.next');
  next.onclick = () => selectAdjacentMetric(group, 1);

  bindHorizontalSwipe(card, (step) => selectAdjacentMetric(group, step), {
    ignoreSelector: '.trend-card__nav, button'
  });
  renderChart();
}

/* Desktop side list: every recorded metric in the open tab as a mini-card.
   Hidden below the desktop breakpoint by CSS; rendering it always is cheap. */
function renderMetricRail(group: MetricGroup): void {
  const host = $('#metric-rail');
  if (!host) return;
  clear(host);
  const last = latest();
  metricItems(group).forEach((key) => {
    const item = el('div', 'metric-rail__item' + (key === selection.metric ? ' is-current' : '')) as HTMLElement;
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    item.setAttribute('aria-label', metricLabel(key, METRICS[key].label));
    item.appendChild(tile(key, last, { delta: deltaFor(key), points: rawPoints(key).slice(-12) }));
    const pick = (): void => {
      if (selection.metric !== key) {
        selection.metric = key;
        renderTrends();
      }
    };
    item.addEventListener('click', pick);
    item.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        pick();
      }
    });
    host.appendChild(item);
  });
}

function setMetricValue(node: HTMLElement, key: string, value: unknown): void {  clear(node);
  const shown = metricDisplay(key, value);
  node.appendChild(document.createTextNode(shown.text));
  if (shown.unit) node.appendChild(el('span', 'unit', shown.unit));
}

function spread(values: number[]): { min: number; max: number; mean: number } | null {
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

function renderChart(): void {
  const key = selection.metric;
  const meta = METRICS[key];
  const { from, to } = period();
  const { points: pts, bucket } = seriesForPeriod(key, from, to);
  const label = (point: ChartPoint): string => bucketLabel(bucket === 'raw' ? 'day' : bucket, point.t);

  syncPeriodInputs(from, to);

  ($('#trend-label') as HTMLElement).textContent = metricLabel(key, meta.label);
  setMetricValue($('#trend-latest'), key, latestWith(key));

  const stats = spread(pts.map((point) => point.v));
  setMetricValue($('#trend-stat-high'), key, stats ? stats.max : null);
  setMetricValue($('#trend-stat-low'), key, stats ? stats.min : null);
  setMetricValue($('#trend-stat-avg'), key, stats ? stats.mean : null);

  const deltaHost = $('#trend-delta');
  const chip = deltaChip(key, deltaFor(key));
  chip.id = 'trend-delta';
  deltaHost.replaceWith(chip);

  // The note counts the readings behind the line, not just the points, because one
  // monthly point standing for six readings is a different claim from a single one.
  const readings = pts.reduce((total, point) => total + (point.readings || 1), 0);
  const parts = [
    fmtDate(from, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' }),
    t('trends.points', { n: pts.length, s: pts.length === 1 ? '' : 's' }),
    t('trends.bucket.' + bucket)
  ];
  if (readings > pts.length) parts.push(t('trends.averaged', { n: readings }));
  if (pts.length >= 2) parts.push(t('trends.over', { d: metricText(key, pts[pts.length - 1].v - pts[0].v) }));
  ($('#trend-range-note') as HTMLElement).textContent = parts.join(' · ');

  const axis = [($('#axis-start') as HTMLElement), ($('#axis-mid') as HTMLElement), ($('#axis-end') as HTMLElement)];
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
    pointLabel: label,
    selectable: true,
    onSelect: (a: number, b: number) => {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      selection.from = startOfDay(lo);
      // A snip inside one day still plots that whole day.
      selection.to = Math.max(endOfDay(hi), endOfDay(lo));
      selection.preset = null;
      renderTrends();
    }
  });

  ($('#trend-chart') as HTMLElement).ondblclick = () => {
    selection.from = null;
    selection.to = null;
    renderTrends();
  };
}

/** Keeps the date inputs in step with the plotted period (no-op when absent). */
function syncPeriodInputs(from: number, to: number): void {
  const fromInput = $('#trend-from') as HTMLInputElement | null;
  const toInput = $('#trend-to') as HTMLInputElement | null;
  if (!fromInput || !toInput) return;
  fromInput.value = toInputDate(from);
  toInput.value = toInputDate(to);
  fromInput.onchange = () => {
    const next = startOfDay(fromInputDate(fromInput.value, from));
    const cur = period();
    if (next <= cur.to) selection.from = next;
    else { selection.from = startOfDay(cur.to); selection.to = endOfDay(next); }
    selection.preset = null;
    renderTrends();
  };
  toInput.onchange = () => {
    const next = endOfDay(fromInputDate(toInput.value, to));
    const cur = period();
    if (next >= cur.from) selection.to = next;
    else { selection.from = startOfDay(next); selection.to = endOfDay(cur.from); }
    selection.preset = null;
    renderTrends();
  };
}

export function renderCompositionSplit(): void {
  const host = $('#composition-split');
  clear(host);

  const last = latest();
  const weight = last?.metrics ? last.metrics.weight as number | undefined : null;
  const bf = last?.metrics ? last.metrics.bodyFat as number | undefined : null;

  if (weight == null || bf == null) {
    host.appendChild(el('p', 'empty__body', t('trends.split.need')));
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
    [t('trends.split.lean'), METRICS.muscleMass.accent, leanMass],
    [t('trends.split.fat'), METRICS.bodyFat.accent, fatMass],
    [t('trends.split.total'), 'var(--c-slate)', total]
  ].forEach((row) => {
    const li = el('li');
    const sw = el('span', 'split__swatch');
    sw.style.background = row[1] as string;
    li.appendChild(sw);
    li.appendChild(el('span', 'split__name', row[0] as string));
    li.appendChild(el('span', 'split__val', metricText('weight', row[2])));
    legend.appendChild(li);
  });
  host.appendChild(legend);

  const note = el('p', 'footnote');
  note.style.padding = '0';
  note.style.textAlign = 'left';
  note.textContent = t('trends.split.note', { date: fmtDate(last?.measuredAt) });
  host.appendChild(note);
}

Route.page('trends', renderTrends);
