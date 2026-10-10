/* Composition — review form validation.
   Reads the rendered review DOM and returns either clean data or field errors.
   No saving here (see reading-builder.ts); no rendering here (see review.ts). */

import { $, $$ } from '../core/dom.js';
import { METRICS } from '../core/metrics.js';
import { parseNumber, toDate } from '../core/format.js';
import { reportFieldLabel, METRIC_REPORT_PATH_MAP } from '../domain/report.js';

export type ReviewCheck =
  | { ok: true; metrics: Record<string, number>; reportEdits: Record<string, number | string | null>; measuredAt: Date }
  | { ok: false; errors: string[]; firstBad: HTMLElement | null; empty?: boolean };

function metricInputOf(input: HTMLElement): string {
  return (input as HTMLInputElement).dataset.metric ?? '';
}

function reportPathOf(input: HTMLElement): string {
  return (input as HTMLInputElement).dataset.reportPath ?? '';
}

function reportKindOf(input: HTMLElement): string {
  return (input as HTMLInputElement).dataset.reportKind ?? 'text';
}

/**
 * Validates every metric + report input in the review form.
 */
export function validateReviewForm(): ReviewCheck {
  const errs: string[] = [];
  const metrics: Record<string, number> = {};
  const metricInputs: Record<string, string> = {};

  /* The first field to fail is the one the reader is sent back to, so a bad value
     in a collapsed section still opens that section rather than failing quietly. */
  let firstBad: HTMLElement | null = null;
  const flag = (input: HTMLElement): void => {
    input.setAttribute('aria-invalid', 'true');
    if (!firstBad) firstBad = input;
  };

  $$('#rev-grid input[data-metric]').forEach((input) => {
    const el = input as HTMLInputElement;
    const key = metricInputOf(input);
    const meta = METRICS[key];
    if (!meta) return;
    metricInputs[key] = el.value.trim();
    el.removeAttribute('aria-invalid');
    if (el.value.trim() === '') return;

    const value = parseNumber(el.value);
    if (value == null || isNaN(value)) {
      errs.push(meta.label + ' is not a number.');
      flag(input);
      return;
    }
    if (value < meta.min || value > meta.max) {
      errs.push(meta.label + ' should sit between ' + meta.min + ' and ' + meta.max + (meta.unit ? ' ' + meta.unit : '') + '.');
      flag(input);
      return;
    }
    metrics[key] = value;
  });

  const reportEdits: Record<string, number | string | null> = {};
  $$('#review-form input[data-report-path]').forEach((input) => {
    const el = input as HTMLInputElement;
    const path = reportPathOf(input);
    const raw = el.value.trim();
    el.removeAttribute('aria-invalid');

    if (reportKindOf(input) === 'number') {
      if (raw === '') { reportEdits[path] = null; return; }
      const value = parseNumber(raw);
      if (value == null || isNaN(value)) {
        errs.push(reportFieldLabel(path.split('.').pop() ?? path) + ' is not a number.');
        flag(input);
        return;
      }
      reportEdits[path] = value;
      return;
    }
    reportEdits[path] = raw === '' ? null : raw;
  });

  Object.keys(metricInputs).forEach((key) => {
    const path = METRIC_REPORT_PATH_MAP.get(key);
    if (!path) return;
    reportEdits[path] = metricInputs[key] === '' ? null : (metrics[key] ?? null);
  });

  const dateInput = $('#rev-date') as HTMLInputElement | null;
  const measuredAt = dateInput ? toDate(dateInput.value) : null;
  if (!measuredAt) {
    errs.push('The measurement date is missing.');
    if (dateInput) flag(dateInput);
  }

  if (errs.length) return { ok: false, errors: errs, firstBad };
  if (!Object.keys(metrics).length) {
    return { ok: false, errors: ['Add at least one measurement before saving.'], firstBad: null, empty: true };
  }
  return { ok: true, metrics, reportEdits, measuredAt: measuredAt as Date };
}
