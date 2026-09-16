/* Composition — the metric catalogue and the report vocabulary it is read from.
   Nothing here depends on any other module. */

/* `min` and `max` are the plausible range for a single measurement, used to
   reject OCR misreads before they reach the database. `better` drives the
   colour of a change chip: 'up' or 'down', or null when direction is neutral. */
export const METRICS = {
  weight:         { label: 'Weight',          unit: 'kg',   digits: 1, group: 'composition', accent: 'var(--c-primary)', better: null,   min: 20,  max: 400 },
  bodyFat:        { label: 'Body fat',        unit: '%',    digits: 1, group: 'fat',         accent: 'var(--c-amber)',   better: 'down', min: 2,   max: 70 },
  muscleMass:     { label: 'Muscle mass',     unit: 'kg',   digits: 1, group: 'muscle',      accent: 'var(--c-green)',   better: 'up',   min: 1,   max: 200 },
  fatFreeMass:    { label: 'Fat-free mass',   unit: 'kg',   digits: 1, group: 'composition', accent: 'var(--c-teal)',    better: null,   min: 1,   max: 200 },
  bodyWater:      { label: 'Body water',      unit: '%',    digits: 1, group: 'water',       accent: 'var(--c-blue)',    better: 'up',   min: 5,   max: 80 },
  boneMass:       { label: 'Bone mass',       unit: 'kg',   digits: 2, group: 'composition', accent: 'var(--c-slate)',   better: null,   min: 0.5, max: 10 },
  visceralFat:    { label: 'Visceral fat',    unit: '',     digits: 0, group: 'risk',        accent: 'var(--c-red)',     better: 'down', min: 1,   max: 60 },
  bmi:            { label: 'BMI',             unit: '',     digits: 1, group: 'risk',        accent: 'var(--c-violet)',  better: null,   min: 5,   max: 90 },
  bmr:            { label: 'BMR',             unit: 'kcal', digits: 0, group: 'energy',      accent: 'var(--c-orange)',  better: null,   min: 400, max: 6000 },
  metabolicAge:   { label: 'Metabolic age',   unit: 'yrs',  digits: 0, group: 'energy',      accent: 'var(--c-teal)',    better: 'down', min: 5,   max: 120 },
  muscleQuality:  { label: 'Muscle quality',  unit: '',     digits: 0, group: 'muscle',      accent: 'var(--c-green)',   better: 'up',   min: 0,   max: 200 },
  physiqueRating: { label: 'Physique rating', unit: '',     digits: 0, group: 'composition', accent: 'var(--c-primary)', better: null,   min: 1,   max: 9 },
  sarcopenicIndex:   { label: 'Sarcopenic index', unit: 'kg/m2', digits: 1, group: 'muscle',      accent: 'var(--c-green)',  better: 'up',   min: 0,   max: 20 },
  skeletalMuscleMass:{ label: 'Skeletal muscle', unit: 'kg',    digits: 1, group: 'muscle',      accent: 'var(--c-green)',  better: 'up',   min: 1,   max: 200 },
  fatMass:           { label: 'Fat mass',        unit: 'kg',    digits: 1, group: 'fat',         accent: 'var(--c-amber)',  better: 'down', min: 0,   max: 200 },
  totalBodyWaterKg:  { label: 'Total body water', unit: 'kg',   digits: 1, group: 'water',       accent: 'var(--c-blue)',   better: 'up',   min: 0,   max: 200 },
  intracellularWater:{ label: 'Intracellular water', unit: 'kg', digits: 1, group: 'water',      accent: 'var(--c-blue)',   better: 'up',   min: 0,   max: 150 },
  extracellularWater:{ label: 'Extracellular water', unit: 'kg', digits: 1, group: 'water',      accent: 'var(--c-blue)',   better: null,   min: 0,   max: 100 },
  ecwTbwRatio:       { label: 'ECW/TBW ratio',   unit: '%',     digits: 1, group: 'water',       accent: 'var(--c-blue)',   better: null,   min: 0,   max: 100 },
  degreeOfObesity:   { label: 'Degree of obesity', unit: '%',   digits: 1, group: 'risk',        accent: 'var(--c-red)',    better: 'down', min: -100, max: 300 },
  muscleRatio:       { label: 'Muscle ratio',    unit: '%',     digits: 1, group: 'muscle',      accent: 'var(--c-green)',  better: 'up',   min: 0,   max: 100 },
  bodyIndex:         { label: 'Body index',      unit: '',      digits: 0, group: 'risk',        accent: 'var(--c-violet)', better: null,   min: -100, max: 200 },
  muscleScore:       { label: 'Muscle score',    unit: '',      digits: 0, group: 'muscle',      accent: 'var(--c-green)',  better: null,   min: -100, max: 200 },
  legMuscleScore:    { label: 'Leg muscle score', unit: '',     digits: 0, group: 'muscle',      accent: 'var(--c-green)',  better: null,   min: -100, max: 200 },

  /* Segmental breakdown. The report splits the body into trunk, both arms and both
     legs, and gives each part its own muscle mass, fat mass and fat percentage.
     These arrive nested in the report, so they need promoting to first-class
     metrics before they can be charted like anything else. */
  segMuscleTrunk:     { label: 'Trunk muscle',      unit: 'kg', digits: 1, group: 'muscle',    accent: 'var(--c-green)',  better: 'up',   min: 1,   max: 120 },
  segMuscleLeftArm:   { label: 'Left arm muscle',   unit: 'kg', digits: 1, group: 'muscle',    accent: 'var(--c-green)',  better: 'up',   min: 0.1, max: 30 },
  segMuscleRightArm:  { label: 'Right arm muscle',  unit: 'kg', digits: 1, group: 'muscle',    accent: 'var(--c-green)',  better: 'up',   min: 0.1, max: 30 },
  segMuscleLeftLeg:   { label: 'Left leg muscle',   unit: 'kg', digits: 1, group: 'muscle',    accent: 'var(--c-green)',  better: 'up',   min: 0.5, max: 80 },
  segMuscleRightLeg:  { label: 'Right leg muscle',  unit: 'kg', digits: 1, group: 'muscle',    accent: 'var(--c-green)',  better: 'up',   min: 0.5, max: 80 },
  segFatTrunk:        { label: 'Trunk fat',         unit: 'kg', digits: 2, group: 'fat',       accent: 'var(--c-amber)',  better: 'down', min: 0.1, max: 120 },
  segFatLeftArm:      { label: 'Left arm fat',      unit: 'kg', digits: 2, group: 'fat',       accent: 'var(--c-amber)',  better: 'down', min: 0.1, max: 30 },
  segFatRightArm:     { label: 'Right arm fat',     unit: 'kg', digits: 2, group: 'fat',       accent: 'var(--c-amber)',  better: 'down', min: 0.1, max: 30 },
  segFatLeftLeg:      { label: 'Left leg fat',      unit: 'kg', digits: 2, group: 'fat',       accent: 'var(--c-amber)',  better: 'down', min: 0.1, max: 50 },
  segFatRightLeg:     { label: 'Right leg fat',     unit: 'kg', digits: 2, group: 'fat',       accent: 'var(--c-amber)',  better: 'down', min: 0.1, max: 50 },
  segFatRateTrunk:    { label: 'Trunk fat rate',    unit: '%',  digits: 1, group: 'fat',       accent: 'var(--c-violet)', better: 'down', min: 2,   max: 70 },
  segFatRateLeftArm:  { label: 'Left arm fat rate', unit: '%',  digits: 1, group: 'fat',       accent: 'var(--c-violet)', better: 'down', min: 2,   max: 70 },
  segFatRateRightArm: { label: 'Right arm fat rate', unit: '%', digits: 1, group: 'fat',       accent: 'var(--c-violet)', better: 'down', min: 2,   max: 70 },
  segFatRateLeftLeg:  { label: 'Left leg fat rate', unit: '%',  digits: 1, group: 'fat',       accent: 'var(--c-violet)', better: 'down', min: 2,   max: 70 },
  segFatRateRightLeg: { label: 'Right leg fat rate', unit: '%', digits: 1, group: 'fat',       accent: 'var(--c-violet)', better: 'down', min: 2,   max: 70 },
  segMuscleBalanceTrunk:     { label: 'Trunk muscle balance', unit: '', digits: 0, group: 'muscle', accent: 'var(--c-green)',  better: null, min: -10, max: 10 },
  segMuscleBalanceLeftArm:   { label: 'Left arm muscle balance', unit: '', digits: 0, group: 'muscle', accent: 'var(--c-green)', better: null, min: -10, max: 10 },
  segMuscleBalanceRightArm:  { label: 'Right arm muscle balance', unit: '', digits: 0, group: 'muscle', accent: 'var(--c-green)', better: null, min: -10, max: 10 },
  segMuscleBalanceLeftLeg:   { label: 'Left leg muscle balance', unit: '', digits: 0, group: 'muscle', accent: 'var(--c-green)', better: null, min: -10, max: 10 },
  segMuscleBalanceRightLeg:  { label: 'Right leg muscle balance', unit: '', digits: 0, group: 'muscle', accent: 'var(--c-green)', better: null, min: -10, max: 10 },
  segFatBalanceTrunk:        { label: 'Trunk fat balance', unit: '', digits: 0, group: 'fat', accent: 'var(--c-amber)', better: null, min: -10, max: 10 },
  segFatBalanceLeftArm:      { label: 'Left arm fat balance', unit: '', digits: 0, group: 'fat', accent: 'var(--c-amber)', better: null, min: -10, max: 10 },
  segFatBalanceRightArm:     { label: 'Right arm fat balance', unit: '', digits: 0, group: 'fat', accent: 'var(--c-amber)', better: null, min: -10, max: 10 },
  segFatBalanceLeftLeg:      { label: 'Left leg fat balance', unit: '', digits: 0, group: 'fat', accent: 'var(--c-amber)', better: null, min: -10, max: 10 },
  segFatBalanceRightLeg:     { label: 'Right leg fat balance', unit: '', digits: 0, group: 'fat', accent: 'var(--c-amber)', better: null, min: -10, max: 10 }
};

