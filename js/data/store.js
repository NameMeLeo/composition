/* Composition — readings, on the device.
   Owns the IndexedDB store, the in-memory copy every view reads from, and the
   derived selectors (latest, series, deltas). Mutating the set fires a
   'readings' event so the mounted page can re-render itself. */

import { DB_NAME, DB_VERSION, STORE } from '../core/constants.js';
import { rangeById, REPORT_METRIC_PATHS, SEGMENTAL_REPORT_PATHS } from '../core/metrics.js';
import { toast } from '../core/dom.js';
import { emit } from '../core/events.js';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB is unavailable in this browser.')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('measuredAt', 'measuredAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open the local database.'));
  });
  return dbPromise;
}

async function all() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function put(reading) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(reading);
    t.oncomplete = () => resolve(reading);
    t.onerror = () => reject(t.error);
  });
}

async function bulkPut(readings) {
  if (!readings.length) return 0;
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const os = t.objectStore(STORE);
    readings.forEach((r) => os.put(r));
    t.oncomplete = () => resolve(readings.length);
    t.onerror = () => reject(t.error);
  });
}

async function remove(id) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function clearAll() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** The raw IndexedDB surface. Prefer the helpers below, which keep the cache in step. */
export const Store = { all, put, bulkPut, remove, clearAll };

/* ------------------------------------------------------------------ */
/* The in-memory set                                                   */
/* ------------------------------------------------------------------ */

let readings = [];

export function getReadings() { return visibleReadings(readings); }
export function getAllReadings() { return readings; }

export function setReadings(next) {
  readings = next;
  emit('readings');
}

export async function loadReadings() {
  try {
    const stored = await all();
    // Older builds seeded eight demo readings. Nothing creates them any more, so
    // any that are still on the device are cleared instead of being shown again.
    const stale = stored.filter((r) => r.sample);
    if (stale.length) {
      for (const s of stale) await Store.remove(s.id);
    }

    const usable = stored.filter((r) => !r.sample);
    const promoted = usable.map(withReportMetrics);
    const changed = promoted.filter((r, index) => r !== usable[index]);
    if (changed.length) await Store.bulkPut(changed);

    setReadings(promoted);
  } catch (err) {
    setReadings([]);
    toast('Local storage is unavailable in this browser. Readings cannot be saved.', 'error');
  }
}

/** Persists a reading and folds it into the in-memory set.

    Re-ingesting a report that is already on the device updates that reading rather than
    adding a second copy, so a better parse of a report replaces what is stored instead of
    sitting beside it. Returns what is now stored, plus whether the save added a reading,
    replaced one, or stood down in favour of a fuller copy already there. */
export async function addReading(reading) {
  const existing = findSameReport(readings, reading);
  const winner = existing ? preferredDuplicate(existing, reading) : reading;

  // The copy on the device carries more than the one just extracted, so it stands. Saying
  // so beats dropping the save silently.
  if (existing && winner === existing) return { reading: existing, outcome: 'kept' };

  if (!existing) {
    await Store.put(reading);
    setReadings(readings.concat([reading]));
    return { reading, outcome: 'added' };
  }

  // The id carries over so anything already holding a reference to this reading — a
  // detail URL, the sync mirror — keeps pointing at it, and so the original save time
  // survives. Everything else comes from the copy that won.
  const stored = Object.assign({}, winner, {
    id: existing.id,
    createdAt: existing.createdAt || winner.createdAt,
    updatedAt: new Date().toISOString()
  });
  await Store.put(stored);
  setReadings(readings.map((r) => (r.id === existing.id ? stored : r)));
  return { reading: stored, outcome: 'updated' };
}

export async function deleteReading(id) {
  await Store.remove(id);
  setReadings(readings.filter((r) => r.id !== id));
}

function normaliseIdentity(value) {
  return value == null ? '' : String(value).trim().toLowerCase();
}

/** The provider serial is the stable report identity carried by API and OCR records. */
export function readingSerialNumber(reading) {
  const details = reading && reading.report && reading.report.provider_details;
  const raw = details && details.raw;
  const candidates = [
    reading && reading.sn,
    reading && reading.report && reading.report.metadata && reading.report.metadata.serial_number,
    details && details.sn,
    raw && raw.sn
  ];
  return normaliseIdentity(candidates.find((value) => value != null && String(value).trim() !== ''));
}

/** The instant a reading was measured, in milliseconds. NaN when it cannot be read. */
function readingMeasuredTime(reading) {
  if (!reading || !reading.measuredAt) return NaN;
  return new Date(reading.measuredAt).getTime();
}

/* The review screen's date field records whole minutes, so the same report can sit a few
   seconds apart depending on how it arrived: an ingest from the provider keeps the
   seconds it printed, a hand-saved copy rounds them off. Anything inside the same minute
   is one measurement; anything further apart is a genuinely different reading from the
   same device, which stays longitudinal. */
const SAME_REPORT_TOLERANCE_MS = 60 * 1000;

/** True when two readings are the same report: one device serial, one subject, and a
    measured instant inside the same minute. */
function isSameReport(first, second) {
  const serial = readingSerialNumber(first);
  if (!serial || serial !== readingSerialNumber(second)) return false;
  if (!compatiblePlayerIds(first, second)) return false;

  const firstTime = readingMeasuredTime(first);
  const secondTime = readingMeasuredTime(second);
  if (!Number.isFinite(firstTime) || !Number.isFinite(secondTime)) return false;
  return Math.abs(firstTime - secondTime) <= SAME_REPORT_TOLERANCE_MS;
}

