# Local development

## Start

Use Node 22.13 or newer (verified Node 22.20.0 / npm 10.9.3). No Docker, Java, paid routing account or Google credential is required.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/. Vite proxies `/api` to the Express API at http://127.0.0.1:3001. Both listen only on loopback. Stop the retained terminal with Ctrl+C when finished. The API process and machine must remain running for automatic checks; closing the browser alone does not stop the server.

`npm run dev:api` and `npm run dev:web` start either process separately. `npm run build` type-checks all source and creates `dist/`. `npm start` starts the API only; it is not a production deployment or a static frontend server. Deployment and production authentication are deliberately deferred.

## First useful workflow

1. The planner starts with example public road approaches near Faisal Mosque and Centaurus. These are not private home/work coordinates or guaranteed building entrances.
2. Use the top clock for Now or a selected PKT date/time, then **Find routes**. Up to three blue driving paths follow real OSM roads; the selected route is darker/thicker. **Add stop** supports up to five intermediate locations. Open **Demo closures** for six independently toggleable scenarios; see [demo guide](DEMOS.md).
3. Try a demo restriction to create an explicitly synthetic event on that route and compare rerouting. Cancel that event later from Closures.
4. Draw a real manual restriction and set its schedule. Replan or save a recurring commute and check its next occurrence.
5. In Profile → Source updates & collector, inspect source status or import an advisory if automatic access fails.
6. Use Profile for themes/map detail, browser alerts and optional learned-journey alerts. Select Preview & navigate on a route for preview or foreground GPS guidance. On phones, expand controls with the sheet handle button.

## Configuration

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

The tracked `assets/routing/` contains real OSM source/graph snapshots and provenance under ODbL 1.0. The current extent is west 72.97, south 33.60, east 73.16, north 33.75. Outside-area endpoints return unavailable; the map itself can pan elsewhere. Pins snap only within a bounded distance, and the dashed pin-to-road connector is not a routed access path.

```sh
npm run data:import
```

This rebuilds the runtime graph from bundled OSM source, downloading a bounded source only when necessary. Restart the API after changing the graph. Read [ROUTING.md](ROUTING.md) before extending coverage or changing access rules. Map tiles and the routable graph are different datasets; neither supplies live traffic here.

## Local data and privacy

`data/manzil.sqlite` and its WAL/SHM files store restrictions, commutes, alerts, notice revisions, pending jobs and personal trips. They are ignored by Git. Closing and reopening the server preserves them. Keep backups private if you choose to make them.

Foreground GPS recording requires an explicit action and consent. Another checkbox controls future road-discovery contribution; it currently uploads nothing. Points older than 30 days are removed, summaries after 90 days. List responses contain summaries only; raw traces are fetched on demand. The source collector keeps original evidence separate from interpreted road events. No Gemini call or closure extraction is performed yet.

Do not expose this single-user API or the Vite server over a LAN/public tunnel. Loopback/origin checks are useful development guards, not authentication. Production requires accounts, per-user data access, secure deployment, durable hosted jobs and the user's chosen provider credentials.

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
- **SQLite warning:** Node 22 labels its built-in SQLite module experimental; this is a runtime warning, not a failed API health check.

Meaningful tests and browser evidence are recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). The complete original roadmap remains [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md).
