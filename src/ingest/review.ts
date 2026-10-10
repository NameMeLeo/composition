/* Composition — the review screen (view).
   Everything the reader extracted lands here for a human to confirm before it is
   written to the device. Rendering lives here; validation lives in
   review-validate.ts; reading construction + persistence lives in
   reading-builder.ts; report flattening lives in domain/report.ts. */

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
  reportValueText
} from '../domain/report.js';
import type { ReportLeaf } from '../domain/report.js';
import { toDate } from '../core/format.js';
import { buildReading, saveReadingDirect, persistReading } from './reading-builder.js';
import { validateReviewForm } from './review-validate.js';
import type { Report, ReviewState } from '../domain/types.js';

/* saveReadingDirect is re-exported so the reading pipeline keeps importing from
   this view module as before. New code may import reading-builder.ts directly. */
export { saveReadingDirect };

let reviewState: ReviewState | null = null;

function reviewReportField(leaf: ReportLeaf): HTMLElement {
  const field = el('div', 'rev__field');
  const id = 'rev-report-' + leaf.path.replace(/\./g, '-');
  const unit = REPORT_FIELD_UNITS[leaf.path] || REPORT_FIELD_UNITS[leaf.path.split('.').pop() as string];

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

function reviewField(key: string, value: unknown): HTMLElement {
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

function toLocalInput(iso: string): string {
  const d = toDate(iso) || new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** The read-only report metadata, as plain rows. It sits above the form because it
    is context for the numbers below, not something you would retype. */
function metadataCard(leaves: ReportLeaf[]): HTMLElement {
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
function measurementPanel(state: ReviewState): HTMLElement {
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
function reportPanel(leaves: ReportLeaf[]): HTMLElement {
  const panel = el('div', 'rev__report');
  const groups = new Map<string, { grid: HTMLElement }>();

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

function reportSectionEntries(report: Report): Array<{ key: string; label: string; leaves: ReportLeaf[] }> {
  return Object.keys(report || {})
    .filter((key) => key !== 'metadata' && key !== 'confidence' && key !== 'notes')
    .map((key) => ({
      key,
      label: REPORT_SECTION_LABELS[key] || reportFieldLabel(key),
      leaves: reportLeaves(report[key], key, '', [])
    }))
    .filter((entry) => entry.leaves.length);
}

function summaryValue(value: unknown): string {
  return value == null || value === '' ? '' : reportValueText(value);
}

function reviewSummary(state: ReviewState): HTMLElement {
  const card = el('section', 'rev__summary');
  card.setAttribute('aria-label', 'Reading source');

  const head = el('div', 'rev__summaryhead');
  head.appendChild(el('div', 'rev__summarytitle', 'Reading source'));
  head.appendChild(el('span', 'rev__summarynote', state.report ? 'Report context' : 'Manual entry'));
  card.appendChild(head);

  const grid = el('div', 'rev__summarygrid');
  const add = (label: string, value: string, node?: HTMLElement | null): void => {
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
    let link: HTMLAnchorElement | null = null;
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
    add('Report link', link ? '' : (state.reportUrl as string), link);
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
function revealPanel(panelId: string): void {
  const panel = $('#' + panelId);
  if (!panel || !panel.hidden) return;
  const tab = $('#rev-tabs [aria-controls="' + panelId + '"]');
  if (tab) (tab as HTMLElement).click();
}

function revealField(node: HTMLElement): void {
  const panel = node.closest('.rev__section');
  if (panel) revealPanel(panel.id);
  node.scrollIntoView({ block: 'center' });
}

/**
 * Opens the review screen.
 */
export function openReview(state: ReviewState): void {
  const host = $('#review-body');
  clear(host);
  // Keep module state for saveReview; extras retained for forward-compat.
  reviewState = { ...state, extras: [] };

  ($('#review-title') as HTMLElement).textContent = state.report ? 'Review report' : 'Check the numbers';
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
    const metadata = reportLeaves((state.report as Report).metadata, 'metadata', '', []);
    if (metadata.length) host.appendChild(metadataCard(metadata));
  }

  const rail = el('div', 'tabs rev__tabs');
  rail.id = 'rev-tabs';
  rail.setAttribute('role', 'tablist');
  rail.setAttribute('aria-label', 'Sections of this reading');

  const form = el('form', 'rev') as HTMLFormElement;
  form.id = 'review-form';
  form.noValidate = true;

  /* Each pill wears the trends tab style and folds its own section, so several can
     stand open together while the rest stay out of the way. Every section stays in
     the DOM either way — saveReview reads the whole form. */
  const addSection = (id: string, label: string, body: HTMLElement, open: boolean): void => {
    const panelId = 'rev-sec-' + id;

    const tab = el('button', 'tab', label) as HTMLButtonElement;
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panelId);

    const panel = el('section', 'rev__section');
    panel.id = panelId;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-label', label);
    panel.appendChild(body);

    const setOpen = (next: boolean): void => {
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

  ($('#view-review') as HTMLElement).hidden = false;
  const first = $('#review-form input');
  if (first) (first as HTMLElement).focus();
}

export function closeReview(): void {
  ($('#view-review') as HTMLElement).hidden = true;
  if (reviewState?.previewUrl) URL.revokeObjectURL(reviewState.previewUrl);
  reviewState = null;
}

/** Validates every field, builds the reading and saves it. */
export async function saveReview(): Promise<void> {
  if (!reviewState) return;
  const state: ReviewState = reviewState;
  const errBox = $('#rev-error');

  const checked = validateReviewForm();
  if (!checked.ok) {
    errBox.hidden = false;
    errBox.textContent = checked.errors.join(' ');
    if (checked.empty) revealPanel('rev-sec-measurement');
    else if (checked.firstBad) revealField(checked.firstBad);
    return;
  }

  const reading = buildReading(state, checked.metrics, checked.reportEdits as Record<string, unknown>, checked.measuredAt);

  try {
    await persistReading(reading);
  } catch (err) {
    errBox.hidden = false;
    errBox.textContent = 'Could not save to this device: ' + (err instanceof Error ? err.message : 'unknown error');
    return;
  }

  closeReview();
}
