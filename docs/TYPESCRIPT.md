# TypeScript

Source lives in `src/**/*.ts`. The browser ships compiled ES modules in
`dist/js/**/*.js`, built by `tsc` (`rootDir: src`, `outDir: dist/js`).
`index.html` (`<script type="module" src="js/main.js">`) and `sw.js`
(`./js/*` entries) are unchanged — they resolve against `dist/` after the
build, so the Pages deploy only had to swap `cp -r js dist/js` for
`npm ci && npm run build`.

## Commands

| | |
|---|---|
| `npm ci` | install the one dev dependency (`typescript`) |
| `npm run typecheck` | `tsc --noEmit` — CI gate, no output |
| `npm run build` | emit to `dist/js` (+ sourcemaps) |
| `npm run dev` | `tsc --watch` into `dist/js` while editing |
| `node scripts/gen-sw-manifest.mjs` | reprint the `sw.js` ASSETS block from `src/` |

Local preview: `npm run build`, then serve `dist/`
(e.g. `npx serve dist` or `python -m http.server -d dist`).
Opening `index.html` from the repo root will not work — browsers cannot
load `.ts` sources.

## Conventions

- ESM import specifiers keep the `.js` extension in `.ts` sources
  (`from './dom.js'`); TypeScript maps them to the sibling `.ts` file and
  the emitted JS keeps the specifier browsers need.
- Shared shapes live in `src/domain/types.ts` (`Reading`, `AppSettings`,
  `ChartPoint`, `ReviewState`, `StartReadingJob`, OCR envelope). Report
  section shapes mirror `supabase/functions/ocr/types.ts`; the client report
  itself is `Record<string, any>` because views walk dotted paths.
- `$()` in `core/dom.ts` is deliberately non-null (every id exists in
  `index.html`); use `$input()`/`$select()` or `as HTMLInputElement` for
  form controls.
- `strict: true`. `any` survives only at true dynamic boundaries
  (IndexedDB payloads, OCR JSON, `esm.sh` CDN import, swipe-handler expando
  props on `wheel.ts` hosts) — each is commented at the site.
- One behavioural note carried over from the JS: `REPORT_FIELD_LABELS` had
  `fat_percentage` twice ("Body fat" then "Fat percentage"); JS kept the
  last, and the TS source keeps a single "Fat percentage" entry with a
  comment so the behaviour is identical and visible.
