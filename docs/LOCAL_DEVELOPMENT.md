# Local development

**18 October integrated release deployed:** source `8702fb9` includes GitHub main `f07778c` plus preserved fuel/cloud-voice work. API `manzil-api-00015-7cr`, private worker `manzil-source-worker-00012-t2z`, Hosting pin `fh-208bbe9aa098303b`. Clear >=95%-confidence road and timed Metro restrictions publish only after evidence, geometry/service and time checks; uncertain events retain individual admin decisions. Ten labelled shared demo closures were imported (seven active, three upcoming), without personal User 123 data. The bundled/offline Urdu pack is excluded; cloud/device speech and nightly fuel remain. **1,099 standard + 27 Firebase emulator tests (1,126 total)**, cloud build and **34 live checks per origin** pass. Earlier review-only/local-only/basic-Urdu notes below are historical. [Current policy and operations](SELECTIVE_AGENT_PUBLICATION.md).

**Pipeline follow-up deployed, 18 October:** API `manzil-api-00011-76r`, private worker `manzil-source-worker-00008-cfp`, Hosting pin `fh-2c9b2b4410f6124c`. Control centre opens on Pipeline; Review queue/Awaiting review combine Gemini post proposals with community reports. Run Gemini now supports the configured authenticated API-to-private-worker boundary; no model key on API. Live progress, actual tool logs, unique incident matching and bounded saved-extraction map retries preserve mandatory admin approval. **478 standard + 20 Auth/Firestore emulator tests (498 total)**, production build, four desktop/mobile/theme/language checks and 27 live read-only checks per origin pass. Production manual analysis uses the public API origin to avoid Hosting's 60-second timeout; API timeout 180 seconds. [Workflow and operations](AGENT_MAP_REVIEW.md). Older scheduled-only/automatic-publication entries are historical. Git changes remain uncommitted/unpushed.

**Current agent map review (18 October):** the combined worker prepares private per-event map drafts. Review on map prefills their details and resolved geometry; administrator approval/rejection controls every routing change. Existing saved interpretations can be prepared without another model request. See [review workflow](AGENT_MAP_REVIEW.md) and current release evidence. Earlier publication-mode descriptions are historical.

**Optional Gemini, 17 October:** the cloud integration is deployed and real text/image generation works with the owner's confirmed Free tier key. Local work remains independent: keep the key in ignored `.env.gemini.local`; explicitly set `GEMINI_ENABLED=true` in `.env` or the launching process for admin Process pending. The emulator runner does not schedule Gemini. `npm.cmd run agent:probe` deliberately calls the real external model without app DB writes. Ordinary dev/tests need no model key. [Local setup and constraints](GEMINI_INTEGRATION.md).

