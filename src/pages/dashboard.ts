/* Composition — Today (the default view).
   Latest reading, the four headline deltas, a 90-day mini trend, every metric
   that has ever been recorded, and the plain-language insights. */

import { $, el, clear, clamp } from '../core/dom.js';
import { t, metricLabel } from '../core/i18n.js';
import { METRICS, METRIC_ORDER, rangeById } from '../core/metrics.js';
import { metricDisplay, fmtDateTime, relDays, axisFormat, bucketLabel } from '../core/format.js';
import { getReadings, latest, deltaFor, seriesFor, rawPoints } from '../data/store.js';
import { deltaChip } from '../components/chip.js';
import { scheduleChart } from '../components/chart.js';
import { tile } from '../components/tile.js';
import { renderInsights, renderSummary } from './insights.js';
import { Route } from '../core/router.js';

function html(sel: string, markup: string): HTMLElement {
  const node = $(sel);
  if (node) node.innerHTML = markup;
  return node;
}

export function renderDashboard(): void {
  const readings = getReadings();
  const has = readings.length > 0;
  const last = latest();

  ($('#banner-setup') as HTMLElement).hidden = true;
  ($('#empty-dashboard') as HTMLElement).hidden = has;
  ($('#hero') as HTMLElement).hidden = !has;
  ($('#block-deltas') as HTMLElement).hidden = !has;
  ($('#block-trend') as HTMLElement).hidden = !has;
  ($('#block-summary') as HTMLElement).hidden = !has;
  ($('#block-insights') as HTMLElement).hidden = !has;

  const metricGrid = $('#dashboard-metrics');
  clear(metricGrid);
  METRIC_ORDER.forEach((key) => {
    const meta = METRICS[key];
    const raw = last?.metrics ? last.metrics[key] : null;
    // A metric nobody has ever recorded gets no tile at all.
    if (raw == null && rawPoints(key).length === 0) return;
    const node = tile(key, last, { delta: deltaFor(key), points: rawPoints(key).slice(-12) });
    node.style.setProperty('--tile-accent', meta.accent);
    metricGrid.appendChild(node);
  });

  if (!has || !last) return;

  /* hero */
  const bf = last.metrics.bodyFat as number | undefined;
  const arc = $('#ring-arc');
  // The ring is a 327-unit circumference, mapped to a 0–50% body-fat scale.
  const pct = bf != null ? clamp(bf / 50, 0, 1) : 0;
  arc.setAttribute('stroke-dasharray', '327');
  arc.setAttribute('stroke-dashoffset', String(327 * (1 - pct)));
  ($('#hero-bf') as HTMLElement).textContent = bf != null ? bf.toFixed(1) : '—';

  const w = metricDisplay('weight', last.metrics.weight);
  const m = metricDisplay('muscleMass', last.metrics.muscleMass);
  html('#hero-weight', w.text + (w.unit ? ' ' + w.unit : ''));
  html('#hero-muscle', m.text + (m.unit ? ' ' + m.unit : ''));
  ($('#hero-visceral') as HTMLElement).textContent = last.metrics.visceralFat != null ? String(last.metrics.visceralFat) : '—';
  ($('#hero-eyebrow') as HTMLElement).textContent = t('dash.hero.eyebrow');
  ($('#hero-meta') as HTMLElement).textContent = last.playerId
    ? t('dash.hero.meta', { date: fmtDateTime(last.measuredAt), rel: relDays(last.measuredAt), player: last.playerId, n: readings.length, s: readings.length === 1 ? '' : 's' })
    : t('dash.hero.meta.noplayer', { date: fmtDateTime(last.measuredAt), rel: relDays(last.measuredAt), n: readings.length, s: readings.length === 1 ? '' : 's' });

  /* deltas */
  const deltaGrid = $('#delta-grid');
  clear(deltaGrid);
  ['weight', 'bodyFat', 'muscleMass', 'visceralFat'].forEach((key) => {
    const meta = METRICS[key];
    const card = el('div', 'tile');
    card.style.setProperty('--tile-accent', meta.accent);
    card.appendChild(el('span', 'tile__label', metricLabel(key, meta.label)));

    const d = deltaFor(key);
    const holder = el('div', 'od-row');
    const chip = deltaChip(key, d);
    chip.classList.add('tile__value');
    chip.style.fontSize = 'var(--fs-sm)';
    chip.style.minHeight = '32px';
    holder.appendChild(chip);
    card.appendChild(holder);

    const foot = el('div', 'tile__foot');
    foot.textContent = d == null ? t('dash.deltas.need2') : t('dash.deltas.prev');
    card.appendChild(foot);
    deltaGrid.appendChild(card);
  });

  /* mini trend — four weekly averages, falling back to every reading when there is
     too little history to fill a single week. */
  const miniPts = seriesFor('weight', 'week');
  const miniRange = rangeById('week');
  ($('#mini-chart') as HTMLElement).dataset.metric = 'weight';
  scheduleChart($('#mini-chart'), {
    points: miniPts.length >= 2 ? miniPts : rawPoints('weight'),
    height: 158,
    accent: METRICS.weight.accent,
    digits: 1,
    metricKey: 'weight',
    yFormat: axisFormat('weight'),
    pointLabel: (point) => bucketLabel(miniRange.bucket, point.t)
  });

  renderSummary();
  renderInsights();
}

Route.page('dashboard', renderDashboard);
