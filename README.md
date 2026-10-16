# Manzil منزل

**17 October integration:** Pakistan-wide search/routing and the Firebase account/storage version now share one codebase. Islamabad journeys use the bundled road graph; other Pakistan journeys use closure-validated online OSRM candidates and Photon search. On the configured Windows workstation, `npm.cmd run dev:local` selects the ignored portable Node runtime and installed Android Studio Java, then starts Firebase emulators, API, worker and web app. See [current verification](docs/IMPLEMENTATION_STATUS.md) and [provider limits/privacy](docs/ROUTING.md).

Current verification: **238 passing tests** (226 standard + 12 real Firebase emulator cases), production type/build checks, and live localhost national routing, closure, sign-in and private saved-stop workflows. The app is running in local Firebase emulator mode; see the environment guide for test accounts and emulator data lifetime.

**16 October environment update:** one codebase now supports standalone SQLite development, Firebase Auth/Firestore emulators, and explicitly configured production Firebase/Cloud Run builds. Run `npm.cmd run dev:firebase` for isolated local user/admin accounts and production-style token/ownership checks. **Node 24.12+ and Java 21+ are required for this workflow.** No deployment or paid model activation has occurred. Start with [environment setup and verification](docs/ENVIRONMENTS.md); the deployment procedure will be agreed separately.


English/Urdu interface and voice controls, a target-aware tutorial, Firebase-ready accounts, automatic foreground GPS rerouting (including remaining stops), and reduced map redraws are implemented. Google Cloud TTS uses server-side ADC, cached audio and bounded usage; enable it only after Cloud configuration. Firebase SDK authentication and isolated records are wired for emulators/production configuration; a real hosted project is not configured or deployed. Standalone development retains [dummy normal/admin sign-ins](docs/DEV_ACCOUNTS_AND_TOUR.md). The [admin dashboard](docs/ADMIN_INTERFACE_PROPOSAL.md) is proposed, not implemented. Core guest planning works locally without Cloud credentials. See [feature/setup guide](docs/BILINGUAL_NAVIGATION_AND_CLOUD.md) and [environment guide](docs/ENVIRONMENTS.md).

Primary tabs are **Map, Closures, Saved and Profile**, with **Activity** added after sign-in. **Try street detour** and **Demo closures** are directly available in the planner; route results expose **Block a point on this route**, and the map always shows **Add restriction**. Guests see the skippable tutorial on every fresh visit and after sign-out, even if previously completed. Signed-in users retain remembered first-use behavior; everyone can replay it from Help or Profile.

Manzil is a Pakistan closure-aware commute planner proposed for the Google Cloud AI Builder Cup 2026, starting with a detailed local Islamabad road graph. It evaluates scheduled road restrictions against planned journeys and offers detours or departure-time recommendations. The future Gemini agent will turn source notices into reviewable closure proposals; the current app provides manual editing and the notice queue.

The repository now contains a working **localhost application**, a real Islamabad OSM road graph, tests, research and branding. No deployment or Google account is required for this local edition.

## Run locally

Requires Node.js **24.12+** for the current Firebase SDKs; Firebase emulator development also requires Java **21+**. This machine now has **Node 24.22.0 / npm 11.19.1**, and `npm.cmd run config:check` confirms the Node requirement is satisfied. From this repository:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. The API runs at http://127.0.0.1:3001. Keep the local server running for source and commute checks. The bundled road graph needs no API key; ordinary basemap tiles need internet. Optional settings are listed in `.env.example`.

For Firebase authentication and per-user storage development, stop the standalone server and run `npm.cmd run dev:firebase` instead. Use `npm.cmd` in PowerShell if `npm.ps1` is blocked. Windows upgrade instructions and the full emulator workflow are in the [environment guide](docs/ENVIRONMENTS.md).

Try **Find routes**, then **Block a point on this route** to see a connected detour, or use **Try street detour** for the preset street example. Demo restrictions are explicitly synthetic and can be cancelled from Closures. Use **Closures → Add closure** or the map's **Add restriction** plus button to draw your own point, road corridor or area and schedule its start/end in Pakistan time.

**X collection:** the requested accountless public-page collector checks every 15 minutes and queues captured notices for a future agent. Actual checks on this network launched the browser but X navigation failed. The app reports that error and partial coverage; successful automatic retrieval is not claimed. Manual import uses the same durable queue. The user's Gemini reasoning agent is intentionally not implemented yet.

## Project documents

