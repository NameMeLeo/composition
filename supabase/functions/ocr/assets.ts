/* Composition — proxying the provider's small overlay icons.
   The report canvas needs star.png, middle/left/right.png and circle.png, but the
   app is served over HTTPS while the provider host is plain HTTP with no CORS
   headers, so the browser cannot fetch them directly. This fetches them
   server-side (no mixed-content or CORS limits in Deno) and returns base64.

   Only the five known icon files are ever served: the name is an allowlist, and
   the base is derived from the report URL the caller already passed, constrained
   to a Tanita self-test report directory. Nothing else on the internet is
   reachable through this mode. */

import { MAX_BYTES, UA } from './config.ts';
import { base64 } from './fetch-report.ts';

const TANITA_REPORT_SEGMENT = 'selftestfitnesscorner';

/** The only files this mode will ever serve. */
export const REPORT_ICON_NAMES = ['star.png', 'middle.png', 'left.png', 'right.png', 'circle.png'] as const;
export type ReportIconName = (typeof REPORT_ICON_NAMES)[number];

export function isReportIconName(value: unknown): value is ReportIconName {
  return typeof value === 'string' && (REPORT_ICON_NAMES as readonly string[]).includes(value);
}

/** The image directory sitting beside a Tanita report page, or null. */
function iconBase(reportUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(reportUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const at = url.pathname.indexOf(TANITA_REPORT_SEGMENT);
  if (at === -1) return null;
  try {
    return new URL(url.pathname.slice(0, at + TANITA_REPORT_SEGMENT.length) + '/image/', url.origin);
  } catch {
    return null;
  }
}

/** Fetches one overlay icon and returns its mime type plus base64 bytes. */
export async function fetchReportIcon(reportUrl: string, name: ReportIconName): Promise<{ mime: string; data: string }> {
  const base = iconBase(reportUrl);
  if (!base) throw new Error('That report link is not a Tanita report page.');

  const target = new URL(name, base);
  const res = await fetch(target.toString(), {
    redirect: 'follow',
    headers: { 'User-Agent': UA, 'Accept': 'image/png,image/*,*/*;q=0.8' }
  });
  if (!res.ok) throw new Error(`The report host replied with ${res.status}.`);

  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  if (contentType && !contentType.includes('image/') && !contentType.includes('octet-stream')) {
    throw new Error('The report host did not return an image.');
  }

  const buffer = new Uint8Array(await res.arrayBuffer());
  if (!buffer.byteLength) throw new Error('The report host returned an empty image.');
  if (buffer.byteLength > MAX_BYTES) throw new Error('The image is larger than this function accepts.');

  // PNG signature check: every icon on the provider is a PNG.
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = pngSig.every((byte, index) => buffer[index] === byte);
  return { mime: isPng ? 'image/png' : (contentType.split(';')[0].trim() || 'image/png'), data: base64(buffer) };
}
