// Composition — Gemini OCR proxy (Supabase Edge Function, Deno)
//
// Why this exists: a static PWA on GitHub Pages or Cloudflare Pages cannot keep
// an API key. The key lives here, on the server, and the app never sees it.
//
// Deploy:
//   supabase functions deploy ocr --no-verify-jwt
//   supabase secrets set GEMINI_API_KEY=... GEMINI_MODEL=gemini-3.5-flash-lite
//
// Environment:
//   GEMINI_API_KEY   required — your Google AI Studio key. Never sent to a client.
//   GEMINI_MODEL     optional — defaults to gemini-3.5-flash-lite. If that model
//                    answers HTTP 429 (rate limited) the request is retried once
//                    with gemini-3.1-flash-lite before failing.
//   ALLOWED_ORIGIN   optional — comma-separated CORS origins, defaults to *
//   REQUIRE_AUTH     optional — "true" rejects the bare anon key; a signed-in
//                    Supabase user is then required for every OCR call
//   MAX_BYTES        optional — largest report accepted, defaults to 12 MB

import { createClient } from '@supabase/supabase-js';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';
// Used once when the primary model is rate limited (HTTP 429).
const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const REQUIRE_AUTH = (Deno.env.get('REQUIRE_AUTH') ?? 'false').toLowerCase() === 'true';
const MAX_BYTES = Number(Deno.env.get('MAX_BYTES') ?? String(12 * 1024 * 1024));
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36';