export const METRIC_ORDER = Object.keys(METRICS);

/* The tabs on the trends page, in the order they are shown. A metric joins a tab
   by naming it in its `group`, and appears inside that tab in `METRIC_ORDER`, which
   is the order of the catalogue above. A tab whose metrics all lack data is dropped
   by the trends page rather than rendered empty. */
export const METRIC_GROUPS = [
  { id: 'composition', label: 'Composition' },
  { id: 'muscle',      label: 'Muscle' },
  { id: 'fat',         label: 'Fat' },
  { id: 'water',       label: 'Water' },
  { id: 'energy',      label: 'Energy' },
  { id: 'risk',        label: 'Risk' }
];

export const metricsInGroup = (groupId) => METRIC_ORDER.filter((key) => METRICS[key].group === groupId);

/* Where each segmental metric lives inside a stored report. Readings captured before
   these were metrics have the values under `report` only, so this table lets them be
   promoted without asking anyone to re-upload a report. */
export const SEGMENTAL_REPORT_PATHS = [
  ['segMuscleTrunk', 'muscle_mass', 'trunk_kg'],
  ['segMuscleLeftArm', 'muscle_mass', 'left_arm_kg'],
  ['segMuscleRightArm', 'muscle_mass', 'right_arm_kg'],
  ['segMuscleLeftLeg', 'muscle_mass', 'left_leg_kg'],
  ['segMuscleRightLeg', 'muscle_mass', 'right_leg_kg'],
  ['segFatTrunk', 'fat_mass', 'trunk_kg'],
  ['segFatLeftArm', 'fat_mass', 'left_arm_kg'],
  ['segFatRightArm', 'fat_mass', 'right_arm_kg'],
  ['segFatLeftLeg', 'fat_mass', 'left_leg_kg'],
  ['segFatRightLeg', 'fat_mass', 'right_leg_kg'],
  ['segFatRateTrunk', 'fat_percentage', 'trunk_percent'],
  ['segFatRateLeftArm', 'fat_percentage', 'left_arm_percent'],
  ['segFatRateRightArm', 'fat_percentage', 'right_arm_percent'],
  ['segFatRateLeftLeg', 'fat_percentage', 'left_leg_percent'],
  ['segFatRateRightLeg', 'fat_percentage', 'right_leg_percent'],
  ['segMuscleBalanceTrunk', 'muscle_balance_scores', 'trunk'],
  ['segMuscleBalanceLeftArm', 'muscle_balance_scores', 'left_arm'],
  ['segMuscleBalanceRightArm', 'muscle_balance_scores', 'right_arm'],
  ['segMuscleBalanceLeftLeg', 'muscle_balance_scores', 'left_leg'],
  ['segMuscleBalanceRightLeg', 'muscle_balance_scores', 'right_leg'],
  ['segFatBalanceTrunk', 'fat_balance_scores', 'trunk'],
  ['segFatBalanceLeftArm', 'fat_balance_scores', 'left_arm'],
  ['segFatBalanceRightArm', 'fat_balance_scores', 'right_arm'],
  ['segFatBalanceLeftLeg', 'fat_balance_scores', 'left_leg'],
  ['segFatBalanceRightLeg', 'fat_balance_scores', 'right_leg']
];

