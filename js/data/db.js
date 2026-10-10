/* Composition — IndexedDB primitives for readings.
   No business logic here: no dedupe, no selectors, no events.
   See dedupe.js (same-report resolution) and selectors.js (derived views). */

import { DB_NAME, DB_VERSION, STORE } from '../core/constants.js';

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

/** The raw IndexedDB surface. Prefer store.js helpers, which keep the cache in step. */
export const Store = { all, put, bulkPut, remove, clearAll };
