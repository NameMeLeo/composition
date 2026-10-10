/* Composition — overlay table for the provider report image.
   Ports the Tanita report page's setData() (js/index.js) into data: every text
   position, block bar, star slot, pentagram, balance icon and leg dot the page
   draws over bg.png, in BG-native pixels (2346x2740). report-image.ts walks this
   table instead of hardcoding coordinates, so a provider redesign touches one file.

   text.jpg (the static explainer below BG) is deliberately not reproduced: every
   overlay y in the source sits inside BG height, so the table is BG-only. */

export type ReportLang = 'en' | 'tc' | 'sc';

export interface TextOp {
  field: string;
  x: number;
  y: number;
  /** English builds shift sm/smm right; tc/sc share the default slot. */
  xEn?: number;
  align?: 'left' | 'center';
  suffix?: string;
}

/** Plain value texts, in draw order. Values come from provider_details.raw. */
export const TEXT_OPS: TextOp[] = [
  { field: 'date', x: 1612, y: 305 },
  { field: 'sm', x: 1440, y: 360, xEn: 1520 },
  { field: 'smm', x: 1420, y: 395, xEn: 1580 },
  { field: 'sn', x: 309, y: 375 },
  { field: 'age', x: 309, y: 455 },
  { field: '__gender', x: 582, y: 455 },
  { field: 'bodyheight', x: 810, y: 455 },
  { field: 'weight', x: 450, y: 640 },
  { field: 'fat_rate', x: 450, y: 690 },
  { field: 'fatkg', x: 450, y: 740 },
  { field: 'nonfatkg', x: 450, y: 790 },
  { field: 'muscle_weight', x: 450, y: 840 },
  { field: 'bmi', x: 450, y: 890 },
  { field: '__bmiRange', x: 630, y: 890 },
  { field: 'body_age', x: 450, y: 940 },
  { field: '__stdweightRange', x: 630, y: 640 },
  { field: '__fatrateRange', x: 630, y: 690 },
  { field: '__fatkgRange', x: 630, y: 740 },
  { field: 'stdmusclekg', x: 630, y: 790 },
  { field: '__stdmuscleRange', x: 630, y: 840 },
  { field: 'fatkg', x: 1400, y: 610 },
  { field: 'boneweight', x: 1580, y: 610 },
  { field: '__muscleWater', x: 1750, y: 610 },
  { field: 'water_in', x: 1930, y: 935 },
  { field: 'weight', x: 1230, y: 935 },
  { field: 'nonfatkg', x: 1400, y: 935 },
  { field: 'muscle_weight', x: 1595, y: 935 },
  { field: 'water_weight', x: 1760, y: 935 },
  { field: 'water_out', x: 1950, y: 610 },
  { field: 'bmr_kj', x: 450, y: 1065 },
  { field: 'bmr', x: 450, y: 1115 },
  { field: 'vfi', x: 515, y: 1230, align: 'center' },
  { field: 'water_weight', x: 450, y: 1335 },
  { field: '__waterPct', x: 450, y: 1390 },
  { field: '__waterOutRatio', x: 450, y: 1495 },
  { field: 'water_out', x: 790, y: 1360 },
  { field: 'water_in', x: 1030, y: 1360 },
  { field: 'truck_weight', x: 340, y: 1730, suffix: 'kg' },
  { field: 'lh_weight', x: 230, y: 1860, suffix: 'kg' },
  { field: 'lf_weight', x: 280, y: 1990, suffix: 'kg' },
  { field: 'rh_weight', x: 870, y: 1860, suffix: 'kg' },
  { field: 'rf_weight', x: 820, y: 1990, suffix: 'kg' },
  { field: 'truck_fat_weight', x: 1290, y: 1730, suffix: 'kg' },
  { field: 'lh_fat_weight', x: 1180, y: 1860, suffix: 'kg' },
  { field: 'lf_fat_weight', x: 1230, y: 1990, suffix: 'kg' },
  { field: 'rh_fat_weight', x: 1820, y: 1860, suffix: 'kg' },
  { field: 'rf_fat_weight', x: 1770, y: 1990, suffix: 'kg' },
];

/** Block-bar meters: filled 25x35 rects from TX, 29.8px pitch. */
export const BLOCK_BARS = [
  { field: 'bmr_block', y: 1042 },
  { field: 'vfi_block', y: 1180 },
  { field: 'waterout_block', y: 1450 },
];
export const BLOCK_TX = 647;
export const BLOCK_PITCH = 29.8;
export const BLOCK_W = 25;
export const BLOCK_H = 35;

/** body_index -> star centre. Index 1 (and unknown) uses the default slot. */
export const STAR_SLOTS: Record<number, { x: number; y: number }> = {
  2: { x: 1654, y: 1380 },
  3: { x: 1883, y: 1378 },
  4: { x: 1424, y: 1260 },
  5: { x: 1654, y: 1269 },
  6: { x: 1883, y: 1267 },
  7: { x: 1424, y: 1173 },
  8: { x: 1654, y: 1173 },
  9: { x: 1883, y: 1173 },
  10: { x: 1424, y: 1115 },
  11: { x: 1654, y: 1115 },
  12: { x: 1883, y: 1115 },
};
export const STAR_DEFAULT = { x: 1426, y: 1380 };

/** Balance icons: sign of the score picks left/middle/right. */
export const BALANCE_MARKS = [
  { field: 'musclearmbal', y: 2170 },
  { field: 'musclefeetbal', y: 2520 },
];
export const BALANCE_X = 654;

/** Leg-score dot geometry. */
export const LEG = { x: 1370, y: 2500, w: 450 / 7, h: 320 / 6 };

/** Pentagram radar charts: [centre x, y, fields in vertex order]. */
export const PENTAGRAMS = [
  { x: 663, y: 1850, fields: ['mts', 'mrhs', 'mrfs', 'mrfs', 'mlhs'] },
  { x: 1608, y: 1850, fields: ['fts', 'frhs', 'frfs', 'flfs', 'flhs'] },
];
export const PENTA_R = 150;
export const PENTA_ROT = 20;
/* Vertex angles exactly as the source (radians, hand-rolled, not evenly spaced). */
export const PENTA_ANGLES = [-0.3141592653589793, 0.9624777960769379, 2.202914857512855, 3.4357519189487724, 4.41238898038469];

/** Source radius mapping, kept verbatim (including its +4 quirk being unused). */
export function pentaRadius(num: number): number {
  if (num >= 1.5) return 101 + (62 / 2.5) * (num - 1.5);
  if (num >= -1.5 && num < 1.5) return 60 + (40 / 3) * (num + 1.5);
  return (60 / 2.5) * (num + 4);
}

export const OVERLAY_FONT = '30px Arial';
