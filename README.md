# Manzil منزل

**17 October deployment:** the core prototype is live at **[manzil-app-v1.web.app](https://manzil-app-v1.web.app)**, using Firebase Hosting, Cloud Run and Firestore in Singapore (`asia-southeast1`). Gemini, cloud speech and scheduled workers are not active. See the [deployment procedure](docs/FIRST_DEPLOYMENT.md) and [verified status](docs/IMPLEMENTATION_STATUS.md). Local SQLite and Firebase emulator development remain available; use `npm.cmd run dev:firebase` for isolated dev accounts. Node **24.12+** and Java **21+** are required for emulator development.

**17 October feature branch:** `codex/feature-development` adds community/admin tools, road-section editing, consented profiles and vehicle/fuel estimates. The compact **Live map** header now reports current PKT time/date; the separate **Plan ahead** section handles selected dates and future routes. Main Map always returns to now, and planned journeys require a fresh live route before GPS guidance. **345 standard tests pass**; production frontend/backend and cloud-configured builds pass. The preceding fuel phase also passed 15 real Firebase emulator cases; that suite was not rerun for this frontend-only change. These features require teammate integration and a separate release. [Handoff](docs/FEATURE_HANDOFF_2026-10-17.md), [time behavior](docs/MAP_TIME_AND_STOPS.md), [fuel estimates](docs/FUEL_COSTS.md).

**17 October branch integration:** the local codebase also contains Pakistan-wide search/routing and authorization fixes from the incoming branch. Islamabad journeys use the bundled graph; other Pakistan journeys use closure-validated OSRM candidates and Photon search. These incoming changes have not been deployed to the live release above. `npm.cmd run dev:local` is the Windows helper for this workstation's portable Node 24.22.0 and compatible Android Studio Java. See [current verification](docs/IMPLEMENTATION_STATUS.md) and [provider limits/privacy](docs/ROUTING.md).


English/Urdu interface and voice controls, a target-aware tutorial, Firebase accounts, automatic foreground GPS rerouting (including remaining stops), and reduced map redraws are implemented. Google Cloud TTS uses server-side ADC, cached audio and bounded usage; it remains disabled in the first release. Firebase email/password authentication and isolated records are configured in the hosted project; production users register real accounts, with no dummy passwords seeded. Standalone development retains [dummy normal/admin sign-ins](docs/DEV_ACCOUNTS_AND_TOUR.md). The [admin workspace](docs/ADMIN_INTERFACE_PROPOSAL.md) is implemented on the feature branch; its extended agent correction/audit/override proposal remains future work. Core guest planning also works locally without Cloud credentials. See [feature/setup guide](docs/BILINGUAL_NAVIGATION_AND_CLOUD.md) and [environment guide](docs/ENVIRONMENTS.md).

The first screen offers sign-in, registration and **Continue as guest**. Regular planning tabs are **Map, Closures, Saved and Profile**, with **Activity** after sign-in. Admins land in **Control centre** and also have Map/Closures/Profile. Admin-only **Demo closures** provides ten scenarios, four with **Try route** through real public streets; route block-point testing is also admin-only. Guests must sign in to submit a report. Guest tours start after the explicit skip, signed-in users retain remembered first-use behavior, and admins can deliberately replay Help.

Manzil is a Pakistan closure-aware commute planner proposed for the Google Cloud AI Builder Cup 2026, starting with a detailed local Islamabad road graph. It evaluates scheduled road restrictions against planned journeys and offers detours or departure-time recommendations. The future Gemini agent will turn source notices into reviewable closure proposals; the current app provides manual editing and the notice queue.

The repository now contains a working **localhost application**, a real Islamabad OSM road graph, tests, research and branding. No deployment or Google account is required for this local edition.

## Run locally

Requires Node.js **24.12+** for the current Firebase SDKs; Firebase emulator development also requires Java **21+**. Use `npm.cmd run dev:local` on this workstation to select the compatible portable runtime without changing system PATH. On a machine with compatible Node/Java, from this repository:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. The API runs at http://127.0.0.1:3001. Keep the local server running for source and commute checks. The bundled road graph needs no API key; ordinary basemap tiles need internet. Optional settings are listed in `.env.example`.

For Firebase authentication and per-user storage development, stop the standalone server and run `npm.cmd run dev:firebase` instead. Use `npm.cmd` in PowerShell if `npm.ps1` is blocked. Windows upgrade instructions and the full emulator workflow are in the [environment guide](docs/ENVIRONMENTS.md).

As admin, use **Demo closures → Try route** on Park Road/F-8, Rohtas Road/G-9, Tipu Sultan Road/I-8 or Sumbal Road/F-10 for a synthetic blockade and real street-route example. Inspect the original blocked route separately from navigable alternatives. Use the map's **Add restriction** to select two points along a connected named Islamabad road, or use Point/Draw/Area, schedule its PKT period and optionally attach photos. Regular reports wait for contributor/admin approval; verified contributors can publish directly. Demo events remain labelled and cancellable without losing history. See [API permissions](docs/API.md).

**X collection:** the requested accountless public-page collector checks every 15 minutes and queues captured notices for a future agent. Actual checks on this network launched the browser but X navigation failed. The app reports that error and partial coverage; successful automatic retrieval is not claimed. Manual import uses the same durable queue. The user's Gemini reasoning agent is intentionally not implemented yet.

## Project documents

- [Retained product context and entire feature backlog](PROJECT_CONTEXT.md): original requirements, current priorities and future transit/crowd/traffic/learned-road features.
- [Implementation status and verification](docs/IMPLEMENTATION_STATUS.md): actual build state, decisions and remaining limitations.
- [Local development guide](docs/LOCAL_DEVELOPMENT.md): startup, configuration, local data, tests and troubleshooting.
- [First deployment and repeat releases](docs/FIRST_DEPLOYMENT.md): real project/region, runtime permissions, commands, smoke checks and deferred services.
- [Map editor guide](docs/MAP_EDITOR.md): drawing, scheduling, editing, import/export and journey workflows.
- [Local routing](docs/ROUTING.md): real graph, temporal validation, OSM provenance and routing limits.
- [API reference](docs/API.md) and [source/agent handoff](docs/INGESTION_IMPLEMENTATION.md).
- [Future deployment and agent architecture](MANZIL_ARCHITECTURE.md): Google Cloud integration targets, agent workflow and the broader roadmap. For the implemented local stack, start with the local development and implementation guides above.
- [Champ Alerts without a paid subscription](CHAMP_ALERTS_INGESTION.md): tested X preview and APP RSS, unofficial WhatsApp Channel clients, official-site candidates, conditional X credit, notification experiments and actual coverage limits.
- [Developer brief and implementation plan](ISLAMABAD_COMMUTE_PROJECT_PLAN.md): start with the quick summary; later sections contain detailed feasibility research, routing comparisons, source-code findings, architecture, and the two-person build plan.
- [Safar map findings](ISLAMABAD_COMMUTE_PROJECT_PLAN.md#19-safar-mapping-reference): verified Leaflet/CARTO Voyager web stack, its relevance to Manzil, and current basemap service conditions.
- [Mapping projects and similar-product comparison](MAPPING_PROJECT_COMPARISON.md): application and tool licenses, actual stacks, closest precedents, 3D alternatives, and recommendations for Manzil.
- [Google integration and first-month cost plan](MAPPING_PROJECT_COMPARISON.md#11-google-integrations-and-first-month-cost-plan): prioritized use cases, free quotas versus credits, optional additions, and a small pilot budget.
- [Hackathon research](AI_BUILDER_CUP_RESEARCH.md): event requirements, judging, related winners, and scope guidance.
- [Logo prompt and usage notes](assets/brand/README.md).

## Implemented local features

1. Clean 2D MapLibre/OpenFreeMap vector map with Pakistan place/road search, draggable pins, light/dark/system app themes, three map styles and a map-detail preference. Colourful Classic is the default; Minimal and Night remain available. Light panels use a blue tint. See [map styles and the black-polygon fix](docs/MAP_STYLES.md).
2. Point, road-corridor and polygon restrictions; exact geometry preview, coordinate editing, scheduled start/end, drafts, revisions, cancellation and GeoJSON import/export.
3. Up to three genuinely different driving routes for the same departure over a bundled OSM graph; clear blue route lines/time labels, distance/ETA cards, closure traversal-time checks and separate earlier/later departure comparisons.
4. Weekly saved commutes, next-occurrence checks and deduplicated in-app impact alerts while the backend runs.
5. Fifteen-minute public X collection attempt, honest status/freshness, manual notices and a durable pending-agent queue.
6. Explicit foreground GPS recording, local trip summaries/history/export/deletion and separate future road-discovery contribution consent.
7. A persistent local profile, preferences, opt-in browser notifications and separately consented learning/closure alerts for usual recorded journeys.
8. Route-step preview, foreground GPS guidance, optional voice prompts and recalculation from a fresh position. No background/Google-equivalent navigation claim.

The implemented stack is React/TypeScript/Vite, MapLibre GL JS, OpenFreeMap, a local OSM routing engine, Express and a shared SQLite/Firestore repository boundary. Firebase emulators exercise the same adapter/token integration used by the hosted core. The flat vector map needs internet and WebGL but no map API key; it removes POIs/building detail in Clean mode and retains attribution. Gemini interpretation and FCM remain future work. Live traffic, transit routing, crowd verification, automatic learned-road publication and camera avoidance remain on the roadmap. Read the [environment guide](docs/ENVIRONMENTS.md) for current configuration and the [15 October redesign guide](docs/REDESIGN_2026-10-15.md) for historical UI decisions.

## Validation

```sh
npm test
npm run test:firebase
npm run build
```

Before the current UI work, the merged checkout passed **241 tests** (229 standard + twelve real Auth/Firestore emulator cases across 30 files) and the cloud TypeScript/frontend/backend build. Both Hosting tagged-host protection and case/trailing-slash authorization regressions are retained. Default tests skip emulator cases; `test:firebase` executes them. The first hosted release separately passed 165 cases and live API/browser checks; those checks do not establish deployment of the incoming Pakistan-wide feature. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for evidence. Real-device GPS/audio, OS notification delivery and successful live X retrieval remain unverified; Gemini and cloud speech are not active.

Use the prominent top clock to view closures and routes at **Now** or a chosen PKT date/time. Add up to five intermediate stops. Open **Demo closures** for ten test scenarios; **Add defaults** enables the original six, and the four focused street examples can be tested individually. See [map time and stops](docs/MAP_TIME_AND_STOPS.md) and [demo guide](docs/DEMOS.md). Map browsing is worldwide; local routing covers central Islamabad, with online routing elsewhere in Pakistan.

Residential streets are considered by ordinary routing whenever eligible; there is no separate street-routing feature. Open **Demo closures → Park Road · F-8 → Try route** to see **Streets 20 → 25 → 21**. Disable its catalogue checkbox to compare with the reopened road. Only the closure is synthetic; both results use real OSM roads and the normal planner.

Blocked roads use a red coating without enclosing polygon outlines. Geometry caching and redundant worker-update suppression reduce overlay delays; measurements and a reproducible local benchmark are in [performance notes](docs/PERFORMANCE.md).

## Branding

The project and team name is **Manzil (منزل)**, meaning destination. The primary logo is a transparent PNG generated on 14 October 2026.

![Manzil Urdu calligraphy logo](assets/brand/manzil-logo-v1.png)

## Milestone

Two developers aim to finish and polish the prototype by **17 October 2026**. The local core was implemented on October 14 and first deployed on October 17. Gemini integration and the remaining feature/real-device verification still need work.

## Credentials and dependencies

Keep API keys and local environment files out of Git. Future setup examples should use placeholders in an .env.example file. Routing/map libraries, hosted services, map data, and generated route results have separate license and attribution requirements documented in the plan.

## Pakistan routing coverage

Plan origins, destinations and stops across Pakistan. Islamabad keeps its local OSM graph; other Pakistan journeys and named-place searches use online OSRM/Photon services, without bundling national road data. Internet is required for those lookups. Tolls/checkposts, charges and queue times are not currently listed. See [routing and provider setup](docs/ROUTING.md).
