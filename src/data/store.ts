/* Composition — readings, on the device.
   Facade over the split modules: db.ts owns IndexedDB, dedupe.ts owns
   same-report identity, selectors.ts owns derived views. This file owns the
   in-memory copy every view reads from. Mutating the set fires a 'readings'
   event so the mounted page can re-render itself. */

import { toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { emit } from '../core/events.js';
import { Store } from './db.js';
import {
  readingSerialNumber,
  findSameReport,
  preferredDuplicate,
  visibleReadings
} from './dedupe.js';
import {
  sortedAsc,
  sortedDesc,
  withReportMetrics,
  rawPointsFor,
  seriesForRange,
  latestWithIn,
  deltaForIn
} from './selectors.js';
import type { ChartPoint, Reading } from '../domain/types.js';

export { Store, readingSerialNumber, sortedAsc, sortedDesc };

/* ------------------------------------------------------------------ */
/* The in-memory set                                                   */
/* ------------------------------------------------------------------ */

let readings: Reading[] = [];

export function getReadings(): Reading[] { return visibleReadings(readings); }
export function getAllReadings(): Reading[] { return readings; }

export function setReadings(next: Reading[]): void {
  readings = next;
  emit('readings');
}

export async function loadReadings(): Promise<void> {
  try {
    const stored = await Store.all();
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
    toast(t('pipe.nostore'), 'error');
  }
}

export type AddReadingOutcome = 'added' | 'updated' | 'kept';

/** Persists a reading and folds it into the in-memory set.

    Re-ingesting a report that is already on the device updates that reading rather than
    adding a second copy, so a better parse of a report replaces what is stored instead of
    sitting beside it. Returns what is now stored, plus whether the save added a reading,
    replaced one, or stood down in favour of a fuller copy already there. */
export async function addReading(reading: Reading): Promise<{ reading: Reading; outcome: AddReadingOutcome }> {
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
  const stored: Reading = {
    ...winner,
    id: existing.id,
    createdAt: existing.createdAt || winner.createdAt,
    updatedAt: new Date().toISOString()
  };
  await Store.put(stored);
  setReadings(readings.map((r) => (r.id === existing.id ? stored : r)));
  return { reading: stored, outcome: 'updated' };
}

export async function deleteReading(id: string): Promise<void> {
  await Store.remove(id);
  setReadings(readings.filter((r) => r.id !== id));
}

/* ------------------------------------------------------------------ */
/* Derived selectors (delegating to selectors.ts with the live set)    */
/* ------------------------------------------------------------------ */

export function latest(): Reading | null { return sortedDesc(getReadings())[0] || null; }
export function previous(): Reading | null { return sortedDesc(getReadings())[1] || null; }

/** Every reading that recorded this metric, oldest first, with no grouping. */
export function rawPoints(key: string): ChartPoint[] { return rawPointsFor(getReadings(), key); }

/** One averaged point per bucket inside a window, oldest first. */
export function seriesFor(key: string, rangeId: string): ChartPoint[] { return seriesForRange(getReadings(), key, rangeId); }

/** The most recent value for a metric, ignoring readings that skipped it. */
export function latestWith(key: string): number | null { return latestWithIn(getReadings(), key); }

/** Change between the two most recent readings that both recorded this metric. */
export function deltaFor(key: string): number | null { return deltaForIn(getReadings(), key); }
