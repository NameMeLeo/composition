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
    + core/i18n.ts   # en/tc/sc dictionary, t(), applyI18n(), label helpers
  domain/              # shared vocabulary: types.ts + report.ts (flatten/label/read back)
    + core/metrics.ts  # metric catalogue (METRICS, groups, ranges, report paths)
    + core/format.ts   # dates, numbers, unit-aware display (locale-aware)
  report/
    overlay-table.ts   # provider canvas coordinates ported from the source page
    report-image.ts    # canvas replica: bundled bg.png + raw payload overlay
    report-popup.ts    # #sheet-report controller (view details / download PNG)
  assets/report/{tc,en,sc}/bg.png  # bundled provider backgrounds (snapshots)
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

Trusted provider results skip review via `reading-builder.saveReadingDirect`,
then open the report-image popup (`report/report-popup.openReportPopup`).

## Provider report image

The Tanita page is a canvas SPA: `bg.png` + JSON overlaid at fixed coordinates
(`supabase/functions/ocr/tanita.ts` documents the API). We replicate that
composition in-app: `report/overlay-table.ts` ports the coordinates,
`report-image.ts` paints them over the bundled `assets/report/<lang>/bg.png`,
and the popup offers View details / Download PNG. The static `text.jpg` tail
is intentionally dropped. Small overlay icons (star, balance marks, leg dot)
are proxied through the edge function (`mode: 'report-asset'`, allowlisted to
five PNGs) because the HTTPS app cannot reach the plain-HTTP provider host.

## Desktop workspace (1024px and up)

Phone stays the capture-and-glance tool; desktop is the analysis workspace.
Mobile-first is preserved: every desktop rule is a `min-width` addition.

- Shell: labeled sidebar (`.rail`, hidden below 1024px) with an Add-reading
  dropdown (`components/menu.ts`, same four Capture actions as the scan fan);
  bottom tabbar hidden on desktop. Drag-and-drop of PDF/photo anywhere on the
  window feeds the file pipeline; shortcuts `1–4` switch views, `/` focuses
  the history filter (inert while typing or signed out).
- Dashboard 12-col grid; trends chart + clickable metric side-list rail;
  history 2-col cards + sticky filter; settings 2-col; sheets to 960px.
- Master–detail history at 1280px: `Route.onSplitDetail` lets `go('detail')`
  render into `#history-detail` without leaving the route (hash still
  updates, refresh is split-aware, breakpoint crossing re-renders).
- Trends compare mode: secondary dashed series mapped affinely onto the
  primary span (axis stays primary-labeled); tooltip shows real values.
- Bulk history ops: select mode + `#bulk-bar` (count, CSV/JSON of selected,
  one-confirm delete). `exportCSV`/`exportJSON` take an optional id list.
- CSV import (`data/import.ts`): parses our own export, validates
  (parseable date + ≥1 metric), previews counts/errors in a confirm, saves
  through `addReading` so dedupe applies.
- 30-day summary strip on Today: avg weight, count, body-fat and muscle net
  changes, derived from existing selectors.

## Multi-language (en/tc/sc)

`core/i18n.ts` owns one `{en, tc, sc}` dictionary. Dynamic code calls `t(key,
vars)`; static HTML wears `data-i18n` / `data-i18n-ph` / `data-i18n-aria` /
`data-i18n-title` attributes swapped by `applyI18n()` (boot + language change).
Metric, section, field and source labels go through `metricLabel()` /
`sectionLabel()` / `fieldLabel()` / `sourceLabel()` with English fallbacks.
`Settings.lang` (`system` default) resolves via `navigator.language`
(Hant→tc, Hans→sc). The report background follows the reading's language,
falling back to the app language.

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
