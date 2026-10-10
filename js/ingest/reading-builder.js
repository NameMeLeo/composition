/* Composition — turning confirmed review state into a stored reading.
   Owns buildReading (validation of presence), applyReportEdits (report patch),
   persistReading (dedupe-aware save + mirror) and saveReadingDirect (trusted
   provider path that skips the human review screen). No DOM here. */

import { uid, toast } from '../core/dom.js';
import { toDate } from '../core/format.js';
import { addReading } from '../data/store.js';
import { Settings } from '../core/settings.js';
import { Auth } from '../services/auth.js';
import { mirrorSync } from '../data/sync.js';
import { Route } from '../core/router.js';

/** Writes the edited report values back onto a copy of the extracted report. */
export function applyReportEdits(report, edits) {
  if (!report) return null;
  const next = JSON.parse(JSON.stringify(report));
  Object.keys(edits || {}).forEach((path) => {
    const parts = path.split('.');
    let node = next;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (edits[path] === null) delete node[last];
    else node[last] = edits[path];
  });
  return next;
}

export function buildReading(state, metrics, reportEdits, measuredAtValue) {
  const measuredAt = toDate(measuredAtValue || state.measuredAt);
  if (!measuredAt) throw new Error('The measurement date is missing.');
  if (!Object.keys(metrics).length) throw new Error('Add at least one measurement before saving.');

  const now = new Date().toISOString();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    measuredAt: measuredAt.toISOString(),
    source: state.source || 'manual',
    sourceType: state.sourceType || null,
    extractionMethod: state.extractionMethod || null,
    playerId: state.playerId || null,
    language: state.language || null,
    reportUrl: state.reportUrl || null,
    note: state.notes || state.note || '',
    confidence: state.confidence,
    raw: state.raw,
    report: applyReportEdits(state.report, reportEdits || {}),
    metrics
  };
}

export async function persistReading(reading) {
  const { reading: stored, outcome } = await addReading(reading);

  if (outcome === 'kept') {
    // The same report is already on the device carrying more than this extraction found,
    // so the stored copy was left alone. Saying which happened is the difference between
    // a silent no-op and a save the reader can trust.
    toast('This report is already saved in more detail', 'error');
  } else {
    toast(outcome === 'updated' ? 'Reading updated' : 'Reading saved');
  }

  Route.go('dashboard');
  if (Settings.get().mirror && Auth.isConfigured()) mirrorSync().catch(() => {});
  return stored;
}

/** Saves trusted provider data without opening the human review screen. */
export async function saveReadingDirect(state) {
  return persistReading(buildReading(state, Object.assign({}, state.metrics || {})));
}
