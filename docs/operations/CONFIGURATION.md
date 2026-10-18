# Configuration reference

Manzil has three runtime modes and two backend roles. Use this guide with [local development](../engineering/LOCAL_DEVELOPMENT.md), [deployment](DEPLOYMENT.md) and [implementation status](../IMPLEMENTATION_STATUS.md). Values below describe checked-in code defaults, not an assertion about the current live environment.

## Modes and commands

| Mode | Command | Identity and persistence | Background work |
| --- | --- | --- | --- |
| Standalone | `npm.cmd run dev` | Trusted localhost development identity; SQLite under `data/` | Local source/commute/fuel timers; source may be enabled by default |
| Firebase emulators | `npm.cmd run dev:firebase` | Auth + Firestore emulators in `demo-manzil`; per-UID records | Local worker runner; collector and cloud speech disabled by launcher; Gemini not scheduled |
| Hosted | `npm.cmd run build:cloud`, then explicit release | Firebase Auth + Firestore; attached service identities | No production source/commute/fuel polling timer; optional private worker and Scheduler; request-driven hourly weather cache |

Node **24.12+** is required. Auth/Firestore emulators also need Java **21+**. The local-runtime PowerShell helper (`npm.cmd run dev:local`) can select already installed/ignored runtimes; it downloads nothing.

The default web/API ports are **5173 / 3001**, local worker **3002**, Auth **9099**, Firestore **8080**, emulator UI **4000**. Stop one stack before starting another on the same ports. All development services must remain on loopback.

## Files and precedence

| File or input | Purpose | Tracking policy |
| --- | --- | --- |
| [`.env.example`](../../.env.example) | Standalone template | Tracked, no secrets |
| `.env` | Optional local process defaults loaded by dotenv | Ignored |
| `.env.gemini.local` | Optional local/emulator `GEMINI_API_KEY`; loaded without overriding existing process values | Ignored; never upload |
| [Frontend template](../../config/frontend.env.example) → `.env.cloud.local` | Public Firebase browser config for Vite's cloud build | Filled-in file ignored |
| [Runtime template](../../config/production.env.example) | Production server placeholders | Tracked template |
| `config/cloud-run*.manzil-app-v1.yaml` | Non-secret settings for the recorded project | Project-specific; adapt before deploying elsewhere |
| Cloud Run environment + Secret Manager injection | Actual deployed server settings/key | Operator-controlled; not browser configuration |

The launching process takes precedence over dotenv defaults. Vite cloud mode loads its mode-specific environment; process values take precedence there too. The emulator launcher explicitly sets its demo project, API/browser mode, loopback proxy, source-off and speech-off settings. Do not carry production environment variables into emulator shells.

`npm.cmd run config:check` validates the **current process's runtime configuration** and Node version. It prints no credentials, creates no resources and does not test a YAML file, browser build configuration, billing, IAM, provider access or live service health.

## Server runtime and authorization

| Variable | Meaning / default |
| --- | --- |
| `MANZIL_MODE` | `local`, `emulator` or `production`; defaults local unless `NODE_ENV=production` |
| `MANZIL_SERVICE_ROLE` | `api` (default) or `worker` |
| `NODE_ENV` | Production process must use production mode; tests disable default external weather/fuel work |
| `HOST` / `PORT` | Local `127.0.0.1:3001`; production `0.0.0.0:8080` unless a valid port is supplied |
| `FIREBASE_PROJECT_ID` | Required Firebase project in emulator/production; `GOOGLE_CLOUD_PROJECT` is fallback |
| `ALLOWED_HOSTS` | Comma-separated hostnames; production requires explicit non-loopback entries, without scheme/path/wildcards |
| `ALLOWED_ORIGINS` | Comma-separated exact HTTPS origins in production, without trailing slash/path |
| `FIREBASE_HOSTING_SERVICE_HOST` | Confirmed hash-based API `*.a.run.app` hostname; must also be in `ALLOWED_HOSTS`; narrowly permits that service's Firebase `fh-*` pins |
| `MANZIL_DB_PATH` / `MANZIL_DATA_DIR` | Standalone SQLite location; forbidden in production |
| `FIRESTORE_EMULATOR_HOST` | Loopback `host:port`, normally `127.0.0.1:8080`; required in emulator mode |
| `FIREBASE_AUTH_EMULATOR_HOST` | Loopback `host:port`, normally `127.0.0.1:9099`; required in emulator mode |

