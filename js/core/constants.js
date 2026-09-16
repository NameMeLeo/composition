/* Composition — storage keys and deployment defaults.
   Nothing here depends on any other module. */

export const APP_VERSION = '1.0.0';

/* The report site that a bare player id is resolved against. It lives here rather
   than inside report-url.js so the address is a deployment detail, not something
   baked into URL parsing, and any device can override it from Settings. */
export const DEFAULT_REPORT_BASE = 'http://13.251.17.127/tanita/selftestfitnesscorner/';

export const DB_NAME = 'composition';
export const DB_VERSION = 1;
export const STORE = 'readings';

export const LS = {
  settings: 'composition.settings.v1',
  // Older builds wrote a local-session marker. Nothing reads it now, but signing
  // out still clears it so a stale key cannot resurrect a phantom session.
  session: 'composition.local-session.v1'
};

/* The OCR proxy is a Supabase Edge Function in the maintainer's own project, so
   these are public values: the anon key is designed to be shipped in a client.
   The Gemini key lives only in the Edge Function's environment. */
export const DEFAULT_SUPABASE_URL = 'https://mtgoncthcfccotqgynzb.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10Z29uY3RoY2ZjY290cWd5bnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NTUyMjYsImV4cCI6MjEwNTAzMTIyNn0.ppoAYDuVPMY2w978TeCarY_BNi4RFbv9_M_wdoqL-f8';
