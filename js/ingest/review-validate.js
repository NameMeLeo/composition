/* Composition — review form validation.
   Reads the rendered review DOM and returns either clean data or field errors.
   No saving here (see reading-builder.js); no rendering here (see review.js). */

import { $, $$ } from '../core/dom.js';
import { METRICS } from '../core/metrics.js';
import { parseNumber, toDate } from '../core/format.js';
import { reportFieldLabel, METRIC_REPORT_PATH_MAP } from '../domain/report.js';

/**
 * Validates every metric + report input in the review form.
 * @returns {{ok: true, metrics, reportEdits, measuredAt} | {ok: false, errors, firstBad}}
 */
export function validateReviewForm() {
  const errs = [];
  const metrics = {};
  const metricInputs = {};

  /* The first field to fail is the one the reader is sent back to, so a bad value
     in a collapsed section still opens that section rather than failing quietly. */
  let firstBad = null;
  const flag = (input) => {
    input.setAttribute('aria-invalid', 'true');
    if (!firstBad) firstBad = input;
  };

  $$('#rev-grid input[data-metric]').forEach((input) => {
    const key = input.dataset.metric;
    const meta = METRICS[key];
    metricInputs[key] = input.value.trim();
    input.removeAttribute('aria-invalid');
    if (input.value.trim() === '') return;

    const value = parseNumber(input.value);
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

  const reportEdits = {};
  $$('#review-form input[data-report-path]').forEach((input) => {
    const path = input.dataset.reportPath;
    const raw = input.value.trim();
    input.removeAttribute('aria-invalid');

    if (input.dataset.reportKind === 'number') {
      if (raw === '') { reportEdits[path] = null; return; }
      const value = parseNumber(raw);
      if (value == null || isNaN(value)) {
        errs.push(reportFieldLabel(path.split('.').pop()) + ' is not a number.');
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
    reportEdits[path] = metricInputs[key] === '' ? null : metrics[key];
  });

  const dateInput = $('#rev-date');
  const measuredAt = dateInput ? toDate(dateInput.value) : null;
  if (!measuredAt) {
    errs.push('The measurement date is missing.');
    if (dateInput) flag(dateInput);
  }

  if (errs.length) return { ok: false, errors: errs, firstBad };
  if (!Object.keys(metrics).length) {
    return { ok: false, errors: ['Add at least one measurement before saving.'], firstBad: null, empty: true };
  }
  return { ok: true, metrics, reportEdits, measuredAt };
}