Production rejects demo projects, emulator hosts, development-auth/local-database settings and a loopback bind. Emulator mode rejects real projects and missing/non-loopback emulator hosts; it must not silently fall back to cloud storage. The backend uses Admin SDK credentials from its attached identity/ADC, not frontend keys. Its Firebase authorization checks remain separate from service IAM.

## Frontend build configuration

Every `VITE_*` value is public after build. Frontend Firebase identifiers are public application configuration, **not** an Admin credential.

| Variable | Purpose |
| --- | --- |
| `VITE_AUTH_MODE` | `development` for local dummy identities, `emulator` for development-only loopback Auth, `firebase` for hosted builds |
| `VITE_FIREBASE_PROJECT_ID` | Must match backend project |
| `VITE_FIREBASE_API_KEY` | Registered public Firebase web API key |
| `VITE_FIREBASE_APP_ID` | Registered Firebase web app ID |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase hosted authentication domain; not an account-action URL |
| `VITE_AGENT_RUN_ORIGIN` | Optional exact public API origin for long administrator analysis; never the private worker URL |
| `VITE_DEV_PORT` / `VITE_API_PROXY_TARGET` | Local Vite port/proxy; normally set by launcher |

The cloud build rejects missing Firebase values, demo project IDs or non-Firebase cloud auth. Emulator auth cannot be shipped in a production bundle. Runtime project/auth/storage checks prevent a configured browser from sending account tokens to a mismatched Manzil backend.

For parallel local stacks, `MANZIL_DEV_API_PORT`, `MANZIL_DEV_WEB_PORT` and `MANZIL_DEV_WORKER_PORT` are launcher overrides. They are not Cloud Run deployment settings.

## Routing, maps, transit and weather

| Setting / component | Configuration boundary |
| --- | --- |
| `OSRM_BASE_URL` | Pakistan route adapter; default `https://router.project-osrm.org`; choose capacity appropriate to deployment |
| `PHOTON_BASE_URL` | Pakistan place search; default `https://photon.komoot.io`; queries go to that provider |
| OpenFreeMap + MapLibre | Public vector styles/tiles; no map API key currently required |
| Bundled OSM graph | Attributed extract in `assets/routing/`; fast-path Islamabad road routing |
| Closure road coverage | Bundled graph where covered; bounded public OSM lookup elsewhere; no client-supplied endpoint override |
| Local bus network | Versioned bundle in `assets/transit/`; not a live operator feed or automatic daily route import |
| Open-Meteo weather | Fixed Islamabad coordinate, model forecast, shared hourly cache; no weather API key or environment switch |

No setting turns model weather into observed traffic, fills missing bus schedules, invents a fare or removes closure/access/time validation. Unavailable data stays explicit. The weather cache is hourly **per process with persisted backoff**, not a distributed lease; evaluate concurrent-refresh behavior before scaling replicas. Road-coverage/provider details are in [routing](../reference/ROUTING.md), [road coverage](../reference/ROAD_COVERAGE.md), [transit](../reference/TRANSIT_ROUTING.md) and [weather](../reference/WEATHER.md).

## Source collection and private media

| Variable | Meaning |
| --- | --- |
| `X_SCRAPER_ENABLED` | Initial enabled default; standalone store enables unless explicitly false, Firestore defaults disabled unless explicitly true |
| `SOURCE_MEDIA_BUCKET` | Private source-image write/read bucket; production **worker only** |
| `SOURCE_MEDIA_READ_BUCKET` | Private evidence-preview bucket for authorized production API reads |

Persisted source settings take precedence over the initial environment default. **Current source interval is five minutes** (`shared/source.ts`), including local enabled collection; earlier fifteen-minute plans are historical. The emulator launcher disables collection. Production has no API polling timer: enabled source collection also needs an allowed worker job and a separate authenticated schedule. Signed-out public X HTML has partial coverage and can be unavailable; no login bypass, WhatsApp scraper or completeness guarantee is implied.

## Worker dispatch and optional Gemini

