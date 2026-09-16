/* Composition — getting a report into the app.
   Three doors in: the paste-the-link sheet, the camera scanner, and a shared
   file. All of them end in the same place — an extraction handed to the review
   screen, or a failed fetch that offers manual entry instead. */

import { $, $$, toast } from '../core/dom.js';
import { METRICS } from '../core/metrics.js';
import { parseNumber } from '../core/format.js';
import { OcrProxy } from '../services/ocr.js';
import { parseReportUrl, playerReportUrl, reportBase, DEFAULT_REPORT_LANGUAGE } from '../services/report-url.js';
import { openReview, saveReadingDirect } from './review.js';

let stream = null;
let detector = null;
let scanTimer = null;
let scanning = false;
let torchOn = false;
let lastHit = '';
let lastHitAt = 0;

/* ------------------------------------------------------------------ */
/* The link sheet                                                      */
/* ------------------------------------------------------------------ */

function openSheet() {
  $('#sheet-capture').hidden = false;
  const input = $('#in-report-url');
  input.value = '';
  // The sheet exists to take one paste, so it opens with the caret already there.
  window.requestAnimationFrame(() => input.focus());
}

function closeSheet() {
  $('#sheet-capture').hidden = true;
}

/* ------------------------------------------------------------------ */
/* Scanner                                                             */
/* ------------------------------------------------------------------ */

/** Prefers the browser's own decoder and falls back to the jsQR script. */
async function ensureDetector() {
  if (detector) return detector;

  if ('BarcodeDetector' in window) {
    try {
      const supported = (BarcodeDetector.getSupportedFormats && await BarcodeDetector.getSupportedFormats()) || [];
      if (!supported.length || supported.indexOf('qr_code') !== -1) {
        detector = { type: 'native', impl: new window.BarcodeDetector({ formats: ['qr_code'] }) };
        return detector;
      }
    } catch (e) { /* fall through to the script engine */ }
  }

  if (!window.__jsQR) {
    await new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }
  const impl = window.jsQR || window.jsqr;
  if (impl) detector = { type: 'script', impl };
  return detector;
}

async function openScanner() {
  closeSheet();
  $('#view-scanner').hidden = false;
  $('#scanner-engine').textContent = 'Starting camera';
  $('#scanner-hint').textContent = 'Line the QR code up inside the frame';

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    const video = $('#scanner-video');
    video.srcObject = stream;
    await video.play();
    scanning = true;

    const engine = await ensureDetector();
    $('#scanner-engine').textContent = engine
      ? (engine.type === 'native' ? 'Camera ready' : 'Camera ready (fallback reader)')
      : 'Camera ready — photo mode';
    if (!engine) $('#scanner-hint').textContent = 'This browser has no in-page decoder. Take a photo of the code instead.';
    if (engine) loop();
  } catch (err) {
    $('#scanner-engine').textContent = 'Camera unavailable';
    $('#scanner-hint').textContent = 'Camera access was refused or is unavailable. Use the report link or a photo instead.';
    toast('Camera unavailable: ' + (err && err.message ? err.message : 'permission denied'), 'error');
  }
}

async function loop() {
  if (!scanning) return;
  const video = $('#scanner-video');

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const canvas = $('#scanner-canvas');
    // Downscaling keeps the per-frame decode cheap enough to stay responsive.
    const maxSide = 520;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth || 1, video.videoHeight || 1));
    canvas.width = Math.round((video.videoWidth || 1) * scale);
    canvas.height = Math.round((video.videoHeight || 1) * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const text = await readFrame(canvas, ctx);
      if (text) { onDetected(text); return; }
    } catch (e) { /* keep scanning */ }
  }

  scanTimer = window.setTimeout(loop, 240);
}

async function readFrame(canvas, ctx) {
  const engine = detector;
  if (!engine) return null;

  if (engine.type === 'native') {
    const codes = await engine.impl.detect(canvas);
    if (codes && codes.length) return codes[0].rawValue || codes[0].rawText || null;
    return null;
  }
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = engine.impl(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
  return result && result.data ? result.data : null;
}

/** Reads a QR code out of a still photo, for phones with no live decoder. */
async function scanImageFile(file) {
  if (!file) return null;
  const engine = await ensureDetector();
  if (!engine) return null;

  const bitmap = await createImageBitmap(file);
  const canvas = $('#scanner-canvas');
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return readFrame(canvas, ctx);
}

function onDetected(text) {
  const now = Date.now();
  // The same code stays in frame for several ticks; only act once per sighting.
  if (text === lastHit && now - lastHitAt < 2500) return;
  lastHit = text;
  lastHitAt = now;
  stopScanner();

  const parsed = parseReportUrl(text);
  if (!parsed.ok) {
    if (/\d{6,}/.test(text)) {
      // A bare id is only resolvable if we know which report site to ask.
      if (parsed.reason === 'no-base') {
        toast('A player id on its own needs a report address to look up. Add one in Settings.', 'error');
        return;
      }
      startReading({ mode: 'player-id', playerId: text.trim(), language: DEFAULT_REPORT_LANGUAGE });
      return;
    }
    toast('That code is not a report link: ' + text.slice(0, 60), 'error');
    return;
  }
  startReading({ mode: 'report-url', url: parsed.url, playerId: parsed.playerId, language: parsed.language });
}

function stopScanner() {
  scanning = false;
  window.clearTimeout(scanTimer);
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  const video = $('#scanner-video');
  if (video) video.srcObject = null;
  $('#view-scanner').hidden = true;
  torchOn = false;
}

async function toggleTorch() {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  if (!track || !track.getCapabilities || !track.getCapabilities().torch) {
    toast('This camera has no torch control.');
    return;
  }
  torchOn = !torchOn;
  try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); }
  catch (e) { toast('The torch could not be switched.'); }
}

