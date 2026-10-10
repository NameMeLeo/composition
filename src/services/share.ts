/* Composition — collecting a report shared in from outside the app.
   The share inbox hands back a one-shot token in ?share=..., so this runs at boot
   and immediately strips the token from the URL before anything else reads it. */

import { toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { parseReportUrl } from './report-url.js';
import { Capture } from '../ingest/capture.js';

interface ShareRecord {
  kind: 'text' | 'file';
  text?: string;
  data?: string;
  name?: string;
  type?: string;
}

async function readToken(token: string): Promise<ShareRecord> {
  const res = await fetch('./share/' + encodeURIComponent(token), { cache: 'no-store' });
  const data = await res.json().catch(() => null) as { ok?: boolean; error?: string; record?: ShareRecord } | null;
  if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || t('svc.uncollected'));
  return data.record || ({} as ShareRecord);
}

function decodeBase64File(record: ShareRecord): File {
  const binary = atob(record.data || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes.buffer as ArrayBuffer], record.name || 'shared-report', { type: record.type || 'application/octet-stream' });
}

/** Consumes ?share=<token> if present and hands the payload to the capture flow. */
export async function consumeShareToken(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('share');
  if (!token) return;

  const url = new URL(window.location.href);
  url.searchParams.delete('share');

  try {
    const record = await readToken(token);

    if (record.kind === 'text') {
      const parsed = parseReportUrl(record.text);
      if (!parsed.ok) { toast(t('svc.shared.notlink'), 'error'); return; }
      void Capture.startReading({ mode: 'report-url', url: parsed.url, playerId: parsed.playerId, language: parsed.language });
      return;
    }

    void Capture.startReading({ mode: 'file', file: decodeBase64File(record) });
  } catch (err) {
    toast(err instanceof Error ? err.message : t('svc.uncollected'), 'error');
  } finally {
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}
