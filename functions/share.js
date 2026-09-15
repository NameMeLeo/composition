// Composition — Cloudflare Pages Function: share target receiver
//
// The web manifest registers Composition as a share target, so on Android the
// OS "Share" sheet can hand a PDF or photo straight to the app. A static host
// cannot read a POST body, so this tiny function parks the shared file for ten
// minutes and bounces the browser back into the app with a token.
//
// Cloudflare Pages wiring (dashboard → your project → Settings → Functions):
//   KV namespace binding:  Variable name SHARE_KV  →  any KV namespace
//   (That binding is optional: without it the function answers 503 and the
//    in-app file picker remains the working path.)
//
// Bindings:
//   SHARE_KV   optional KV namespace used as the ten-minute holding pen

const MAX_BYTES = 18 * 1024 * 1024;
const TTL_SECONDS = 600;

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.SHARE_KV) {
    return new Response(
      'The share inbox is not enabled on this deployment. Open the app and use Add reading → Share a PDF or photo instead.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return new Response('Could not read the shared payload.', { status: 400 });
  }

  const file = form.get('report') || form.get('file');
  const text = form.get('text');

  const token = crypto.randomUUID();
  let record = null;

  if (file && typeof file !== 'string') {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return new Response('That file is larger than the share inbox accepts.', { status: 413 });
    }
    record = {
      kind: 'file',
      name: file.name || 'shared-report',
      type: file.type || 'application/octet-stream',
      size: buffer.byteLength,
      data: toBase64(buffer)
    };
  } else if (text) {
    record = { kind: 'text', text: String(text) };
  } else {
    return new Response('Nothing was shared.', { status: 400 });
  }

  await env.SHARE_KV.put('share:' + token, JSON.stringify(record), { expirationTtl: TTL_SECONDS });

  const destination = new URL('/index.html', request.url);
  destination.searchParams.set('share', token);
  return Response.redirect(destination.toString(), 303);
}
