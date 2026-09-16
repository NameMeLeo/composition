/* Composition — the Tanita self-test report provider.

   The public report page is a canvas SPA. Its HTML is an 852-byte shell holding no
   measurements at all, so fetching that page and reading its text leaves an OCR pass
   with nothing to work from — it could only invent numbers. The page gets its data
   from a POST API, so this calls that API directly and maps the reply. No model call
   is involved, which makes this path exact, instant and free. */

import { UA } from './config.ts';
import type { Report, UserProfile } from './types.ts';

const TANITA_REPORT_SEGMENT = 'selftestfitnesscorner';
const TANITA_API_FILE = 'api/get_body_by_id_tanita.php';
/** The report page ships this token in its own public JavaScript, so it is not a
    secret. Override with the TANITA_API_TOKEN secret if the provider rotates it. */
const TANITA_API_TOKEN = Deno.env.get('TANITA_API_TOKEN') ?? '78Fx5vcOwnWhjogiTReM';

/* Every field the provider may fill, used only to decide whether a payload is worth
   mapping at all. Kept as a list because the payload is flat and untyped. */
const TANITA_NUMERIC_FIELDS = [
  'sm', 'smm', 'weight', 'gender', 'age', 'body_age', 'bodyheight', 'body_water', 'water_in',
  'water_out', 'water_out_per', 'waterout_block', 'water_weight', 'bmr', 'bmr_kj', 'bmr_block',
  'bmi', 'vfi', 'vfi_block', 'muscle_weight', 'truck_weight', 'lh_weight', 'rh_weight', 'lf_weight',
  'rf_weight', 'mts', 'mlhs', 'mrhs', 'mlfs', 'mrfs', 'fat_rate', 'fatrate_LR', 'fatrate_HR',
  'truck_fat_weight', 'lh_fat_weight', 'rh_fat_weight', 'lf_fat_weight', 'rf_fat_weight',
  'truck_fat_rate', 'lh_fat_rate', 'rh_fat_rate', 'lf_fat_rate', 'rf_fat_rate', 'fts', 'flhs',
  'frhs', 'flfs', 'frfs', 'stdweight', 'stdweight_LR', 'stdweight_HR', 'stdmusclekg',
  'stdmusclekg_LR', 'stdmusclekg_HR', 'stdfatrate', 'boneweight', 'fatkg', 'fatkg_LR', 'fatkg_HR',
  'nonfatkg', 'nonfatkg_LR', 'nonfatkg_HR', 'legmusiclescore', 'bodytype', 'clothesweight',
  'musclefeetbal', 'musclearmbal', 'musclescore', 'degreeofobesity', 'muscle_ratio', 'body_index'
];

/** Locates the data API that sits beside a Tanita report page, when the URL is one. */
function tanitaApiTarget(url: URL): { api: URL; playerId: string } | null {
  const at = url.pathname.indexOf(TANITA_REPORT_SEGMENT);
  if (at === -1) return null;

  const playerId = (url.searchParams.get('player_id') ?? url.searchParams.get('playerId') ?? '').trim();
  if (!/^[A-Za-z0-9_-]{4,}$/.test(playerId)) return null;

  try {
    // /tanita/selftestfitnesscorner/ -> /tanita/api/get_body_by_id_tanita.php
    return { api: new URL(url.pathname.slice(0, at) + TANITA_API_FILE, url.origin), playerId };
  } catch {
    return null;
  }
}

/** Numbers arrive either as numbers or as strings carrying their unit ("26.0kg"). */
export function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

/** Fetches the provider's own payload for a report page, or null when the URL is not
    one of theirs or the reply carries no usable numbers. */
export async function fetchTanitaReading(url: URL): Promise<Record<string, unknown> | null> {
  const target = tanitaApiTarget(url);
  if (!target) return null;

  try {
    const res = await fetch(target.api.toString(), {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: TANITA_API_TOKEN, player_id: target.playerId })
    });
    if (!res.ok) return null;

    const payload: any = await res.json().catch(() => null);
    const data = payload?.success && payload?.inbodydata && typeof payload.inbodydata === 'object'
      ? payload.inbodydata
      : null;
    if (!data) return null;

    return TANITA_NUMERIC_FIELDS.some((key) => parseNumeric(data[key]) !== null) ? data : null;
  } catch {
    return null;
  }
}

/* Maps the provider's flat, cryptically named payload onto the same report shape the
   OCR path produces, so nothing downstream needs to know which path filled it.

   Every provider field is retained under provider_details.raw; confirmed measurements
   and classifications are also normalized into the canonical report sections below. */