- [Retained product context and entire feature backlog](PROJECT_CONTEXT.md): original requirements, current priorities and future transit/crowd/traffic/learned-road features.
- [Implementation status and verification](docs/IMPLEMENTATION_STATUS.md): actual build state, decisions and remaining limitations.
- [Local development guide](docs/LOCAL_DEVELOPMENT.md): startup, configuration, local data, tests and troubleshooting.
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

1. Clean 2D MapLibre/OpenFreeMap vector map with local place/road search, draggable pins, light/dark/system app themes, five separate map styles and a map-detail preference. Colourful Streets is the default; use the Style button on the map to switch.
2. Point, road-corridor and polygon restrictions; exact geometry preview, coordinate editing, scheduled start/end, drafts, revisions, cancellation and GeoJSON import/export.
3. Up to three genuinely different driving routes for the same departure over a bundled OSM graph; clear blue route lines/time labels, distance/ETA cards, closure traversal-time checks and separate earlier/later departure comparisons.
4. Weekly saved commutes, next-occurrence checks and deduplicated in-app impact alerts while the backend runs.
5. Fifteen-minute public X collection attempt, honest status/freshness, manual notices and a durable pending-agent queue.
6. Explicit foreground GPS recording, local trip summaries/history/export/deletion and separate future road-discovery contribution consent.
7. A persistent local profile, preferences, opt-in browser notifications and separately consented learning/closure alerts for usual recorded journeys.
8. Route-step preview, foreground GPS guidance, optional voice prompts and recalculation from a fresh position. No background/Google-equivalent navigation claim.

The implemented stack is React/TypeScript/Vite, MapLibre GL JS, OpenFreeMap, a local OSM routing engine, Express and a shared SQLite/Firestore repository boundary. Firebase emulators exercise the same Firestore/token integration intended for production. The flat vector map needs internet and WebGL but no map API key; it removes POIs/building detail in Clean mode and retains attribution. Live Google Cloud deployment, Gemini interpretation and FCM remain future work. Live traffic, transit routing, crowd verification, automatic learned-road publication and camera avoidance remain on the explicit roadmap. Read the [environment guide](docs/ENVIRONMENTS.md) for current configuration and the [15 October redesign guide](docs/REDESIGN_2026-10-15.md) for historical UI decisions.

## Validation

```sh
npm test
npm run test:firebase
npm run build
```

Historical Firebase foundation verification totaled **162 passing tests**: 155 standard cases plus seven real Auth/Firestore emulator cases across 24 files. The normal command intentionally skips those seven without emulator hosts; run `test:firebase` to execute them. Coverage includes the retained routing/API/UI regressions plus user isolation, admin access, large GPS chunks/retention, concurrent revisions, shared speech accounting and compiled API/worker startup. Standalone and cloud-configured builds pass; the cloud build used public placeholder configuration only. Production dependencies audit clean; seven development-tool advisories remain in the Firebase CLI dependency tree. Browser evidence and verification boundaries are in the implementation status. Live Cloud deployment, real-device GPS, OS notification delivery and successful live X retrieval remain unverified.

Use the prominent top clock to view closures and routes at **Now** or a chosen PKT date/time. Add up to five intermediate stops. Open **Demo closures** for six test scenarios. See [map time and stops](docs/MAP_TIME_AND_STOPS.md) and [demo guide](docs/DEMOS.md). Map browsing is worldwide; the routing graph remains bounded to central Islamabad.

Click **Try street detour** below the planner heading for a real F-8 Park Road route through **Streets 20 → 25 → 21**, then **Reopen demo road** to compare it with the direct route. Both use the real graph and ordinary planner; only the closure is synthetic.

Blocked roads use a red coating without enclosing polygon outlines. Geometry caching and redundant worker-update suppression reduce overlay delays; measurements and a reproducible local benchmark are in [performance notes](docs/PERFORMANCE.md).

## Branding

The project and team name is **Manzil (منزل)**, meaning destination. The primary logo is a transparent PNG generated on 14 October 2026.

![Manzil Urdu calligraphy logo](assets/brand/manzil-logo-v1.png)

## Milestone

Two developers aim to finish and polish the prototype by **17 October 2026**. The local core was implemented on October 14. The owner will handle deployment and build the Gemini agent later.

## Credentials and dependencies

Keep API keys and local environment files out of Git. Future setup examples should use placeholders in an .env.example file. Routing/map libraries, hosted services, map data, and generated route results have separate license and attribution requirements documented in the plan.

## Pakistan routing coverage

Plan origins, destinations and stops across Pakistan. Islamabad keeps its local OSM graph; other Pakistan journeys and named-place searches use online OSRM/Photon services, without bundling national road data. Internet is required for those lookups. Tolls/checkposts, charges and queue times are not currently listed. See [routing and provider setup](docs/ROUTING.md).
