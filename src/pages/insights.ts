/* Composition — plain-language insights for the Today view.
   Pure derivation over readings: first-vs-last deltas, 90-day weight spread,
   30-day cadence. No DOM shell here beyond the insight list host. */

import { $, el, clear } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { metricText, relDays, massValue } from '../core/format.js';
import { getReadings, sortedAsc } from '../data/store.js';

interface InsightItem { accent: string; title: string; body: string; }

export function renderInsights(): void {
  const host = $('#insight-list');
  clear(host);

  const list = sortedAsc(getReadings());
  const first = list[0];
  const last = list[list.length - 1];

  if (!first || !last || list.length < 2) {
    const only = el('div', 'insight');
    only.appendChild(el('span', 'insight__mark', '•'));
    const body = el('div', 'od-field');
    body.appendChild(el('div', 'insight__title', t('insights.one')));
    body.appendChild(el('div', 'insight__body', t('insights.one.body')));
    only.appendChild(body);
    host.appendChild(only);
    return;
  }

  const items: InsightItem[] = [];

  const bfDelta = last.metrics.bodyFat != null && first.metrics.bodyFat != null
    ? (last.metrics.bodyFat as number) - (first.metrics.bodyFat as number) : null;
  if (bfDelta != null && Math.abs(bfDelta) >= 0.2) {
    items.push({
      accent: 'var(--c-amber-soft)',
      title: bfDelta < 0 ? t('insights.bf.down') : t('insights.bf.up'),
      body: t('insights.bf.body', {
        v: Math.abs(bfDelta).toFixed(1),
        dir: bfDelta < 0 ? t('insights.bf.lower') : t('insights.bf.higher'),
        n: list.length
      })
    });
  }

  const mmDelta = last.metrics.muscleMass != null && first.metrics.muscleMass != null
    ? (last.metrics.muscleMass as number) - (first.metrics.muscleMass as number) : null;
  if (mmDelta != null && Math.abs(mmDelta) >= 0.1) {
    const shown = massValue(Math.abs(mmDelta), 1);
    items.push({
      accent: 'var(--c-green-soft)',
      title: mmDelta > 0 ? t('insights.mm.up') : t('insights.mm.down'),
      body: t('insights.mm.body', {
        v: shown.value, unit: shown.unit,
        dir: mmDelta > 0 ? t('insights.mm.above') : t('insights.mm.below')
      })
    });
  }

  // Raw readings from the last 90 days, not the averaged buckets: the point of this
  // insight is how far the measurement itself has swung between readings.
  const since90 = Date.now() - 90 * 86400000;
  const weights = sortedAsc(getReadings())
    .filter((r) => r.metrics && typeof r.metrics.weight === 'number')
    .filter((r) => new Date(r.measuredAt).getTime() >= since90)
    .map((r) => r.metrics.weight as number);
  if (weights.length >= 3) {
    const spread = Math.max.apply(null, weights) - Math.min.apply(null, weights);
    items.push({
      accent: 'var(--c-primary-soft)',
      title: t('insights.spread.title'),
      body: t('insights.spread.body', {
        spread: metricText('weight', spread), n: weights.length,
        last: metricText('weight', weights[weights.length - 1])
      })
    });
  }

  const last30 = getReadings().filter((r) => Date.now() - new Date(r.measuredAt).getTime() <= 30 * 86400000);
  items.push({
    accent: 'var(--c-teal-soft)',
    title: t('insights.cadence'),
    body: t('insights.cadence.body', { n: last30.length, s: last30.length === 1 ? '' : 's', rel: relDays(last.measuredAt) })
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
  note.textContent = t('insights.note');
  host.appendChild(note);
}

/** Last-30-days stat chips: averages and net changes, no new data layer. */
export function renderSummary(): void {
  const host = $('#summary-grid');
  if (!host) return;
  clear(host);

  const since = Date.now() - 30 * 86400000;
  const rows = sortedAsc(getReadings()).filter((r) => new Date(r.measuredAt).getTime() >= since);

  const stat = (label: string, value: string): void => {
    const card = el('div', 'tile');
    card.appendChild(el('span', 'tile__label', label));
    card.appendChild(el('span', 'tile__value', value));
    host.appendChild(card);
  };

  const series = (key: string): number[] =>
    rows.filter((r) => r.metrics && typeof r.metrics[key] === 'number').map((r) => r.metrics[key] as number);

  const weights = series('weight');
  stat(t('sum.avgweight'), weights.length ? metricText('weight', weights.reduce((a, b) => a + b, 0) / weights.length) : '—');
  stat(t('sum.count'), String(rows.length));

  const net = (key: string): number | null => {
    const vs = series(key);
    return vs.length >= 2 ? vs[vs.length - 1] - vs[0] : null;
  };
  const signed = (key: string, v: number | null): string =>
    v == null || v === 0 ? (v == null ? '—' : metricText(key, 0)) : (v < 0 ? '-' : '+') + metricText(key, Math.abs(v));
  stat(t('sum.bf'), signed('bodyFat', net('bodyFat')));
  stat(t('sum.muscle'), signed('muscleMass', net('muscleMass')));
}
