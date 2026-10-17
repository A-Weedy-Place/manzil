# Local development

**17 October:** the core is [deployed](https://manzil-app-v1.web.app); local workflows remain unchanged. Recommended `npm.cmd run dev:firebase` uses local Auth/Firestore emulators, seeded accounts and isolated records. Node **24.12+** and Java **21+** are required; Firebase CLI is a project dependency. Plain `npm.cmd run dev` retains standalone SQLite. See [environment guide](ENVIRONMENTS.md) for switching modes and [deployment procedure](FIRST_DEPLOYMENT.md) for explicit cloud releases. Local development never implicitly uploads private data or deploys changes.

For local normal/admin credentials, login-first guest entry and the spotlight tour, see [Development accounts and tour](DEV_ACCOUNTS_AND_TOUR.md). This feature branch implements a **Control centre** with blockade review/correction, contributor verification and source-pipeline status. The earlier [admin proposal](ADMIN_INTERFACE_PROPOSAL.md) remains historical context; its full audit/override system and automatic Gemini publication are still separate work. The other developer handles integration/release; pushing the branch does not update the live app.

English/Urdu controls, guest account screens, onboarding and automatic GPS recovery are described in [Bilingual navigation and Cloud speech](BILINGUAL_NAVIGATION_AND_CLOUD.md). Local planning still needs no Cloud credentials. Optional cloud speech uses server-side ADC and `TTS_ENABLED=true`; it is disabled in the first hosted release. Firebase authentication/storage are configured for hosted use. In PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

## Start

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
2. Use the top clock for Now or a selected **Pakistan date/time**, then **Find routes**. Up to three distinct validated blue routes are shown when available; fewer routes have an explicit reason rather than duplicate/fabricated alternatives. **Add stop** supports five intermediate locations. Streets participate in ordinary routing. Click the pale-red unavailable original to inspect its theoretical time/distance; it is comparison only and cannot start navigation.
3. As admin, open **Demo closures** for ten explicitly synthetic scenarios. **Park Road · F-8 → Try route** exercises normal street detours; the other focused examples cover G-9, I-8 and F-10. Route results also offer **Block a point on this route** to add a synthetic restriction. These tools are admin-only and never replace live verified reports. See [demo guide](DEMOS.md).
4. **Closures** is visible to everyone. Select **Add closure** or the map plus button. Guests are asked to sign in. The default **Road section** tool selects two ends on the same connected local road; set schedule, explanation and up to two photos. Ordinary reports wait for review; verified contributors/admin may publish. Other road sections need separate reports. Point/drawn tools remain available outside the road-section helper's imported Islamabad coverage.
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
| `BROWSER_EXECUTABLE_PATH` | Optional installed Chrome/Edge/Chromium executable for the isolated collector |

The initial source profile and 15-minute interval are deliberately fixed. Settings in the Updates panel control whether automatic checks run. No existing browser login/profile is read.

The collector can use an installed browser. An optional official Playwright Chromium download can be kept inside ignored `.playwright/`; see [source implementation](INGESTION_IMPLEMENTATION.md) for setup and actual smoke-test results. Browser execution or network access can fail independently of app startup. A failed source check does not block maps, editing, routing or manual import.

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
- **X status is error/blocked:** inspect the source state, test the configured browser/network and use deliberate notice import. Actual smoke checks here launched Chromium but X navigation failed; no reliable live retrieval is claimed.
- **GPS history is empty:** allow Personal trip data in Profile, then explicitly start guidance or manual recording and grant browser location access. A navigation trip must reach 60 seconds/100 metres before saving. Keep the page visible; hidden-page navigation fragments are discarded. Device accuracy/location services matter; no synthetic fixes are generated. Usual-route learning additionally needs three qualifying journeys on separate dates.
- **Normal user can publish immediately in standalone mode:** its API is intentionally one trusted local admin; switch to Firebase emulators for authorization testing. In Firebase modes, verify the current `membership` and pending report state.
- **People list unavailable:** check emulator availability or production Firebase Auth list/get IAM permissions. Verification cannot grant/remove an administrator claim, and standalone verification is explicitly unsupported.
- **Road section unavailable:** both ends must be near the same connected mapped road within the imported Islamabad area. Try a shorter section or a point/drawn restriction; a visual flyover crossing is not graph connectivity.
- **Unsupported Node / blocked npm script:** use Node 24.12+ and run `npm.cmd run config:check`; after upgrading, restart VS Code/terminals and restore dependencies with `npm.cmd ci`. Use `npm.cmd` if PowerShell blocks `npm.ps1`.
- **SQLite warning:** the built-in SQLite module can emit an experimental warning; this alone is not a failed API health check.

Meaningful tests and browser evidence are recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). The complete original roadmap remains [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md).
