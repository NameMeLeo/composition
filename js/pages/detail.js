/* Composition — one reading in full, with the report it was read from behind it. */

import { $, el, clear, toast } from '../core/dom.js';
import {
  METRICS, METRIC_ORDER,
  REPORT_SECTION_ORDER, REPORT_SECTION_LABELS, REPORT_FIELD_LABELS, REPORT_FIELD_UNITS,
  METRIC_REFERENCE_RANGES
} from '../core/metrics.js';
import { fmtDate, fmtDateTime, metricText, metricDisplay } from '../core/format.js';
import { getReadings, deleteReading } from '../data/store.js';
import { Route } from '../core/router.js';

/* ------------------------------------------------------------------ */
/* Reading a report back                                               */
/* ------------------------------------------------------------------ */

/* Field names arrive as snake_case. The ones the app has a name for are in
   REPORT_FIELD_LABELS; anything else is humanised rather than shown raw, so a field
   added to the reader's schema still reads as words instead of an identifier. */
function reportFieldLabel(key) {
  if (REPORT_FIELD_LABELS[key]) return REPORT_FIELD_LABELS[key];
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function reportValueText(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/* Units are keyed by the whole path where the same leaf means different things —
   "standard" is kg under weight and % under body fat — and by the leaf name
   otherwise. */
function reportUnit(path) {
  return REPORT_FIELD_UNITS[path] || REPORT_FIELD_UNITS[path.split('.').pop()];
}

/** Every leaf of one report section as label/value rows. The nested group is kept in
    the label so "Left arm" under Muscle mass never reads like "Left arm" under fat. */
function reportRows(section, prefix, group, out) {
  Object.keys(section || {}).forEach((key) => {
    const value = section[key];
    if (value == null || value === '') return;

    const path = prefix ? prefix + '.' + key : key;
    const label = reportFieldLabel(key);

    if (typeof value === 'object' && !Array.isArray(value)) {
      reportRows(value, path, group ? group + ' · ' + label : label, out);
      return;
    }
    out.push({ label: group ? group + ' · ' + label : label, path, value });
  });
  return out;
}

function reportBlock(title, rows) {
  const block = el('section', 'detail__reportsec');
  block.appendChild(el('span', 'detail__reportsectitle', title));

  const grid = el('div', 'detail__grid');
  rows.forEach((row) => {
    const unit = reportUnit(row.path);
    const line = el('div', 'detail__row');
    line.appendChild(el('span', 'detail__k', row.label));
    line.appendChild(el('span', 'detail__v', reportValueText(row.value) + (unit ? ' ' + unit : '')));
    grid.appendChild(line);
  });
  block.appendChild(grid);
  return block;
}

/* The whole extracted report, section by section. The review screen shows this once,
   before saving; this is the same record afterwards, so nothing the reader found goes
   out of reach the moment the reading is stored. Sections run in reading order, and
   anything the reader returned that the app has no name for still gets shown.
   `provider_details` is left out on purpose: it is the provider's raw payload, and
   every value in it is already normalised into the sections below. */
function reportPanel(report) {
  const card = el('section', 'detail__report');

  const head = el('div', 'detail__reporthead');
  head.appendChild(el('span', 'detail__reporttitle', 'Full report'));
  head.appendChild(el('span', 'detail__reportnote', 'Every extracted field'));
  card.appendChild(head);

  const named = REPORT_SECTION_ORDER.filter((key) => key !== 'provider_details');
  const rest = Object.keys(report)
    .filter((key) => key !== 'provider_details' && named.indexOf(key) === -1);

  named.concat(rest).forEach((key) => {
    const rows = reportRows(report[key], key, '', []);
    if (!rows.length) return;
    card.appendChild(reportBlock(REPORT_SECTION_LABELS[key] || reportFieldLabel(key), rows));
  });

  return card;
}

/* ------------------------------------------------------------------ */
/* The reference range beside a measurement                            */
/* ------------------------------------------------------------------ */

/** The printed reference range that belongs under a metric, worded for its row.
    Returns an empty string when the report carried no range for it. */
function referenceNote(report, key) {
  if (!report) return '';

  const pair = METRIC_REFERENCE_RANGES.find((entry) => entry[0] === key);
  if (!pair) return '';

  const range = pair[1].split('.').reduce((node, part) => (node == null ? null : node[part]), report);
  if (!range || typeof range !== 'object') return '';

  const number = (value) => (value == null || value === '' || isNaN(Number(value)) ? null : Number(value));
  const lower = number(range.lower);
  const upper = number(range.upper);
  const standard = number(range.standard);

  const parts = [];
  // The band is what a reading is judged against, so the unit is printed once, after
  // the upper bound, rather than repeated on both numbers.
  if (lower != null && upper != null) {
    const lo = metricDisplay(key, lower);
    const hi = metricDisplay(key, upper);
    parts.push('normal ' + lo.text + '–' + hi.text + (hi.unit ? ' ' + hi.unit : ''));
  }
  if (standard != null) {
    const std = metricDisplay(key, standard);
    parts.push('standard ' + std.text + (std.unit ? ' ' + std.unit : ''));
  }
  return parts.join(' · ');
}

/** One measured metric, with its value and the report's own reference beneath it. */
function metricRow(key, value, note) {
  const line = el('div', 'detail__row');
  line.appendChild(el('span', 'detail__k', METRICS[key].label));

  if (!note) {
    line.appendChild(el('span', 'detail__v', metricText(key, value)));
    return line;
  }

  const figure = el('span', 'detail__v detail__v--ref');
  figure.appendChild(el('span', 'detail__val', metricText(key, value)));
  figure.appendChild(el('span', 'detail__ref', note));
  line.appendChild(figure);
  return line;
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

export function renderDetail(id) {
  const host = $('#detail-body');
  clear(host);

  const reading = getReadings().find((r) => r.id === id);
  if (!reading) {
    host.appendChild(el('p', 'empty__body', 'That reading is no longer on this device.'));
    return;
  }

  const card = el('div', 'detail__hero');
  card.appendChild(el('div', 'detail__date', fmtDate(reading.measuredAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })));

  const grid = el('div', 'detail__grid');
  METRIC_ORDER.forEach((key) => {
    const value = reading.metrics ? reading.metrics[key] : null;
    if (value == null) return;
    grid.appendChild(metricRow(key, value, referenceNote(reading.report, key)));
  });
  card.appendChild(grid);
  host.appendChild(card);

  if (reading.report) host.appendChild(reportPanel(reading.report));

  const meta = el('p', 'detail__meta');
  const bits = ['Saved ' + fmtDateTime(reading.createdAt)];
  if (reading.playerId) bits.push('player_id ' + reading.playerId);
  if (reading.language) bits.push('language ' + reading.language);
  if (reading.reportUrl) bits.push(reading.reportUrl);
  meta.textContent = bits.join(' · ');
  host.appendChild(meta);

  if (reading.note) {
    host.appendChild(Object.assign(el('p', 'detail__meta'), { textContent: reading.note }));
  }

  const actions = el('div', 'od-cluster');
  actions.style.marginTop = 'var(--s-5)';
  const del = el('button', 'btn btn--danger btn--small', 'Delete reading');
  del.type = 'button';
  del.addEventListener('click', async () => {
    if (!window.confirm('Delete this reading from this device? This cannot be undone.')) return;
    await deleteReading(reading.id);
    toast('Reading deleted');
    Route.go('history');
  });
  actions.appendChild(del);
  host.appendChild(actions);
}

Route.page('detail', renderDetail);
