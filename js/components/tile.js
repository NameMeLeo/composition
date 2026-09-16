/* Composition — the dashboard metric cards. */

import { METRICS } from '../core/metrics.js';
import { el } from '../core/dom.js';
import { metricDisplay, axisFormat } from '../core/format.js';
import { deltaFor, rawPoints } from '../data/store.js';
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
