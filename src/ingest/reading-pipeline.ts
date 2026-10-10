/* Composition — the reading pipeline: fetch + extract + hand to review.
   Owns the "one report in" flow for link / player-id / file / manual jobs.
   Camera handling lives in scanner.ts; human confirmation lives in review.ts.
   This module orchestrates between them and never touches the view directly. */

import { $, $$, toast } from '../core/dom.js';
import { METRICS } from '../core/metrics.js';
import { parseNumber } from '../core/format.js';
import { OcrProxy } from '../services/ocr.js';
import { parseReportUrl, playerReportUrl, reportBase } from '../services/report-url.js';
import { openReview, saveReadingDirect } from './review.js';
import type { OcrResult, StartReadingJob } from '../domain/types.js';

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function setStep(name: string, state: string): void {
  const node = $('#proc-steps li[data-step="' + name + '"]');
  if (node) node.dataset.state = state;
}

function showProcessing(title: string, body: string, steps: string[]): void {
  ($('#proc-title') as HTMLElement).textContent = title;
  ($('#proc-body') as HTMLElement).textContent = body;
  $$('#proc-steps li').forEach((li) => { li.dataset.state = steps.indexOf(li.dataset.step ?? '') !== -1 ? 'active' : ''; });
  ($('#overlay-processing') as HTMLElement).hidden = false;
}

function hideProcessing(): void { ($('#overlay-processing') as HTMLElement).hidden = true; }

function providerSourceOf(result: OcrResult | null): string | null {
  if (!result) return null;
  if (result.sourceType) return result.sourceType as string;
  const via = (result.report as { provider_details?: { source?: string } } | null)?.provider_details?.source;
  return via ?? null;
}

export function extractionMethod(result: OcrResult | null): string {
  if (result && (result.sourceType === 'tanita-api' || providerSourceOf(result) === 'tanita-api')) {
    return 'Tanita provider API (OCR not used)';
  }
  const format = result?.sourceType ? ' (' + result.sourceType + ')' : '';
  return 'OCR fallback' + format;
}

export function isProviderResult(result: OcrResult | null): boolean {
  return Boolean(result && (result.sourceType === 'tanita-api' || providerSourceOf(result) === 'tanita-api'));
}

