/* Composition — rendering a provider report as the source page draws it.
   Replicates the Tanita report page's canvas composition (js/index.js setData):
   bg.png underneath, the JSON payload overlaid at the same coordinates, the
   static text.jpg tail dropped. Values come from report.provider_details.raw,
   so no network beyond the background and the small overlay icons.

   All coordinates live in overlay-table.ts; this module only walks the table. */

import {
  TEXT_OPS, BLOCK_BARS, BLOCK_TX, BLOCK_PITCH, BLOCK_W, BLOCK_H,
  STAR_SLOTS, STAR_DEFAULT, BALANCE_MARKS, BALANCE_X, LEG,
  PENTAGRAMS, PENTA_R, PENTA_ROT, PENTA_ANGLES, pentaRadius, OVERLAY_FONT,
  type ReportLang
} from './overlay-table.js';
import { reportBase } from '../services/report-url.js';
import { DEFAULT_REPORT_BASE } from '../core/constants.js';
import type { Reading } from '../domain/types.js';

/** Numbers arrive as numbers or unit-carrying strings ("22.0kg"). */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

/** Which bundled background the report uses: the job language when it names a
    shipped folder, otherwise the app language (sc shares tc's layout). */
export function resolveReportLang(readingLang: unknown, appLang: ReportLang): ReportLang {
  const w = String(readingLang || '').trim().toLowerCase();
  if (w.startsWith('en')) return 'en';
  if (w === 'sc' || w === 'cn' || w === 'hans' || w === 'zh-cn' || w === 'zh-sg') return 'sc';
  if (w === 'tc' || w === '' || w.startsWith('zh')) return w.includes('cn') || w.includes('hans') || w.includes('sg') ? 'sc' : 'tc';
  return appLang;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load: ' + src));
    img.src = src;
  });
}

/** A report-page URL on the provider host, needed only to aim the icon proxy. */
export function assetPageUrl(reading: Reading): string {
  if (reading.reportUrl) return reading.reportUrl;
  const base = (reportBase() || DEFAULT_REPORT_BASE).replace(/\/+$/, '') + '/';
  const player = reading.playerId ? '?player_id=' + encodeURIComponent(reading.playerId) : '';
  return base + player;
}

/* Derived overlay strings, computed exactly like the source page. */
function derived(field: string, raw: Record<string, unknown>, lang: ReportLang): string {
  switch (field) {
    case '__gender': {
      const male = num(raw.gender) === 1;
      return lang === 'en' ? (male ? 'M' : 'F') : male ? '男' : '女';
    }
    case '__bmiRange': return '18.5 ~ 22.9';
    case '__stdweightRange': return text(raw.stdweight_LR) + ' ~ ' + text(raw.stdweight_HR);
    case '__fatrateRange': return text(raw.fatrate_LR) + ' ~ ' + text(raw.fatrate_HR);
    case '__fatkgRange': return text(raw.fatkg_LR) + ' ~ ' + text(raw.fatkg_HR);
    case '__stdmuscleRange': return text(raw.stdmusclekg_LR) + ' ~ ' + text(raw.stdmusclekg_HR);
    case '__muscleWater': {
      const m = num(raw.muscle_weight);
      const w = num(raw.water_weight);
      return m == null || w == null ? '' : (m - w).toFixed(1);
    }
    case '__waterPct': {
      const w = num(raw.water_weight);
      const t = num(raw.weight);
      return w == null || t == null || t === 0 ? '' : ((w / t) * 100).toFixed(1);
    }
    case '__waterOutRatio': {
      const o = num(raw.water_out);
      const w = num(raw.water_weight);
      return o == null || w == null || w === 0 ? '' : ((o / w) * 100).toFixed(1);
    }
    default: return '';
  }
}

