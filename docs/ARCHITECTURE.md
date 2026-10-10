# Architecture

Local-first PWA. TypeScript sources in `src/` compile to ES modules in
`dist/js/` (`npm run build`); `index.html` loads `js/main.js`, which resolves
against `dist/` after the build. See `docs/TYPESCRIPT.md` for commands.
Readings live in IndexedDB first; Supabase mirror is opt-in.

## Where things live

```text
src/
  main.ts              # thin boot: settings → shell wiring → readings → auth → route
  app/shell-events.ts  # app-frame chrome (nav, auth button, sheet/scanner/review chrome)
  core/                # pure plumbing: dom, events, router, settings, theme, constants
  domain/              # shared vocabulary: types.ts + report.ts (flatten/label/read back)
    + core/metrics.ts  # metric catalogue (METRICS, groups, ranges, report paths)
    + core/format.ts   # dates, numbers, unit-aware display
  data/
    db.ts              # IndexedDB primitives only
    dedupe.ts          # same-report identity (serial + minute + player)
    selectors.ts       # pure derived views (sorted, rawPoints, series, deltas)
    store.ts           # facade: in-memory set + load/add/delete + live selectors
    export.ts sync.ts  # CSV/JSON/Samsung out; two-way cloud mirror
  services/            # outside world: auth, ocr proxy, report-url, share inbox
  ingest/
    capture.ts         # facade: sheet chrome + re-exports (keeps old imports working)
    scanner.ts         # camera + QR decode → pipeline
    reading-pipeline.ts# fetch + extract + hand to review (or direct-save provider data)
    review.ts          # review screen view (render only)
    review-validate.ts # form → clean data | errors
    reading-builder.ts # clean data → reading → persist (+ mirror)
    scanfan.ts         # radial add-reading menu
  pages/               # one module per route; each calls Route.page(name, render)
    insights.ts        # Today-view derivations extracted from dashboard
  ui/ (as components/) # chart, chip, tile, wheel — presentational; take props
```

`components/` is the current folder name for `ui/` above (rename deferred to
avoid churning `sw.js` + imports in the same PR).

## Data flow

```
scan/link/file/manual
  → ingest/reading-pipeline.startReading
  → ingest/review.openReview (human confirms)
  → ingest/review-validate + reading-builder
  → data/store.addReading (dedupe via dedupe.ts)
  → events.emit('readings') → router refreshes mounted page
```

Trusted provider results skip review via `reading-builder.saveReadingDirect`.

## Conventions

- Views read via `data/store.ts` live selectors (`getReadings`, `latest`,
  `seriesFor`, `deltaFor`, `rawPoints`); components take props
  (`tile(key, reading, { delta, points })`).
- Report flattening: always `domain/report.ts`
  (`reportLeaves` for edit view, `reportRows` for read-only view).
- HTML entity decoding: `core/dom.ts decodeHtmlEntities`
  (services must not touch `document` directly).
- Routes register with `Route.page(name, render)` on import;
  `history`/`settings` additionally export `init*()` wired once in
  `app/shell-events.ts`.
- Service worker: `sw.js` ASSETS must list every compiled `dist/js` file.
  After adding/removing a module, run `node scripts/gen-sw-manifest.mjs`
  and paste the output, then bump `CACHE`.
