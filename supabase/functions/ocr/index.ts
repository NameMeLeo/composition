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
//   GEMINI_MODEL     optional — defaults to gemini-3.5-flash-lite
//   ALLOWED_ORIGIN   optional — CORS origin, defaults to * (set it to your site)
//   REQUIRE_AUTH     optional — "true" rejects the bare anon key; a signed-in
//                    Supabase user is then required for every OCR call
//   MAX_BYTES        optional — largest report accepted, defaults to 12 MB

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
const REQUIRE_AUTH = (Deno.env.get('REQUIRE_AUTH') ?? 'false').toLowerCase() === 'true';
const MAX_BYTES = Number(Deno.env.get('MAX_BYTES') ?? String(12 * 1024 * 1024));
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36';

const PROMPT = `You read Tanita body composition reports and return the measured values as JSON.

Rules:
- Read the numbers exactly as printed. Do not estimate, interpolate, round, or invent anything.
- Convert only when the report itself prints a different unit: pounds to kilograms, stones and pounds to kilograms.
- Omit any metric the report does not show. Never return null, zero or a placeholder for a missing metric.
- If the report shows a date and time, return it as measured_at in ISO 8601 local time without a timezone suffix. Omit it when the report does not show one.
- confidence is your own confidence that the extraction is correct, between 0 and 1.
- notes is one short sentence describing anything ambiguous or unreadable. Empty string when everything was clear.

Metric keys, in kilograms / percent / kcal / years as noted:
weight (kg), body_fat (%), muscle_mass (kg), fat_free_mass (kg), body_water (%), bone_mass (kg),
visceral_fat (level), bmi, bmr (kcal), metabolic_age (years), muscle_quality (score), physique_rating (1-9).`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    measured_at: { type: 'STRING', description: 'ISO 8601 local date-time, e.g. 2026-03-14T07:20' },
    confidence: { type: 'NUMBER' },
    notes: { type: 'STRING' },
    metrics: {
      type: 'OBJECT',
      properties: {
        weight: { type: 'NUMBER' },
        body_fat: { type: 'NUMBER' },
        muscle_mass: { type: 'NUMBER' },
        fat_free_mass: { type: 'NUMBER' },
        body_water: { type: 'NUMBER' },
        bone_mass: { type: 'NUMBER' },
        visceral_fat: { type: 'NUMBER' },
        bmi: { type: 'NUMBER' },
        bmr: { type: 'NUMBER' },
        metabolic_age: { type: 'NUMBER' },
        muscle_quality: { type: 'NUMBER' },
        physique_rating: { type: 'NUMBER' }
      }
    }
  },
  required: ['metrics']
};

const KEY_MAP: Record<string, string> = {
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

function cors(extra: Record<string, string> = {}): Record<string, string> {
  return Object.assign({
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  }, extra);
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors(Object.assign({ 'Content-Type': 'application/json' }, headers))
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

async function callGemini(parts: unknown[]) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set on this function.');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
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
    throw new Error(detail);
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

  const metrics: Record<string, number> = {};
  const source = parsed?.metrics ?? {};
  Object.keys(source).forEach((key) => {
    const value = Number(source[key]);
    if (!isFinite(value)) return;
    const mapped = KEY_MAP[key];
    if (!mapped) return;
    metrics[mapped] = value;
  });

  return {
    measuredAt: typeof parsed?.measured_at === 'string' ? parsed.measured_at : null,
    metrics,
    confidence: isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : null,
    notes: typeof parsed?.notes === 'string' ? parsed.notes : '',
    text
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

function base64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'The request body was not JSON.' }, 400);
  }

  const mode = body?.mode;

  if (mode === 'ping') {
    return json({ ok: true, model: GEMINI_MODEL, hasKey: Boolean(GEMINI_API_KEY), requireAuth: REQUIRE_AUTH });
  }

  const auth = await authorize(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, 401);

  try {
    if (mode === 'report-url') {
      const url = String(body?.url ?? '').trim();
      if (!url) return json({ ok: false, error: 'No report URL was supplied.' }, 400);

      const { contentType, buffer } = await fetchReport(url);

      if (contentType.includes('pdf') || contentType.includes('image/')) {
        const mimeType = contentType.split(';')[0].trim() || 'application/pdf';
        const result = await callGemini([
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: base64(buffer) } }
        ]);
        return json(Object.assign({ ok: true }, result, { sourceType: mimeType }));
      }

      const html = new TextDecoder('utf-8').decode(buffer);
      const text = stripHtml(html).slice(0, 180_000);
      if (!text) return json({ ok: false, error: 'The report page had no readable text.' }, 422);

      const result = await callGemini([
        { text: PROMPT },
        { text: `Report page fetched from ${url}:\n\n${text}` }
      ]);
      return json(Object.assign({ ok: true }, result, { sourceType: 'text/html' }));
    }

    if (mode === 'document') {
      const mimeType = String(body?.mimeType ?? '').trim() || 'application/octet-stream';
      const data = String(body?.data ?? '');
      if (!data) return json({ ok: false, error: 'No document data was supplied.' }, 400);
      const approxBytes = Math.floor((data.length * 3) / 4);
      if (approxBytes > MAX_BYTES) return json({ ok: false, error: 'That attachment is larger than this function accepts.' }, 413);

      const result = await callGemini([
        { text: PROMPT },
        { inline_data: { mime_type: mimeType, data } }
      ]);
      return json(Object.assign({ ok: true }, result, { sourceType: mimeType }));
    }

    return json({ ok: false, error: `Unknown mode: ${String(mode)}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The report could not be read.';
    return json({ ok: false, error: message }, 502);
  }
});