export function mapTanitaReport(d: Record<string, unknown>): Report {
  const gender = parseNumeric(d.gender);
  const genderCode: UserProfile['gender'] = gender === 1 ? 'M' : gender === 2 ? 'F' : null;

  return {
    metadata: {
      test_date: typeof d.date === 'string' ? d.date.replace(' ', 'T') : null,
      serial_number: typeof d.sn === 'string' ? d.sn : null,
      device_brand: 'Tanita'
    },
    user_profile: {
      age: parseNumeric(d.age),
      gender_code: gender,
      gender: genderCode,
      height_cm: parseNumeric(d.bodyheight),
      weight_kg: parseNumeric(d.weight),
      clothing_weight_kg: parseNumeric(d.clothesweight)
    },
    key_indicators: {
      bmi: parseNumeric(d.bmi),
      metabolic_age: parseNumeric(d.body_age),
      visceral_fat_rating: parseNumeric(d.vfi),
      sarcopenic_index_smi: parseNumeric(d.sm),
      skeletal_muscle_mass_kg: parseNumeric(d.smm),
      body_type_code: parseNumeric(d.bodytype),
      muscle_score: parseNumeric(d.musclescore),
      body_index: parseNumeric(d.body_index)
    },
    body_composition: {
      fat_percentage: parseNumeric(d.fat_rate),
      fat_mass_kg: parseNumeric(d.fatkg),
      muscle_mass_kg: parseNumeric(d.muscle_weight),
      fat_free_mass_kg: parseNumeric(d.nonfatkg),
      bone_mass_kg: parseNumeric(d.boneweight),
      total_body_water_kg: parseNumeric(d.water_weight),
      total_body_water_percent: parseNumeric(d.body_water),
      intracellular_water_kg: parseNumeric(d.water_in),
      extracellular_water_kg: parseNumeric(d.water_out),
      ecw_tbw_ratio_percent: parseNumeric(d.water_out_per),
      degree_of_obesity_percent: parseNumeric(d.degreeofobesity),
      muscle_ratio_percent: parseNumeric(d.muscle_ratio),
      bmr_kcal: parseNumeric(d.bmr),
      bmr_kj: parseNumeric(d.bmr_kj)
    },
    segmental_analysis: {
      muscle_mass: {
        trunk_kg: parseNumeric(d.truck_weight),
        left_arm_kg: parseNumeric(d.lh_weight),
        right_arm_kg: parseNumeric(d.rh_weight),
        left_leg_kg: parseNumeric(d.lf_weight),
        right_leg_kg: parseNumeric(d.rf_weight)
      },
      fat_mass: {
        trunk_kg: parseNumeric(d.truck_fat_weight),
        left_arm_kg: parseNumeric(d.lh_fat_weight),
        right_arm_kg: parseNumeric(d.rh_fat_weight),
        left_leg_kg: parseNumeric(d.lf_fat_weight),
        right_leg_kg: parseNumeric(d.rf_fat_weight)
      },
      fat_percentage: {
        trunk_percent: parseNumeric(d.truck_fat_rate),
        left_arm_percent: parseNumeric(d.lh_fat_rate),
        right_arm_percent: parseNumeric(d.rh_fat_rate),
        left_leg_percent: parseNumeric(d.lf_fat_rate),
        right_leg_percent: parseNumeric(d.rf_fat_rate)
      },
      muscle_balance_scores: {
        trunk: parseNumeric(d.mts),
        left_arm: parseNumeric(d.mlhs),
        right_arm: parseNumeric(d.mrhs),
        left_leg: parseNumeric(d.mlfs),
        right_leg: parseNumeric(d.mrfs)
      },
      fat_balance_scores: {
        trunk: parseNumeric(d.fts),
        left_arm: parseNumeric(d.flhs),
        right_arm: parseNumeric(d.frhs),
        left_leg: parseNumeric(d.flfs),
        right_leg: parseNumeric(d.frfs)
      }
    },
    reference_ranges: {
      body_fat_percent: {
        lower: parseNumeric(d.fatrate_LR),
        upper: parseNumeric(d.fatrate_HR),
        standard: parseNumeric(d.stdfatrate)
      },
      fat_mass_kg: {
        lower: parseNumeric(d.fatkg_LR),
        upper: parseNumeric(d.fatkg_HR)
      },
      fat_free_mass_kg: {
        // The provider ships no standard of its own for non-fat mass. The guide it prints
        // beside it is the standard muscle mass, which is the same figure muscle_mass_kg
        // is measured against.
        standard: parseNumeric(d.stdmusclekg),
        lower: parseNumeric(d.nonfatkg_LR),
        upper: parseNumeric(d.nonfatkg_HR)
      },
      weight_kg: {
        standard: parseNumeric(d.stdweight),
        lower: parseNumeric(d.stdweight_LR),
        upper: parseNumeric(d.stdweight_HR)
      },
      muscle_mass_kg: {
        standard: parseNumeric(d.stdmusclekg),
        lower: parseNumeric(d.stdmusclekg_LR),
        upper: parseNumeric(d.stdmusclekg_HR)
      }
    },
    assessments: {
      water_balance_block: parseNumeric(d.waterout_block),
      bmr_block: parseNumeric(d.bmr_block),
      visceral_fat_block: parseNumeric(d.vfi_block),
      leg_muscle_score: parseNumeric(d.legmusiclescore),
      lower_body_muscle_balance: parseNumeric(d.musclefeetbal),
      upper_body_muscle_balance: parseNumeric(d.musclearmbal)
    },
    provider_details: {
      source: 'tanita-api',
      mapping_version: 'tanita-inbodydata-v1',
      raw: d
    }
  };
}