/** The stored reading that already holds this report, or null. When several copies are on
    the device the richest is returned, so an update lands on the copy that is in use. */
function findSameReport(source, reading) {
  return source.reduce((best, candidate) => {
    if (!isSameReport(candidate, reading)) return best;
    return best ? preferredDuplicate(best, candidate) : candidate;
  }, null);
}

function compatiblePlayerIds(first, second) {
  const a = normaliseIdentity(first && first.playerId);
  const b = normaliseIdentity(second && second.playerId);
  return !a || !b || a === b;
}

/* Report content outweighs metric count because metrics are derived from the report: a
   parse that recovers more of the report is the better record even when a poorer parse
   happened to name more metric keys. Metric count only settles readings that carry no
   report at all, which is the manual-entry case. */
function readingRichness(reading) {
  const reportSize = reading && reading.report ? JSON.stringify(reading.report).length : 0;
  const metricCount = reading && reading.metrics ? Object.keys(reading.metrics).length : 0;
  return reportSize * 1000 + metricCount;
}

function readingUpdatedTime(reading) {
  const candidates = [reading && reading.updatedAt, reading && reading.createdAt, reading && reading.measuredAt];
  for (const candidate of candidates) {
    const time = candidate ? new Date(candidate).getTime() : NaN;
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

function preferredDuplicate(current, candidate) {
  const currentRichness = readingRichness(current);
  const candidateRichness = readingRichness(candidate);
  if (candidateRichness !== currentRichness) return candidateRichness > currentRichness ? candidate : current;

  const currentUpdated = readingUpdatedTime(current);
  const candidateUpdated = readingUpdatedTime(candidate);
  if (candidateUpdated !== currentUpdated) return candidateUpdated > currentUpdated ? candidate : current;
  return String(candidate && candidate.id || '') < String(current && current.id || '') ? candidate : current;
}

/* Duplicate imports stay in IndexedDB and in raw exports. Views use the richest copy
   only when the same provider serial, player and measured instant all agree. Different
   dates from the same device remain longitudinal readings.

   Readings are filed under their serial and then under the minute they were measured in,
   so a device with years of history still resolves in constant time per reading instead
   of comparing every pair. Only that minute and its two neighbours can hold an instant
   inside the tolerance: two times more than a minute apart always land two slots apart or
   further, and that pair is one the tolerance rejects anyway. */
function visibleReadings(source) {
  const unique = [];
  const bySerial = new Map();
  const slotOf = (time) => Math.floor(time / SAME_REPORT_TOLERANCE_MS);

  source.forEach((reading) => {
    const serial = readingSerialNumber(reading);
    const measured = readingMeasuredTime(reading);
    if (!serial || !Number.isFinite(measured)) { unique.push(reading); return; }

    let slots = bySerial.get(serial);
    if (!slots) { slots = new Map(); bySerial.set(serial, slots); }

    const slot = slotOf(measured);
    let match = null;
    for (const offset of [0, -1, 1]) {
      const bucket = slots.get(slot + offset);
      if (!bucket) continue;
      match = bucket.find((entry) =>
        Math.abs(entry.measured - measured) <= SAME_REPORT_TOLERANCE_MS &&
        compatiblePlayerIds(entry.reading, reading)
      );
      if (match) break;
    }

    // The instant a report was first filed under stands as its canonical time, so a later
    // copy that shifts the winner never moves the entry between slots.
    if (match) { match.reading = preferredDuplicate(match.reading, reading); return; }

    const bucket = slots.get(slot) || [];
    bucket.push({ reading, measured });
    slots.set(slot, bucket);
  });

  return unique.concat(
    Array.from(bySerial.values())
      .flatMap((slots) => Array.from(slots.values()).flat())
      .map((entry) => entry.reading)
  );
}

/* ------------------------------------------------------------------ */
/* Derived selectors                                                   */
/* ------------------------------------------------------------------ */

export const sortedAsc = (list) => list.slice().sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));
export const sortedDesc = (list) => list.slice().sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt));

/* Report values used to live only under `report`, which meant no chart, history or
   tile for them. Promote every known numeric report path on load and write it back
   once. A complete reading is returned untouched, so boot does not rewrite storage. */
function withReportMetrics(reading) {
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

export function latest() { return sortedDesc(getReadings())[0] || null; }
export function previous() { return sortedDesc(getReadings())[1] || null; }

/** Every reading that recorded this metric, oldest first, with no grouping. */
export function rawPoints(key) {
  return sortedAsc(getReadings())
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
export function seriesFor(key, rangeId) {
  const range = rangeById(rangeId);
  const from = range.span ? windowStart(range.bucket, range.span) : null;

  const buckets = new Map();
  rawPoints(key).forEach((point) => {
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
export function latestWith(key) {
  const d = sortedDesc(getReadings()).find((r) => r.metrics && typeof r.metrics[key] === 'number');
  return d ? d.metrics[key] : null;
}

/** Change between the two most recent readings that both recorded this metric. */
export function deltaFor(key) {
  const d = sortedDesc(getReadings()).filter((r) => r.metrics && typeof r.metrics[key] === 'number');
  if (d.length < 2) return null;
  return d[0].metrics[key] - d[1].metrics[key];
}
