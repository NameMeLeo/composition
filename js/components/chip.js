/* Composition — the change chip shown next to a metric. */

import { METRICS } from '../core/metrics.js';
import { el } from '../core/dom.js';
import { massValue, isMassMetric } from '../core/format.js';

/**
 * Builds the "▲ 0.8 kg" / "No change" chip for one metric.
 * @param {string} key   metric id
 * @param {number|null} delta Signed change, or null when there is nothing to compare.
 */
export function deltaChip(key, delta) {
  const meta = METRICS[key];
  const node = el('span', 'delta');

  if (delta == null) {
    node.textContent = 'No comparison yet';
    node.classList.add('delta--flat');
    return node;
  }

  const shown = Number(isMassMetric(key)
    ? massValue(Math.abs(delta), meta.digits).value
    : Math.abs(delta).toFixed(meta.digits));
  const unit = isMassMetric(key)
    ? ' ' + massValue(0, 0).unit
    : (meta.unit ? ' ' + meta.unit : '');

  // Below half the smallest displayed step, the change is noise, not a trend.
  if (shown < Math.pow(10, -meta.digits) / 2) {
    node.textContent = 'No change';
    node.classList.add('delta--flat');
    return node;
  }

  const rising = delta > 0;
  const good = meta.better ? (meta.better === 'up' ? rising : !rising) : null;
  node.classList.add(good === true ? 'delta--up' : good === false ? 'delta--down' : 'delta--flat');
  node.textContent = (rising ? '▲ ' : '▼ ') + shown + unit;
  return node;
}
