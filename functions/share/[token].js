// Composition — Cloudflare Pages Function: share inbox retrieval
//
// GET /share/<token> hands the parked file back to the app, then destroys the
// record so a shared report is never readable twice. The token lives for ten
// minutes at most.

export async function onRequestGet({ params, env }) {
  if (!env || !env.SHARE_KV) {
    return new Response(JSON.stringify({ ok: false, error: 'The share inbox is not enabled.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const key = 'share:' + String(params.token || '');
  const raw = await env.SHARE_KV.get(key);
  if (!raw) {
    return new Response(JSON.stringify({ ok: false, error: 'That shared file has expired.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await env.SHARE_KV.delete(key);

  return new Response(JSON.stringify({ ok: true, record: JSON.parse(raw) }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
