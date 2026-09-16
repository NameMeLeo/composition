/* Composition — the metric catalogue and the report vocabulary it is read from.
   Nothing here depends on any other module. */

/* `min` and `max` are the plausible range for a single measurement, used to
   reject OCR misreads before they reach the database. `better` drives the
   colour of a change chip: 'up' or 'down', or null when direction is neutral. */
export const METRICS = {
  weight:         { label: 'Weight',          unit: 'kg',   digits: 1, group: 'composition', accent: 'var(--c-primary)', better: null,   min: 20,  max: 400 },
  bodyFat:        { label: 'Body fat',        unit: '%',    digits: 1, group: 'composition', accent: 'var(--c-amber)',   better: 'down', min: 2,   max: 70 },
  muscleMass:     { label: 'Muscle mass',     unit: 'kg',   digits: 1, group: 'composition', accent: 'var(--c-green)',   better: 'up',   min: 1,   max: 200 },
  fatFreeMass:    { label: 'Fat-free mass',   unit: 'kg',   digits: 1, group: 'composition', accent: 'var(--c-teal)',    better: null,   min: 1,   max: 200 },
  bodyWater:      { label: 'Body water',      unit: '%',    digits: 1, group: 'composition', accent: 'var(--c-blue)',    better: 'up',   min: 5,   max: 80 },
  boneMass:       { label: 'Bone mass',       unit: 'kg',   digits: 2, group: 'composition', accent: 'var(--c-slate)',   better: null,   min: 0.5, max: 10 },
  visceralFat:    { label: 'Visceral fat',    unit: '',     digits: 0, group: 'risk',        accent: 'var(--c-red)',     better: 'down', min: 1,   max: 60 },
  bmi:            { label: 'BMI',             unit: '',     digits: 1, group: 'risk',        accent: 'var(--c-violet)',  better: null,   min: 5,   max: 90 },
  bmr:            { label: 'BMR',             unit: 'kcal', digits: 0, group: 'energy',      accent: 'var(--c-orange)',  better: null,   min: 400, max: 6000 },
  metabolicAge:   { label: 'Metabolic age',   unit: 'yrs',  digits: 0, group: 'energy',      accent: 'var(--c-teal)',    better: 'down', min: 5,   max: 120 },
  muscleQuality:  { label: 'Muscle quality',  unit: '',     digits: 0, group: 'performance', accent: 'var(--c-green)',   better: 'up',   min: 0,   max: 200 },
  physiqueRating: { label: 'Physique rating', unit: '',     digits: 0, group: 'performance', accent: 'var(--c-primary)', better: null,   min: 1,   max: 9 }
};

export const METRIC_ORDER = Object.keys(METRICS);

export const LB_PER_KG = 2.2046226218;

export const RANGES = [
  { id: '7d',  label: '7D',  days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
  { id: '1y',  label: '1Y',  days: 365 },
  { id: 'all', label: 'All', days: null }
];

export const SOURCE_LABEL = {
  qr: 'QR scan',
  link: 'Report link',
  file: 'Shared file',
  share: 'Shared file',
  manual: 'Entered by hand'
};

export const REPORT_SECTION_LABELS = {
  metadata: 'Report metadata',
  user_profile: 'Subject profile',
  key_indicators: 'Key indicators',
  body_composition: 'Body composition',
  segmental_analysis: 'Segmental analysis'
};

export const REPORT_FIELD_LABELS = {
  test_date: 'Test date', facility_name: 'Facility', serial_number: 'Serial number', device_brand: 'Device brand',
  age: 'Age', gender: 'Gender', height_cm: 'Height', weight_kg: 'Weight',
  bmi: 'BMI', metabolic_age: 'Metabolic age', visceral_fat_rating: 'Visceral fat rating',
  visceral_fat_status: 'Visceral fat status', sarcopenic_index_smi: 'Sarcopenic index (SMI)',
  skeletal_muscle_mass_kg: 'Skeletal muscle mass (SMM)', physique_rating: 'Physique rating',
  physique_rating_score: 'Physique rating score', muscle_quality_score: 'Muscle quality',
  fat_percentage: 'Body fat', fat_mass_kg: 'Fat mass', muscle_mass_kg: 'Muscle mass',
  fat_free_mass_kg: 'Fat-free mass (FFM)', bone_mass_kg: 'Bone mass', protein_mass_kg: 'Protein mass',
  total_body_water_kg: 'Total body water (TBW)', total_body_water_percent: 'Total body water',
  intracellular_water_kg: 'Intracellular water (ICW)', extracellular_water_kg: 'Extracellular water (ECW)',
  ecw_tbw_ratio_percent: 'ECW/TBW', bmr_kcal: 'BMR', bmr_kj: 'BMR',
  muscle_mass: 'Muscle mass', fat_mass: 'Fat mass', trunk_kg: 'Trunk',
  left_arm_kg: 'Left arm', right_arm_kg: 'Right arm', left_leg_kg: 'Left leg', right_leg_kg: 'Right leg'
};

export const REPORT_FIELD_UNITS = {
  age: 'yrs', height_cm: 'cm', weight_kg: 'kg', sarcopenic_index_smi: 'kg/m2',
  skeletal_muscle_mass_kg: 'kg', fat_percentage: '%', fat_mass_kg: 'kg', muscle_mass_kg: 'kg',
  fat_free_mass_kg: 'kg', bone_mass_kg: 'kg', protein_mass_kg: 'kg', total_body_water_kg: 'kg',
  total_body_water_percent: '%', intracellular_water_kg: 'kg', extracellular_water_kg: 'kg',
  ecw_tbw_ratio_percent: '%', bmr_kcal: 'kcal', bmr_kj: 'kJ',
  trunk_kg: 'kg', left_arm_kg: 'kg', right_arm_kg: 'kg', left_leg_kg: 'kg', right_leg_kg: 'kg'
};
