<p align="center"><img src="public/manzil-logo.png" alt="Manzil logo" width="112" /></p>
<h1 align="center">Manzil · منزل</h1>
<p align="center"><strong>Plan around road closures. Find another way.</strong></p>
<p align="center">
<a href="https://manzil-app-v1.web.app">Hosted app</a> · <a href="docs/README.md">Documentation</a> · <a href="ARCHITECTURE.md">Architecture</a> · <a href="CONTRIBUTING.md">Contributing</a> · <a href="docs/IMPLEMENTATION_STATUS.md">Status</a>
</p>

Manzil helps commuters plan around current and scheduled road restrictions. It combines a clear 2D map, closure-aware driving routes, local bus journeys, community reports and administrator-reviewed interpretations of traffic notices. It began in Islamabad/Rawalpindi; road reporting now supports mapped roads beyond that initial area.

> **This README describes this checkout.** The hosted app is released separately and may have an older feature set. A GitHub push does not deploy under the tracked workflow. See [status and release boundaries](docs/IMPLEMENTATION_STATUS.md).

## Features

| Area | Implemented capabilities |
| --- | --- |
| **Map and driving** | Fast 2D map, place search, start/destination and intermediate stops, up to three distinct eligible routes, time/distance estimates and blocked-route comparison. Ordinary streets participate in routing. |
| **Live map / Plan ahead** | Current Pakistan time; a separate date/time planner, scheduled restrictions and supported weather forecast hours. Closure checks account for traversal time. |
| **Road restrictions** | Select a continuous road interval for a **Road closure**, or draw a short cross-road **Blockade**. Add times, unknown expiry, notes, source and up to six photos. Active roads are red; future markers reveal yellow previews. |
| **Community review** | Guests browse; members submit private reports. Verified contributors/admins review reports and maintain restrictions. Admins manage verification and administrator roles with server-checked authority. |
| **Local transport** | Twin Cities bus/Metro/EV routes, stops, road-following bus geometry, estimated walking links/transfers, selected-journey focus and reference fares. Closures mark uncertain services grey; reviewed suspension notices grey the affected service/time. |
| **Navigation** | Foreground location, accuracy/staleness states, guidance, recovery from deviation and English/Urdu voice options. Travel recording requires explicit consent. |
| **Personal journeys** | Profile/photo/city, vehicle/mileage, saved commutes, usual-route alerts, weekly/monthly statistics, trip history, historical map paths and branded image sharing/download. |
| **Weather and fuel** | Hourly cached Islamabad weather for live/planned hours, PSO petrol/diesel references, journey fuel estimates and historical rate snapshots. Captured departure weather can appear in trip-share images. |
| **Administrator workspace** | Dedicated Users, Review queue, Closures and Pipelines. Inspect evidence and Gemini analysis in an adjacent panel; correct, approve or reject road/service proposals. |
| **Accounts and appearance** | Firebase email/password, guest entry, password visibility, branded recovery, onboarding, English/Urdu, dark/light/system appearance and independent Classic/Minimal/Night map styles. Defaults: dark appearance, Classic driving map and Minimal Local map. |

### Source-to-map workflow

```mermaid
flowchart LR
  A[Public Champ posts or manual import] --> B[Collection and deduplication]
  B --> C[Configured Gemini worker]
  C --> D[Private road or service proposal]
  D --> E[Administrator review]
  E --> F[Approved timed restriction]
  F --> G[Driving and Local availability]
```

**Every agent map change requires administrator approval.** Community reports have a separate verified-contributor/admin review path. Source evidence, unresolved fields, revisions and human overrides are retained. [Review workflow](docs/operations/AGENT_MAP_REVIEW.md).

## Technology stack

