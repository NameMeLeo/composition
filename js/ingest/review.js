/* Composition — the review screen.
   Everything the reader extracted lands here for a human to confirm before it is
   written to the device. This is the only place a reading is created. */

import { $, $$, el, clear, uid, toast } from '../core/dom.js';
import {
  METRICS, METRIC_ORDER,
  REPORT_SECTION_LABELS, REPORT_FIELD_LABELS, REPORT_FIELD_UNITS
} from '../core/metrics.js';
import { parseNumber, toDate } from '../core/format.js';
import { addReading } from '../data/store.js';
import { Settings } from '../core/settings.js';
import { Auth } from '../services/auth.js';
import { mirrorSync } from '../data/sync.js';
import { Route } from '../core/router.js';

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
  'body_composition.bmr_kcal',
  // Segmental values are editable metric fields now, so the raw report leaves
  // would only show the same fifteen numbers a second time.
  'segmental_analysis.muscle_mass.trunk_kg',
  'segmental_analysis.muscle_mass.left_arm_kg',
  'segmental_analysis.muscle_mass.right_arm_kg',
  'segmental_analysis.muscle_mass.left_leg_kg',
  'segmental_analysis.muscle_mass.right_leg_kg',
  'segmental_analysis.fat_mass.trunk_kg',
  'segmental_analysis.fat_mass.left_arm_kg',
  'segmental_analysis.fat_mass.right_arm_kg',
  'segmental_analysis.fat_mass.left_leg_kg',
  'segmental_analysis.fat_mass.right_leg_kg',
  'segmental_analysis.fat_percentage.trunk_percent',
  'segmental_analysis.fat_percentage.left_arm_percent',
  'segmental_analysis.fat_percentage.right_arm_percent',
  'segmental_analysis.fat_percentage.left_leg_percent',
  'segmental_analysis.fat_percentage.right_leg_percent'
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

/** The read-only report metadata, as plain rows. It sits above the form because it
    is context for the numbers below, not something you would retype. */
function metadataCard(leaves) {
  const card = el('div', 'rev__meta');

  const head = el('div', 'rev__metahead');
  head.appendChild(el('span', 'rev__metatitle', 'Report metadata'));
  head.appendChild(el('span', 'rev__metanote', 'Read only'));
  card.appendChild(head);

  const grid = el('div', 'detail__grid');
  leaves.forEach((leaf) => {
    const row = el('div', 'detail__row');
    row.appendChild(el('span', 'detail__k', leaf.label));
    row.appendChild(el('span', 'detail__v', String(leaf.value)));
    grid.appendChild(row);
  });
  card.appendChild(grid);
  return card;
}

/** The date plus the editable metric grid, with a picker for anything the reader
    did not find. */
function measurementPanel(state) {
  const body = el('div', 'rev__body');

  const dateField = el('div', 'rev__field');
  const dateLabel = el('label', 'rev__label', 'Measured at');
  dateLabel.setAttribute('for', 'rev-date');
  dateField.appendChild(dateLabel);

  const dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.className = 'rev__input';
  dateInput.id = 'rev-date';
  dateInput.value = toLocalInput(state.measuredAt);
  dateField.appendChild(dateInput);
  body.appendChild(dateField);

  const grid = el('div', 'rev__grid');
  grid.id = 'rev-grid';
  body.appendChild(grid);

  Object.keys(state.metrics).forEach((key) => { grid.appendChild(reviewField(key, state.metrics[key])); });

  const addRow = el('div', 'od-row');
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
  body.appendChild(addRow);

  return body;
}

/** One report section's editable fields. Report labels run long ("Muscle mass ·
    Left arm · kg"), so they get wider tracks than the metric grid. */
function reportPanel(leaves) {
  const grid = el('div', 'rev__grid rev__grid--wide');
  leaves.forEach((leaf) => grid.appendChild(reviewReportField(leaf)));
  return grid;
}

/** Opens a collapsed section so an error is never reported against a field the
    reader cannot see. */
function revealPanel(panelId) {
  const panel = $('#' + panelId);
  if (!panel || !panel.hidden) return;
  const tab = $('#rev-tabs [aria-controls="' + panelId + '"]');
  if (tab) tab.click();
}

function revealField(node) {
  const panel = node.closest('.rev__section');
  if (panel) revealPanel(panel.id);
  node.scrollIntoView({ block: 'center' });
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

  /* The extracted report's own metadata is read-only, and it frames every number
     that follows, so it leads the screen. */
  if (state.report) {
    const metadata = reportLeaves(state.report.metadata, 'metadata', '', []);
    if (metadata.length) host.appendChild(metadataCard(metadata));
  }

  const rail = el('div', 'tabs rev__tabs');
  rail.id = 'rev-tabs';
  rail.setAttribute('role', 'tablist');
  rail.setAttribute('aria-label', 'Sections of this reading');

  const form = el('form', 'rev');
  form.id = 'review-form';
  form.noValidate = true;

  /* Each pill wears the trends tab style and folds its own section, so several can
     stand open together while the rest stay out of the way. Every section stays in
     the DOM either way — saveReview reads the whole form. */
  const addSection = (id, label, body, open) => {
    const panelId = 'rev-sec-' + id;

    const tab = el('button', 'tab', label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panelId);

    const panel = el('section', 'rev__section');
    panel.id = panelId;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-label', label);
    panel.appendChild(body);

    const setOpen = (next) => {
      panel.hidden = !next;
      tab.classList.toggle('tab--on', next);
      tab.setAttribute('aria-selected', next ? 'true' : 'false');
      tab.setAttribute('aria-expanded', next ? 'true' : 'false');
    };
    tab.addEventListener('click', () => setOpen(panel.hidden));
    setOpen(open);

    rail.appendChild(tab);
    form.appendChild(panel);
  };

  /* The values that get saved lead, because they are the ones that matter. */
  addSection('measurement', 'Measurement', measurementPanel(state), true);

  if (state.report) {
    Object.keys(REPORT_SECTION_LABELS)
      .filter((key) => key !== 'metadata')
      .map((key) => ({ key, leaves: reportLeaves(state.report[key], key, '', []) }))
      .filter((entry) => entry.leaves.length)
      .forEach((entry) => addSection(entry.key, REPORT_SECTION_LABELS[entry.key], reportPanel(entry.leaves), false));
  }

  /* The rail and the error line travel together, so a problem never scrolls out of
     sight while the field it names is somewhere below. */
  const sticky = el('div', 'rev__sticky');
  sticky.appendChild(rail);

  const errBox = el('p', 'rev__error');
  errBox.id = 'rev-error';
  errBox.hidden = true;
  sticky.appendChild(errBox);

  host.appendChild(sticky);
  host.appendChild(form);

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

  const dateInput = $('#rev-date');
  const measuredAt = toDate(dateInput.value);
  if (!measuredAt) {
    errs.push('The measurement date is missing.');
    flag(dateInput);
  }

  if (errs.length) {
    errBox.hidden = false;
    errBox.textContent = errs.join(' ');
    if (firstBad) revealField(firstBad);
    return;
  }
  if (!Object.keys(metrics).length) {
    errBox.hidden = false;
    errBox.textContent = 'Add at least one measurement before saving.';
    revealPanel('rev-sec-measurement');
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
