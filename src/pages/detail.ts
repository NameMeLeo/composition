/* Composition — one reading in full, with the report it was read from behind it. */

import { $, el, clear, toast } from '../core/dom.js';
import { t, metricLabel, sectionLabel } from '../core/i18n.js';
import {
  METRICS, METRIC_ORDER,
  REPORT_SECTION_ORDER, REPORT_SECTION_LABELS,
  METRIC_REFERENCE_RANGES
} from '../core/metrics.js';
import { reportFieldLabel, reportRows, reportUnit, reportValueText } from '../domain/report.js';
import type { ReportRow } from '../domain/report.js';
import { fmtDate, fmtDateTime, metricText, metricDisplay } from '../core/format.js';
import { getReadings, deleteReading } from '../data/store.js';
import { Route } from '../core/router.js';
import type { Report } from '../domain/types.js';

/* ------------------------------------------------------------------ */
/* Reading a report back (shared walk lives in domain/report.ts)        */
/* ------------------------------------------------------------------ */

function reportBlock(title: string, rows: ReportRow[]): HTMLElement {
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
function reportPanel(report: Report): HTMLElement {
  const card = el('section', 'detail__report');

  const head = el('div', 'detail__reporthead');
  head.appendChild(el('span', 'detail__reporttitle', t('detail.report')));
  head.appendChild(el('span', 'detail__reportnote', t('detail.report.note')));
  card.appendChild(head);

  const named = REPORT_SECTION_ORDER.filter((key) => key !== 'provider_details');
  const rest = Object.keys(report)
    .filter((key) => key !== 'provider_details' && named.indexOf(key) === -1);

  named.concat(rest).forEach((key) => {
    const rows = reportRows(report[key], key, '', []);
    if (!rows.length) return;
    card.appendChild(reportBlock(sectionLabel(key, REPORT_SECTION_LABELS[key] || reportFieldLabel(key)), rows));
  });

  return card;
}

/* ------------------------------------------------------------------ */
/* The reference range beside a measurement                            */
/* ------------------------------------------------------------------ */

/** The printed reference range that belongs under a metric, worded for its row.
    Returns an empty string when the report carried no range for it. */
function referenceNote(report: Report | null, key: string): string {
  if (!report) return '';

  const pair = METRIC_REFERENCE_RANGES.find((entry) => entry[0] === key);
  if (!pair) return '';

  const range = pair[1].split('.').reduce<unknown>((node, part) => {
    if (node == null || typeof node !== 'object') return null;
    return (node as Record<string, unknown>)[part] ?? null;
  }, report);
  if (!range || typeof range !== 'object') return '';

  const number = (value: unknown): number | null =>
    (value == null || value === '' || isNaN(Number(value)) ? null : Number(value));
  const rec = range as Record<string, unknown>;
  const lower = number(rec.lower);
  const upper = number(rec.upper);
  const standard = number(rec.standard);

  const parts: string[] = [];
  // The band is what a reading is judged against, so the unit is printed once, after
  // the upper bound, rather than repeated on both numbers.
  if (lower != null && upper != null) {
    const lo = metricDisplay(key, lower);
    const hi = metricDisplay(key, upper);
    parts.push(t('detail.normal', { lo: lo.text, hi: hi.text, unit: hi.unit ? ' ' + hi.unit : '' }));
  }
  if (standard != null) {
    const std = metricDisplay(key, standard);
    parts.push(t('detail.standard', { v: std.text, unit: std.unit ? ' ' + std.unit : '' }));
  }
  return parts.join(' · ');
}

/** One measured metric, with its value and the report's own reference beneath it. */
function metricRow(key: string, value: number, note: string): HTMLElement {
  const line = el('div', 'detail__row');
  line.appendChild(el('span', 'detail__k', metricLabel(key, METRICS[key].label)));

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

export function renderDetail(id?: string | null): void {
  const host = $('#detail-body');
  clear(host);

  const reading = getReadings().find((r) => r.id === id);
  if (!reading) {
    host.appendChild(el('p', 'empty__body', t('detail.gone')));
    return;
  }

  const card = el('div', 'detail__hero');
  card.appendChild(el('div', 'detail__date', fmtDate(reading.measuredAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })));

  const grid = el('div', 'detail__grid');
  METRIC_ORDER.forEach((key) => {
    const value = reading.metrics ? reading.metrics[key] : null;
    if (value == null) return;
    grid.appendChild(metricRow(key, value as number, referenceNote(reading.report, key)));
  });
  card.appendChild(grid);
  host.appendChild(card);

  if (reading.report) host.appendChild(reportPanel(reading.report));

  const meta = el('p', 'detail__meta');
  const bits = [t('detail.saved', { date: fmtDateTime(reading.createdAt) })];
  if (reading.playerId) bits.push('player_id ' + reading.playerId);
  if (reading.language) bits.push('language ' + reading.language);
  if (reading.reportUrl) bits.push(reading.reportUrl);
  meta.textContent = bits.join(' · ');
  host.appendChild(meta);

  if (reading.note) {
    const note = el('p', 'detail__meta');
    note.textContent = reading.note;
    host.appendChild(note);
  }

  const actions = el('div', 'od-cluster');
  actions.style.marginTop = 'var(--s-5)';
  const del = el('button', 'btn btn--danger btn--small', t('detail.delete')) as HTMLButtonElement;
  del.type = 'button';
  del.addEventListener('click', async () => {
    if (!window.confirm(t('detail.confirm'))) return;
    await deleteReading(reading.id);
    toast(t('detail.deleted'));
    Route.go('history');
  });
  actions.appendChild(del);
  host.appendChild(actions);
}

Route.page('detail', renderDetail);