| Layer | Technologies |
| --- | --- |
| Interface | React 19, TypeScript 5.9, Vite 7, Lucide, CSS |
| Maps / geometry | MapLibre GL JS 6, OpenFreeMap, OpenStreetMap, Turf |
| Roads / search | Bundled OSM graph and directed routing, OSRM candidates, Photon search, bounded on-demand OSM road loading |
| API / validation | Node.js 24, Express 5, Zod 4 |
| Identity / storage | Firebase Authentication/Admin SDK, Firestore; SQLite for trusted standalone development |
| Source / AI | Gemini Developer API, structured extraction, public-page parser, durable inbox/claims/retries and private image evidence |
| Hosting / operations | Firebase Hosting, Cloud Run API/private worker, Cloud Scheduler, Secret Manager, Cloud Storage, service-account IAM |
| Speech / context | Browser synthesis, bundled basic Urdu prompts, optional Google Cloud Text-to-Speech; Open-Meteo; PSO |
| Verification | Vitest, Testing Library, jsdom, Auth/Firestore Emulators, TypeScript and production builds |

The complete dependency list is in [package.json](package.json), with locked versions in [package-lock.json](package-lock.json). Offline data preparation uses Python scripts; it is separate from ordinary app startup.

MapLibre/OpenStreetMap powers the map. Google Maps, Mapbox, live Google traffic and paid X API access are not current dependencies.

## Pipelines and integrations

| Pipeline | Trigger and result | Boundary |
| --- | --- | --- |
| **Champ Alerts** | Enabled collector defaults to five-minute public X checks; deduplicates new/edited evidence and images. Manual import uses the same inbox. | Signed-out access is partial and can fail; no complete-feed guarantee or WhatsApp channel ingestion. |
| **Gemini** | Separate enabled worker/manual admin trigger; validated bilingual text/image extraction and private road/service proposals. | Configured worker-only credentials and bounded allowances; saved analysis does not generate again; human approval required. |
| **Weather** | Shared hourly Open-Meteo cache for Islamabad; live/planned requests select the exact hour. | Model forecast; explicit stale/unavailable. No nationwide download or weather worker job. |
| **Fuel** | PSO extraction and dated price history; bounded daily checks when enabled. | Last-checked reference, not guaranteed pump tariff; cloud schedule requires operator setup. |
| **Journey alerts** | Saved/consented usual journeys checked against restrictions. | Foreground/in-app and permission-based browser alerts; closed-app push is future work. |
| **Transit data** | PakBus import, CDA/PMA official-source comparison and OSM alignment produce a versioned committed network. | Snapshot, not live operator feed. Gaps, source conflicts and unknown times remain explicit. |

Integration code does not mean a service is enabled in every runtime. See [configuration](docs/operations/CONFIGURATION.md), [pipeline walkthrough](docs/guides/PIPELINES.md) and [source limitations](docs/operations/INGESTION_IMPLEMENTATION.md).

## Run locally

Install **Node.js 24.12+**, npm and **Java 21+**. Firebase emulator mode exercises actual account tokens, roles and separate user records.

```sh
npm ci
npm run dev:firebase
```