function drawTexts(ctx: CanvasRenderingContext2D, raw: Record<string, unknown>, lang: ReportLang): void {
  ctx.fillStyle = '#000';
  ctx.font = OVERLAY_FONT;
  ctx.textAlign = 'left';
  for (const op of TEXT_OPS) {
    const value = op.field.startsWith('__')
      ? derived(op.field, raw, lang)
      : text(raw[op.field]) + (op.suffix ?? '');
    ctx.textAlign = op.align ?? 'left';
    ctx.fillText(value, lang === 'en' && op.xEn != null ? op.xEn : op.x, op.y);
  }
  ctx.textAlign = 'left';
}

function drawBlocks(ctx: CanvasRenderingContext2D, raw: Record<string, unknown>): void {
  ctx.fillStyle = '#000';
  for (const bar of BLOCK_BARS) {
    const count = num(raw[bar.field]);
    if (count == null) continue;
    for (let i = 0; i < count; i++) {
      ctx.fillRect(BLOCK_TX + i * BLOCK_PITCH, bar.y, BLOCK_W, BLOCK_H);
    }
  }
}

function drawPentagrams(ctx: CanvasRenderingContext2D, raw: Record<string, unknown>): void {
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.font = OVERLAY_FONT;
  for (const p of PENTAGRAMS) {
    const values = p.fields.map((f) => raw[f]);
    const radii = values.map((v) => {
      const n = num(v);
      return n == null || isNaN(n) ? NaN : pentaRadius(n);
    });
    ctx.beginPath();
    const r0 = radii[0];
    if (!isNaN(r0)) ctx.moveTo(p.x, p.y - r0);
    ctx.textAlign = 'center';
    ctx.fillText(text(values[0]), p.x, p.y - PENTA_R - PENTA_ROT + 20);
    for (let i = 1; i < radii.length; i++) {
      if (!isNaN(radii[i])) {
        ctx.lineTo(p.x + radii[i] * Math.cos(PENTA_ANGLES[i - 1]), p.y + radii[i] * Math.sin(PENTA_ANGLES[i - 1]));
      }
      ctx.textAlign = i === 1 || i === 2 ? 'left' : 'right';
      ctx.fillText(
        text(values[i]),
        p.x + (PENTA_R + PENTA_ROT) * Math.cos(PENTA_ANGLES[i - 1]),
        p.y + (PENTA_R + PENTA_ROT) * Math.sin(PENTA_ANGLES[i - 1]) + 20
      );
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.textAlign = 'left';
}

/**
 * Paints the full report onto a canvas at BG-native resolution.
 * Icons that failed to load are passed as null and skipped, never fatal.
 */
export function renderReportImage(
  raw: Record<string, unknown>,
  lang: ReportLang,
  bg: HTMLImageElement,
  icons: Map<string, HTMLImageElement | null>
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = bg.naturalWidth || bg.width;
  canvas.height = bg.naturalHeight || bg.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

  drawTexts(ctx, raw, lang);
  drawBlocks(ctx, raw);
  drawPentagrams(ctx, raw);

  const star = icons.get('star.png');
  if (star) {
    const slot = STAR_SLOTS[Math.round(num(raw.body_index) ?? NaN)] ?? STAR_DEFAULT;
    ctx.drawImage(star, slot.x - star.width / 2, slot.y - star.height / 2, star.width, star.height);
  }

  for (const mark of BALANCE_MARKS) {
    const score = num(raw[mark.field]);
    const name = score != null && score > 0 ? 'right.png' : score != null && score < 0 ? 'left.png' : 'middle.png';
    const img = icons.get(name);
    if (img) ctx.drawImage(img, BALANCE_X - img.width / 2, mark.y, img.width, img.height);
  }

  const circle = icons.get('circle.png');
  const age = num(raw.age);
  const leg = num(raw.legmusiclescore);
  if (circle && age != null && leg != null) {
    const mx = ((age - 20) / 10) * LEG.w;
    const my = ((leg - 60) / 10) * LEG.h;
    ctx.drawImage(circle, LEG.x - circle.width / 2 + mx, LEG.y - circle.height / 2 - my, circle.width, circle.height);
  }

  return canvas;
}
