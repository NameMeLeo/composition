/* Composition — the review screen (view).
   Everything the reader extracted lands here for a human to confirm before it is
   written to the device. Rendering lives here; validation lives in
   review-validate.js; reading construction + persistence lives in
   reading-builder.js; report flattening lives in domain/report.js. */

import { $, el, clear } from '../core/dom.js';
import {
  METRICS, METRIC_ORDER,
  REPORT_SECTION_LABELS, REPORT_FIELD_UNITS,
  SOURCE_LABEL
} from '../core/metrics.js';
import {
  reportFieldLabel,
  reportLeaves,
  reportValue,
  reportValueText,
  reportUnit
} from '../domain/report.js';
import { toDate } from '../core/format.js';
import { buildReading, saveReadingDirect, persistReading } from './reading-builder.js';
import { validateReviewForm } from './review-validate.js';

/* saveReadingDirect is re-exported so the reading pipeline keeps importing from
   this view module as before. New code may import reading-builder.js directly. */
export { saveReadingDirect };

let reviewState = null;

function reviewReportField(leaf) {
  const field = el('div', 'rev__field');
  const id = 'rev-report-' + leaf.path.replace(/\./g, '-');
  const unit = REPORT_FIELD_UNITS[leaf.path] || REPORT_FIELD_UNITS[leaf.path.split('.').pop()];

  const label = el('label', 'rev__label', leaf.label + (unit ? ' · ' + unit : ''));
  label.setAttribute('for', id);
  field.appendChild(label);

  if (leaf.promoted || leaf.readOnly) {
    field.classList.add('rev__field--readonly');
    field.appendChild(el('div', 'rev__readonly', reportValueText(leaf.value)));
    return field;
  }

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
  input.value = reportValueText(leaf.value);
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
    row.appendChild(el('span', 'detail__v', reportValueText(leaf.value)));
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

/** One report section's fields, grouped by the nested objects in the response. */
function reportPanel(leaves) {
  const panel = el('div', 'rev__report');
  const groups = new Map();

  leaves.forEach((leaf) => {
    const groupKey = leaf.group || '';
    let group = groups.get(groupKey);
    if (!group) {
      const target = groupKey ? el('fieldset', 'rev__group') : panel;
      if (groupKey) target.appendChild(el('legend', 'rev__grouptitle', groupKey));
      const grid = el('div', 'rev__grid rev__grid--wide');
      target.appendChild(grid);
      if (groupKey) panel.appendChild(target);
      group = { grid };
      groups.set(groupKey, group);
    }
    group.grid.appendChild(reviewReportField(leaf));
  });

  return panel;
}

function reportSectionEntries(report) {
  return Object.keys(report || {})
    .filter((key) => key !== 'metadata' && key !== 'confidence' && key !== 'notes')
    .map((key) => ({
      key,
      label: REPORT_SECTION_LABELS[key] || reportFieldLabel(key),
      leaves: reportLeaves(report[key], key, '', [])
    }))
    .filter((entry) => entry.leaves.length);
}

function summaryValue(value) {
  return value == null || value === '' ? '' : reportValueText(value);
}

function reviewSummary(state) {
  const card = el('section', 'rev__summary');
  card.setAttribute('aria-label', 'Reading source');

  const head = el('div', 'rev__summaryhead');
  head.appendChild(el('div', 'rev__summarytitle', 'Reading source'));
  head.appendChild(el('span', 'rev__summarynote', state.report ? 'Report context' : 'Manual entry'));
  card.appendChild(head);

  const grid = el('div', 'rev__summarygrid');
  const add = (label, value, node) => {
    if (!value && !node) return;
    const item = el('div', 'rev__summaryitem');
    item.appendChild(el('span', 'rev__summarylabel', label));
    if (node) item.appendChild(node);
    else item.appendChild(el('span', 'rev__summaryvalue', value));
    grid.appendChild(item);
  };

  add('Input', SOURCE_LABEL[state.source] || state.source || 'Unknown');
  add('Extraction', state.extractionMethod || 'Unknown');
  if (typeof state.confidence === 'number') add('Confidence', Math.round(state.confidence * 100) + '%');
  add('Player', summaryValue(state.playerId));
  add('Serial', summaryValue(reportValue(state.report, 'metadata.serial_number')));

  if (state.reportUrl) {
    let link = null;
    try {
      const url = new URL(state.reportUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        link = document.createElement('a');
        link.href = url.toString();
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.className = 'rev__summaryvalue rev__summarylink';
        link.textContent = url.toString();
      }
    } catch (e) { /* keep the source as plain state, without making it a link */ }
    add('Report link', link ? '' : state.reportUrl, link);
  }
  card.appendChild(grid);

  if (state.note) card.appendChild(el('p', 'rev__hint', state.note));
  if (state.notes) {
    const warning = el('div', 'rev__warning');
    warning.appendChild(el('strong', 'rev__warningtitle', 'OCR note'));
    warning.appendChild(el('span', 'rev__warningtext', state.notes));
    card.appendChild(warning);
  }
  return card;
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
  const host = $('#review-body');
  clear(host);
  // Keep module state for saveReview; extras retained for forward-compat.
  reviewState = Object.assign({ extras: [] }, state);

  $('#review-title').textContent = state.report ? 'Review report' : 'Check the numbers';
  host.appendChild(reviewSummary(state));

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

  const sections = state.report ? reportSectionEntries(state.report) : [];
  sections.forEach((entry, index) => addSection(entry.key, entry.label, reportPanel(entry.leaves), index === 0));
  addSection('measurement', 'Measurements', measurementPanel(state), sections.length === 0);

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
  const first = $('#review-form input');
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

  const checked = validateReviewForm();
  if (!checked.ok) {
    errBox.hidden = false;
    errBox.textContent = checked.errors.join(' ');
    if (checked.empty) revealPanel('rev-sec-measurement');
    else if (checked.firstBad) revealField(checked.firstBad);
    return;
  }

  const { metrics, reportEdits, measuredAt } = checked;
  const reading = buildReading(reviewState, metrics, reportEdits, measuredAt);

  try {
    await persistReading(reading);
  } catch (err) {
    errBox.hidden = false;
    errBox.textContent = 'Could not save to this device: ' + (err && err.message ? err.message : 'unknown error');
    return;
  }

  closeReview();
}
