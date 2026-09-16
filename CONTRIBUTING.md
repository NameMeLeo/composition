# Contributing to Composition

Thanks for looking under the hood. The app is deliberately small: vanilla
JavaScript, ES modules loaded directly by the browser, no build step and no runtime
dependencies.

## Run it locally

```bash
python -m http.server 8000
# or
npx --yes serve . -l 8000
```

Then open <http://localhost:8000>.

**A server is required.** Browsers refuse to load ES modules over `file://`, so
opening `index.html` directly gives you a blank page.

The core app — capture by hand, history, trends, exports — works with no backend at
all. OCR, Google sign-in and the cloud mirror each need the matching optional service
to be configured in Settings.

## Layout

```
index.html      Shell markup: every view, sheet and overlay
styles.css      Design tokens and all styling
sw.js           Offline app shell
js/
  main.js       Entry point: boot, global chrome, page registration
  constants.js  Storage keys, storage names, deployment defaults
  metrics.js    Metric catalogue, tabs, time ranges, report vocabulary
  dom.js        $, el, clear, toast, uid
  format.js     Dates, numbers, unit-aware measurement text
  events.js     Tiny pub/sub for "the readings changed"
  settings.js   localStorage preferences
  store.js      IndexedDB, the in-memory cache, and the derived selectors
  auth.js       Supabase Google sign-in
  ocr.js        Client for the OCR Edge Function
  report-url.js Turning pasted text into a report URL
  sync.js       Optional two-way cloud mirror
  router.js     Hash routing; pages register themselves
  shell.js      Sign-in screen vs app shell
  theme.js      Theme, motion, installed-app detection
  capture.js    Link sheet, QR scanner, extraction pipeline
  review.js     The review screen; the only place a reading is created
  scanfan.js    Radial menu on the scan button
  export.js     JSON, CSV, Samsung Health, copy summary
  share.js      Shared-in reports (?share= token)
  components/   chart.js, wheel.js, chip.js, tile.js
  pages/        dashboard.js, trends.js, history.js, detail.js, settings.js
```

Adding a page means creating `js/pages/your-page.js`, registering it with
`Route.page('your-page', render)`, importing it from `main.js` for its side effect,
and adding the new file to `ASSETS` in `sw.js`.

## House rules

- **No build step.** If a change needs a bundler, a compiler or `npm install` to run,
  it doesn't belong in the app shell.
- **Bump the cache when shipping JS.** `sw.js` precaches every module by name. Add new
  files to `ASSETS` and raise `CACHE` (`composition-vNN`) or returning visitors keep
  the old code.
- **A wrong number is worse than no number.** This is health data. Never fill a field
  with a plausible guess, never interpolate across a gap, and never map a provider
  field whose meaning hasn't been confirmed. Missing values stay missing and the UI
  says so.
- **Derive, don't duplicate.** Mass metrics are detected from `METRICS[key].unit`, not
  from a second hardcoded list — the duplicate list is exactly how the segmental
  values silently lost their lb conversion.
- **Comments explain why.** The code already says what it does.

## Checks before you commit

```bash
node --check <file>        # syntax, ESM auto-detected
git diff --check           # stray whitespace
```

Then load the page and click through the view you changed. A module that fails to
parse leaves the app blank, and `node --check` is the fastest way to catch that.

## The Ocr Edge Function

`supabase/functions/ocr/index.ts` is a Deno function with two jobs:

1. **Tanita report links** are resolved by calling the provider's own data API and
   mapping the reply field by field. No model is involved, so this path is exact,
   instant and free. The public report page is a canvas shell with no measurements in
   its HTML, so fetching and reading that page could only ever produce invented
   numbers — which is why it isn't done.
2. **Everything else** (PDFs, photos, other report pages) goes to Gemini for
   extraction.

Deploy with:

```bash
supabase functions deploy ocr --no-verify-jwt
```

`verify_jwt: false` lets the function answer before sign-in, and the function does its
own authorization internally. `REQUIRE_AUTH=true` rejects the bare anon key so that
only a signed-in user's session is accepted.

### Local development against the deployed function

The function requires a real user session. Mint a short-lived one with the
`service_role` key rather than weakening `REQUIRE_AUTH`:

1. `POST /auth/v1/admin/generate_link` with `{type: "magiclink", email: "<user>"}`
2. `POST /auth/v1/verify` with `{type: "magiclink", token_hash: "<hashed_token>"}`

The second call returns an `access_token` to use as the `Authorization: Bearer` value.

## Hosting it yourself

The app is static files. GitHub Pages works as-is: `.github/workflows/deploy.yml`
builds a `dist/` bundle and uploads it. Keep `js/` in that copy step — the browser
fetches modules individually, so a bundle that omits the directory renders nothing.

Camera capture needs HTTPS (or `localhost`). Everything else works over plain HTTP.
