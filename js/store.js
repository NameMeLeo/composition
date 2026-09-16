/* Composition — readings, on the device.
   Owns the IndexedDB store, the in-memory copy every view reads from, and the
   derived selectors (latest, series, deltas). Mutating the set fires a
   'readings' event so the mounted page can re-render itself. */

import { DB_NAME, DB_VERSION, STORE } from './constants.js';
import { RANGES } from './metrics.js';
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
    setReadings(stored.filter((r) => !r.sample));
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

export function latest() { return sortedDesc(readings)[0] || null; }
export function previous() { return sortedDesc(readings)[1] || null; }

/** Points for one metric inside one time range, oldest first. */
export function seriesFor(key, rangeId) {
  const range = RANGES.find((r) => r.id === rangeId) || RANGES[RANGES.length - 1];
  const cutoff = range.days ? Date.now() - range.days * 86400000 : null;
  return sortedAsc(readings)
    .filter((r) => r.metrics && typeof r.metrics[key] === 'number' && !isNaN(r.metrics[key]))
    .filter((r) => !cutoff || new Date(r.measuredAt).getTime() >= cutoff)
    .map((r) => ({ t: new Date(r.measuredAt).getTime(), v: r.metrics[key], id: r.id }));
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