/* ------------------------------------------------------------------ */
/* The reading pipeline                                                */
/* ------------------------------------------------------------------ */

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function setStep(name, state) {
  const node = $('#proc-steps li[data-step="' + name + '"]');
  if (node) node.dataset.state = state;
}

function showProcessing(title, body, steps) {
  $('#proc-title').textContent = title;
  $('#proc-body').textContent = body;
  $$('#proc-steps li').forEach((li) => { li.dataset.state = steps.indexOf(li.dataset.step) !== -1 ? 'active' : ''; });
  $('#overlay-processing').hidden = false;
}

function hideProcessing() { $('#overlay-processing').hidden = true; }

function extractionMethod(result) {
  if (result && (result.sourceType === 'tanita-api' || result.report?.provider_details?.source === 'tanita-api')) {
    return 'Tanita provider API (OCR not used)';
  }
  const format = result && result.sourceType ? ' (' + result.sourceType + ')' : '';
  return 'OCR fallback' + format;
}

function isProviderResult(result) {
  return Boolean(result && (result.sourceType === 'tanita-api' || result.report?.provider_details?.source === 'tanita-api'));
}

/**
 * Fetches and reads one report, then hands it to the review screen.
 * @param {{mode: 'manual'|'file'|'report-url'|'player-id', file?: File, url?: string, playerId?: string, language?: string}} job
 */
async function startReading(job) {
  if (job.mode === 'manual') {
    openReview({
      metrics: {}, measuredAt: new Date().toISOString(), confidence: null, raw: null, notes: '',
      playerId: null, language: null, reportUrl: null, source: 'manual', previewUrl: null,
      sourceType: null, extractionMethod: 'Manual entry', note: 'Entered by hand.'
    });
    return;
  }

  showProcessing('Reading the report', 'Fetching the page for you, then reading it.', ['fetch']);
  let result = null;
  let previewUrl = null;
  let note = '';

  try {
    if (job.mode === 'file') {
      setStep('fetch', 'done');
      setStep('ocr', 'active');
      $('#proc-title').textContent = 'Reading the attachment';
      $('#proc-body').textContent = 'Sending ' + job.file.name + ' straight for reading — no fetching needed.';
      previewUrl = job.file.type && job.file.type.indexOf('image/') === 0 ? URL.createObjectURL(job.file) : null;
      const data = await fileToBase64(job.file);
      result = await OcrProxy.fromDocument(job.file.type || 'application/octet-stream', data);
        note = 'Read from ' + job.file.name + ' with ' + extractionMethod(result) + '.';
    } else if (job.mode === 'report-url') {
      if (!OcrProxy.isConfigured()) throw new Error('The OCR proxy is not configured, so the report cannot be fetched or read. Add your Supabase details in Settings, or enter the numbers by hand.');
      result = await OcrProxy.fromReportUrl(job.url);
        note = 'Fetched from ' + parseReportUrl(job.url).host + ' via ' + extractionMethod(result) + '.';
    } else if (job.mode === 'player-id') {
      if (!reportBase()) throw new Error('Only a player id was found, and no report address is configured. Add one in Settings, or paste the full report link.');
      const built = playerReportUrl(job.playerId, job.language);
      if (!OcrProxy.isConfigured()) throw new Error('Only a player id was found. The full report link is needed, and the proxy must be configured to fetch it.');
      result = await OcrProxy.fromReportUrl(built);
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
    if (err && err.code === 'AUTH_REQUIRED') return;
    const message = err && err.message ? err.message : 'The report could not be read.';
    const proceed = window.confirm(message + '\n\nOpen the review screen and type the numbers instead?');
    if (!proceed) return;
    result = { metrics: {}, measuredAt: new Date().toISOString(), failed: true };
    note = 'Entered by hand after: ' + message;
  }

  hideProcessing();
  const review = {
    metrics: normaliseMetrics(result.metrics || {}),
    report: result.report || null,
    measuredAt: result.measuredAt || new Date().toISOString(),
    confidence: typeof result.confidence === 'number' ? result.confidence : null,
    raw: result.text || result.raw || null,
    notes: result.notes || '',
    playerId: job.playerId || null,
    language: job.language || null,
    reportUrl: job.url || null,
    source: job.mode === 'file' ? 'file' : job.mode === 'report-url' ? 'link' : 'qr',
    sourceType: result.sourceType || result.report?.provider_details?.source || null,
    extractionMethod: result.failed ? 'Manual entry after extraction failure' : extractionMethod(result),
    previewUrl,
    note
  };

  if (isProviderResult(result)) {
    try {
      await saveReadingDirect(review);
    } catch (err) {
      toast('Could not save the provider reading: ' + (err && err.message ? err.message : 'unknown error'), 'error');
    }
    return;
  }

  openReview(review);
}

/** Maps whatever keys the reader returned onto our metric ids. */
function normaliseMetrics(input) {
  const out = {};
  Object.keys(input || {}).forEach((rawKey) => {
    const key = matchMetric(rawKey);
    if (!key) return;
    const value = parseNumber(input[rawKey]);
    if (value == null) return;
    out[key] = value;
  });
  return out;
}

function matchMetric(rawKey) {
  if (METRICS[rawKey]) return rawKey;
  const slug = String(rawKey).toLowerCase().replace(/[^a-z]/g, '');

  const table = {
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

export const Capture = {
  openSheet,
  closeSheet,
  openScanner,
  stopScanner,
  toggleTorch,
  scanImageFile,
  startReading
};
