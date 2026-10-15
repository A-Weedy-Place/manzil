# Manzil منزل

Manzil is an Islamabad closure-aware commute planner proposed for the Google Cloud AI Builder Cup 2026. It evaluates scheduled road restrictions against planned journeys and offers detours or departure-time recommendations. The future Gemini agent will turn source notices into reviewable closure proposals; the current app provides manual editing and the notice queue.

The repository now contains a working **localhost application**, a real Islamabad OSM road graph, tests, research and branding. No deployment or Google account is required for this local edition.

## Run locally

Requires Node.js **22.13+**; verified with 22.20.0. From this repository:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. The API runs at http://127.0.0.1:3001. Keep the local server running for source and commute checks. The bundled road graph needs no API key; ordinary basemap tiles need internet. Optional settings are listed in `.env.example`.

Try **Find my route**, then **Try a demo restriction** to see a connected detour. Demo restrictions are explicitly synthetic and can be cancelled from Closures. Use the editor to draw your own point, road corridor or area and schedule its start/end in Pakistan time.

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

The implemented stack is React/TypeScript/Vite, MapLibre GL JS, OpenFreeMap, a local OSM routing engine, Express and SQLite. The flat vector map needs internet and WebGL but no map API key; it removes POIs/building detail in Clean mode and retains attribution. Google Cloud/Gemini, Firestore, ORS and FCM remain deployment/integration targets. Live traffic, transit routing, crowd verification, automatic learned-road publication and camera avoidance remain on the explicit roadmap. Read the [15 October redesign guide](docs/REDESIGN_2026-10-15.md) for profiles, notifications, navigation and their practical boundaries.

## Validation

```sh
npm test
npm run build
```

The current suite has **91 passing tests**, including diverse real-road alternatives, ordered stops with turn/time continuity, residential street detours, red-road/snapshot agreement, demo ownership, topology/access/direction, unavailable routes, persistence, revisions, source deduplication/outbox, consented journey inference/alerts, notification delivery guards and navigation failure/progression logic. Type checking and the production build pass. Browser evidence and verification boundaries are in the implementation status. Real-device GPS, OS notification delivery and successful live X retrieval remain unverified.

Use the prominent top clock to view closures and routes at **Now** or a chosen PKT date/time. Add up to five intermediate stops. Open **Demo closures** for six test scenarios. See [map time and stops](docs/MAP_TIME_AND_STOPS.md) and [demo guide](docs/DEMOS.md). Map browsing is worldwide; the routing graph remains bounded to central Islamabad.

## Branding

The project and team name is **Manzil (منزل)**, meaning destination. The primary logo is a transparent PNG generated on 14 October 2026.

![Manzil Urdu calligraphy logo](assets/brand/manzil-logo-v1.png)

## Milestone

Two developers aim to finish and polish the prototype by **17 October 2026**. The local core was implemented on October 14. The owner will handle deployment and build the Gemini agent later.

## Credentials and dependencies

Keep API keys and local environment files out of Git. Future setup examples should use placeholders in an .env.example file. Routing/map libraries, hosted services, map data, and generated route results have separate license and attribution requirements documented in the plan.