export async function startReading(job: StartReadingJob): Promise<void> {
  if (job.mode === 'manual') {
    openReview({
      metrics: {}, report: null, measuredAt: new Date().toISOString(), confidence: null, raw: null, notes: '',
      playerId: null, language: null, reportUrl: null, source: 'manual', previewUrl: null,
      sourceType: null, extractionMethod: 'Manual entry', note: 'Entered by hand.'
    });
    return;
  }

  showProcessing('Reading the report', 'Fetching the page for you, then reading it.', ['fetch']);
  let result: OcrResult | null = null;
  let previewUrl: string | null = null;
  let note = '';

  try {
    if (job.mode === 'file') {
      setStep('fetch', 'done');
      setStep('ocr', 'active');
      ($('#proc-title') as HTMLElement).textContent = 'Reading the attachment';
      ($('#proc-body') as HTMLElement).textContent = 'Sending ' + job.file.name + ' straight for reading — no fetching needed.';
      previewUrl = job.file.type?.indexOf('image/') === 0 ? URL.createObjectURL(job.file) : null;
      const data = await fileToBase64(job.file);
      result = (await OcrProxy.fromDocument(job.file.type || 'application/octet-stream', data)) as unknown as OcrResult;
      note = 'Read from ' + job.file.name + ' with ' + extractionMethod(result) + '.';
    } else if (job.mode === 'report-url') {
      if (!OcrProxy.isConfigured()) throw new Error('The OCR proxy is not configured, so the report cannot be fetched or read. Add your Supabase details in Settings, or enter the numbers by hand.');
      result = (await OcrProxy.fromReportUrl(job.url)) as unknown as OcrResult;
      const parsed = parseReportUrl(job.url);
      note = 'Fetched from ' + (parsed.ok ? parsed.host : job.url) + ' via ' + extractionMethod(result) + '.';
    } else if (job.mode === 'player-id') {
      if (!reportBase()) throw new Error('Only a player id was found, and no report address is configured. Add one in Settings, or paste the full report link.');
      const built = playerReportUrl(job.playerId, job.language);
      if (!OcrProxy.isConfigured()) throw new Error('Only a player id was found. The full report link is needed, and the proxy must be configured to fetch it.');
      result = (await OcrProxy.fromReportUrl(built)) as unknown as OcrResult;
      note = 'Fetched from player ' + job.playerId + ' via ' + extractionMethod(result) + '.';
    } else {
      result = { metrics: {}, measuredAt: new Date().toISOString() };
    }
    setStep('fetch', 'done');
    setStep('ocr', 'done');
    setStep('done', 'active');
  } catch (err) {
    hideProcessing();
    // An expired session has already sent the user back to the sign-in screen.
    if (err instanceof Error && (err as Error & { code?: string }).code === 'AUTH_REQUIRED') return;
    const message = err instanceof Error ? err.message : 'The report could not be read.';
    const proceed = window.confirm(message + '\n\nOpen the review screen and type the numbers instead?');
    if (!proceed) return;
    result = { metrics: {}, measuredAt: new Date().toISOString(), failed: true };
    note = 'Entered by hand after: ' + message;
  }

  hideProcessing();
  const r = (result ?? {}) as OcrResult;
  const rawMetrics = (r.metrics ?? {}) as Record<string, unknown>;
  const review = {
    metrics: normaliseMetrics(rawMetrics),
    report: (r.report ?? null) as ReviewReport,
    measuredAt: (r.measuredAt as string) || new Date().toISOString(),
    confidence: typeof r.confidence === 'number' ? r.confidence : null,
    raw: (r.text as string) ?? (r.raw as string) ?? null,
    notes: (r.notes as string) || '',
    playerId: job.mode === 'player-id' ? job.playerId : (job.mode === 'report-url' ? (job.playerId ?? null) : null),
    language: job.mode === 'report-url' || job.mode === 'player-id' ? (job.language ?? null) : null,
    reportUrl: job.mode === 'report-url' ? job.url : null,
    source: job.mode === 'file' ? 'file' : job.mode === 'report-url' ? 'link' : 'qr',
    sourceType: (r.sourceType as string) ?? providerSourceOf(r),
    extractionMethod: r.failed ? 'Manual entry after extraction failure' : extractionMethod(r),
    previewUrl,
    note
  };

  if (isProviderResult(r)) {
    try {
      await saveReadingDirect(review);
    } catch (err) {
      toast('Could not save the provider reading: ' + (err instanceof Error ? err.message : 'unknown error'), 'error');
    }
    return;
  }

  openReview(review);
}

type ReviewReport = import('../domain/types.js').Report | null;

/** Maps whatever keys the reader returned onto our metric ids. */
export function normaliseMetrics(input: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  Object.keys(input || {}).forEach((rawKey) => {
    const key = matchMetric(rawKey);
    if (!key) return;
    const value = parseNumber(input[rawKey]);
    if (value == null) return;
    out[key] = value;
  });
  return out;
}

/** Resolves a reader key (any casing/shape) to a metric id, or null. Exported for tests. */
export function matchMetric(rawKey: string): string | null {
  if (METRICS[rawKey]) return rawKey;
  const slug = String(rawKey).toLowerCase().replace(/[^a-z]/g, '');

  const table: Record<string, string> = {
    weight: 'weight', bodyweight: 'weight', mass: 'weight', weightkg: 'weight',
    bodyfat: 'bodyFat', bodyfatpercentage: 'bodyFat', fatpercent: 'bodyFat', bodyfatpct: 'bodyFat', percentfat: 'bodyFat',
    musclemass: 'muscleMass', muscle: 'muscleMass', skeletalmusclemass: 'muscleMass',
    fatfreemass: 'fatFreeMass', leanmass: 'fatFreeMass', fatfree: 'fatFreeMass',
    bodywater: 'bodyWater', water: 'bodyWater', totalbodywater: 'bodyWater', tbw: 'bodyWater',
    bonemass: 'boneMass', bone: 'boneMass',
    visceral: 'visceralFat', visceralfat: 'visceralFat', visceralfatlevel: 'visceralFat', vfl: 'visceralFat',
    bmi: 'bmi', bodymassindex: 'bmi',
    bmr: 'bmr', basalmetabolicrate: 'bmr', basalmetabolism: 'bmr',
    metabolicage: 'metabolicAge', bodyage: 'metabolicAge',
    musclequality: 'muscleQuality', musclequalityscore: 'muscleQuality',
    physiquerating: 'physiqueRating'
  };
  if (table[slug]) return table[slug];

  const keys = Object.keys(METRICS);
  for (let i = 0; i < keys.length; i++) {
    if (slug.indexOf(keys[i].toLowerCase()) !== -1) return keys[i];
  }
  return null;
}
