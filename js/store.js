/* Composition — readings, on the device.
   Owns the IndexedDB store, the in-memory copy every view reads from, and the
   derived selectors (latest, series, deltas). Mutating the set fires a
   'readings' event so the mounted page can re-render itself. */

import { DB_NAME, DB_VERSION, STORE } from './constants.js';
import { rangeById, SEGMENTAL_REPORT_PATHS } from './metrics.js';
import { toast } from './dom.js';
import { emit } from './events.js';

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

export function getReadings() { return readings; }

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
    const promoted = usable.map(withSegmentalMetrics);
    const changed = promoted.filter((r, index) => r !== usable[index]);
    if (changed.length) await Store.bulkPut(changed);

    setReadings(promoted);
  } catch (err) {
    setReadings([]);
    toast('Local storage is unavailable in this browser. Readings cannot be saved.', 'error');
  }
}

/** Persists a new reading and folds it into the in-memory set. */
export async function addReading(reading) {
  await Store.put(reading);
  setReadings(readings.concat([reading]));
}

export async function deleteReading(id) {
  await Store.remove(id);
  setReadings(readings.filter((r) => r.id !== id));
}

/* ------------------------------------------------------------------ */
/* Derived selectors                                                   */
/* ------------------------------------------------------------------ */

export const sortedAsc = (list) => list.slice().sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt));
export const sortedDesc = (list) => list.slice().sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt));

/* Segmental values used to live only under `report`, which meant no chart, no tile
   and no history for them. They are metrics now, so readings captured earlier are
   promoted on load and written back once. A reading that already has them is
   returned untouched, which keeps this from rewriting the store on every boot. */
function withSegmentalMetrics(reading) {
  const section = reading && reading.report && reading.report.segmental_analysis;
  if (!section) return reading;

  const metrics = reading.metrics || {};
  const missing = SEGMENTAL_REPORT_PATHS.filter(([key, part, field]) => {
    const value = section[part] && section[part][field];
    return metrics[key] == null && typeof value === 'number' && !isNaN(value);
  });
  if (!missing.length) return reading;

  const next = Object.assign({}, reading, { metrics: Object.assign({}, metrics) });
  missing.forEach(([key, part, field]) => { next.metrics[key] = section[part][field]; });
  return next;
}

export function latest() { return sortedDesc(readings)[0] || null; }
export function previous() { return sortedDesc(readings)[1] || null; }

/** Every reading that recorded this metric, oldest first, with no grouping. */
export function rawPoints(key) {
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
  const d = sortedDesc(readings).find((r) => r.metrics && typeof r.metrics[key] === 'number');
  return d ? d.metrics[key] : null;
}

/** Change between the two most recent readings that both recorded this metric. */
export function deltaFor(key) {
  const d = sortedDesc(readings).filter((r) => r.metrics && typeof r.metrics[key] === 'number');
  if (d.length < 2) return null;
  return d[0].metrics[key] - d[1].metrics[key];
}
