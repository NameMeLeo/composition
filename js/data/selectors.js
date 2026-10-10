/* Composition — derived selectors over readings.
   Pure functions: pass readings in, get sorted/bucketed views out.
   The in-memory set lives in store.js; this module never touches IndexedDB. */

import { rangeById, REPORT_METRIC_PATHS, SEGMENTAL_REPORT_PATHS } from '../core/metrics.js';

export const sortedAsc = (list) => list.slice().sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));
export const sortedDesc = (list) => list.slice().sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt));

/* Report values used to live only under `report`, which meant no chart, history or
   tile for them. Promote every known numeric report path on load and write it back
   once. A complete reading is returned untouched, so boot does not rewrite storage. */
export function withReportMetrics(reading) {
  const report = reading && reading.report;
  if (!report) return reading;

  const paths = REPORT_METRIC_PATHS.concat(
    SEGMENTAL_REPORT_PATHS.map(([key, part, field]) => [key, 'segmental_analysis.' + part, field])
  );
  const metrics = reading.metrics || {};
  const missing = paths.filter(([key, section, field]) => {
    const parts = (section + '.' + field).split('.');
    let value = report;
    parts.forEach((part) => { value = value == null ? null : value[part]; });
    return metrics[key] == null && typeof value === 'number' && !isNaN(value);
  });
  if (!missing.length) return reading;

  const next = Object.assign({}, reading, { metrics: Object.assign({}, metrics) });
  missing.forEach(([key, section, field]) => {
    const parts = (section + '.' + field).split('.');
    let value = report;
    parts.forEach((part) => { value = value == null ? null : value[part]; });
    next.metrics[key] = value;
  });
  return next;
}

/** Every reading that recorded this metric, oldest first, with no grouping. */
export function rawPointsFor(readings, key) {
  return sortedAsc(readings)
    .filter((r) => r.metrics && typeof r.metrics[key] === 'number' && !isNaN(r.metrics[key]))
    .map((r) => ({ t: new Date(r.measuredAt).getTime(), v: r.metrics[key], id: r.id }))
    .filter((p) => !isNaN(p.t));
}

/** The start of the bucket a moment belongs to, as a timestamp. */
function bucketStart(time, bucket) {
  const d = new Date(time);
  if (bucket === 'week') {
    // Weeks run Monday to Sunday, which is how a training week is normally read.
    const offset = (d.getDay() + 6) % 7;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset).getTime();
  }
  if (bucket === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  if (bucket === 'year') return new Date(d.getFullYear(), 0, 1).getTime();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/* The first bucket a window includes, so a window covers exactly `span` slots. Built
   by rolling the calendar rather than subtracting milliseconds, which would drift an
   hour across a daylight-saving change and misfile a reading made near midnight. */
function windowStart(bucket, span) {
  const now = new Date();
  if (bucket === 'day') return bucketStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (span - 1)).getTime(), 'day');
  if (bucket === 'week') return bucketStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (span - 1) * 7).getTime(), 'week');
  if (bucket === 'month') return new Date(now.getFullYear(), now.getMonth() - (span - 1), 1).getTime();
  return null;
}

/** One averaged point per bucket inside a window, oldest first. Empty buckets are
    left out rather than filled with a made-up value, so the line only ever spans
    periods that were actually measured. */
export function seriesForRange(readings, key, rangeId) {
  const range = rangeById(rangeId);
  const from = range.span ? windowStart(range.bucket, range.span) : null;

  const buckets = new Map();
  rawPointsFor(readings, key).forEach((point) => {
    if (from !== null && point.t < from) return;
    const start = bucketStart(point.t, range.bucket);
    const held = buckets.get(start);
    if (held) { held.sum += point.v; held.n += 1; }
    else buckets.set(start, { sum: point.v, n: 1 });
  });

  return Array.from(buckets.entries())
    .map(([t, held]) => ({ t, v: held.sum / held.n, readings: held.n }))
    .sort((a, b) => a.t - b.t);
}

/** The most recent value for a metric, ignoring readings that skipped it. */
export function latestWithIn(readings, key) {
  const d = sortedDesc(readings).find((r) => r.metrics && typeof r.metrics[key] === 'number');
  return d ? d.metrics[key] : null;
}

/** Change between the two most recent readings that both recorded this metric. */
export function deltaForIn(readings, key) {
  const d = sortedDesc(readings).filter((r) => r.metrics && typeof r.metrics[key] === 'number');
  if (d.length < 2) return null;
  return d[0].metrics[key] - d[1].metrics[key];
}
