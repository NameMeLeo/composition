/* Composition — shared report helpers.
   Single home for flattening, labelling and reading back an extracted report.

   Previously `ingest/review.js` (reportLeaves) and `pages/detail.js` (reportRows)
   each carried their own recursive flattener with slightly different shapes.
   Import from here instead of duplicating the walk. */

import {
  REPORT_FIELD_LABELS,
  REPORT_FIELD_UNITS,
  REPORT_METRIC_PATHS,
  SEGMENTAL_REPORT_PATHS
} from '../core/metrics.js';

/** Human label for a snake_case field. Unknown keys are humanised, never raw. */
export function reportFieldLabel(key) {
  if (REPORT_FIELD_LABELS[key]) return REPORT_FIELD_LABELS[key];
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Unit for a dotted report path, falling back to the leaf name. */
export function reportUnit(path) {
  return REPORT_FIELD_UNITS[path] || REPORT_FIELD_UNITS[path.split('.').pop()] || '';
}

/** Plain text for a leaf value (arrays/booleans included). */
export function reportValueText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** Reads a dotted path (e.g. "metadata.serial_number") out of a report. */
export function reportValue(report, path) {
  if (!report || !path) return null;
  return path.split('.').reduce((value, key) => (value == null ? null : value[key]), report);
}

/* Metric key -> dotted report path (e.g. weight -> "user_profile.weight_kg").
   Used to mirror metric edits back onto the report on save. */
export const METRIC_REPORT_PATH_MAP = new Map(
  REPORT_METRIC_PATHS.map(([key, section, field]) => [key, section + '.' + field]).concat(
    SEGMENTAL_REPORT_PATHS.map(([key, part, field]) => [key, 'segmental_analysis.' + part + '.' + field])
  )
);

export const PROMOTED_REPORT_PATHS = new Set(METRIC_REPORT_PATH_MAP.values());

function isProviderPath(path) {
  return path === 'provider_details' || path.indexOf('provider_details.') === 0;
}

/**
 * Flattens one report section into editable leaves.
 * Each leaf keeps its dotted `path`, its nested `group` label, and flags for
 * whether the value is promoted to a metric or is read-only provider metadata.
 */
export function reportLeaves(section, path, group, out) {
  const acc = out || [];
  Object.keys(section || {}).forEach((key) => {
    const item = section[key];
    if (item == null || item === '') return;
    const next = path ? path + '.' + key : key;
    if (typeof item === 'object' && !Array.isArray(item)) {
      const nextGroup = group ? group + ' · ' + reportFieldLabel(key) : reportFieldLabel(key);
      reportLeaves(item, next, nextGroup, acc);
      return;
    }
    const label = reportFieldLabel(key);
    acc.push({
      path: next,
      group,
      label: group ? group + ' · ' + label : label,
      value: item,
      promoted: PROMOTED_REPORT_PATHS.has(next),
      readOnly: isProviderPath(next)
    });
  });
  return acc;
}

/**
 * Every leaf of one report section as label/value rows for read-only display.
 * Same walk as reportLeaves, lighter shape (no promoted/readOnly flags).
 */
export function reportRows(section, prefix, group, out) {
  const acc = out || [];
  Object.keys(section || {}).forEach((key) => {
    const value = section[key];
    if (value == null || value === '') return;
    const path = prefix ? prefix + '.' + key : key;
    const label = reportFieldLabel(key);
    if (typeof value === 'object' && !Array.isArray(value)) {
      reportRows(value, path, group ? group + ' · ' + label : label, acc);
      return;
    }
    acc.push({ label: group ? group + ' · ' + label : label, path, value });
  });
  return acc;
}
