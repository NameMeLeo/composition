/* Composition — getting readings back out of the app. */

import { $, toast } from './dom.js';
import { APP_VERSION } from './constants.js';
import { METRICS, METRIC_ORDER } from './metrics.js';
import { fmtDateTime, metricText } from './format.js';
import { latest, sortedAsc, getReadings } from './store.js';

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
}

function toCSV(rows, headers, mapper) {
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => {
      const v = mapper(row, h);
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(','));
  });
  return lines.join('\n');
}

export function exportJSON() {
  download(
    'composition-readings-' + stamp() + '.json',
    JSON.stringify({ app: 'composition', version: APP_VERSION, exportedAt: new Date().toISOString(), readings: sortedAsc(getReadings()) }, null, 2),
    'application/json'
  );
  toast('JSON exported');
}

export function exportCSV() {
  const headers = ['measured_at', 'source', 'player_id', 'note',
    'weight_kg', 'body_fat_pct', 'muscle_mass_kg', 'fat_free_mass_kg', 'body_water_pct',
    'bone_mass_kg', 'visceral_fat', 'bmi', 'bmr_kcal', 'metabolic_age', 'muscle_quality', 'physique_rating'];
  const metricColumns = {
    weight_kg: 'weight', body_fat_pct: 'bodyFat', muscle_mass_kg: 'muscleMass', fat_free_mass_kg: 'fatFreeMass',
    body_water_pct: 'bodyWater', bone_mass_kg: 'boneMass', visceral_fat: 'visceralFat', bmi: 'bmi',
    bmr_kcal: 'bmr', metabolic_age: 'metabolicAge', muscle_quality: 'muscleQuality', physique_rating: 'physiqueRating'
  };

  const text = toCSV(sortedAsc(getReadings()), headers, (row, h) => {
    if (h === 'measured_at') return row.measuredAt;
    if (h === 'source') return row.source;
    if (h === 'player_id') return row.playerId;
    if (h === 'note') return row.note;
    return row.metrics ? row.metrics[metricColumns[h]] : null;
  });
  download('composition-readings-' + stamp() + '.csv', text, 'text/csv;charset=utf-8');
  toast('CSV exported');
}

/** Samsung Health's import shape. Needs weight and body fat to be meaningful. */
export function exportSamsung() {
  const rows = sortedAsc(getReadings()).filter((r) => r.metrics && r.metrics.weight != null && r.metrics.bodyFat != null);
  if (!rows.length) { toast('Samsung Health import needs weight and body fat', 'error'); return; }

  const headers = ['start_time', 'end_time', 'weight', 'body_fat', 'skeletal_muscle', 'body_water', 'visceral_fat', 'bmi', 'basal_metabolic_rate'];
  const text = toCSV(rows, headers, (row, h) => {
    const m = row.metrics;
    if (h === 'start_time' || h === 'end_time') return row.measuredAt;
    if (h === 'weight') return m.weight;
    if (h === 'body_fat') return m.bodyFat;
    if (h === 'skeletal_muscle') return m.muscleMass;
    if (h === 'body_water') return m.bodyWater;
    if (h === 'visceral_fat') return m.visceralFat;
    if (h === 'bmi') return m.bmi;
    if (h === 'basal_metabolic_rate') return m.bmr;
    return null;
  });
  download('samsung-health-body-composition-' + stamp() + '.csv', text, 'text/csv;charset=utf-8');
  toast('Samsung-shaped CSV exported');
}

export async function copySummary() {
  const last = latest();
  if (!last) { toast('Nothing to summarise yet'); return; }

  const lines = ['Body composition — ' + fmtDateTime(last.measuredAt)];
  METRIC_ORDER.forEach((key) => {
    if (typeof last.metrics[key] === 'number') lines.push(METRICS[key].label + ': ' + metricText(key, last.metrics[key]));
  });
  const text = lines.join('\n');

  try {
    await navigator.clipboard.writeText(text);
    toast('Summary copied');
  } catch (e) {
    // Clipboard access needs a secure context; the hidden field is the fallback.
    const holder = $('#clipboard-holder');
    holder.value = text;
    holder.select();
    toast('Summary selected — copy it from the text field');
  }
}