const PROMPT = `You are an OCR extraction engine for Tanita body composition analyzer reports.
Read the entire PDF or image, including the Details table, summary boxes, BMR/VFA/TBW panel,
and Segmental Analysis panels. Return only JSON that matches the response schema.

Rules:
- Read values exactly as printed. Do not estimate, interpolate, round, calculate, or invent values.
- Omit a field when its label is absent or its value is genuinely unreadable. Do not use null, zero,
  a desirable-range boundary, a chart axis label, or a value from a different row as a replacement.
- Preserve the report's units. Only convert when the report itself provides the converted unit.
- Use the local report date and time as metadata.test_date in ISO 8601 form without a timezone suffix.
- confidence is between 0 and 1 and reflects the whole extraction. notes should name specific unreadable
  fields, not claim that the whole image is low quality when only one field is unclear.

Label disambiguation:
- Details row "Fat" is body_composition.fat_percentage; "Fat Mass" is body_composition.fat_mass_kg.
- "FFM" is body_composition.fat_free_mass_kg. Do not confuse it with skeletal muscle mass (SMM).
- Details row "Muscle Mass" is body_composition.muscle_mass_kg. "SMM" belongs in
  key_indicators.skeletal_muscle_mass_kg.
- "TBW" may appear both as kilograms and as a percentage. Put them in total_body_water_kg and
  total_body_water_percent respectively. Keep ECW and ICW in their own fields.
- When BMR is printed in both kJ and kcal, copy each value into bmr_kj and bmr_kcal; use kcal for
  the app's BMR metric.
- "Visceral Fat Rating" is the numeric visceral_fat_rating, not the words Standard, High, or Very High.
- Read each Segmental Analysis value under the correct Muscle Mass or Fat panel and body part.
- Physique Rating is categorical text unless the report also prints a numeric 1-9 score.

The primary target fields are metadata, user_profile, key_indicators, body_composition, and
segmental_analysis. The schema intentionally leaves individual fields optional because reports
vary by device model and language.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  description: 'Structured Tanita report extraction. / 身體成分分析報告結構化萃取。',
  properties: {
    metadata: {
      type: 'OBJECT',
      description: 'Report metadata and device details. / 報告元數據與儀器資訊。',
      properties: {
        test_date: { type: 'STRING', description: 'Local test date and time, for example 2026-09-14T21:20:09.' },
        facility_name: { type: 'STRING', description: 'Testing facility or organization, if printed.' },
        serial_number: { type: 'STRING', description: 'Device serial number from S/N.' },
        device_brand: { type: 'STRING', description: 'Analyzer brand or manufacturer, if printed.' }
      }
    },
    user_profile: {
      type: 'OBJECT',
      description: 'Subject profile. / 受測者基本資料。',
      properties: {
        age: { type: 'INTEGER', description: 'Age in years.' },
        gender: { type: 'STRING', enum: ['M', 'F'], description: 'Printed gender: M or F.' },
        height_cm: { type: 'NUMBER', description: 'Height in centimeters.' },
        weight_kg: { type: 'NUMBER', description: 'Weight in kilograms from the Weight row or summary.' }
      }
    },
    key_indicators: {
      type: 'OBJECT',
      description: 'High-level indicators. / 核心指標。',
      properties: {
        bmi: { type: 'NUMBER', description: 'Body Mass Index.' },
        metabolic_age: { type: 'INTEGER', description: 'Metabolic age in years.' },
        visceral_fat_rating: { type: 'INTEGER', description: 'Numeric Visceral Fat Rating, usually 1-59.' },
        visceral_fat_status: { type: 'STRING', enum: ['Standard', 'High', 'Very High'], description: 'Printed visceral-fat category.' },
        sarcopenic_index_smi: { type: 'NUMBER', description: 'Sarcopenic Index or Skeletal Muscle Mass Index (SMI), in kg/m2.' },
        skeletal_muscle_mass_kg: { type: 'NUMBER', description: 'Skeletal Muscle Mass (SMM), in kg.' },
        physique_rating: { type: 'STRING', description: 'Categorical Physique Rating such as Standard, Muscular, Over Fat, or Hidden Obese.' },
        physique_rating_score: { type: 'NUMBER', description: 'Numeric Physique Rating from 1-9, only if explicitly printed.' },
        muscle_quality_score: { type: 'NUMBER', description: 'Muscle Quality score, if explicitly printed.' }
      }
    },
    body_composition: {
      type: 'OBJECT',
      description: 'Detailed fat, muscle, bone, protein, and water values. / 詳細體成分數據。',
      properties: {
        fat_percentage: { type: 'NUMBER', description: 'Body fat percentage from the Fat row, not Fat Mass.' },
        fat_mass_kg: { type: 'NUMBER', description: 'Fat Mass in kg.' },
        muscle_mass_kg: { type: 'NUMBER', description: 'Total Muscle Mass row in kg; do not use SMM here.' },
        fat_free_mass_kg: { type: 'NUMBER', description: 'Fat-Free Mass (FFM) in kg.' },
        bone_mass_kg: { type: 'NUMBER', description: 'Bone Mass in kg.' },
        protein_mass_kg: { type: 'NUMBER', description: 'Protein mass in kg.' },
        total_body_water_kg: { type: 'NUMBER', description: 'Total Body Water (TBW) in kg.' },
        total_body_water_percent: { type: 'NUMBER', description: 'Total Body Water (TBW) percentage, if printed.' },
        intracellular_water_kg: { type: 'NUMBER', description: 'Intracellular Water (ICW) in kg.' },
        extracellular_water_kg: { type: 'NUMBER', description: 'Extracellular Water (ECW) in kg.' },
        ecw_tbw_ratio_percent: { type: 'NUMBER', description: 'ECW/TBW percentage.' },
        bmr_kcal: { type: 'INTEGER', description: 'Basal Metabolic Rate in kcal.' },
        bmr_kj: { type: 'INTEGER', description: 'Basal Metabolic Rate in kJ.' }
      }
    },
    segmental_analysis: {
      type: 'OBJECT',
      description: 'Muscle and fat distribution by body segment. / 分部肌肉與脂肪數據。',
      properties: {
        muscle_mass: {
          type: 'OBJECT',
          description: 'Segmental muscle mass in kg.',
          properties: {
            trunk_kg: { type: 'NUMBER', description: 'Trunk muscle mass in kg.' },
            left_arm_kg: { type: 'NUMBER', description: 'Left arm muscle mass in kg.' },
            right_arm_kg: { type: 'NUMBER', description: 'Right arm muscle mass in kg.' },
            left_leg_kg: { type: 'NUMBER', description: 'Left leg muscle mass in kg.' },
            right_leg_kg: { type: 'NUMBER', description: 'Right leg muscle mass in kg.' }
          }
        },
        fat_mass: {
          type: 'OBJECT',
          description: 'Segmental fat mass in kg.',
          properties: {
            trunk_kg: { type: 'NUMBER', description: 'Trunk fat mass in kg.' },
            left_arm_kg: { type: 'NUMBER', description: 'Left arm fat mass in kg.' },
            right_arm_kg: { type: 'NUMBER', description: 'Right arm fat mass in kg.' },
            left_leg_kg: { type: 'NUMBER', description: 'Left leg fat mass in kg.' },
            right_leg_kg: { type: 'NUMBER', description: 'Right leg fat mass in kg.' }
          }
        },
        fat_percentage: {
          type: 'OBJECT',
          description: 'Segmental fat percentage for each body part.',
          properties: {
            trunk_percent: { type: 'NUMBER', description: 'Trunk fat percentage.' },
            left_arm_percent: { type: 'NUMBER', description: 'Left arm fat percentage.' },
            right_arm_percent: { type: 'NUMBER', description: 'Right arm fat percentage.' },
            left_leg_percent: { type: 'NUMBER', description: 'Left leg fat percentage.' },
            right_leg_percent: { type: 'NUMBER', description: 'Right leg fat percentage.' }
          }
        }
      }
    },
    confidence: { type: 'NUMBER', description: 'Overall extraction confidence from 0 to 1.' },
    notes: { type: 'STRING', description: 'Short note naming specific unreadable or ambiguous fields.' }
  },
  required: ['metadata', 'user_profile', 'key_indicators', 'body_composition', 'segmental_analysis']
};

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
  physique_rating: 'physiqueRating'
};

function cors(requestOrigin = '', extra: Record<string, string> = {}): Record<string, string> {
  const allowOrigin = ALLOWED_ORIGINS.includes('*')
    ? '*'
    : requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0] ?? '*';

  return Object.assign({
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  }, extra);
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}, requestOrigin = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors(requestOrigin, Object.assign({ 'Content-Type': 'application/json' }, headers))
  });
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(tr|table|div|p|li|h[1-6])>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function authorize(req: Request): Promise<{ ok: true } | { ok: false; error: string }> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, error: 'Missing credentials. Sign in or add the anon key.' };

  if (SUPABASE_ANON_KEY && token === SUPABASE_ANON_KEY) {
    if (REQUIRE_AUTH) return { ok: false, error: 'This proxy requires a signed-in user.' };
    return { ok: true };
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return REQUIRE_AUTH ? { ok: false, error: 'The proxy is not configured for authentication.' } : { ok: true };
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return { ok: false, error: 'That session is not valid any more.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'The session could not be verified.' };
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function extractMetrics(parsed: any): Record<string, number> {
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

  // The segmental breakdown is the one part of the report that is nested: five body
  // parts, each carrying its own muscle mass, fat mass and fat percentage.
  const segment = parsed?.segmental_analysis ?? {};
  const muscle = segment.muscle_mass ?? {};
  const fat = segment.fat_mass ?? {};
  const rate = segment.fat_percentage ?? {};

  setMetric('segMuscleTrunk', muscle.trunk_kg);
  setMetric('segMuscleLeftArm', muscle.left_arm_kg);
  setMetric('segMuscleRightArm', muscle.right_arm_kg);
  setMetric('segMuscleLeftLeg', muscle.left_leg_kg);
  setMetric('segMuscleRightLeg', muscle.right_leg_kg);

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

  return metrics;
}

// Keeps the upstream status so a rate limit can be told apart from a real fault.
class GeminiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

async function requestGemini(model: string, parts: unknown[]) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0,
          topP: 0.9,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA
        }
      })
    }
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = payload?.error?.message ?? `Gemini replied with ${res.status}.`;
    throw new GeminiError(detail, res.status);
  }
  return payload;
}

async function callGemini(parts: unknown[]) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set on this function.');

  let payload: any;
  try {
    payload = await requestGemini(GEMINI_MODEL, parts);
  } catch (err) {
    // Only a rate-limited primary is worth retrying, and only once.
    const rateLimited = err instanceof GeminiError && err.status === 429;
    if (!rateLimited || GEMINI_MODEL === GEMINI_FALLBACK_MODEL) throw err;
    payload = await requestGemini(GEMINI_FALLBACK_MODEL, parts);
  }

  const text: string | undefined = payload?.candidates?.[0]?.content?.parts?.find((p: any) => p?.text)?.text;
  if (!text) {
    const reason = payload?.candidates?.[0]?.finishReason ?? 'no content';
    throw new Error(`Gemini returned nothing usable (${reason}).`);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini did not return valid JSON.');
  }

  const measuredAt = typeof parsed?.metadata?.test_date === 'string'
    ? parsed.metadata.test_date
    : typeof parsed?.measured_at === 'string'
      ? parsed.measured_at
      : null;

  return Object.assign({}, parsed, {
    report: parsed,
    measuredAt,
    metrics: extractMetrics(parsed),
    confidence: toFiniteNumber(parsed?.confidence),
    notes: typeof parsed?.notes === 'string' ? parsed.notes : '',
    text
  });
}

/* ------------------------------------------------------------------ */
/* Tanita self-test report provider                                    */
/* ------------------------------------------------------------------ */
/* The public report page is a canvas SPA. Its HTML is an 852-byte shell holding no
   measurements at all, so fetching that page and reading its text leaves an OCR pass
   with nothing to work from — it could only invent numbers. The page gets its data
   from a POST API, so this calls that API directly and maps the reply. No model call
   is involved, which makes this path exact, instant and free. */

const TANITA_REPORT_SEGMENT = 'selftestfitnesscorner';
const TANITA_API_FILE = 'api/get_body_by_id_tanita.php';
// The report page ships this token in its own public JavaScript, so it is not a
// secret. Override with the TANITA_API_TOKEN secret if the provider rotates it.
const TANITA_API_TOKEN = Deno.env.get('TANITA_API_TOKEN') ?? '78Fx5vcOwnWhjogiTReM';

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
function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

async function fetchTanitaReading(url: URL): Promise<Record<string, unknown> | null> {
  const target = tanitaApiTarget(url);
  if (!target) return null;

  const res = await fetch(target.api.toString(), {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: TANITA_API_TOKEN, player_id: target.playerId })
  });
  if (!res.ok) return null;

  const payload: any = await res.json().catch(() => null);
  if (!payload?.success || !payload?.inbodydata) return null;
  return payload.inbodydata;
}

/* Maps the provider's flat, cryptically named payload onto the same report shape the
   OCR path produces, so nothing downstream needs to know which path filled it.

   Only fields whose meaning could be confirmed are mapped. The payload also carries
   muscle_ratio, bodytype, musclescore, degreeofobesity and body_index, none of which
   are documented anywhere — and because this is health data, they are left out
   rather than guessed at from their names. */
function mapTanitaReport(d: Record<string, unknown>) {
  const gender = parseNumeric(d.gender);

  return {
    metadata: {
      test_date: typeof d.date === 'string' ? d.date.replace(' ', 'T') : null,
      serial_number: typeof d.sn === 'string' ? d.sn : null,
      device_brand: 'Tanita'
    },
    user_profile: {
      age: parseNumeric(d.age),
      gender: gender === 1 ? 'Male' : gender === 2 ? 'Female' : null,
      height_cm: parseNumeric(d.bodyheight),
      weight_kg: parseNumeric(d.weight)
    },
    key_indicators: {
      bmi: parseNumeric(d.bmi),
      metabolic_age: parseNumeric(d.body_age),
      visceral_fat_rating: parseNumeric(d.vfi),
      sarcopenic_index_smi: parseNumeric(d.sm),
      skeletal_muscle_mass_kg: parseNumeric(d.smm)
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
      }
    }
  };
}

async function fetchReport(url: string) {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error('That report link is not a valid URL.');
  }
  if (!/^https?:$/.test(target.protocol)) throw new Error('That report link is not a web address.');

  const res = await fetch(target.toString(), {
    redirect: 'follow',
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8' }
  });
  if (!res.ok) throw new Error(`The report host replied with ${res.status}.`);

  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw new Error('The report is larger than this function accepts.');
  return { contentType, buffer };
}

function sniffMimeType(buffer: Uint8Array, contentType: string): string | null {
  const startsWith = (...bytes: number[]) => bytes.every((byte, index) => buffer[index] === byte);
  const asciiAt = (offset: number, value: string) => value.split('').every((char, index) => buffer[offset + index] === char.charCodeAt(0));

  if (asciiAt(0, '%PDF-')) return 'application/pdf';
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (asciiAt(0, 'GIF87a') || asciiAt(0, 'GIF89a')) return 'image/gif';
  if (asciiAt(0, 'RIFF') && asciiAt(8, 'WEBP')) return 'image/webp';

  if (contentType.includes('pdf')) return 'application/pdf';
  if (contentType.includes('image/')) return contentType.split(';')[0].trim();
  return null;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  const requestOrigin = req.headers.get('origin') ?? '';
  const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    json(body, status, headers, requestOrigin);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(requestOrigin) });
  if (req.method !== 'POST') return respond({ ok: false, error: 'Use POST.' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return respond({ ok: false, error: 'The request body was not JSON.' }, 400);
  }

  const mode = body?.mode;

  if (mode === 'ping') {
    return respond({
      ok: true,
      model: GEMINI_MODEL,
      fallbackModel: GEMINI_FALLBACK_MODEL,
      hasKey: Boolean(GEMINI_API_KEY),
      requireAuth: REQUIRE_AUTH
    });
  }

  const auth = await authorize(req);
  if (!auth.ok) return respond({ ok: false, error: auth.error }, 401);

  try {
    if (mode === 'report-url') {
      const url = String(body?.url ?? '').trim();
      if (!url) return respond({ ok: false, error: 'No report URL was supplied.' }, 400);

      // Ask the provider's data API first. A report page on its own is an empty
      // shell, so this is the only path that yields the real numbers for it.
      let reportUrl: URL | null = null;
      try { reportUrl = new URL(url); } catch { reportUrl = null; }

      const reading = reportUrl ? await fetchTanitaReading(reportUrl) : null;
      if (reading) {
        const report = mapTanitaReport(reading);
        const testDate: unknown = report.metadata.test_date;
        return respond({
          ok: true,
          report,
          measuredAt: typeof testDate === 'string' ? testDate : new Date().toISOString(),
          metrics: extractMetrics(report),
          confidence: 1,
          notes: '',
          sourceType: 'tanita-api'
        });
      }

      const { contentType, buffer } = await fetchReport(url);

      const binaryMimeType = sniffMimeType(buffer, contentType);
      if (binaryMimeType) {
        const mimeType = binaryMimeType;
        const result = await callGemini([
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: base64(buffer) } }
        ]);
        return respond(Object.assign({ ok: true }, result, { sourceType: mimeType }));
      }

      const html = new TextDecoder('utf-8').decode(buffer);
      const text = stripHtml(html).slice(0, 180_000);
      if (!text) return respond({ ok: false, error: 'The report page had no readable text.' }, 422);

      const result = await callGemini([
        { text: PROMPT },
        { text: `Report page fetched from ${url}:\n\n${text}` }
      ]);
      return respond(Object.assign({ ok: true }, result, { sourceType: 'text/html' }));
    }

    if (mode === 'document') {
      const mimeType = String(body?.mimeType ?? '').trim() || 'application/octet-stream';
      const data = String(body?.data ?? '');
      if (!data) return respond({ ok: false, error: 'No document data was supplied.' }, 400);
      const approxBytes = Math.floor((data.length * 3) / 4);
      if (approxBytes > MAX_BYTES) return respond({ ok: false, error: 'That attachment is larger than this function accepts.' }, 413);

      const result = await callGemini([
        { text: PROMPT },
        { inline_data: { mime_type: mimeType, data } }
      ]);
      return respond(Object.assign({ ok: true }, result, { sourceType: mimeType }));
    }

    return respond({ ok: false, error: `Unknown mode: ${String(mode)}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The report could not be read.';
    // Keep Gemini's own status so a rate limit stays a 429 instead of becoming a 502.
    const status = err instanceof GeminiError ? err.status : 502;
    return respond({ ok: false, error: message }, status);
  }
});