| Variable | Meaning / default |
| --- | --- |
| `WORKER_AUDIENCE` | Exact HTTPS canonical worker base URL for Google OIDC |
| `WORKER_SERVICE_ACCOUNT_EMAIL` | Exact accepted Scheduler service-account email |
| `WORKER_ALLOWED_JOBS` | Explicit comma-separated subset of `source,agent,fuel,commutes`; code fallback `source,commutes,fuel`, so deployed allowlists must be deliberate |
| `AGENT_WORKER_URL` | Production API-only exact private `*.a.run.app` origin for manual administrator analysis |
| `WORKER_MANUAL_SERVICE_ACCOUNT_EMAIL` | Production worker-only API runtime account in the same project; accepted only for `agent` |
| `GEMINI_ENABLED` | Initial model activation; default false; real work also requires persisted enabled settings and a key |
| `GEMINI_API_KEY` | Secret, server-only; local ignored file or worker Secret Manager injection |
| `GEMINI_MODEL` | Currently validated as `gemini-3.1-flash-lite` only |
| `GEMINI_DAILY_REQUEST_LIMIT` | Default 20; validated 1–200 attempts per PKT day |
| `GEMINI_DAILY_BUDGET_USD` | Default 1; validated 0.02–10; internal conservative reservation, not a provider/cloud billing cap |
| `GEMINI_AUTO_PUBLISH` | Compatibility input only: runtime enforces administrator review and rejects enabling automatic publication |

Production worker endpoints additionally require private Cloud Run IAM. An environment allowlist does not make a service private by itself. The public API does not expose worker operations or receive the model key. No real Gemini request occurs simply by running the standard tests; `agent:probe` is an explicit real external model attempt when configured.

The recorded cloud deployment uses separate five-minute source and agent schedules. Environment values do not create schedules. Local emulators do not automatically schedule Gemini; deliberate administrator execution with a real key still calls the external service. Clear validated road and transit changes publish automatically when enabled; unresolved proposals stay private for review. See [current lifecycle](SELECTIVE_AGENT_PUBLICATION.md).

## Fuel, speech and personal data

Fuel refresh reads a dated PSO reference with a persisted once-per-PKT-date guard. Standalone starts the local check; the emulator runner invokes the `fuel`/commute jobs; production offers deliberate administrator checking and optional separately allowed worker jobs. No daily cloud fuel schedule is active in the recorded release. There is no arbitrary fuel-source URL or fuel API-key setting.

| Speech variable | Meaning / default |
| --- | --- |
| `TTS_ENABLED` | Cloud Text-to-Speech off by default; provider credentials/API and deliberate provisioning also required |
| `PUBLIC_CLOUD_SPEECH` | False by default; cloud speech otherwise requires identity |
| `TTS_MONTHLY_CHARACTER_LIMIT` | Default 100,000 application characters per UTC month; valid positive integer |
| `TTS_ENGLISH_VOICE` | Default `en-GB-Wavenet-A` |
| `TTS_URDU_VOICE` | Default `ur-IN-Wavenet-A` |
| `ALLOW_PAID_SERVICES` | Emulator cloud speech requires explicit true in addition to activation |

Device voices and the bundled basic Urdu fallback are separate from optional cloud TTS. Voice availability/pronunciation depend on provider/device; none of these flags improves hardware GPS accuracy.

User consent is stored per account and defaults off. It is not a global environment flag. Turning on a source/model/worker setting does not authorize collecting a person's location. GPS retention, private exports and sample emulator data follow [personal travel data](../reference/PERSONAL_TRAVEL_DATA.md); no local account or database is automatically uploaded when modes change.

## Configuration failures to check first

| Symptom | Check |
| --- | --- |
| Hosted frontend says environment mismatch | Frontend/backend Firebase project, auth mode and Firestore production selection |
| Hosting `/api` returns host rejection | Exact API/service hosts, `FIREBASE_HOSTING_SERVICE_HOST` and updated Hosting pin |
| Administrator analysis times out through Hosting | Optional public direct API origin, its CORS allowlist, API-to-private-worker identity and request timeout |
| Source/model appears enabled but nothing runs | Persisted enabled state, job allowlist, worker identity/audience, Scheduler state and actual saved last-run outcome |
| Cannot verify users/change claims | Current admin claim plus API runtime Firebase Auth update IAM; do not loosen application checks |
| Branded reset page not used by email | Released `/account/action` handler and Firebase Console custom action URL, not `authDomain` |
| Forecast unavailable at a planned date | Actual hourly forecast coverage/freshness; no invented long-range weather |

See deployment/status documentation for recorded verification. Never include raw tokens, reset codes, keys, GPS traces, private media or credential-bearing URLs in issue reports or tracked configuration.
