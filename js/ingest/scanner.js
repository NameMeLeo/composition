/* Composition — camera scanner for report QR codes.
   Owns the video stream, the BarcodeDetector/jsQR engines, and still-photo decode.
   A decoded QR string is routed to the reading pipeline (reading-pipeline.js);
   this module never fetches or parses reports itself beyond that routing. */

import { $, toast } from '../core/dom.js';
import { parseReportUrl, DEFAULT_REPORT_LANGUAGE } from '../services/report-url.js';
import { startReading } from './reading-pipeline.js';

let stream = null;
let detector = null;
let scanTimer = null;
let scanning = false;
let torchOn = false;
let lastHit = '';
let lastHitAt = 0;

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

export async function openScanner() {
  $('#sheet-capture').hidden = true;
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
export async function scanImageFile(file) {
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

/** Routes one decoded QR string into the reading pipeline. Exported for tests. */
export function onDetected(text) {
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

export function stopScanner() {
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

export async function toggleTorch() {
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
