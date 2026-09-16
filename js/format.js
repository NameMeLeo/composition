/* Composition — dates, numbers and unit-aware measurement formatting. */

import { METRICS, LB_PER_KG } from './metrics.js';
import { Settings } from './settings.js';

const MASS_METRICS = ['weight', 'muscleMass', 'fatFreeMass', 'boneMass'];

export function isMassMetric(key) { return MASS_METRICS.indexOf(key) !== -1; }

export function toDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value, opts) {
  const d = toDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function fmtTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d);
}

export function fmtDateTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(d);
}

export function relDays(value) {
  const d = toDate(value);
  if (!d) return '';
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  const months = Math.round(days / 30);
  return months === 1 ? 'a month ago' : months + ' months ago';
}

export function massValue(kg, digits) {
  const unit = Settings.get().massUnit;
  const value = unit === 'lb' ? kg * LB_PER_KG : kg;
  return { value: value.toFixed(digits), unit };
}

/** Splits a raw metric value into the text and unit a view should show. */
export function metricDisplay(key, raw) {
  if (raw == null || raw === '' || isNaN(Number(raw))) return { text: '—', unit: '' };
  const meta = METRICS[key];
  if (!meta) return { text: String(raw), unit: '' };
  if (isMassMetric(key)) {
    const m = massValue(Number(raw), meta.digits);
    return { text: m.value, unit: m.unit };
  }
  return { text: Number(raw).toFixed(meta.digits), unit: meta.unit };
}

export function metricText(key, raw) {
  const d = metricDisplay(key, raw);
  return d.unit ? d.text + ' ' + d.unit : d.text;
}

/** A y-axis label formatter that respects the chosen mass unit. */
export function axisFormat(key) {
  const meta = METRICS[key];
  if (!meta) return (v) => String(v);
  if (isMassMetric(key)) return (v) => massValue(v, meta.digits).value;
  return (v) => v.toFixed(meta.digits);
}

/** Reads a number out of free text, tolerating a decimal comma and stray units. */
export function parseNumber(input) {
  if (input == null) return null;
  const cleaned = String(input).replace(',', '.').replace(/[^\d.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}
