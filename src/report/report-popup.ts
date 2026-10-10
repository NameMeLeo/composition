/* Composition — the provider report image popup.
   Opens after any provider-mode ingest (scan, link or player id) has saved:
   the saved reading's raw payload is painted over the bundled bg.png exactly
   like the source page, minus its static text tail. OCR/file/manual flows
   never come here. */

import { $, el, clear, toast } from '../core/dom.js';
import { t, resolveAppLang, metricLabel, type AppLang } from '../core/i18n.js';
import { fmtDateTime, metricText } from '../core/format.js';
import { METRICS } from '../core/metrics.js';
import { OcrProxy } from '../services/ocr.js';
import { Route } from '../core/router.js';
import {
  renderReportImage, loadImage, resolveReportLang, assetPageUrl
} from './report-image.js';
import type { ReportLang } from './overlay-table.js';
import type { Reading } from '../domain/types.js';

const ICON_NAMES = ['star.png', 'middle.png', 'left.png', 'right.png', 'circle.png'];

/* Session cache: five tiny icons, refetched at most once per provider host. */
const iconCache = new Map<string, Promise<HTMLImageElement | null>>();

function iconKey(pageUrl: string, name: string): string {
  let origin = '';
  try { origin = new URL(pageUrl).origin; } catch { origin = pageUrl; }
  return origin + '|' + name;
}

function loadIcon(pageUrl: string, name: string): Promise<HTMLImageElement | null> {
  const key = iconKey(pageUrl, name);
  const held = iconCache.get(key);
  if (held) return held;
  const job = (async (): Promise<HTMLImageElement | null> => {
    try {
      if (!OcrProxy.isConfigured()) return null;
      const asset = await OcrProxy.reportAsset(pageUrl, name);
      const bytes = Uint8Array.from(atob(asset.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: asset.mime || 'image/png' }));
      try {
        return await loadImage(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      return null;
    }
  })();
  iconCache.set(key, job);
  return job;
}

function appReportLang(): ReportLang {
  const lang: AppLang = resolveAppLang();
  return lang === 'en' ? 'en' : lang === 'sc' ? 'sc' : 'tc';
}

function metaLine(reading: Reading): string {
  const bits = [fmtDateTime(reading.measuredAt)];
  if (reading.playerId) bits.push('player ' + reading.playerId);
  return bits.join(' · ');
}

/** Key facts beside the canvas: date lives in the header, values live here. */
function renderFacts(reading: Reading): HTMLElement {
  const facts = el('div', 'report__facts');
  const add = (label: string, value: string): void => {
    if (!value || value === '—') return;
    const chip = el('span', 'report__fact');
    chip.appendChild(el('b', undefined, value));
    chip.appendChild(document.createTextNode(' ' + label));
    facts.appendChild(chip);
  };
  for (const key of ['weight', 'bodyFat', 'muscleMass', 'visceralFat', 'bmi']) {
    const value = reading.metrics ? reading.metrics[key] : null;
    if (typeof value === 'number') add(metricLabel(key, METRICS[key].label).toLowerCase(), metricText(key, value));
  }
  return facts;
}

function downloadCanvas(canvas: HTMLCanvasElement): void {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Self-test Fitness Corner_' + Date.now() + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(t('popup.downloaded'));
}

/** Opens the popup for an already-saved provider reading. */
export async function openReportPopup(reading: Reading): Promise<void> {
  const sheet = $('#sheet-report');
  const body = $('#report-body');
  const foot = $('#report-foot');
  clear(body);
  clear(foot);

  ($('#report-title') as HTMLElement).textContent = t('popup.title');
  ($('#report-meta') as HTMLElement).textContent = metaLine(reading);
  sheet.hidden = false;

  const status = el('p', 'rev__hint', t('popup.rendering'));
  body.appendChild(status);

  const raw = reading.report?.provider_details?.raw as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') {
    status.textContent = t('popup.fail');
    return;
  }

  const lang = resolveReportLang(reading.language, appReportLang());
  const pageUrl = assetPageUrl(reading);

  let bg: HTMLImageElement;
  try {
    bg = await loadImage('assets/report/' + lang + '/bg.png');
  } catch {
    try {
      bg = await loadImage('assets/report/tc/bg.png');
    } catch {
      status.textContent = t('popup.fail');
      return;
    }
  }

  const icons = new Map<string, HTMLImageElement | null>();
  await Promise.all(ICON_NAMES.map(async (name) => {
    icons.set(name, await loadIcon(pageUrl, name));
  }));

  let canvas: HTMLCanvasElement;
  try {
    canvas = renderReportImage(raw, lang, bg, icons);
  } catch {
    status.textContent = t('popup.fail');
    return;
  }

  clear(body);
  body.appendChild(renderFacts(reading));
  canvas.className = 'report__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', t('popup.title') + ' · ' + metaLine(reading));
  body.appendChild(canvas);

  const btnDetails = el('button', 'btn btn--ghost') as HTMLButtonElement;
  btnDetails.type = 'button';
  btnDetails.textContent = t('popup.details');
  btnDetails.addEventListener('click', () => {
    closeReportPopup();
    Route.go('detail', reading.id);
  });

  const btnDownload = el('button', 'btn btn--ghost') as HTMLButtonElement;
  btnDownload.type = 'button';
  btnDownload.textContent = t('popup.download');
  btnDownload.addEventListener('click', () => downloadCanvas(canvas));

  const btnClose = el('button', 'btn btn--primary od-fill') as HTMLButtonElement;
  btnClose.type = 'button';
  btnClose.textContent = t('popup.close');
  btnClose.addEventListener('click', closeReportPopup);

  foot.append(btnDetails, btnDownload, btnClose);
  ($('#report-meta') as HTMLElement).textContent = metaLine(reading);
}

export function closeReportPopup(): void {
  ($('#sheet-report') as HTMLElement).hidden = true;
}