**17 October:** the core is [deployed](https://manzil-app-v1.web.app); local workflows remain unchanged. Recommended `npm.cmd run dev:firebase` uses local Auth/Firestore emulators, seeded accounts and isolated records. Node **24.12+** and Java **21+** are required; Firebase CLI is a project dependency. Plain `npm.cmd run dev` retains standalone SQLite. See [environment guide](ENVIRONMENTS.md) for switching modes and [deployment procedure](FIRST_DEPLOYMENT.md) for explicit cloud releases. Local development never implicitly uploads private data or deploys changes.

For local normal/admin credentials, login-first guest entry and the spotlight tour, see [Development accounts and tour](DEV_ACCOUNTS_AND_TOUR.md). This feature branch implements a **Control centre** with blockade review/correction, contributor verification and source-pipeline status. The earlier [admin proposal](ADMIN_INTERFACE_PROPOSAL.md) remains historical context; its full audit/override system and automatic Gemini publication are still separate work. The other developer handles integration/release; pushing the branch does not update the live app.

English/Urdu controls, guest account screens, onboarding and automatic GPS recovery are described in [Bilingual navigation and Cloud speech](BILINGUAL_NAVIGATION_AND_CLOUD.md). Local planning still needs no Cloud credentials. Optional local cloud speech uses server-side ADC, `TTS_ENABLED=true` and explicit `ALLOW_PAID_SERVICES=true`; emulator defaults stay disabled. Production guest/signed-in cloud voices and the 01:00 PKT fuel schedule are documented in [fuel/voice operations](FUEL_AND_VOICE.md). In PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

## Start

Vehicle/fuel features use no new credentials or packages. In Profile, save a car/motorcycle, petrol/diesel and km/litre; each valid route can then show a small fuel estimate. The running standalone/emulator worker checks the public PSO archive once per Pakistan date. Admin **Pipeline → Check fuel prices** exposes that same daily result without starting Champ collection. The price check is separate from the disabled X collector. Source failures retain visible cached/unavailable states. Activity has week/month/all-retained estimated spending; trips without a known vehicle or dated rate stay unpriced. No real GPS is required to inspect the controls, and enabling vehicle estimates does not grant trip collection permission. [Fuel guide](FUEL_COSTS.md).

The optional **`npm.cmd run dev:local`** helper supports machines with ignored portable Node 24 or installed Android Studio Java 21. It changes only its child-process environment. With compatible Node/Java already on PATH, use `npm.cmd run dev:firebase` directly. See [runtime details](ENVIRONMENTS.md#environment-requirements).

Use **Node 24.12+** and Java **21+** for the recommended emulator workflow. See [Windows Node instructions](ENVIRONMENTS.md#upgrading-node-on-windows). Standalone SQLite mode needs no Docker, Java, paid routing account or Google credential.

```sh
npm.cmd ci
npm.cmd run dev:firebase
```

Open **http://127.0.0.1:5173/**. Vite proxies `/api` to the API at **http://127.0.0.1:3001**. Emulator mode starts Auth/Firestore, frontend, API and worker with seeded accounts; source retrieval and cloud speech remain disabled by its launcher. Keep all local services on loopback. Stop the terminal with Ctrl+C when finished. Automatic local checks require the backend/worker and machine to remain running.

`npm.cmd run dev` starts the standalone SQLite API/frontend; `dev:api` and `dev:web` start either separately. It has one trusted local API identity and shared records, so use emulators to test user isolation/roles. Stop one stack before switching modes; do not run two APIs on the same port. `npm run build` type-checks all source and creates standalone `dist/`; never publish that preview as the cloud frontend. `npm start` starts the standalone API only. Hosted release uses `npm.cmd run build:cloud` and the separate authorized release procedure.

## First useful workflow

1. Sign in, create a configured Firebase account, or select **Continue as guest**. Guest entry is remembered in this browser tab; guest browsing receives the skippable tour. Skip/Finish/Escape dismiss it for the visit. Help/Profile can replay it. Sign-out returns to account entry. An ordinary account lands on Map; admin lands in Control centre. No entry/tour action requests GPS.
2. **Map** always uses now; its compact **Live map** header shows PKT time/date. Open **Plan ahead** to apply another Pakistan date/time and plan there. **Map** restores live time while remembering the preview selection. Planned routes offer **View live route** before current navigation. Up to three distinct validated blue routes are shown when available; fewer routes have an explicit reason. **Add stop** supports five ordered locations. The pale-red unavailable original can be inspected for comparison but never navigated. [Time behavior](MAP_TIME_AND_STOPS.md).
3. As admin, open **Demo closures** for ten explicitly synthetic scenarios. **Park Road · F-8 → Try route** exercises normal street detours; the other focused examples cover G-9, I-8 and F-10. Route results also offer **Block a point on this route** to add a synthetic restriction. These tools are admin-only and never replace live verified reports. See [demo guide](DEMOS.md).
4. **Closures** is visible to everyone. Select **Add closure**; guests are asked to sign in and can close that dialog to keep browsing. Choose **Road closure** for two ends on the same connected road, or **Blockade** for a short line across the road. Add PKT schedule/unknown expiry, optional notes/source and up to six photos. Ordinary reports wait for review; verified contributors/admin may publish. Outside the bundled graph, the API loads a small cached public OSM road area automatically. There is no Islamabad editor boundary; unsupported/unavailable source geometry stays explicit. [Workflow](CLOSURE_WORKFLOW.md), [road source and limits](ROAD_COVERAGE.md).
5. Closure cards show place and **From/Until** immediately. Expand for lazily loaded photos, notes and reporter/reviewer identity. A verified contributor can review pending reports. Admin **Control centre → Blockades** adds all-record filtering and correction/cancellation. **People** lists Auth accounts and verifies/unverifies contributors; admin claims remain an operator responsibility. Directory service permission failures are shown explicitly.
6. **Control centre → Pipeline** shows the existing collector/inbox status and deliberate notice import. Actual public-page coverage is partial; disabled/error states are not live verification. Gemini extraction and automatic event publication are not activated.
7. Profile supports photo/name/city/area, language, **Classic/Minimal/Night** map styles and light/dark/system app appearance. Personal trip data is visibly **Off** until allowed. Browser notifications need separate permission. Select **Navigate** for preview; only **Start GPS guidance** requests location. With trip consent, eligible foreground trips are saved for statistics and usual-route warnings. Activity offers manual recording and history. On phones, expand controls using the sheet handle.

Firebase role/ownership checks are enforced on the server independently of UI controls. A contributor's verification is server-owned metadata, not an admin claim. Standalone dummy identities still share one trusted local API; use emulators to test ordinary reports versus verified/admin behavior. These updates supersede earlier instructions allowing guest editor/demo mutations or describing the dashboard as wholly unimplemented.

## Standalone configuration

Copy `.env.example` to `.env` if overrides are needed. Never commit `.env`. Defaults work without one.

| Setting | Purpose |
| --- | --- |
| `HOST` | Must remain `127.0.0.1`; the API rejects other bind hosts |
| `PORT` | API port, default 3001. Keep this default with the current Vite proxy; update the proxy too if changing it |
| `MANZIL_DATA_DIR` | Local data folder, default `./data` |
| `MANZIL_DB_PATH` | Optional full SQLite filename override |
| Map appearance | No environment key. Use Profile → Theme / Map detail for the OpenFreeMap vector styles |
| `X_SCRAPER_ENABLED` | Initial automatic-source setting for a new database. The app's setting is persisted after creation |
| Browser executable settings | No longer used by the HTTPS source collector |

The source profile and five-minute interval are deliberately fixed. Settings in the Updates panel control whether automatic checks run. Standalone development polls while its server runs; production requires the private worker/Scheduler described in [source deployment](SOURCE_DEPLOYMENT.md). No existing browser login/profile is read.

The source collector uses bounded, cookie-free HTTPS and parse5 HTML parsing; no browser executable/download is required. Use `npm.cmd run source:probe` for a metadata-only read-only check; `source:check` writes the normal source inbox. Failed/blocked HTTPS or changed markup remains explicit and does not block maps, editing, routing or manual import. See [source implementation](INGESTION_IMPLEMENTATION.md).

For explicit local image inspection, run `npm.cmd run source:probe -- --download-images`. Images and a source-linked manifest are saved under ignored `data/source-probes/`; the output prints their folder/filenames. Limits are eight images, 5 MB each, 15 seconds per request and 45 seconds for the download batch. This does not call Gemini, classify relevance or alter the source inbox/map. Plain `source:probe` remains metadata-only.

## Routing data and coverage

The tracked `assets/routing/` contains real OSM source/graph snapshots and provenance under ODbL 1.0. The local graph extent is west 72.97, south 33.60, east 73.16, north 33.75. Other Pakistan endpoints use online OSRM routing; named search also uses Photon. Both require internet and return explicit unavailable errors when providers fail. Foreign endpoints/stops are rejected before routing. Pins snap only within a bounded distance, and the dashed pin-to-road connector is not a routed access path. Red road coating remains limited to the bundled Islamabad graph; national closures are still checked against returned route candidates. See [coverage and privacy](ROUTING.md).

```sh
npm run data:import
```

This rebuilds the runtime graph from bundled OSM source, downloading a bounded source only when necessary. Restart the API after changing the graph. Read [ROUTING.md](ROUTING.md) before extending coverage or changing access rules. Map tiles and the routable graph are different datasets; neither supplies live traffic here.

## Local data and privacy

In standalone mode, `data/manzil.sqlite` and its WAL/SHM files store restrictions, commutes, alerts, notice revisions, pending jobs and personal trips. They are ignored by Git. Closing and reopening the server preserves them. Emulator mode uses separate local Firestore records and starts fresh by default; it never migrates SQLite data. Keep backups private if you choose to make them.

Personal GPS collection defaults off, including older profiles without the field. Allowing it can also enable usual-route learning; switching collection off disables learning and clears unsaved navigation/manual recording. Planning/preview alone starts no recording. Navigation reuses its existing GPS fixes; hiding the page discards an unsaved navigation fragment, and account changes/opt-out abort pending saves. Manual recording pauses when Activity/page becomes hidden. No background GPS is promised. The API checks collection permission at the trip-write boundary; personal data remains UID-scoped in Firebase.

Photo uploads are resized/re-encoded locally before submission; profile city/area are optional manually entered text. Closure photos are stripped from state lists and fetched only after opening an authorized report. A separate per-trip checkbox controls future road-discovery contribution; it currently uploads nothing and adds no roads. Points older than 30 days are removed, summaries after 90 days. Trip lists contain summaries; raw traces are fetched on demand. See [personal travel data](PERSONAL_TRAVEL_DATA.md) for exact consent/retention boundaries. Source evidence remains separate from interpreted events; Gemini interpretation is not active.

Keep the standalone single-user API, Vite server and Firebase emulators on loopback. Standalone origin checks and dummy roles are development guards. Firebase modes verify identity and enforce per-user data access; live production still requires configured service identities, secure deployment, externally scheduled worker jobs and the chosen provider setup. See [environment guide](ENVIRONMENTS.md).

## Checks and troubleshooting

```sh
npm test
npm run build
npm run source:check
```

- **Page cannot connect:** run `npm run dev`, check both printed local URLs, and ensure ports 5173/3001 are free. Do not terminate unrelated processes to reclaim a port.
- **Graph unavailable:** confirm tracked routing assets exist, run `data:import`, restart the API. No straight-line fallback is substituted.
- **No route:** check the graph extent, road pin locations, one-way/access rules and closure geometry/time. Large polygons can disconnect all roads or conservatively cover flyovers.
- **Tiles missing:** routing is local but OpenFreeMap styles/tiles/fonts require internet and the renderer needs WebGL. The app shows a failure state and retains fields/coordinate editing. Do not bulk-download or proxy public tiles to work around restrictions.
- **X status is error/blocked:** run `npm.cmd run source:probe` and inspect `diagnostics` for each profile/detail request. `request_timeout` is the 15-second request deadline; `collection_timeout` is the 35-second overall deadline. `http_status` includes the actual HTTP code (403 means access denied; 429 means rate limited). `network` may include a safe `networkCode`, such as `ENOTFOUND` for DNS resolution failure. `content_type`, `missing_body` and `body_too_large` distinguish unusable responses. HTTP 200 with no usable posts can indicate a login shell or changed markup; check the top-level state/message too. No raw response bodies, headers or exception messages are printed. A failed check does not mean there are no closures. Uninterrupted delivery and Cloud Run source access remain unverified; deliberate notice import remains available.
- **GPS history is empty:** allow Personal trip data in Profile, then explicitly start guidance or manual recording and grant browser location access. A navigation trip must reach 60 seconds/100 metres before saving. Keep the page visible; hidden-page navigation fragments are discarded. Device accuracy/location services matter; no synthetic fixes are generated. Usual-route learning additionally needs three qualifying journeys on separate dates.
- **Normal user can publish immediately in standalone mode:** its API is intentionally one trusted local admin; switch to Firebase emulators for authorization testing. In Firebase modes, verify the current `membership` and pending report state.
- **People list unavailable:** check emulator availability or production Firebase Auth list/get IAM permissions. Verification cannot grant/remove an administrator claim, and standalone verification is explicitly unsupported.
- **Road section unavailable:** both ends must be near the same connected mapped road within the imported Islamabad area. Try a shorter section or a point/drawn restriction; a visual flyover crossing is not graph connectivity.
- **Unsupported Node / blocked npm script:** use Node 24.12+ and run `npm.cmd run config:check`; after upgrading, restart VS Code/terminals and restore dependencies with `npm.cmd ci`. Use `npm.cmd` if PowerShell blocks `npm.ps1`.
- **SQLite warning:** the built-in SQLite module can emit an experimental warning; this alone is not a failed API health check.

Meaningful tests and browser evidence are recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). The complete original roadmap remains [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md).

For an isolated Auth/Firestore suite when development ports are occupied, run `npm.cmd run build:server` followed by `node scripts/test-firebase-isolated.mjs`. It allocates disposable high ports, uses the demo test project, removes its temporary config and leaves other emulator sessions running.
