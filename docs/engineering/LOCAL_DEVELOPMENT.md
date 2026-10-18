# Local development

Use the Auth/Firestore emulator workflow for normal development and permission testing. The standalone SQLite workflow is available for one trusted local workspace. Neither workflow deploys the app or migrates local records into the hosted project.

## Requirements and start

- **Node 24.12+** and npm; **Java 21+** for Firebase emulators.
- Dependencies are pinned by `package-lock.json`; Firebase CLI is a project dev dependency.
- In PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.
- Maps/online routing/search/weather/source checks need the relevant external provider; ordinary tests need no cloud/model key.

```sh
npm.cmd ci
npm.cmd run dev:firebase
```

Open **http://127.0.0.1:5173/**. The runner starts local Auth/Firestore, API, worker and frontend, seeds development accounts and uses only the `demo-manzil` project. Vite proxies `/api` to the local API. Keep all services on loopback and stop the terminal with Ctrl+C.

| Service | Default address |
| --- | --- |
| Frontend | `http://127.0.0.1:5173` |
| API | `http://127.0.0.1:3001/api` |
| Private development worker | `http://127.0.0.1:3002` |
| Firebase Auth emulator | `127.0.0.1:9099` |
| Firestore emulator | `127.0.0.1:8080` |

`MANZIL_DEV_API_PORT`, `MANZIL_DEV_WEB_PORT` and `MANZIL_DEV_WORKER_PORT` override the corresponding development ports together with the runner's proxy. Avoid competing stacks on the same ports; do not terminate unrelated processes to reclaim them.

For seeded credentials and fictional history, see [development accounts](DEV_ACCOUNTS_AND_TOUR.md) and [sample account](SAMPLE_ACCOUNT.md). Sample data is emulator-only and never production GPS evidence. `npm.cmd run dev:local` wraps the same emulator workflow using the optional ignored portable Node / installed Java runtime. [Environment requirements and Windows setup](../operations/CONFIGURATION.md).

## Choose the correct mode

| Command | Behavior |
| --- | --- |
| `npm.cmd run dev:firebase` | Recommended: local Firebase identities, per-user Firestore records and actual role checks |
| `npm.cmd run dev` | Standalone SQLite API/frontend; one trusted API identity and shared records |
| `npm.cmd run dev:api` / `dev:web` | Start the standalone services separately |
| `npm.cmd start` | Standalone API only |
| `npm.cmd run config:check` | Validate selected environment/runtime settings |

Standalone mode is not a public authentication system. Its dummy user/admin UI choices cannot establish account isolation or ordinary-user moderation. Use emulators for those tests. Stop one stack before switching modes. Emulator mode starts fresh by default and never imports SQLite automatically.

## First useful workflow

1. **Continue as guest** or sign in. New guest entry/registration offers the skippable tour. Ordinary login does not replay it. No entry/tour action requests GPS.
2. In **Map**, select start/destination and Find routes. Live map uses PKT now; **Plan ahead** owns alternative date/time and departure comparisons. Up to three validated alternatives are offered honestly. Add up to five ordered stops.
3. In **Local**, inspect the imported Twin Cities network, select a bus line or search a connection. Missing timetable/geometry and unknown fares remain explicit. Journey selection fades unrelated lines; it does not change service availability.
4. In **Closures**, create a Road closure between mapped road endpoints or a short transverse Blockade. Ordinary submissions wait privately for review; verified contributors/admins can review and correct reports. Outside the offline extract, bounded public OSM road requests supply missing editor geometry.
5. As an administrator, use **Users**, **Review queue**, **Closures** and **Pipelines**. The directory exposes minimal identity/city/consent state, not another user's GPS/trips/vehicle. Source evidence and saved Gemini analysis open beside the list. Preparing/viewing a proposal is not approval.
6. In Profile, set identity, vehicle, language and appearance. Collection remains off until allowed. Explicit GPS guidance can save eligible foreground trips only with consent. Activity shows history/statistics; it has no separate manual recording workflow.

Useful guides: [map workflows](../guides/MAP_EDITOR.md), [admin workspace](../guides/ADMIN_WORKSPACE.md), [closure reporting](../guides/CLOSURE_WORKFLOW.md), [Local routing](../reference/TRANSIT_ROUTING.md), [personal data](../reference/PERSONAL_TRAVEL_DATA.md).

## Sources, models and external effects

The emulator launcher initializes source collection disabled and cloud speech disabled. It ticks source/commute/fuel jobs locally; source settings already persisted in a running database still matter. It does **not** schedule Gemini. Fuel can perform one bounded public PSO check per PKT date. Weather maintains its bounded Islamabad hourly cache. None of these jobs creates a paid subscription.

| Command / action | External effect |
| --- | --- |
| `npm.cmd run source:probe` | Read-only, cookie-free source-page metadata check; no inbox/map writes |
| `npm.cmd run source:probe -- --download-images` | Explicit bounded image download into ignored `data/source-probes/` |
| `npm.cmd run source:check` | Runs the collector and writes source notices/outbox into the selected local storage |
| `npm.cmd run agent:probe` | Deliberately calls configured Gemini; no application DB writes |
| Fetch / Run Gemini / pause-resume in Pipelines | Separate authorized actions; Refresh only reads saved results |

Do not enable source/model/cloud speech or run network probes merely to start development. Public X access is partial and can fail; failure is not evidence that no closure exists. All source-generated road or bus-service map changes require administrator approval. Existing saved interpretations can be prepared/retried within their mapping limits without another model call. Keep optional local Gemini credentials in ignored `.env.gemini.local`; ordinary development/tests need none. [Source implementation](../operations/INGESTION_IMPLEMENTATION.md), [Gemini setup](../operations/GEMINI_INTEGRATION.md), [review workflow](../operations/AGENT_MAP_REVIEW.md).

