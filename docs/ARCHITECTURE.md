# Architecture

Local-first PWA. No build step. `index.html` loads `js/main.js` (ES modules).
Readings live in IndexedDB first; Supabase mirror is opt-in.

## Where things live

```text
js/
  main.js              # thin boot: settings → shell wiring → readings → auth → route
  app/shell-events.js  # app-frame chrome (nav, auth button, sheet/scanner/review chrome)
  core/                # pure plumbing: dom, events, router, settings, theme, constants
  domain/              # shared vocabulary: report.js (flatten/label/read back)
    + core/metrics.js  # metric catalogue (METRICS, groups, ranges, report paths)
    + core/format.js   # dates, numbers, unit-aware display
  data/
    db.js              # IndexedDB primitives only
    dedupe.js          # same-report identity (serial + minute + player)
    selectors.js       # pure derived views (sorted, rawPoints, series, deltas)
    store.js           # facade: in-memory set + load/add/delete + live selectors
    export.js sync.js  # CSV/JSON/Samsung out; two-way cloud mirror
  services/            # outside world: auth, ocr proxy, report-url, share inbox
  ingest/
    capture.js         # facade: sheet chrome + re-exports (keeps old imports working)
    scanner.js         # camera + QR decode → pipeline
    reading-pipeline.js# fetch + extract + hand to review (or direct-save provider data)
    review.js          # review screen view (render only)
    review-validate.js # form → clean data | errors
    reading-builder.js # clean data → reading → persist (+ mirror)
    scanfan.js         # radial add-reading menu
  pages/               # one module per route; each calls Route.page(name, render)
    insights.js        # Today-view derivations extracted from dashboard
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
  → data/store.addReading (dedupe via dedupe.js)
  → events.emit('readings') → router refreshes mounted page
```

Trusted provider results skip review via `reading-builder.saveReadingDirect`.

## Conventions

- Views read via `data/store.js` live selectors (`getReadings`, `latest`,
  `seriesFor`, `deltaFor`, `rawPoints`); components take props
  (`tile(key, reading, { delta, points })`).
- Report flattening: always `domain/report.js`
  (`reportLeaves` for edit view, `reportRows` for read-only view).
- HTML entity decoding: `core/dom.js decodeHtmlEntities`
  (services must not touch `document` directly).
- Routes register with `Route.page(name, render)` on import;
  `history`/`settings` additionally export `init*()` wired once in
  `app/shell-events.js`.
- Service worker: `sw.js` ASSETS must list every shipped JS file.
  After adding/removing a module, run `node scripts/gen-sw-manifest.mjs`
  and paste the output, then bump `CACHE`.