/* Non-segmental report leaves that can be promoted to metrics for readings saved by
   older builds before these fields were added to the catalogue. */
export const REPORT_METRIC_PATHS = [
  ['weight', 'user_profile', 'weight_kg'],
  ['bodyFat', 'body_composition', 'fat_percentage'],
  ['muscleMass', 'body_composition', 'muscle_mass_kg'],
  ['fatFreeMass', 'body_composition', 'fat_free_mass_kg'],
  ['bodyWater', 'body_composition', 'total_body_water_percent'],
  ['boneMass', 'body_composition', 'bone_mass_kg'],
  ['bmi', 'key_indicators', 'bmi'],
  ['visceralFat', 'key_indicators', 'visceral_fat_rating'],
  ['bmr', 'body_composition', 'bmr_kcal'],
  ['metabolicAge', 'key_indicators', 'metabolic_age'],
  ['muscleQuality', 'key_indicators', 'muscle_quality_score'],
  ['physiqueRating', 'key_indicators', 'physique_rating_score'],
  ['sarcopenicIndex', 'key_indicators', 'sarcopenic_index_smi'],
  ['skeletalMuscleMass', 'key_indicators', 'skeletal_muscle_mass_kg'],
  ['bodyIndex', 'key_indicators', 'body_index'],
  ['muscleScore', 'key_indicators', 'muscle_score'],
  ['fatMass', 'body_composition', 'fat_mass_kg'],
  ['totalBodyWaterKg', 'body_composition', 'total_body_water_kg'],
  ['intracellularWater', 'body_composition', 'intracellular_water_kg'],
  ['extracellularWater', 'body_composition', 'extracellular_water_kg'],
  ['ecwTbwRatio', 'body_composition', 'ecw_tbw_ratio_percent'],
  ['degreeOfObesity', 'body_composition', 'degree_of_obesity_percent'],
  ['muscleRatio', 'body_composition', 'muscle_ratio_percent'],
  ['legMuscleScore', 'assessments', 'leg_muscle_score']
];

