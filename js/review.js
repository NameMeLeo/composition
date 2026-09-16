/* Composition — the review screen.
   Everything the reader extracted lands here for a human to confirm before it is
   written to the device. This is the only place a reading is created. */

import { $, $$, el, clear, uid, toast } from './dom.js';
import {
  METRICS, METRIC_ORDER,
  REPORT_SECTION_LABELS, REPORT_FIELD_LABELS, REPORT_FIELD_UNITS
} from './metrics.js';
import { parseNumber, toDate } from './format.js';
import { addReading } from './store.js';
import { Settings } from './settings.js';
import { Auth } from './auth.js';
import { mirrorSync } from './sync.js';
import { Route } from './router.js';

let reviewState = null;

function reportFieldLabel(key) {
  if (REPORT_FIELD_LABELS[key]) return REPORT_FIELD_LABELS[key];
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Report values already shown by an editable metric field, keyed by their path in
// the report. Skipped below so the same number is never shown twice.
const REPORT_METRIC_PATHS = new Set([
  'metadata.test_date',
  'user_profile.weight_kg',
  'key_indicators.bmi',
  'key_indicators.metabolic_age',
  'key_indicators.visceral_fat_rating',
  'key_indicators.physique_rating',
  'key_indicators.physique_rating_score',
  'key_indicators.muscle_quality_score',
  'body_composition.fat_percentage',
  'body_composition.muscle_mass_kg',
  'body_composition.fat_free_mass_kg',
  'body_composition.bone_mass_kg',
  'body_composition.total_body_water_percent',
  'body_composition.bmr_kcal'
]);

// Flattens a report section into editable leaves, naming nested groups after their
// parent so a segmental value reads "Muscle mass · Trunk".
function reportLeaves(section, path, group, out) {
  Object.keys(section || {}).forEach((key) => {
    if (key === 'leg_muscle_score') return;
    const item = section[key];
    if (item == null || item === '') return;
    const next = path ? path + '.' + key : key;
    if (typeof item === 'object' && !Array.isArray(item)) {
      reportLeaves(item, next, reportFieldLabel(key), out);
      return;
    }
    if (REPORT_METRIC_PATHS.has(next)) return;
    const label = reportFieldLabel(key);
    out.push({ path: next, label: group ? group + ' · ' + label : label, value: item });
  });
  return out;
}

function reviewReportField(leaf) {
  const field = el('div', 'rev__field');
  const id = 'rev-report-' + leaf.path.replace(/\./g, '-');
  const unit = REPORT_FIELD_UNITS[leaf.path.split('.').pop()];

  const label = el('label', 'rev__label', leaf.label + (unit ? ' · ' + unit : ''));
  label.setAttribute('for', id);
  field.appendChild(label);

  const numeric = typeof leaf.value === 'number';
  const input = document.createElement('input');
  input.className = 'rev__input';
  input.id = id;
  input.dataset.reportPath = leaf.path;
  input.dataset.reportKind = numeric ? 'number' : 'text';
  if (numeric) {
    input.type = 'number';
    input.step = 'any';
    input.inputMode = 'decimal';
  } else {
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
  }
  input.value = String(leaf.value);
  field.appendChild(input);
  return field;
}

function reviewField(key, value) {
  const meta = METRICS[key];
  const field = el('div', 'rev__field');
  const id = 'rev-' + key;

  const label = el('label', 'rev__label', meta.label + (meta.unit ? ' · ' + meta.unit : ''));
  label.setAttribute('for', id);
  field.appendChild(label);

  const input = document.createElement('input');
  input.className = 'rev__input';
  input.id = id;
  input.dataset.metric = key;
  input.type = 'number';
  input.step = meta.digits === 0 ? '1' : (meta.digits === 1 ? '0.1' : '0.01');
  input.min = String(meta.min);
  input.max = String(meta.max);
  input.inputMode = 'decimal';
  input.value = value == null || value === '' ? '' : String(value);
  field.appendChild(input);
  return field;
}

/** Writes the edited report values back onto a copy of the extracted report. */
function applyReportEdits(report, edits) {
  if (!report) return null;
  const next = JSON.parse(JSON.stringify(report));
  Object.keys(edits).forEach((path) => {
    const parts = path.split('.');
    let node = next;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (edits[path] === null) delete node[last];
    else node[last] = edits[path];
  });
  return next;
}

function toLocalInput(iso) {
  const d = toDate(iso) || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/**
 * Opens the review screen.
 * @param {object} state Extraction result: metrics, report, measuredAt, source…
 */
export function openReview(state) {
  reviewState = Object.assign({ extras: [] }, state);
  const host = $('#review-body');
  clear(host);

  if (state.note) {
    const p = el('p', 'rev__hint');
    p.style.marginTop = 'var(--s-2)';
    p.textContent = state.note;
    host.appendChild(p);
  }

  if (state.previewUrl) {
    const wrap = el('div', 'rev__preview');
    const img = document.createElement('img');
    img.src = state.previewUrl;
    img.alt = 'The attachment being read';
    img.width = 800;
    img.height = 600;
    wrap.appendChild(img);
    host.appendChild(wrap);
  }

  const form = el('form', 'rev');
  form.id = 'review-form';
  form.noValidate = true;
  form.style.marginTop = 'var(--s-3)';

  /* Block one: the values that get saved. */
  const measuring = el('div', 'rev__block');
  const h = el('div', 'rev__head');
  h.appendChild(el('div', 'rev__title', 'Measurement'));
  measuring.appendChild(h);

  const dateField = el('div', 'rev__field');
  dateField.style.marginTop = 'var(--s-3)';
  const dateLabel = el('label', 'rev__label', 'Measured at');
  dateLabel.setAttribute('for', 'rev-date');
  dateField.appendChild(dateLabel);

  const dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.className = 'rev__input';
  dateInput.id = 'rev-date';
  dateInput.value = toLocalInput(state.measuredAt);
  dateField.appendChild(dateInput);
  measuring.appendChild(dateField);

  const grid = el('div', 'rev__grid');
  grid.id = 'rev-grid';
  measuring.appendChild(grid);

  Object.keys(state.metrics).forEach((key) => { grid.appendChild(reviewField(key, state.metrics[key])); });

  const addRow = el('div', 'od-row');
  addRow.style.marginTop = 'var(--s-3)';

  const select = document.createElement('select');
  select.className = 'rev__input od-fill';
  select.id = 'rev-add';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = 'Add another metric';
  select.appendChild(opt0);
  METRIC_ORDER.forEach((key) => {
    if (state.metrics[key] != null) return;
    const o = document.createElement('option');
    o.value = key;
    o.textContent = METRICS[key].label + (METRICS[key].unit ? ' (' + METRICS[key].unit + ')' : '');
    select.appendChild(o);
  });
  select.addEventListener('change', () => {
    const key = select.value;
    if (!key) return;
    grid.appendChild(reviewField(key, ''));
    const existing = Array.from(select.options).find((o) => o.value === key);
    if (existing) existing.remove();
    select.value = '';
  });
  addRow.appendChild(select);
  measuring.appendChild(addRow);
  form.appendChild(measuring);

  /* Block two: the extracted report. Its metadata is context rather than data you
     would retype, so it reads back as plain text; the rest stays editable. */
  if (state.report) {
    const metadata = reportLeaves(state.report.metadata, 'metadata', '', []);
    const sections = Object.keys(REPORT_SECTION_LABELS)
      .filter((key) => key !== 'metadata')
      .map((key) => ({ key, leaves: reportLeaves(state.report[key], key, '', []) }))
      .filter((entry) => entry.leaves.length);

    if (metadata.length || sections.length) {
      const reportBlock = el('div', 'rev__block');
      const rh = el('div', 'rev__head');
      rh.appendChild(el('div', 'rev__title', 'From the report'));
      reportBlock.appendChild(rh);

      if (metadata.length) {
        const readout = el('div', 'rev__readout');
        const metaGrid = el('div', 'detail__grid');
        metadata.forEach((leaf) => {
          const row = el('div', 'detail__row');
          row.appendChild(el('span', 'detail__k', leaf.label));
          row.appendChild(el('span', 'detail__v', String(leaf.value)));
          metaGrid.appendChild(row);
        });
        readout.appendChild(metaGrid);
        reportBlock.appendChild(readout);
      }

      sections.forEach((entry) => {
        const group = el('div', 'rev__group');
        group.appendChild(el('div', 'rev__subtitle', REPORT_SECTION_LABELS[entry.key]));
        const reportGrid = el('div', 'rev__grid');
        entry.leaves.forEach((leaf) => reportGrid.appendChild(reviewReportField(leaf)));
        group.appendChild(reportGrid);
        reportBlock.appendChild(group);
      });

      form.appendChild(reportBlock);
    }
  }

  host.appendChild(form);

  const errBox = el('p', 'rev__error');
  errBox.id = 'rev-error';
  errBox.hidden = true;
  host.appendChild(errBox);

  $('#view-review').hidden = false;
  const first = $('#rev-grid input');
  if (first) first.focus();
}

export function closeReview() {
  $('#view-review').hidden = true;
  if (reviewState && reviewState.previewUrl) URL.revokeObjectURL(reviewState.previewUrl);
  reviewState = null;
}

/** Validates every field, builds the reading and saves it. */
export async function saveReview() {
  if (!reviewState) return;
  const errBox = $('#rev-error');
  const errs = [];
  const metrics = {};

  $$('#rev-grid input[data-metric]').forEach((input) => {
    const key = input.dataset.metric;
    const meta = METRICS[key];
    input.removeAttribute('aria-invalid');
    if (input.value.trim() === '') return;

    const value = parseNumber(input.value);
    if (value == null || isNaN(value)) {
      errs.push(meta.label + ' is not a number.');
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    if (value < meta.min || value > meta.max) {
      errs.push(meta.label + ' should sit between ' + meta.min + ' and ' + meta.max + (meta.unit ? ' ' + meta.unit : '') + '.');
      input.setAttribute('aria-invalid', 'true');
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
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      reportEdits[path] = value;
      return;
    }
    reportEdits[path] = raw === '' ? null : raw;
  });

  const measuredAt = toDate($('#rev-date').value);
  if (!measuredAt) errs.push('The measurement date is missing.');

  if (errs.length) {
    errBox.hidden = false;
    errBox.textContent = errs.join(' ');
    errBox.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (!Object.keys(metrics).length) {
    errBox.hidden = false;
    errBox.textContent = 'Add at least one measurement before saving.';
    return;
  }

  const reading = {
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    measuredAt: measuredAt.toISOString(),
    source: reviewState.source || 'manual',
    playerId: reviewState.playerId || null,
    language: reviewState.language || null,
    reportUrl: reviewState.reportUrl || null,
    note: reviewState.notes || reviewState.note || '',
    confidence: reviewState.confidence,
    raw: reviewState.raw,
    report: applyReportEdits(reviewState.report, reportEdits),
    metrics
  };

  try {
    await addReading(reading);
  } catch (err) {
    errBox.hidden = false;
    errBox.textContent = 'Could not save to this device: ' + (err && err.message ? err.message : 'unknown error');
    return;
  }

  closeReview();
  toast('Reading saved');
  Route.go('dashboard');
  if (Settings.get().mirror && Auth.isConfigured()) mirrorSync().catch(() => {});
}
