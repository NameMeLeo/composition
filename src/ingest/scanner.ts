/* Composition — camera scanner for report QR codes.
   Owns the video stream, the BarcodeDetector/jsQR engines, and still-photo decode.
   A decoded QR string is routed to the reading pipeline (reading-pipeline.ts);
   this module never fetches or parses reports itself beyond that routing. */

import { $, toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { parseReportUrl, DEFAULT_REPORT_LANGUAGE } from '../services/report-url.js';
import { startReading } from './reading-pipeline.js';

declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => {
      detect(source: HTMLCanvasElement): Promise<Array<{ rawValue?: string; rawText?: string }>>;
    } & { getSupportedFormats?: () => Promise<string[]> };
    __jsQR?: unknown;
    jsQR?: (data: Uint8ClampedArray, w: number, h: number, opts: unknown) => { data?: string } | null;
    jsqr?: (data: Uint8ClampedArray, w: number, h: number, opts: unknown) => { data?: string } | null;
  }
}

interface Detector {
  type: 'native' | 'script';
  impl: unknown;
}

let stream: MediaStream | null = null;
let detector: Detector | null = null;
let scanTimer: number | null = null;
let scanning = false;
let torchOn = false;
let lastHit = '';
let lastHitAt = 0;

/** Prefers the browser's own decoder and falls back to the jsQR script. */
async function ensureDetector(): Promise<Detector | null> {
  if (detector) return detector;

  const w = window as Window & typeof globalThis;
  if ('BarcodeDetector' in window && w.BarcodeDetector) {
    try {
      const BD = w.BarcodeDetector;
      const getFormats = (BD as unknown as { getSupportedFormats?: () => Promise<string[]> }).getSupportedFormats;
      const supported = (getFormats && await getFormats.call(BD)) || [];
      if (!supported.length || supported.indexOf('qr_code') !== -1) {
        detector = { type: 'native', impl: new w.BarcodeDetector({ formats: ['qr_code'] }) };
        return detector;
      }
    } catch (e) { /* fall through to the script engine */ }
  }

  if (!window.__jsQR) {
    await new Promise<void>((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }
  const impl = window.jsQR || window.jsqr;
  if (impl) detector = { type: 'script', impl };
  return detector;
}

export async function openScanner(): Promise<void> {
  $('#sheet-capture').hidden = true;
  ($('#scanner-engine') as HTMLElement).textContent = t('scan.starting');
  ($('#scanner-hint') as HTMLElement).textContent = t('scan.hint');

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    const video = $('#scanner-video') as HTMLVideoElement;
    video.srcObject = stream;
    await video.play();
    scanning = true;

    const engine = await ensureDetector();
    ($('#scanner-engine') as HTMLElement).textContent = engine
      ? (engine.type === 'native' ? t('scan.ready') : t('scan.ready.fallback'))
      : t('scan.ready.photo');
    if (!engine) ($('#scanner-hint') as HTMLElement).textContent = t('scan.nodecoder');
    if (engine) void loop();
  } catch (err) {
    ($('#scanner-engine') as HTMLElement).textContent = t('scan.unavailable');
    ($('#scanner-hint') as HTMLElement).textContent = t('scan.refused');
    toast(t('scan.unavailable.msg', { message: err instanceof Error ? err.message : t('scan.denied') }), 'error');
  }
}

async function loop(): Promise<void> {
  if (!scanning) return;
  const video = $('#scanner-video') as HTMLVideoElement;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const canvas = $('#scanner-canvas') as HTMLCanvasElement;
    // Downscaling keeps the per-frame decode cheap enough to stay responsive.
    const maxSide = 520;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth || 1, video.videoHeight || 1));
    canvas.width = Math.round((video.videoWidth || 1) * scale);
    canvas.height = Math.round((video.videoHeight || 1) * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const text = await readFrame(canvas, ctx);
        if (text) { onDetected(text); return; }
      } catch (e) { /* keep scanning */ }
    }
  }

  scanTimer = window.setTimeout(() => void loop(), 240);
}

async function readFrame(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<string | null> {
  const engine = detector;
  if (!engine) return null;

  if (engine.type === 'native') {
    const native = engine.impl as { detect(c: HTMLCanvasElement): Promise<Array<{ rawValue?: string; rawText?: string }>> };
    const codes = await native.detect(canvas);
    if (codes && codes.length) return codes[0].rawValue || codes[0].rawText || null;
    return null;
  }
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const fn = engine.impl as (data: Uint8ClampedArray, w: number, h: number, opts: unknown) => { data?: string } | null;
  const result = fn(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
  return result?.data ? result.data : null;
}

/** Reads a QR code out of a still photo, for phones with no live decoder. */
export async function scanImageFile(file: File | null): Promise<string | null> {
  if (!file) return null;
  const engine = await ensureDetector();
  if (!engine) return null;

  const bitmap = await createImageBitmap(file);
  const canvas = $('#scanner-canvas') as HTMLCanvasElement;
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return readFrame(canvas, ctx);
}

/** Routes one decoded QR string into the reading pipeline. Exported for tests. */
export function onDetected(text: string): void {
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
        toast(t('scan.playerid.nobase'), 'error');
        return;
      }
      void startReading({ mode: 'player-id', playerId: text.trim(), language: DEFAULT_REPORT_LANGUAGE });
      return;
    }
    toast(t('scan.notlink', { text: text.slice(0, 60) }), 'error');
    return;
  }
  void startReading({ mode: 'report-url', url: parsed.url, playerId: parsed.playerId, language: parsed.language });
}

export function stopScanner(): void {
  scanning = false;
  if (scanTimer !== null) window.clearTimeout(scanTimer);
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  const video = $('#scanner-video') as HTMLVideoElement | null;
  if (video) video.srcObject = null;
  ($('#view-scanner') as HTMLElement).hidden = true;
  torchOn = false;
}

export async function toggleTorch(): Promise<void> {
  if (!stream) return;
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & {
    getCapabilities?: () => { torch?: boolean } & Record<string, unknown>;
    applyConstraints?: (c: unknown) => Promise<void>;
  };
  const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
  if (!track || !track.getCapabilities || !caps?.torch) {
    toast(t('scan.notorch'));
    return;
  }
  torchOn = !torchOn;
  try { await track.applyConstraints?.({ advanced: [{ torch: torchOn }] }); }
  catch (e) { toast(t('scan.torch.fail')); }
}