/* The printed reference range that belongs beside each measured metric, so a value
   can be read against the range the report itself printed for it. Only the ranges a
   Tanita report actually carries appear here; everything else in `reference_ranges`
   is shown as a plain field in the reading's full report. */
export const METRIC_REFERENCE_RANGES = [
  ['weight',      'reference_ranges.weight_kg'],
  ['bodyFat',     'reference_ranges.body_fat_percent'],
  ['fatMass',     'reference_ranges.fat_mass_kg'],
  ['fatFreeMass', 'reference_ranges.fat_free_mass_kg'],
  ['muscleMass',  'reference_ranges.muscle_mass_kg']
];

export const LB_PER_KG = 2.2046226218;

/* The time windows on the trends page. A window never draws more points than it has
   room to label: seven daily points, four weekly averages, twelve monthly averages,
   and one point for every calendar year on record. Each reading inside a bucket is
   averaged into the single point that bucket contributes. */
export const RANGES = [
  { id: 'day',   label: 'Days',    bucket: 'day',   span: 7  },
  { id: 'week',  label: 'Weeks',   bucket: 'week',  span: 4  },
  { id: 'month', label: 'Months', bucket: 'month', span: 12 },
  { id: 'year',  label: 'Years', bucket: 'year',  span: null }
];

/* Falls back to the widest window, so an id left over from an older build still
   renders something rather than throwing. */
export const rangeById = (rangeId) =>
  RANGES.find((range) => range.id === rangeId) || RANGES[RANGES.length - 1];

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
  reference_ranges: 'Reference ranges',
  assessments: 'Assessments',
  segmental_analysis: 'Segmental analysis'
};

/* The order a whole report is shown in, which is the order it is read in: provenance
   first, then the subject, then measurements, then the ranges they are judged
   against, then the instrument's own classifications and the segmental breakdown. */
export const REPORT_SECTION_ORDER = Object.keys(REPORT_SECTION_LABELS);

