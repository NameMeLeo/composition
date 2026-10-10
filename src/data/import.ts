/* Composition — importing our own exported CSV back.
   Closes the export loop (device migration, backups): rows are parsed,
   validated with the same rules as a hand entry (parseable date + at least one
   usable measurement), and saved through addReading so dedupe treats an
   already-present report as kept/updated instead of duplicating it. Nothing is
   written until the caller confirms the preview. */

import { uid } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { parseNumber, toDate } from '../core/format.js';
import { metricFromCsvColumn } from './export.js';
import { addReading } from './store.js';
import type { Reading } from '../domain/types.js';

const KNOWN_SOURCES = ['qr', 'link', 'file', 'share', 'manual'];
const MAX_IMPORT_BYTES = 18 * 1024 * 1024;

export interface ImportSkipped { row: number; reason: string; }
export interface ImportPreview { staged: Reading[]; skipped: ImportSkipped[]; }

/** Minimal RFC-4180 reader: quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const pushCell = (): void => { row.push(cell); cell = ''; };
  const pushRow = (): void => {
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') pushCell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      pushCell();
      pushRow();
    } else cell += c;
  }
  pushCell();
  pushRow();
  return rows;
}

/** Parses without saving. Row numbers are 1-based including the header. */
export function previewCsvImport(text: string): ImportPreview {
  const skipped: ImportSkipped[] = [];
  if (text.length > MAX_IMPORT_BYTES) {
    return { staged: [], skipped: [{ row: 0, reason: t('shell.toobig') }] };
  }
  const rows = parseCsv(text);
  if (!rows.length) return { staged: [], skipped: [{ row: 0, reason: t('import.empty') }] };

  const headers = rows[0].map((h) => h.trim());
  const measuredIdx = headers.indexOf('measured_at');
  if (measuredIdx === -1) return { staged: [], skipped: [{ row: 1, reason: t('import.noheader') }] };
  const sourceIdx = headers.indexOf('source');
  const playerIdx = headers.indexOf('player_id');
  const noteIdx = headers.indexOf('note');
  const metricCols = headers
    .map((h, i) => ({ key: metricFromCsvColumn(h), i }))
    .filter((c): c is { key: string; i: number } => !!c.key);

  const staged: Reading[] = [];
  const now = new Date().toISOString();
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rowNo = r + 1;
    const measuredAt = toDate((cells[measuredIdx] || '').trim());
    if (!measuredAt) {
      skipped.push({ row: rowNo, reason: t('import.baddate') });
      continue;
    }
    const metrics: Record<string, number> = {};
    metricCols.forEach(({ key, i }) => {
      const raw = (cells[i] || '').trim();
      if (!raw) return;
      const value = parseNumber(raw);
      if (value != null) metrics[key] = value;
    });
    if (!Object.keys(metrics).length) {
      skipped.push({ row: rowNo, reason: t('import.nometrics') });
      continue;
    }
    const source = sourceIdx !== -1 ? (cells[sourceIdx] || '').trim().toLowerCase() : '';
    staged.push({
      id: uid(),
      createdAt: now,
      updatedAt: now,
      measuredAt: measuredAt.toISOString(),
      source: KNOWN_SOURCES.includes(source) ? source : 'manual',
      sourceType: null,
      extractionMethod: null,
      playerId: playerIdx !== -1 && cells[playerIdx].trim() ? cells[playerIdx].trim() : null,
      language: null,
      reportUrl: null,
      note: noteIdx !== -1 ? (cells[noteIdx] || '') : '',
      confidence: null,
      raw: null,
      report: null,
      metrics
    });
  }
  return { staged, skipped };
}

/** Saves staged rows through the dedupe-aware store. Returns the outcomes. */
export async function importReadings(staged: Reading[]): Promise<{ added: number; updated: number; kept: number }> {
  let added = 0;
  let updated = 0;
  let kept = 0;
  for (const reading of staged) {
    const { outcome } = await addReading(reading);
    if (outcome === 'added') added++;
    else if (outcome === 'updated') updated++;
    else kept++;
  }
  return { added, updated, kept };
}
