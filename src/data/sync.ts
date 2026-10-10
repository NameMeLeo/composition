/* Composition — optional cloud mirror.
   Readings live on the device first; this only copies them into the user's own
   Supabase project, resolving conflicts by whichever copy was touched last. */

import { Auth } from '../services/auth.js';
import { Settings } from '../core/settings.js';
import { Store, setReadings } from './store.js';
import type { MirrorResult, Reading } from '../domain/types.js';

interface RemoteRow {
  id?: string;
  measured_at?: string;
  source?: string;
  payload?: unknown;
  updated_at?: string;
}

/** The tiebreak key used to decide which of two copies of a reading wins. */
function readingUpdatedAt(reading: Reading, fallback?: string): number {
  const candidates = [reading?.updatedAt, reading?.createdAt, reading?.measuredAt, fallback];
  for (const value of candidates) {
    const time = value ? new Date(value).getTime() : NaN;
    if (isFinite(time)) return time;
  }
  return 0;
}

/** Rebuilds a reading from a mirrored row, or null when the row is unusable. */
function mirroredReading(row: RemoteRow): Reading | null {
  const payload = row?.payload && typeof row.payload === 'object' ? (row.payload as Partial<Reading>) : null;
  const id = row?.id ? row.id : payload?.id;
  if (!id || !payload || !payload.metrics || typeof payload.metrics !== 'object') return null;
  return {
    ...(payload as Reading),
    id,
    createdAt: payload.createdAt || row.updated_at || row.measured_at || new Date().toISOString(),
    updatedAt: payload.updatedAt || row.updated_at || payload.createdAt || row.measured_at,
    measuredAt: payload.measuredAt || row.measured_at || new Date().toISOString(),
    source: payload.source || row.source || 'manual'
  };
}

/** Two-way sync. Returns {ok, count, uploaded, downloaded} or {ok: false, error}. */
export async function mirrorSync(): Promise<MirrorResult> {
  const url = Settings.get().supabaseUrl.replace(/\/+$/, '') + '/rest/v1/readings';
  try {
    const token = await Auth.accessToken();
    if (!token) return { ok: false, count: 0, error: 'Sign in before mirroring readings.' };

    const headers: Record<string, string> = {
      apikey: Settings.get().supabaseAnonKey,
      Authorization: 'Bearer ' + token
    };

    const localReadings = (await Store.all()).map((reading) => {
      if (reading.updatedAt) return reading;
      return { ...reading, updatedAt: reading.createdAt || reading.measuredAt || new Date().toISOString() };
    });
    const localById = new Map(localReadings.map((reading) => [reading.id, reading]));

    const pull = await fetch(url + '?select=id,measured_at,source,payload,updated_at', {
      method: 'GET',
      cache: 'no-store',
      headers
    });
    if (!pull.ok) {
      const detail = await pull.text().catch(() => '');
      return { ok: false, count: 0, error: 'The mirror could not download readings (' + pull.status + ')' + (detail ? ': ' + detail.slice(0, 140) : '.') };
    }
    const remoteRows = await pull.json().catch(() => null) as RemoteRow[] | null;
    if (!Array.isArray(remoteRows)) return { ok: false, count: 0, error: 'The mirror returned an invalid reading list.' };

    const merged = new Map(localReadings.map((reading) => [reading.id, reading]));
    const uploads: Reading[] = [];
    const writes: Reading[] = [];
    const remoteIds = new Set<string>();
    let downloaded = 0;

    remoteRows.forEach((row) => {
      const remote = mirroredReading(row);
      if (!remote) return;
      remoteIds.add(remote.id);
      const local = localById.get(remote.id);
      if (!local || readingUpdatedAt(remote, row.updated_at) > readingUpdatedAt(local)) {
        merged.set(remote.id, remote);
        writes.push(remote);
        downloaded++;
        return;
      }
      uploads.push(local);
    });
    localReadings.forEach((reading) => {
      if (!remoteIds.has(reading.id)) uploads.push(reading);
    });

    if (writes.length) await Store.bulkPut(writes);

    const mergedReadings = Array.from(merged.values());
    const uniqueUploads = Array.from(new Map(uploads.map((reading) => [reading.id, reading])).values());

    if (uniqueUploads.length) {
      const push = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(uniqueUploads.map((reading) => ({
          id: reading.id,
          measured_at: reading.measuredAt,
          source: reading.source,
          payload: reading
        })))
      });
      if (!push.ok) {
        const detail = await push.text().catch(() => '');
        return { ok: false, count: 0, error: 'The mirror could not upload readings (' + push.status + ')' + (detail ? ': ' + detail.slice(0, 140) : '.') };
      }
    }

    // Publishing the merged set re-renders whichever view is mounted.
    setReadings(mergedReadings);
    Settings.save({ mirrorSyncedAt: new Date().toISOString() });
    return { ok: true, count: mergedReadings.length, uploaded: uniqueUploads.length, downloaded };
  } catch (err) {
    return { ok: false, count: 0, error: 'The mirror could not be reached.' };
  }
}