export const REPORT_FIELD_LABELS = {
  test_date: 'Test date', facility_name: 'Facility', serial_number: 'Serial number', device_brand: 'Device brand',
  age: 'Age', gender: 'Gender', gender_code: 'Gender code', height_cm: 'Height', weight_kg: 'Weight', clothing_weight_kg: 'Clothing weight',
  bmi: 'BMI', metabolic_age: 'Metabolic age', visceral_fat_rating: 'Visceral fat rating',
  visceral_fat_status: 'Visceral fat status', sarcopenic_index_smi: 'Sarcopenic index (SMI)',
  skeletal_muscle_mass_kg: 'Skeletal muscle mass (SMM)', physique_rating: 'Physique rating',
  physique_rating_score: 'Physique rating score', muscle_quality_score: 'Muscle quality', body_type_code: 'Body type code',
  muscle_score: 'Muscle score', body_index: 'Body index',
  fat_percentage: 'Body fat', fat_mass_kg: 'Fat mass', muscle_mass_kg: 'Muscle mass',
  fat_free_mass_kg: 'Fat-free mass (FFM)', bone_mass_kg: 'Bone mass', protein_mass_kg: 'Protein mass',
  total_body_water_kg: 'Total body water (TBW)', total_body_water_percent: 'Total body water',
  intracellular_water_kg: 'Intracellular water (ICW)', extracellular_water_kg: 'Extracellular water (ECW)',
  ecw_tbw_ratio_percent: 'ECW/TBW', degree_of_obesity_percent: 'Degree of obesity', muscle_ratio_percent: 'Muscle ratio',
  bmr_kcal: 'BMR', bmr_kj: 'BMR',
  body_fat_percent: 'Body fat reference',
  standard: 'Standard', lower: 'Lower reference', upper: 'Upper reference',
  water_balance_block: 'Water balance block', bmr_block: 'BMR block', visceral_fat_block: 'Visceral fat block',
  leg_muscle_score: 'Leg muscle score', lower_body_muscle_balance: 'Lower-body muscle balance', upper_body_muscle_balance: 'Upper-body muscle balance',
  muscle_balance_scores: 'Muscle balance scores', fat_balance_scores: 'Fat balance scores',
  trunk: 'Trunk', left_arm: 'Left arm', right_arm: 'Right arm', left_leg: 'Left leg', right_leg: 'Right leg',
  muscle_mass: 'Muscle mass', fat_mass: 'Fat mass', fat_percentage: 'Fat percentage',
  trunk_kg: 'Trunk', left_arm_kg: 'Left arm', right_arm_kg: 'Right arm', left_leg_kg: 'Left leg', right_leg_kg: 'Right leg',
  trunk_percent: 'Trunk', left_arm_percent: 'Left arm', right_arm_percent: 'Right arm',
  left_leg_percent: 'Left leg', right_leg_percent: 'Right leg'
};

export const REPORT_FIELD_UNITS = {
  age: 'yrs', height_cm: 'cm', weight_kg: 'kg', clothing_weight_kg: 'kg', sarcopenic_index_smi: 'kg/m2',
  skeletal_muscle_mass_kg: 'kg', fat_percentage: '%', fat_mass_kg: 'kg', muscle_mass_kg: 'kg',
  fat_free_mass_kg: 'kg', bone_mass_kg: 'kg', protein_mass_kg: 'kg', total_body_water_kg: 'kg',
  total_body_water_percent: '%', intracellular_water_kg: 'kg', extracellular_water_kg: 'kg',
  ecw_tbw_ratio_percent: '%', degree_of_obesity_percent: '%', muscle_ratio_percent: '%', bmr_kcal: 'kcal', bmr_kj: 'kJ',
  trunk_kg: 'kg', left_arm_kg: 'kg', right_arm_kg: 'kg', left_leg_kg: 'kg', right_leg_kg: 'kg',
  trunk_percent: '%', left_arm_percent: '%', right_arm_percent: '%',
  left_leg_percent: '%', right_leg_percent: '%',
  'reference_ranges.body_fat_percent.lower': '%',
  'reference_ranges.body_fat_percent.upper': '%',
  'reference_ranges.body_fat_percent.standard': '%',
  'reference_ranges.fat_mass_kg.lower': 'kg',
  'reference_ranges.fat_mass_kg.upper': 'kg',
  'reference_ranges.fat_free_mass_kg.lower': 'kg',
  'reference_ranges.fat_free_mass_kg.upper': 'kg',
  'reference_ranges.fat_free_mass_kg.standard': 'kg',
  'reference_ranges.weight_kg.lower': 'kg',
  'reference_ranges.weight_kg.upper': 'kg',
  'reference_ranges.weight_kg.standard': 'kg',
  'reference_ranges.muscle_mass_kg.lower': 'kg',
  'reference_ranges.muscle_mass_kg.upper': 'kg',
  'reference_ranges.muscle_mass_kg.standard': 'kg'
};
