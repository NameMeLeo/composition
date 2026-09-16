/* Composition — downloading a report and working out what it actually is.
   A host's Content-Type is a hint, not an answer: report pages are frequently served
   as text/html when they are really a PDF, so the first bytes decide. */

import { MAX_BYTES, UA } from './config.ts';

/** Follows redirects and caps the download at MAX_BYTES. */
export async function fetchReport(url: string): Promise<{ contentType: string; buffer: Uint8Array }> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error('That report link is not a valid URL.');
  }
  if (!/^https?:$/.test(target.protocol)) throw new Error('That report link is not a web address.');

  const res = await fetch(target.toString(), {
    redirect: 'follow',
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8' }
  });
  if (!res.ok) throw new Error(`The report host replied with ${res.status}.`);

  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw new Error('The report is larger than this function accepts.');
  return { contentType, buffer };
}

/** The magic bytes win; the host's content type is only a fallback. Returns null when
    the bytes are text, which means the report is an HTML page to be stripped instead. */
export function sniffMimeType(buffer: Uint8Array, contentType: string): string | null {
  const startsWith = (...bytes: number[]) => bytes.every((byte, index) => buffer[index] === byte);
  const asciiAt = (offset: number, value: string) => value.split('').every((char, index) => buffer[offset + index] === char.charCodeAt(0));

  if (asciiAt(0, '%PDF-')) return 'application/pdf';
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (asciiAt(0, 'GIF87a') || asciiAt(0, 'GIF89a')) return 'image/gif';
  if (asciiAt(0, 'RIFF') && asciiAt(8, 'WEBP')) return 'image/webp';

  if (contentType.includes('pdf')) return 'application/pdf';
  if (contentType.includes('image/')) return contentType.split(';')[0].trim();
  return null;
}

/** Base64 for a Gemini inline_data part. Chunked, because spreading a multi-megabyte
    array into apply/fromCharCode arguments overflows the stack. */
export function base64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
