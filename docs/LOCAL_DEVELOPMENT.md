# Local development

**17 October:** the core is [deployed](https://manzil-app-v1.web.app); local workflows remain unchanged. Recommended `npm.cmd run dev:firebase` uses local Auth/Firestore emulators, seeded accounts and isolated records. Node **24.12+** and Java **21+** are required; Firebase CLI is a project dependency. Plain `npm.cmd run dev` retains standalone SQLite. See [environment guide](ENVIRONMENTS.md) for switching modes and [deployment procedure](FIRST_DEPLOYMENT.md) for explicit cloud releases. Local development never implicitly uploads private data or deploys changes.

For the local dummy normal/admin credentials and updated spotlight tour, see [Development accounts and tour](DEV_ACCOUNTS_AND_TOUR.md). The admin dashboard is still a [proposal for discussion](ADMIN_INTERFACE_PROPOSAL.md), not an implemented feature.

English/Urdu controls, guest account screens, onboarding and automatic GPS recovery are described in [Bilingual navigation and Cloud speech](BILINGUAL_NAVIGATION_AND_CLOUD.md). Local planning still needs no Cloud credentials. Optional cloud speech uses server-side ADC and `TTS_ENABLED=true`; it is disabled in the first hosted release. Firebase authentication/storage are configured for hosted use. In PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

## Start

The optional **`npm.cmd run dev:local`** helper supports machines with ignored portable Node 24 or installed Android Studio Java 21. It changes only its child-process environment. This machine already has compatible Node 24.22.0/Java 25.0.1 on PATH and can use `npm.cmd run dev:firebase` directly. See [runtime details](ENVIRONMENTS.md#environment-requirements).

Use **Node 24.12+**; this machine now has **Node 24.22.0 / npm 11.19.1**, with a passing configuration check. See [Windows Node upgrade instructions](ENVIRONMENTS.md#upgrading-node-on-windows) for another machine. Standalone SQLite mode needs no Docker, Java, paid routing account or Google credential. The recommended Firebase emulator mode additionally needs Java 21+.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/. Vite proxies `/api` to the Express API at http://127.0.0.1:3001. Both listen only on loopback. Stop the retained terminal with Ctrl+C when finished. The API process and machine must remain running for automatic checks; closing the browser alone does not stop the server.

`npm run dev:api` and `npm run dev:web` start either process separately. `npm run build` type-checks all source and creates standalone `dist/`; never publish that preview as the cloud frontend. `npm start` starts the standalone API only. For production-style development, stop the standalone processes and run `npm.cmd run dev:firebase`; it launches local Auth/Firestore, API, frontend and worker with seeded accounts. The hosted release uses `npm.cmd run build:cloud` and the separate release procedure.

## First useful workflow

1. Guests receive the skippable tutorial on every fresh visit/reload and after sign-out, even if previously completed. Skip/Finish/Escape dismiss it for this visit; polling and tab navigation do not reopen it. Signed-in users retain remembered first-use behavior. Replay is available from Help or Profile. The planner starts with example public road approaches near Faisal Mosque and Centaurus, not private home/work coordinates or guaranteed building entrances.
2. Use the top clock for Now or a selected PKT date/time, then **Find routes**. Up to three blue driving paths follow real OSM roads; the selected route is darker/thicker. **Add stop** supports up to five intermediate locations. Open **Demo closures** for six independently toggleable scenarios; see [demo guide](DEMOS.md).
3. Use **Block a point on this route** in route results to create an explicitly synthetic event and compare rerouting, or **Demo closures → Park Road · F-8 → Try route** for an ordinary-planner street example. Neither requires opening Help. Cancel the sample later from Closures.
4. **Closures** is a primary tab for everyone. Use **Add closure** there or the always-visible map **Add restriction** plus button to draw a manual restriction and set its schedule. Replan, or sign in with a [dummy development account](DEV_ACCOUNTS_AND_TOUR.md) to save/check a recurring commute. **Activity** appears in primary navigation after sign-in and opens recording/history; Saved and personal alerts/settings also require sign-in.
5. In Profile → Source updates & collector, inspect source status or import an advisory if automatic access fails.
6. Use Profile for language/themes/map detail; signed-in users can also configure browser alerts and optional learned-journey alerts. Select **Navigate** on a route for preview or foreground GPS guidance. On phones, expand controls with the sheet handle button.

Shared closure/demo/source mutations require an admin in emulator/production modes; use the seeded admin account for the editing/demo steps above. Standalone mode retains trusted-local editing. The full admin correction dashboard is still a proposal.

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

Foreground GPS recording requires an explicit action and consent. Another checkbox controls future road-discovery contribution; it currently uploads nothing. Points older than 30 days are removed, summaries after 90 days. List responses contain summaries only; raw traces are fetched on demand. The source collector keeps original evidence separate from interpreted road events. No Gemini call or closure extraction is performed yet.

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
- **GPS has no samples:** permission, device accuracy, a visible active page and location services matter. No synthetic points are generated. Location fixes older than recording start or worse than the accuracy threshold are ignored.
- **Unsupported Node / blocked npm script:** use Node 24.12+ and run `npm.cmd run config:check`; after upgrading, restart VS Code/terminals and restore dependencies with `npm.cmd ci`. Use `npm.cmd` if PowerShell blocks `npm.ps1`.
- **SQLite warning:** the built-in SQLite module can emit an experimental warning; this alone is not a failed API health check.

Meaningful tests and browser evidence are recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). The complete original roadmap remains [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md).
