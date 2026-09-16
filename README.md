# Composition

Composition turns Tanita body-composition reports into a private, useful history. Capture a report, check the numbers, and watch the trend build over time.

## Start with the easiest capture path

Open **Add reading** and paste the report link. Composition accepts a normal URL, copied QR/share text, a scheme-less address, or a bare player ID. It fetches the report, reads the measurements, and shows them for review before anything is saved.

When a link is not convenient, the same screen also supports:

- Scanning the QR code on the report.
- Uploading a PDF or photo from the device.
- Entering the numbers manually.

## Review before you save

Every captured report opens in an editable review screen. Check the date, correct any measurement, and save only when the reading looks right. Empty fields stay empty rather than being guessed.

## See the signal, not a pile of numbers

- **Today** shows the latest reading and the change from the previous one.
- **Trends** lets you move through one metric at a time with a swipeable wheel and a clear chart.
- **History** keeps the full timeline available for inspection and editing.
- **Exports** include JSON, CSV, and a Samsung Health-shaped CSV for your own import workflow.

## Local first

Readings are stored in the browser on the device, so the core app remains useful offline. There is no analytics or telemetry. OCR is optional: when enabled, the report is sent through a server-side reader and the Gemini API key stays off the device.

## Optional cloud mirror

Sign in with Google and turn on the cloud mirror when you want the same readings available across devices. Sync is bidirectional: Composition brings down cloud readings, keeps the newer version when a reading exists in both places, and uploads local readings that are newer or missing from the cloud.

The mirror is off by default. Cloud rows belong to your signed-in account and are protected by Row Level Security in your Supabase project.

## Install it like an app

Composition is a progressive web app. Open it in a supported browser and use the browser's install action to add it to your home screen. Camera capture requires HTTPS or `localhost`.

## For contributors

The app is a small vanilla JavaScript PWA with IndexedDB storage, native SVG charts, an optional Supabase OCR function, and a service-worker app shell. There is no build step and no dependencies — the browser loads ES modules directly.

To run the static app locally:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. A server is required: browsers block ES modules over `file://`. OCR, Google sign-in, and cloud sync require the corresponding optional services to be configured.

### Layout

```
index.html      Shell markup: every view, sheet and overlay
styles.css      Design tokens and all styling
sw.js           Offline app shell (add new modules to ASSETS)
js/
  main.js       Entry point: boot, global chrome, page registration
  constants.js  Storage keys, storage names, deployment defaults
  metrics.js    Metric catalogue and report vocabulary
  dom.js        $, el, clear, toast, uid
  format.js     Dates, numbers, unit-aware measurement text
  events.js     Tiny pub/sub for "the readings changed"
  settings.js   localStorage preferences
  store.js      IndexedDB plus the in-memory readings cache
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

Adding a page means creating `js/pages/your-page.js`, registering it with `Route.page('your-page', render)`, importing it from `main.js` for its side effect, and adding every new file to `sw.js`.
