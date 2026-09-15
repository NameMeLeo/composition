# Composition

A progressive web app that gets Tanita body-composition reports off a piece of paper and into your phone, keeps every reading on the device, and draws the trends.

- **Scan** the QR code on a Tanita self-test report and the report is fetched for you.
- **Share** a PDF or photo straight into the app — the QR step is skipped entirely.
- **Gemini** reads the numbers server-side. The API key never reaches the browser.
- **Everything stays local** in IndexedDB, with optional CSV, JSON and Samsung-Health-shaped export.

---

## What is in the box

```
index.html                      the app — one runnable entry
styles.css                      design tokens and components
app.js                          auth, storage, capture, OCR client, charts
sw.js                           service worker (offline app shell)
manifest.webmanifest            installable PWA + Android share target
icons/                          app icons
supabase/schema.sql             optional cloud mirror table with RLS
supabase/functions/ocr/         Gemini OCR proxy — the only place the key lives
functions/share.js              optional Cloudflare share inbox receiver
functions/share/[token].js      optional Cloudflare share inbox pickup
.github/workflows/deploy.yml    GitHub Pages deployment
```

Open `index.html` and it starts at the Google sign-in screen. After sign-in, readings are still stored locally in the browser unless the optional cloud mirror is enabled.

---

## The key problem, and how this solves it

GitHub Pages and Cloudflare Pages serve static files. Anything shipped to the browser can be read by whoever loads the page, so a Gemini key in `app.js` is a public key. There is no client-side trick around that.

So the key lives in a **Supabase Edge Function**, which runs on Supabase's servers:

```
phone  ──POST + session JWT──▶  Supabase Edge Function  ──x-goog-api-key──▶  Gemini
       (never sees the key)      (holds GEMINI_API_KEY)
```

The browser only ever knows your Supabase URL and its **anon** key. Both are designed to be public — Row Level Security is what protects your data, not the anon key. The Gemini key is a Supabase secret and is never sent anywhere except Google.

This also solves the second problem: `13.251.17.127` does not send CORS headers, so a browser cannot fetch the report directly. The function fetches it server-side.

---

## Setup

### 1. Deploy the app

**GitHub Pages**

```bash
git init
git add .
git commit -m "Composition: local-first body composition PWA"
git branch -M main
gh repo create composition --public --source=. --push     # or: git remote add origin ... && git push -u origin main
```

Then in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The included workflow deploys on every push to `main`.

**Cloudflare Pages** (also gives you the Android share inbox)

Create a Pages project pointing at the repository with:

| Setting | Value |
|---|---|
| Build command | *(leave empty)* |
| Build output directory | `/` |

Add a KV namespace and bind it as `SHARE_KV` to unlock the share target. Without KV the app still works and the in-app file picker handles sharing.

### 2. Create the Supabase project

1. <https://supabase.com/dashboard> → **New project**.
2. **Authentication → Providers → Google → Enable.** Paste a Google OAuth client id and secret (create them at <https://console.cloud.google.com/apis/credentials> — authorised redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`).
3. **Authentication → URL Configuration → Redirect URLs** — add `https://namemeleo.github.io/composition/` and `http://localhost:8000` if you test locally.
4. **Project Settings → API** — copy the **Project URL** and the **anon public** key. The browser app uses these public values to initialize Supabase; they are not secret.
5. (Optional) Run `supabase/schema.sql` in the SQL editor to enable the cloud mirror.

#### OAuth branding and the Supabase URL

The Google consent page is hosted by the configured OAuth flow, so its `Continue to <project-ref>.supabase.co` line cannot be renamed by changing Composition's button text or redirect string. You can change the Google OAuth consent-screen app name, logo and support details in Google Cloud. To replace the Supabase hostname itself, configure a custom Supabase domain if it is available for your plan, then use that domain consistently in Supabase Auth, Google Cloud's authorised redirect URI, and the app configuration. Keep the deployed Composition URL in Supabase's redirect allowlist as well.

### 3. Deploy the OCR proxy

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>

# The key goes in as a secret, never into a file that is committed.
supabase secrets set GEMINI_API_KEY=your-google-ai-studio-key
supabase secrets set GEMINI_MODEL=gemini-3.5-flash-lite
supabase secrets set ALLOWED_ORIGIN=http://localhost:8000,https://your-username.github.io
supabase secrets set REQUIRE_AUTH=true

supabase functions deploy ocr --no-verify-jwt
```

Get a key from <https://aistudio.google.com/apikey>.

`--no-verify-jwt` is required so the function can answer the `ping` check and accept the anon key; the function verifies the caller itself and `REQUIRE_AUTH=true` upgrades that to a signed-in user only.

### 4. Point the app at it

The deployed app uses the public Supabase URL and anon key defined near the top of `app.js`. To point a fork at a different project, update `DEFAULT_SUPABASE_URL` and `DEFAULT_SUPABASE_ANON_KEY` before deployment. The in-app OCR controls are intentionally hidden from ordinary users. Never put `GEMINI_API_KEY` or a service-role key in the browser.

---

## Using it

**Scan a QR code** — Add reading → Scan the report QR code. Works with the native `BarcodeDetector` where available and falls back to an in-page decoder elsewhere. If neither is available the app says so and offers the photo route instead of pretending to scan.

**Share a PDF or photo** — Add reading → Share a PDF or photo on Android, or share to Composition from any app's share sheet. The attachment goes straight to Gemini with no fetching and no QR decoding.

**Paste a link** — the same fetch-and-read path when the camera is inconvenient. A link containing `player_id` is accepted, and a bare player id is expanded to the full Tanita URL.

**Check the numbers** — every reading lands on a review screen first. Gemini's output is presented field by field with typical ranges, and anything out of range is flagged before it can be saved. Nothing is written to your device until you press Save.

**Trends** — pick a metric and a range (7D / 30D / 90D / 1Y / All) and scrub the chart with a finger. Summary tiles give latest, average, lowest, highest and change across the range.

---

## Samsung Health

Samsung Health has no public write API, so direct sync is not something this app can honestly promise. Instead, **Settings → Samsung Health export** produces a CSV with Samsung's column names (`start_time`, `end_time`, `weight`, `body_fat`, `skeletal_muscle`, `body_water`, `visceral_fat`, `bmi`, `basal_metabolic_rate`) for import through your own tooling or Samsung's data import flows.

---

## Privacy

- Readings live in IndexedDB on the device. There is no analytics, no telemetry, no third-party script beyond the Google Fonts stylesheet and `@supabase/supabase-js` (both loaded only when needed).
- The cloud mirror is off by default. When on, rows are written to your own Supabase project under Row Level Security, readable only by your user id.
- The OCR function logs nothing about the content of your reports. If you want the proxy to stay private, set `REQUIRE_AUTH=true` and keep `ALLOWED_ORIGIN` limited to the origins you use, separated by commas.
- Shared-in files are parked at most ten minutes in KV and deleted on first read.

---

## Local development

```bash
python -m http.server 8000     # or: npx serve .
```

Then open <http://localhost:8000>. Camera access requires `localhost` or HTTPS.

---

## Assumptions worth knowing

- The Gemini model id is a single secret, `GEMINI_MODEL`. Rename it there if you switch models.
- The OCR prompt is schema-driven and was written without a sample report attached, so it targets the standard Tanita layout. The review screen exists precisely because extraction can be wrong; if a field comes back empty the app leaves it empty rather than guessing.
- New installs start with no readings. Older browser profiles that already contain the previous sample readings still show the sample banner, and **Remove** on the dashboard clears only those sample records.
