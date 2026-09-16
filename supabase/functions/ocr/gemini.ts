/* Composition — the OCR path: handing a report to Gemini and reading its answer back.

   The model is asked for JSON constrained by RESPONSE_SCHEMA, so parsing is a cast
   rather than a guess. The answer is then split: the report sections become the
   report, and the two fields describing the extraction become envelope fields. */

import { GEMINI_API_KEY, GEMINI_FALLBACK_MODEL, GEMINI_MODEL } from './config.ts';
import { extractMetrics, toFiniteNumber } from './metrics.ts';
import { RESPONSE_SCHEMA } from './schema.ts';
import type { ExtractionResponse, RawExtraction, Report } from './types.ts';

/** Keeps the upstream status so a rate limit can be told apart from a real fault. */
export class GeminiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

interface GeminiPayload {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string };
}

/** One attempt against one model. Never retries — the caller decides that. */
async function requestGemini(model: string, parts: unknown[]): Promise<GeminiPayload> {
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

  const payload = await res.json().catch(() => null) as GeminiPayload | null;
  if (!res.ok) {
    const detail = payload?.error?.message ?? `Gemini replied with ${res.status}.`;
    throw new GeminiError(detail, res.status);
  }
  return payload ?? {};
}

/** Separates the report from the extraction's own two fields.

    `confidence` and `notes` say how well the read went, not what was measured, and the
    app reads both from the response envelope. Leaving them inside the report would put
    the same value in two places and would give the OCR report a different shape from the
    provider report — so they are lifted out here, once, and never travel in `report`. */
function splitExtraction(parsed: RawExtraction): { report: Report; confidence: number | null; notes: string } {
  const confidence = toFiniteNumber(parsed.confidence);
  const notes = typeof parsed.notes === 'string' ? parsed.notes : '';

  const report = Object.assign({}, parsed) as Record<string, unknown>;
  delete report.confidence;
  delete report.notes;
  // A legacy alias for the measurement time. Read below, but never a report field.
  delete report.measured_at;

  return { report: report as Report, confidence, notes };
}

/**
 * Reads one report and returns it in the same shape the provider path returns.
 * @param parts Gemini content parts: the prompt, plus the report as a file or as text.
 */
export async function callGemini(parts: unknown[]): Promise<ExtractionResponse> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set on this function.');

  let payload: GeminiPayload;
  try {
    payload = await requestGemini(GEMINI_MODEL, parts);
  } catch (err) {
    // Only a rate-limited primary is worth retrying, and only once.
    const rateLimited = err instanceof GeminiError && err.status === 429;
    if (!rateLimited || GEMINI_MODEL === GEMINI_FALLBACK_MODEL) throw err;
    payload = await requestGemini(GEMINI_FALLBACK_MODEL, parts);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.find((part) => part?.text)?.text;
  if (!text) {
    const reason = payload?.candidates?.[0]?.finishReason ?? 'no content';
    throw new Error(`Gemini returned nothing usable (${reason}).`);
  }

  let parsed: RawExtraction;
  try {
    parsed = JSON.parse(text) as RawExtraction;
  } catch {
    throw new Error('Gemini did not return valid JSON.');
  }

  const { report, confidence, notes } = splitExtraction(parsed);
  const measuredAt = typeof report.metadata?.test_date === 'string'
    ? report.metadata.test_date
    : typeof parsed.measured_at === 'string'
      ? parsed.measured_at
      : null;

  return { report, measuredAt, metrics: extractMetrics(report), confidence, notes, text };
}
