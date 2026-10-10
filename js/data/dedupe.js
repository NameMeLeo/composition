/* Composition — same-report identity and dedupe.
   Decides when two readings are the same provider report (one device serial,
   one subject, one measured minute) and which copy wins. Pure functions over
   readings; no IndexedDB, no events. */

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
export function readingMeasuredTime(reading) {
  if (!reading || !reading.measuredAt) return NaN;
  return new Date(reading.measuredAt).getTime();
}

/* The review screen's date field records whole minutes, so the same report can sit a few
   seconds apart depending on how it arrived: an ingest from the provider keeps the
   seconds it printed, a hand-saved copy rounds them off. Anything inside the same minute
   is one measurement; anything further apart is a genuinely different reading from the
   same device, which stays longitudinal. */
export const SAME_REPORT_TOLERANCE_MS = 60 * 1000;

export function compatiblePlayerIds(first, second) {
  const a = normaliseIdentity(first && first.playerId);
  const b = normaliseIdentity(second && second.playerId);
  return !a || !b || a === b;
}

/** True when two readings are the same report: one device serial, one subject, and a
    measured instant inside the same minute. */
export function isSameReport(first, second) {
  const serial = readingSerialNumber(first);
  if (!serial || serial !== readingSerialNumber(second)) return false;
  if (!compatiblePlayerIds(first, second)) return false;

  const firstTime = readingMeasuredTime(first);
  const secondTime = readingMeasuredTime(second);
  if (!Number.isFinite(firstTime) || !Number.isFinite(secondTime)) return false;
  return Math.abs(firstTime - secondTime) <= SAME_REPORT_TOLERANCE_MS;
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

export function preferredDuplicate(current, candidate) {
  const currentRichness = readingRichness(current);
  const candidateRichness = readingRichness(candidate);
  if (candidateRichness !== currentRichness) return candidateRichness > currentRichness ? candidate : current;

  const currentUpdated = readingUpdatedTime(current);
  const candidateUpdated = readingUpdatedTime(candidate);
  if (candidateUpdated !== currentUpdated) return candidateUpdated > currentUpdated ? candidate : current;
  return String(candidate && candidate.id || '') < String(current && current.id || '') ? candidate : current;
}

/** The stored reading that already holds this report, or null. */
export function findSameReport(source, reading) {
  return source.reduce((best, candidate) => {
    if (!isSameReport(candidate, reading)) return best;
    return best ? preferredDuplicate(best, candidate) : candidate;
  }, null);
}

/* Duplicate imports stay in IndexedDB and in raw exports. Views use the richest copy
   only when the same provider serial, player and measured instant all agree. Different
   dates from the same device remain longitudinal readings.

   Readings are filed under their serial and then under the minute they were measured in,
   so a device with years of history still resolves in constant time per reading instead
   of comparing every pair. Only that minute and its two neighbours can hold an instant
   inside the tolerance: two times more than a minute apart always land two slots apart or
   further, and that pair is one the tolerance rejects anyway. */
export function visibleReadings(source) {
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