Cloud speech requires explicit configuration/authorization; the bundled Urdu/device fallback does not enable a cloud service. Production source/model schedules and credentials are separate from the local runner. Read the [deployment procedure](../operations/DEPLOYMENT.md) before any live change.

## Standalone configuration

Defaults work without `.env`; copy `.env.example` only when overrides are needed. Never commit local environment files.

| Setting | Purpose |
| --- | --- |
| `HOST` | Standalone bind host; must remain `127.0.0.1` |
| `PORT` | API port, default 3001; standalone proxy configuration must agree |
| `MANZIL_DATA_DIR` | Local data folder, default `./data` |
| `MANZIL_DB_PATH` | Optional full SQLite filename override |
| `X_SCRAPER_ENABLED` | Initial source setting for a new database; persisted settings take precedence afterwards |
| `OSRM_BASE_URL` / `PHOTON_BASE_URL` | Compatible routing/search providers; public defaults are prototype services |
| Appearance | No environment key; use Profile/Style |

The fixed source profile/collection interval and cookie-free parsing limits are documented in [source implementation](../operations/INGESTION_IMPLEMENTATION.md). No browser profile, session credential or browser executable is used by the current collector.

## Routing and public data

`assets/routing/` retains the bundled OSM graph/source/provenance under ODbL 1.0. Its offline extent is **[72.97, 33.60, 73.16, 33.75]**. Pakistan endpoints outside that extract use OSRM; names also use Photon. Provider outages return explicit unavailable states. The map camera and closure editor are not limited to Islamabad; driving endpoints retain the documented Pakistan coverage guard.

```sh
npm.cmd run data:import
```

This rebuilds the graph from bundled OSM source, downloading bounded source only if necessary. Restart the API after changing graph assets. Do not regenerate unrelated datasets as part of routine UI work. Imported transit geometry and its missing sections use a separate reviewed build process. [Routing](../reference/ROUTING.md), [road-provider bounds/privacy](../reference/ROAD_COVERAGE.md), [transit data](../data-sources/TRANSIT_DATA.md).

Tiles and routing graphs are separate datasets. Neither provides live traffic. A pin-to-road connector or estimated walking connector is not validated access guidance.

## Local data and privacy

- Standalone `data/manzil.sqlite` and its WAL/SHM store shared local records and are ignored by Git. Emulator storage is separate; never copy either into cloud implicitly.
- Trip collection is off by default and checked again at write time. Planning/preview requests no recording. Navigation saves only eligible consented foreground sessions; hidden pages/account changes/opt-out discard unsaved fragments.
- Raw GPS expires after **30 days**, summaries after **90 days**. Lists omit point arrays; traces load on demand. Road-discovery flags add no roads automatically.
- Images are resized/re-encoded before upload; closure evidence loads on authorized expansion. Source evidence and model interpretation remain separate from approved public map events.
- Do not commit databases, GPS, source archives, browser state, screenshots containing credentials/action codes or `.env` secrets. SQLite deletion is not a promise of forensic disk/back-up erasure.

[Personal travel data](../reference/PERSONAL_TRAVEL_DATA.md), [API permission boundaries](../reference/API.md), [environment modes](../operations/CONFIGURATION.md).

## Checks

```sh
npm.cmd test
npm.cmd run test:firebase
npm.cmd run build
npm.cmd run build:server
```

`test:firebase` uses a disposable `demo-manzil-test` project and real Auth/Firestore emulators. Do not point it at production. Standard tests use synthetic providers/data where appropriate; they do not validate real GPS or live source availability. Source/model probes are deliberate external actions, not required test steps.

`build` type-checks source and creates a standalone `dist/`; it is not the configured hosted frontend. An authorized release uses `build:cloud` and the documented Firebase/Cloud Run procedure. Do not deploy to validate a documentation/UI change.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Cannot connect | Printed service URLs, Node version, free ports and API `/api/health` |
| Graph unavailable | Tracked routing assets, import result and API restart; no straight-line fallback exists |
| No driving route | Pin/carriageway, access/one-way rules, selected-time closures and provider status |
| No Local connection | Stop access distance, transfers, calendars, source/road gaps and service restrictions; endpoints are not pedestrian-road snapped |
| Road section unavailable | Two endpoints near the same connected road; try a shorter interval. Public OSM failures are explicit 503s, unsuitable selections 422s |
| Tiles absent / graphics failure | Internet/WebGL and visible provider/context warning; retain fields/coordinates, do not bulk-cache public tiles |
| Source blocked/error | Inspect safe `source:probe` diagnostics; 403/429/login shells/changed markup can prevent collection. No bypass or fabricated success |
| GPS history empty | Collection consent, explicit guidance, browser permission, visible page, sufficiently accurate fixes and 60 s / 100 m threshold |
| User appears privileged in standalone | Expected trusted local identity; use Firebase emulators for authorization tests |
| Users directory unavailable | Emulator availability or configured production Firebase Auth IAM; errors are not an empty confirmed user list |
| Unsupported Node / npm blocked | Node 24.12+, new terminal after upgrade, `npm.cmd ci`, then `config:check` |
| SQLite experimental warning | May be informational; inspect actual health/error state |

Branded password-reset handling is implemented at `/account/action`; production email templates require separate release configuration. Never publish or paste reset action codes. [Password recovery setup](../guides/AUTH_PASSWORD_RESET.md).
