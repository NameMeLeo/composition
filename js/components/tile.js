/* Composition — the metric cards.

   `tile` is the dashboard's grid cell: one value, its change chip and a sparkline of
   the recent shape. `metricCard` is the fuller card used on Trends, where a metric
   has a whole time range behind it: the latest value set large, with the highest,
   lowest and average for the window tucked beside it in small type. */

import { METRICS } from '../metrics.js';
import { el } from '../dom.js';
import { metricDisplay, axisFormat } from '../format.js';
import { deltaFor, rawPoints } from '../store.js';
import { deltaChip } from './chip.js';
import { scheduleChart } from './chart.js';

/** One labelled value with its change chip and a sparkline of the last 12 points. */
export function tile(key, reading) {
  const meta = METRICS[key];
  const raw = reading && reading.metrics ? reading.metrics[key] : null;

  const node = el('div', 'tile');
  node.style.setProperty('--tile-accent', meta.accent);

  node.appendChild(el('span', 'tile__label', meta.label));

  const value = el('span', 'tile__value');
  const shown = metricDisplay(key, raw);
  value.textContent = shown.text;
  if (shown.unit) value.appendChild(el('span', 'unit', shown.unit));
  node.appendChild(value);

  const delta = deltaFor(key);
  const foot = el('div', 'tile__foot');
  if (delta == null) {
    foot.textContent = raw == null ? 'Not recorded yet' : 'Only one reading so far';
  } else {
    foot.appendChild(deltaChip(key, delta));
  }
  node.appendChild(foot);

  const spark = el('div', 'tile__spark');
  node.appendChild(spark);
  const pts = rawPoints(key).slice(-12);
  if (pts.length >= 2) {
    scheduleChart(spark, {
      points: pts,
      height: 34,
      accent: meta.accent,
      digits: meta.digits,
      grid: false,
      dots: false,
      scrub: false,
      padLeft: 2,
      padRight: 2,
      padTop: 4,
      padBottom: 4,
      metricKey: key,
      yFormat: axisFormat(key)
    });
  }
  return node;
}

/** Highest, lowest and mean of a list of values, or null when the list is empty. */
function spread(values) {
  if (!values.length) return null;
  let min = values[0];
  let max = values[0];
  let sum = 0;
  values.forEach((value) => {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  });
  return { min, max, mean: sum / values.length };
}

/**
 * The metric card: the latest value set large, with the highest, lowest and average
 * for the chosen range in small type beside it. One card therefore answers the whole
 * question for a metric, which is what lets it double as the picker and the readout —
 * every number is on screen before a chart is opened.
 *
 * @param {string} key metric id
 * @param {{points?: Array, latest?: number|null, active?: boolean,
 *          emptyText?: string, onSelect?: (key: string) => void}} [options]
 */
export function metricCard(key, options) {
  const opts = options || {};
  const meta = METRICS[key];
  const points = opts.points || [];
  const stats = spread(points.map((point) => point.v));

  const node = el('button', 'tile tile--card' + (opts.active ? ' tile--active' : ''));
  node.type = 'button';
  node.style.setProperty('--tile-accent', meta.accent);
  node.setAttribute('aria-pressed', opts.active ? 'true' : 'false');

  const head = el('span', 'tile__head');
  head.appendChild(el('span', 'tile__label', meta.label));
  const lead = el('span', 'tile__value tile__value--lead');
  const shown = metricDisplay(key, opts.latest);
  lead.textContent = shown.text;
  if (shown.unit) lead.appendChild(el('span', 'unit', shown.unit));
  head.appendChild(lead);
  node.appendChild(head);

  const side = el('span', 'tile__side');
  if (stats) {
    // The unit is already stated by the lead value, so these stay bare numbers.
    [['High', stats.max], ['Low', stats.min], ['Avg', stats.mean]].forEach((row) => {
      const line = el('span', 'tile__stat');
      line.appendChild(el('span', 'tile__stat-label', row[0]));
      line.appendChild(el('span', 'tile__stat-value', metricDisplay(key, row[1]).text));
      side.appendChild(line);
    });
  } else {
    side.appendChild(el('span', 'tile__stat-empty', opts.emptyText || 'No readings in this range'));
  }
  node.appendChild(side);

  if (opts.onSelect) node.addEventListener('click', () => opts.onSelect(key));
  return node;
}
