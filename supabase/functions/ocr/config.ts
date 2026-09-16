/* Composition — the function's environment, read once.
   Every Deno.env lookup in this function happens here, so no other module has to
   know an environment variable by name. */

export const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
export const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';
/** Tried once when the primary model answers HTTP 429. */
export const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

export const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/** When true the bare anon key is refused and a signed-in user is required. */
export const REQUIRE_AUTH = (Deno.env.get('REQUIRE_AUTH') ?? 'false').toLowerCase() === 'true';

/** Largest report this function will accept, in bytes. */
export const MAX_BYTES = Number(Deno.env.get('MAX_BYTES') ?? String(12 * 1024 * 1024));

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
export const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

/** Some report hosts answer a scripted user agent and nothing else. */
export const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36';
