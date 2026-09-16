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
//   GEMINI_API_KEY    required — your Google AI Studio key. Never sent to a client.
//   GEMINI_MODEL      optional — defaults to gemini-3.5-flash-lite. If that model
//                     answers HTTP 429 (rate limited) the request is retried once
//                     with gemini-3.1-flash-lite before failing.
//   ALLOWED_ORIGIN    optional — comma-separated CORS origins, defaults to *
//   REQUIRE_AUTH      optional — "true" rejects the bare anon key; a signed-in
//                     Supabase user is then required for every OCR call
//   MAX_BYTES         optional — largest report accepted, defaults to 12 MB
//   TANITA_API_TOKEN  optional — override for the report host's own public token
//
// This file is the router and nothing else. The work lives beside it:
//
//   config.ts        the environment, read once
//   types.ts         the response contract both paths must satisfy
//   prompt.ts        what the model is told to read
//   schema.ts        the JSON the model must answer with
//   http.ts          CORS, JSON replies, caller identity
//   fetch-report.ts  downloading a report and identifying its real type
//   tanita.ts        the provider API path — exact, instant, free
//   gemini.ts        the OCR path — for reports with no API behind them
//   metrics.ts       flattening a report into the app's metric keys

import { GEMINI_API_KEY, GEMINI_FALLBACK_MODEL, GEMINI_MODEL, MAX_BYTES, REQUIRE_AUTH } from './config.ts';
import { PROMPT } from './prompt.ts';
import { authorize, cors, json, stripHtml } from './http.ts';
import { base64, fetchReport, sniffMimeType } from './fetch-report.ts';
import { GeminiError, callGemini } from './gemini.ts';
import { extractMetrics } from './metrics.ts';
import { fetchTanitaReading, mapTanitaReport } from './tanita.ts';
import type { ExtractionResponse, OcrResponse } from './types.ts';

/** The single place a successful extraction is stamped with which path produced it. */
function respondOcr(result: ExtractionResponse, sourceType: string): OcrResponse {
  return Object.assign({ ok: true } as const, result, { sourceType });
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
        const testDate: unknown = report.metadata?.test_date;
        return respond(respondOcr({
          report,
          measuredAt: typeof testDate === 'string' ? testDate : new Date().toISOString(),
          metrics: extractMetrics(report),
          confidence: 1,
          notes: ''
        }, 'tanita-api'));
      }

      const { contentType, buffer } = await fetchReport(url);

      // A PDF or an image goes to the model as bytes; anything else is a page.
      const binaryMimeType = sniffMimeType(buffer, contentType);
      if (binaryMimeType) {
        const result = await callGemini([
          { text: PROMPT },
          { inline_data: { mime_type: binaryMimeType, data: base64(buffer) } }
        ]);
        return respond(respondOcr(result, binaryMimeType));
      }

      const html = new TextDecoder('utf-8').decode(buffer);
      const text = stripHtml(html).slice(0, 180_000);
      if (!text) return respond({ ok: false, error: 'The report page had no readable text.' }, 422);

      const result = await callGemini([
        { text: PROMPT },
        { text: `Report page fetched from ${url}:\n\n${text}` }
      ]);
      return respond(respondOcr(result, 'text/html'));
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
      return respond(respondOcr(result, mimeType));
    }

    return respond({ ok: false, error: `Unknown mode: ${String(mode)}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The report could not be read.';
    // Keep Gemini's own status so a rate limit stays a 429 instead of becoming a 502.
    const status = err instanceof GeminiError ? err.status : 502;
    return respond({ ok: false, error: message }, status);
  }
});
