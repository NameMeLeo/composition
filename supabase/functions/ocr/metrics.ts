/* Composition — flattening a report into the app's metric keys.
   The app charts a flat list of named numbers, while a report is nested by section.
   This is the one place that knows which report field feeds which metric, so both the
   provider path and the OCR path produce an identical `metrics` object for the same
   measurement. */

import type { Report, SegmentalAnalysis, SegmentMass, SegmentPercent, SegmentScore } from './types.ts';

/** Providers and older builds have used several spellings for the same metric. */
const LEGACY_KEY_MAP: Record<string, string> = {
  weight: 'weight',
  body_fat: 'bodyFat',
  muscle_mass: 'muscleMass',
  fat_free_mass: 'fatFreeMass',
  body_water: 'bodyWater',
  bone_mass: 'boneMass',
  visceral_fat: 'visceralFat',
  bmi: 'bmi',
  bmr: 'bmr',
  metabolic_age: 'metabolicAge',
  muscle_quality: 'muscleQuality',
  physique_rating: 'physiqueRating',
  sarcopenic_index_smi: 'sarcopenicIndex',
  skeletal_muscle_mass_kg: 'skeletalMuscleMass',
  fat_mass_kg: 'fatMass',
  total_body_water_kg: 'totalBodyWaterKg',
  intracellular_water_kg: 'intracellularWater',
  extracellular_water_kg: 'extracellularWater',
  ecw_tbw_ratio_percent: 'ecwTbwRatio',
  degree_of_obesity_percent: 'degreeOfObesity',
  muscle_ratio_percent: 'muscleRatio',
  body_index: 'bodyIndex',
  muscle_score: 'muscleScore',
  leg_muscle_score: 'legMuscleScore'
};

/** Guards against NaN, empty strings and numeric strings that are not really numbers. */
export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** A report, plus the flat `metrics` block an older extraction may still carry. */
export type MetricsSource = Partial<Report> & { metrics?: Record<string, unknown> };

export function extractMetrics(parsed: MetricsSource | null | undefined): Record<string, number> {
  const metrics: Record<string, number> = {};
  const setMetric = (key: string, value: unknown) => {
    const number = toFiniteNumber(value);
    if (number !== null) metrics[key] = number;
  };

  const legacy = parsed?.metrics ?? {};
  Object.keys(legacy).forEach((key) => {
    const mapped = LEGACY_KEY_MAP[key];
    if (mapped) setMetric(mapped, legacy[key]);
  });

  const profile = parsed?.user_profile ?? {};
  const indicators = parsed?.key_indicators ?? {};
  const composition = parsed?.body_composition ?? {};

  setMetric('weight', profile.weight_kg);
  setMetric('bodyFat', composition.fat_percentage);
  setMetric('muscleMass', composition.muscle_mass_kg);
  setMetric('fatFreeMass', composition.fat_free_mass_kg);
  setMetric('bodyWater', composition.total_body_water_percent);
  setMetric('boneMass', composition.bone_mass_kg);
  setMetric('visceralFat', indicators.visceral_fat_rating);
  setMetric('bmi', indicators.bmi);
  setMetric('bmr', composition.bmr_kcal);
  setMetric('metabolicAge', indicators.metabolic_age);
  setMetric('muscleQuality', indicators.muscle_quality_score);
  setMetric('physiqueRating', indicators.physique_rating_score ?? indicators.physique_rating);
  setMetric('sarcopenicIndex', indicators.sarcopenic_index_smi);
  setMetric('skeletalMuscleMass', indicators.skeletal_muscle_mass_kg);
  setMetric('bodyIndex', indicators.body_index);
  setMetric('muscleScore', indicators.muscle_score);

  setMetric('fatMass', composition.fat_mass_kg);
  setMetric('totalBodyWaterKg', composition.total_body_water_kg);
  setMetric('intracellularWater', composition.intracellular_water_kg);
  setMetric('extracellularWater', composition.extracellular_water_kg);
  setMetric('ecwTbwRatio', composition.ecw_tbw_ratio_percent);
  setMetric('degreeOfObesity', composition.degree_of_obesity_percent);
  setMetric('muscleRatio', composition.muscle_ratio_percent);

  // The segmental breakdown is the one part of the report that is nested: five body
  // parts, each carrying its own muscle mass, fat mass and fat percentage.
  const segment: SegmentalAnalysis = parsed?.segmental_analysis ?? {};
  const muscle: SegmentMass = segment.muscle_mass ?? {};
  const fat: SegmentMass = segment.fat_mass ?? {};
  const rate: SegmentPercent = segment.fat_percentage ?? {};
  const muscleBalance: SegmentScore = segment.muscle_balance_scores ?? {};
  const fatBalance: SegmentScore = segment.fat_balance_scores ?? {};

  setMetric('segMuscleTrunk', muscle.trunk_kg);
  setMetric('segMuscleLeftArm', muscle.left_arm_kg);
  setMetric('segMuscleRightArm', muscle.right_arm_kg);
  setMetric('segMuscleLeftLeg', muscle.left_leg_kg);
  setMetric('segMuscleRightLeg', muscle.right_leg_kg);
  setMetric('segMuscleBalanceTrunk', muscleBalance.trunk);
  setMetric('segMuscleBalanceLeftArm', muscleBalance.left_arm);
  setMetric('segMuscleBalanceRightArm', muscleBalance.right_arm);
  setMetric('segMuscleBalanceLeftLeg', muscleBalance.left_leg);
  setMetric('segMuscleBalanceRightLeg', muscleBalance.right_leg);

  setMetric('segFatTrunk', fat.trunk_kg);
  setMetric('segFatLeftArm', fat.left_arm_kg);
  setMetric('segFatRightArm', fat.right_arm_kg);
  setMetric('segFatLeftLeg', fat.left_leg_kg);
  setMetric('segFatRightLeg', fat.right_leg_kg);

  setMetric('segFatRateTrunk', rate.trunk_percent);
  setMetric('segFatRateLeftArm', rate.left_arm_percent);
  setMetric('segFatRateRightArm', rate.right_arm_percent);
  setMetric('segFatRateLeftLeg', rate.left_leg_percent);
  setMetric('segFatRateRightLeg', rate.right_leg_percent);
  setMetric('segFatBalanceTrunk', fatBalance.trunk);
  setMetric('segFatBalanceLeftArm', fatBalance.left_arm);
  setMetric('segFatBalanceRightArm', fatBalance.right_arm);
  setMetric('segFatBalanceLeftLeg', fatBalance.left_leg);
  setMetric('segFatBalanceRightLeg', fatBalance.right_leg);

  const assessments = parsed?.assessments ?? {};
  setMetric('legMuscleScore', assessments.leg_muscle_score);

  return metrics;
}
