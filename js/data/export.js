/* Composition — getting readings back out of the app. */

import { $, toast } from '../core/dom.js';
import { APP_VERSION } from '../core/constants.js';
import { METRICS, METRIC_ORDER } from '../core/metrics.js';
import { fmtDateTime, metricText } from '../core/format.js';
import { latest, sortedAsc, getAllReadings, getReadings, readingSerialNumber } from './store.js';

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
    JSON.stringify({ app: 'composition', version: APP_VERSION, exportedAt: new Date().toISOString(), readings: sortedAsc(getAllReadings()) }, null, 2),
    'application/json'
  );
  toast('JSON exported');
}

export function exportCSV() {
  const headers = ['measured_at', 'source', 'player_id', 'serial_number', 'note',
    'weight_kg', 'body_fat_pct', 'muscle_mass_kg', 'fat_free_mass_kg', 'body_water_pct',
    'bone_mass_kg', 'visceral_fat', 'bmi', 'bmr_kcal', 'metabolic_age', 'muscle_quality', 'physique_rating',
    'sarcopenic_index', 'skeletal_muscle_mass_kg', 'fat_mass_kg', 'total_body_water_kg',
    'intracellular_water_kg', 'extracellular_water_kg', 'ecw_tbw_ratio_pct', 'degree_of_obesity_pct',
    'muscle_ratio_pct', 'body_index', 'muscle_score', 'leg_muscle_score',
    'trunk_muscle_kg', 'left_arm_muscle_kg', 'right_arm_muscle_kg', 'left_leg_muscle_kg', 'right_leg_muscle_kg',
    'trunk_fat_kg', 'left_arm_fat_kg', 'right_arm_fat_kg', 'left_leg_fat_kg', 'right_leg_fat_kg',
    'trunk_fat_rate_pct', 'left_arm_fat_rate_pct', 'right_arm_fat_rate_pct', 'left_leg_fat_rate_pct', 'right_leg_fat_rate_pct',
    'trunk_muscle_balance', 'left_arm_muscle_balance', 'right_arm_muscle_balance',
    'left_leg_muscle_balance', 'right_leg_muscle_balance', 'trunk_fat_balance',
    'left_arm_fat_balance', 'right_arm_fat_balance', 'left_leg_fat_balance', 'right_leg_fat_balance'];
  const metricColumns = {
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

  const text = toCSV(sortedAsc(getReadings()), headers, (row, h) => {
    if (h === 'measured_at') return row.measuredAt;
    if (h === 'source') return row.source;
    if (h === 'player_id') return row.playerId;
    if (h === 'serial_number') return readingSerialNumber(row);
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
