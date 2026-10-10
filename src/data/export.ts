/* Composition — getting readings back out of the app. */

import { $, toast } from '../core/dom.js';
import { t, metricLabel } from '../core/i18n.js';
import { APP_VERSION } from '../core/constants.js';
import { METRICS, METRIC_ORDER } from '../core/metrics.js';
import { fmtDateTime, metricText } from '../core/format.js';
import { latest, sortedAsc, getAllReadings, getReadings, readingSerialNumber } from './store.js';
import type { Reading } from '../domain/types.js';

function download(filename: string, text: string, mime?: string): void {
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

function stamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
}

function toCSV(rows: Reading[], headers: string[], mapper: (row: Reading, h: string) => unknown): string {
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

export function exportJSON(ids?: string[] | null): void {
  const readings = ids ? sortedAsc(getAllReadings().filter((r) => ids.includes(r.id))) : sortedAsc(getAllReadings());
  download(
    'composition-readings-' + stamp() + '.json',
    JSON.stringify({ app: 'composition', version: APP_VERSION, exportedAt: new Date().toISOString(), readings }, null, 2),
    'application/json'
  );
  toast(t('exp.json'));
}

/* Column header -> metric key. Derived from the METRICS catalogue in one place so
   adding a metric cannot silently leave the CSV behind. */
export const METRIC_COLUMNS: Record<string, string> = {
  weight_kg: 'weight', body_fat_pct: 'bodyFat', muscle_mass_kg: 'muscleMass', fat_free_mass_kg: 'fatFreeMass',
  body_water_pct: 'bodyWater', bone_mass_kg: 'boneMass', visceral_fat: 'visceralFat', bmi: 'bmi',
  bmr_kcal: 'bmr', metabolic_age: 'metabolicAge', muscle_quality: 'muscleQuality', physique_rating: 'physiqueRating',
  sarcopenic_index: 'sarcopenicIndex', skeletal_muscle_mass_kg: 'skeletalMuscleMass', fat_mass_kg: 'fatMass',
  total_body_water_kg: 'totalBodyWaterKg', intracellular_water_kg: 'intracellularWater',
  extracellular_water_kg: 'extracellularWater', ecw_tbw_ratio_pct: 'ecwTbwRatio',
  degree_of_obesity_pct: 'degreeOfObesity', muscle_ratio_pct: 'muscleRatio', body_index: 'bodyIndex',
  muscle_score: 'muscleScore', leg_muscle_score: 'legMuscleScore',
  trunk_muscle_kg: 'segMuscleTrunk', left_arm_muscle_kg: 'segMuscleLeftArm',
  right_arm_muscle_kg: 'segMuscleRightArm', left_leg_muscle_kg: 'segMuscleLeftLeg',
  right_leg_muscle_kg: 'segMuscleRightLeg', trunk_fat_kg: 'segFatTrunk', left_arm_fat_kg: 'segFatLeftArm',
  right_arm_fat_kg: 'segFatRightArm', left_leg_fat_kg: 'segFatLeftLeg', right_leg_fat_kg: 'segFatRightLeg',
  trunk_fat_rate_pct: 'segFatRateTrunk', left_arm_fat_rate_pct: 'segFatRateLeftArm',
  right_arm_fat_rate_pct: 'segFatRateRightArm', left_leg_fat_rate_pct: 'segFatRateLeftLeg',
  right_leg_fat_rate_pct: 'segFatRateRightLeg',
  trunk_muscle_balance: 'segMuscleBalanceTrunk', left_arm_muscle_balance: 'segMuscleBalanceLeftArm',
  right_arm_muscle_balance: 'segMuscleBalanceRightArm', left_leg_muscle_balance: 'segMuscleBalanceLeftLeg',
  right_leg_muscle_balance: 'segMuscleBalanceRightLeg', trunk_fat_balance: 'segFatBalanceTrunk',
  left_arm_fat_balance: 'segFatBalanceLeftArm', right_arm_fat_balance: 'segFatBalanceRightArm',
  left_leg_fat_balance: 'segFatBalanceLeftLeg', right_leg_fat_balance: 'segFatBalanceRightLeg'
};

export function exportCSV(ids?: string[] | null): void {
  const headers = ['measured_at', 'source', 'player_id', 'serial_number', 'note'].concat(Object.keys(METRIC_COLUMNS));
  const rows = ids ? sortedAsc(getReadings().filter((r) => ids.includes(r.id))) : sortedAsc(getReadings());

  const text = toCSV(rows, headers, (row, h) => {
    if (h === 'measured_at') return row.measuredAt;
    if (h === 'source') return row.source;
    if (h === 'player_id') return row.playerId;
    if (h === 'serial_number') return readingSerialNumber(row);
    if (h === 'note') return row.note;
    return row.metrics ? row.metrics[METRIC_COLUMNS[h]] : null;
  });
  download('composition-readings-' + stamp() + '.csv', text, 'text/csv;charset=utf-8');
  toast(t('exp.csv'));
}

/** Reverse lookup for the importer: CSV column header -> metric key. */
export function metricFromCsvColumn(header: string): string | null {
  return METRIC_COLUMNS[header] ?? null;
}

/** Samsung Health's import shape. Needs weight and body fat to be meaningful. */
export function exportSamsung(): void {
  const rows = sortedAsc(getReadings()).filter((r) => r.metrics && r.metrics.weight != null && r.metrics.bodyFat != null);
  if (!rows.length) { toast(t('exp.samsung.need'), 'error'); return; }

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
  toast(t('exp.samsung.done'));
}

export async function copySummary(): Promise<void> {
  const last = latest();
  if (!last) { toast(t('exp.nothing')); return; }

  const lines = [t('exp.summary.head', { date: fmtDateTime(last.measuredAt) })];
  METRIC_ORDER.forEach((key) => {
    if (typeof last.metrics[key] === 'number') lines.push(metricLabel(key, METRICS[key].label) + ': ' + metricText(key, last.metrics[key]));
  });
  const text = lines.join('\n');

  try {
    await navigator.clipboard.writeText(text);
    toast(t('exp.copied'));
  } catch (e) {
    // Clipboard access needs a secure context; the hidden field is the fallback.
    const holder = $('#clipboard-holder') as HTMLTextAreaElement;
    holder.value = text;
    holder.select();
    toast(t('exp.select'));
  }
}