| Service | Local address |
| --- | --- |
| App | [127.0.0.1:5173](http://127.0.0.1:5173/) |
| API | [127.0.0.1:3001/api](http://127.0.0.1:3001/api) |
| Auth / Firestore | `127.0.0.1:9099` / `127.0.0.1:8080` |

The launcher configures the demo project, starts a private local worker and seeds guarded emulator accounts, including **User 123** with sample travel data. Automatic source scraping is paused; Gemini stays off unless configured. See [local development](docs/engineering/LOCAL_DEVELOPMENT.md) and [sample account](docs/engineering/SAMPLE_ACCOUNT.md).

On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`. `npm.cmd run dev:local` uses this workspace's optional portable tools when installed; fresh clones should install the prerequisites above.

For trusted single-user SQLite development, copy `.env.example` to `.env`, review it and set `X_SCRAPER_ENABLED=false` before `npm run dev` to pause collection. This shared local database is **not production authentication**. [Runtime modes](docs/operations/CONFIGURATION.md).

### Commands

| Command | Purpose |
| --- | --- |
| `npm run docs:check` | Validate local documentation links and section anchors |
| `npm test -- --maxWorkers=4` | Standard deterministic tests |
| `npm run test:firebase` | Isolated real Auth/Firestore integration checks |
| `npm run build` | Frontend TypeScript check and production build |
| `npm run build:server` | Compile API and worker |
| `npm run config:check` | Validate selected runtime configuration |
| `npm run build:cloud` | Build a configured cloud release |

Source/model probes make external requests and can consume allowances. Read the relevant operations guide first. [Contributing](CONTRIBUTING.md) maps changes to checks.

## Deploy your own instance

The production design is **Firebase Hosting → Cloud Run API**, with **Firebase Authentication/Firestore** and a separate authenticated private worker.

1. Create your Firebase/Google Cloud project, billing configuration and service identities.
2. Configure Authentication, Firestore, frontend/runtime templates, hosts/origins and private-worker permissions.
3. Release the tested API/worker, rules/indexes and Hosting together; configure the branded password-action URL.
4. Bootstrap an administrator explicitly. Enable only intended optional jobs, verify the released origin and record source/revisions.

Use the **[deployment runbook](docs/operations/DEPLOYMENT.md)** and **[configuration reference](docs/operations/CONFIGURATION.md)**. Existing `*.manzil-app-v1.yaml` files target the owner's project and need adaptation. Copying a file or pushing a branch does not create a working deployment. Provider free tiers and quotas do not guarantee a zero-cost production service.

## Coverage and limits

- **Driving:** Pakistan journey scope. Browsing and real-road reporting extend beyond Islamabad; missing road/provider coverage stays unavailable. Only a central Islamabad graph is bundled.
- **Local:** 37 Twin Cities routes / 67 directional patterns. Road-alignment estimates are not certified operator trajectories. Unresolved gaps cannot be crossed; source-conflicting/restricted patterns are excluded from recommendations. Reference fares are not tickets or guaranteed current tariffs.
- **Estimates:** speed-based ETAs, fuel consumption and forecasts; no live traffic, bus tracking or universal accurate timetable.
- **Navigation:** browser/device precision and voices vary. Turn guidance requires a recent accurate fix. Basic Urdu fallback has limited vocabulary; background mobile guidance is outside this MVP.
- **Privacy:** opt-in foreground travel collection, export/delete and bounded retention. Historical traces never automatically become public roads. [Data behavior](docs/reference/PERSONAL_TRAVEL_DATA.md).

## Documentation

| Need | Start here |
| --- | --- |
| Product and architecture | [Context](PROJECT_CONTEXT.md) · [Architecture](ARCHITECTURE.md) |
| Developer or agent onboarding | [Contributing](CONTRIBUTING.md) · [Agent guide](docs/engineering/AGENT_GUIDE.md) · [Instructions](AGENTS.md) |
| Technical contracts | [API](docs/reference/API.md) · [Routing](docs/reference/ROUTING.md) · [Transit sources](docs/data-sources/TRANSIT_SOURCES.md) |
| Setup and release | [Local development](docs/engineering/LOCAL_DEVELOPMENT.md) · [Deployment](docs/operations/DEPLOYMENT.md) |
| Implemented versus future | [Status](docs/IMPLEMENTATION_STATUS.md) |
| Original research and decisions | [Research and archive index](docs/README.md#research-and-history) |

## Attribution and reuse

Preserve OpenStreetMap/OpenFreeMap/OpenMapTiles and Open-Meteo attribution. Libraries, transit evidence, forecasts and brand assets have separate terms: [transit reuse](docs/data-sources/TRANSIT_SOURCES.md), [weather licence](docs/reference/WEATHER.md), [brand notes](assets/brand/README.md).

This repository is **private**, with no repository-wide open-source licence currently granted. Public operator material and open-source dependencies do not automatically grant unrestricted redistribution of the app or datasets.
