# Manzil منزل

**Merged release deployed, 18 October:** application commit `1f196c3` combines GitHub feature merge `49762d0` with the deployed Gemini checkpoint `9b16416`. Live API `manzil-api-00012-g9q`, private worker `manzil-source-worker-00009-6bf`, Hosting pin `fh-84ad6494196d6945`. New UI/profile/transit/weather features and mandatory Gemini admin review are retained. **809 standard + 24 Auth/Firestore emulator tests (833 total)**, production build, three local browser flows, two hosted entry checks and **34 live checks per origin** pass. Weather is fresh; the live bundled transit network has 37 routes/1,210 stops and returned three journey options. Model limits/schedules and worker-only secret remain unchanged. GitHub main contains both histories; original checkout is synchronized and prior local edits are retained in a named backup stash. Earlier localhost-only, uncommitted and deployment-pending entries below are historical.

**18 October release integration (validation complete; deployment pending):** GitHub main `49762d0` merged feature development through `da13602` but did not include the locally deployed Gemini/pipeline work. Isolated checkout `D:/Manzil/release-integration-20261018`, branch `integration/deployed-feature-release`, preserves that work as checkpoint `9b16416` and combines both histories. Incoming transit/weather/profile/entry UI and travel/privacy behavior are retained alongside private Gemini proposals, unified review counts, admin approval, manual worker dispatch and safe account error codes. Original checkout is preserved. **809 standard + 24 real Auth/Firestore emulator cases (833 total)**, production build and three actual-browser desktop/phone/Urdu entry-to-admin-map-prefill checks pass. Updated one stale transit colour expectation and made production weather refresh/persistence finish before responding. Existing test ports were occupied; the isolated emulator run used 8280/9299 and related alternate ports. Temporary root config was removed. No production test account, GPS migration, blockade approval or model call was performed.

**Pipeline follow-up deployed, 18 October:** API `manzil-api-00011-76r`, private worker `manzil-source-worker-00008-cfp`, Hosting pin `fh-2c9b2b4410f6124c`. Control centre opens on Pipeline; Review queue/Awaiting review combine Gemini post proposals with community reports. Run Gemini now supports the configured authenticated API-to-private-worker boundary; no model key on API. Live progress, actual tool logs, unique incident matching and bounded saved-extraction map retries preserve mandatory admin approval. **478 standard + 20 Auth/Firestore emulator tests (498 total)**, production build, four desktop/mobile/theme/language checks and 27 live read-only checks per origin pass. Production manual analysis uses the public API origin to avoid Hosting's 60-second timeout; API timeout 180 seconds. [Workflow and operations](docs/AGENT_MAP_REVIEW.md). Older scheduled-only/automatic-publication entries are historical. Git changes remain uncommitted/unpushed.
**18 October localhost feature branch:** **Local** browses and plans Islamabad–Rawalpindi bus/metro journeys, with sourced stops, transfers, optional departures and closure/service-suspension awareness. Bus colours avoid red; affected lines appear grey. The snapshot includes **37 route references**, with scoped comparisons against **42 CDA PDFs and 20 official Punjab eTransit directions**. Historical/unmapped references, source conflicts and unavailable timetables remain explicit. **Profile → Terms & Conditions / Privacy Policy** describes actual data controls in English/Urdu. [Official comparison](docs/TRANSIT_DATA.md), [routing and API](docs/TRANSIT_ROUTING.md), [policy behavior](docs/LEGAL_AND_PRIVACY.md). This work is on `codex/feature-development`, separate from the deployed release described below.

**17 October deployment:** the core prototype is live at **[manzil-app-v1.web.app](https://manzil-app-v1.web.app)**, using Firebase Hosting, Cloud Run and Firestore in Singapore (`asia-southeast1`). Gemini, cloud speech and scheduled workers are not active. See the [deployment procedure](docs/FIRST_DEPLOYMENT.md) and [verified status](docs/IMPLEMENTATION_STATUS.md). Local SQLite and Firebase emulator development remain available; use `npm.cmd run dev:firebase` for isolated dev accounts. Node **24.12+** and Java **21+** are required for emulator development.

**Latest deployed review release, 18 October:** API `manzil-api-00010-mfs`, private worker `manzil-source-worker-00007-4mq`, Hosting pin `fh-657d3b00874068d1`. Every agent map change requires administrator approval. Five existing private drafts were prepared without new Gemini calls or route changes; three have resolved landmark pins. **456 standard + 19 Auth/Firestore emulator cases (475 total)**, production build and four local browser/theme/language checks pass. Read the current implementation status and [review guide](docs/AGENT_MAP_REVIEW.md). Earlier release/mode entries below are historical; Git changes remain uncommitted/unpushed.

**Current scope, 18 October:** the owner now requires administrator approval/rejection for every agent map change. Gemini prepares private per-event map proposals and Review on map prefills fields, evidenced or labelled AI-proposed PKT times and resolved road/landmark geometry. Unknown fields stay explicit. Existing saved interpretations can be prepared without another model call. The live setting has been switched to review mode; earlier automatic-publication preferences and release descriptions below are historical. See [agent map review](docs/AGENT_MAP_REVIEW.md).

**Pipeline UI:** source collection and Gemini now have a clearer Collect → Understand → Decide walkthrough, with each original post, AI analysis and map outcome grouped together. All posts is the default; waiting work and completed results stay distinct. Dark-mode collection panels use muted blue-grey. [Demo walkthrough](docs/PIPELINE_DEMO.md).

**Gemini deployed, 17 October evening:** [manzil-app-v1.web.app](https://manzil-app-v1.web.app) now includes bilingual structured text/image interpretation, durable daily limits, validated closure/reopening and admin results/private-image review. API `manzil-api-00007-kv4`, worker `manzil-source-worker-00004-h5p`, Hosting pin `fh-1892cd5e1863e326`. The owner confirmed the API key's Free tier; it is private to the worker. Separate source and Gemini jobs run every five minutes; validated publication is enabled, while ambiguous evidence stays in review. Real cloud generation, **450 standard/emulator cases**, production build and **24 live checks per origin** pass. No suitable real post has yet demonstrated an automatic map closure/reopening. [Operation, limits and pause](docs/GEMINI_INTEGRATION.md), [release evidence](docs/IMPLEMENTATION_STATUS.md). Earlier source-only releases below are historical.

**Latest source pilot, 17 October:** collection now runs every five minutes on Google Cloud, independently of your computer. API `manzil-api-00006-cpm` is published at **[manzil-app-v1.web.app](https://manzil-app-v1.web.app)** through Hosting pin `fh-99a30503e5ad5589`; private worker `manzil-source-worker-00003-g8s` saves source evidence without Gemini/map publication. Cloud speech and fuel/commute schedules remain inactive. [Deployment and pause instructions](docs/SOURCE_DEPLOYMENT.md), [verification](docs/IMPLEMENTATION_STATUS.md#five-minute-source-pilot-deployed---17-october). Local SQLite and Firebase emulator development remain available; use `npm.cmd run dev:firebase` for isolated dev accounts. Node **24.12+** and Java **21+** are required for emulator development. Older feature-release notes below retain their historical scope.

**17 October feature release deployed:** commit **`0fd5592`**, including pull request #1, is live on **`manzil-api-00005-zg5`**, Hosting pin **`fh-4dbbea488086e281`**. This adds community/admin moderation, road-section editing, consented profiles, vehicle/fuel features and map polish. **Live map** shows current PKT time; **Plan ahead** handles selected dates and requires a fresh live route before GPS guidance. Fresh **345 standard + 15 emulator tests (360 total)**, the cloud build and **27 live checks per origin** pass. Guest browser checks cover Lahore routing, planned dates and English/Urdu phone layouts. [Current verification](docs/IMPLEMENTATION_STATUS.md#feature-release-deployed--17-october), [time behavior](docs/MAP_TIME_AND_STOPS.md), [fuel estimates](docs/FUEL_COSTS.md).

**Retained routing and runtime setup:** Islamabad journeys retain the bundled graph; other Pakistan journeys use closure-validated OSRM candidates and Photon search. Public provider endpoints are for light prototype use. `npm.cmd run dev:local` is an optional Windows runtime helper; this machine has Node 24.22.0 and Java 25. The previous release `34e9e4a` / `manzil-api-00004-7t4` remains the rollback reference. See [provider limits/privacy](docs/ROUTING.md).


English/Urdu interface and voice controls, a target-aware tutorial, Firebase accounts, automatic foreground GPS rerouting (including remaining stops), and reduced map redraws are implemented. Google Cloud TTS uses server-side ADC, cached audio and bounded usage; it remains disabled in the current release. Firebase email/password authentication and isolated records are configured in the hosted project; production users register real accounts, with no dummy passwords seeded. Standalone development retains [dummy normal/admin sign-ins](docs/DEV_ACCOUNTS_AND_TOUR.md). The [admin workspace](docs/ADMIN_INTERFACE_PROPOSAL.md) is deployed; suppression overrides are implemented, while the extended correction-history/reset proposal remains future work. Core guest planning also works locally without Cloud credentials. See [feature/setup guide](docs/BILINGUAL_NAVIGATION_AND_CLOUD.md) and [environment guide](docs/ENVIRONMENTS.md).

The first screen offers sign-in, registration and **Continue as guest**. Regular planning tabs are **Map, Plan ahead, Local, Closures, Saved and Profile**, with **Activity** after sign-in. Admins land in **Control centre** and can also open Local. Admin-only **Demo closures** provides ten scenarios, four with **Try route** through real public streets; route block-point testing is also admin-only. Guests must sign in to submit a report. Guest tours start after the explicit skip, signed-in users retain remembered first-use behavior, and admins can deliberately replay Help.

Manzil is a Pakistan closure-aware commute planner proposed for the Google Cloud AI Builder Cup 2026, starting with a detailed local Islamabad road graph. It evaluates scheduled road restrictions against planned journeys and offers detours or departure-time recommendations. The deployed Gemini agent turns source text/images into bilingual structured interpretations and server-validated closure proposals, retaining ambiguous evidence for admin review. The hosted app also provides manual editing and the durable notice queue.

The repository now contains a working **localhost application**, a real Islamabad OSM road graph, tests, research and branding. No deployment or Google account is required for this local edition.

Fuel reference data is initially **unavailable** (zero cached records). An authenticated admin can request the bounded daily PSO check in Pipeline; automatic daily refresh needs the separately deployed private worker/Scheduler. No background job was added by this release.

## Run locally

Requires Node.js **24.12+** for the current Firebase SDKs; Firebase emulator development also requires Java **21+**. Use `npm.cmd run dev:local` if you need the optional portable-runtime helper without changing system PATH. On a machine with compatible Node/Java, from this repository:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. The API runs at http://127.0.0.1:3001. Keep the local server running for source and commute checks. The bundled road graph needs no API key; ordinary basemap tiles need internet. Optional settings are listed in `.env.example`.

For Firebase authentication and per-user storage development, stop the standalone server and run `npm.cmd run dev:firebase` instead. Use `npm.cmd` in PowerShell if `npm.ps1` is blocked. Windows upgrade instructions and the full emulator workflow are in the [environment guide](docs/ENVIRONMENTS.md).

As admin, use **Demo closures → Try route** on Park Road/F-8, Rohtas Road/G-9, Tipu Sultan Road/I-8 or Sumbal Road/F-10 for a synthetic blockade and real street-route example. Inspect the original blocked route separately from navigable alternatives. Use the map's **Add restriction** to select two points along a connected named Islamabad road, or use Point/Draw/Area, schedule its PKT period and optionally attach photos. Regular reports wait for contributor/admin approval; verified contributors can publish directly. Demo events remain labelled and cancellable without losing history. See [API permissions](docs/API.md).

**X collection:** the private Cloud Run worker now collects bounded public HTML every **five minutes** through authenticated Cloud Scheduler. Four notices and one image were saved from Google Cloud; scheduled repeats deduplicated notices and reused the image. Posts/revisions remain in Firestore, while images are private with seven-day lifecycle cleanup. API `manzil-api-00006-cpm` and worker `manzil-source-worker-00003-g8s` use the same tested image. **386 standard + 15 emulator cases (401 total)** and cloud build pass. `npm.cmd run source:probe` remains metadata-only; add `-- --download-images` for explicit local inspection. `source:check` deliberately writes the non-production queue. Gemini/OCR and automatic map publication remain inactive; coverage is always partial. See [source operations/pause](docs/SOURCE_DEPLOYMENT.md), [implementation](docs/INGESTION_IMPLEMENTATION.md) and [release evidence](docs/IMPLEMENTATION_STATUS.md#five-minute-source-pilot-deployed---17-october). The pilot continues until paused and does not require your computer to stay on.

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

1. Clean 2D MapLibre/OpenFreeMap vector map with Pakistan place/road search, draggable pins, light/dark/system app themes, three map styles and a map-detail preference. Dark app appearance and Classic map are the new/missing defaults; saved choices stay intact. Startup has empty A/B fields and no preset route. Light uses grey outer panels and pale-blue cards; Night and Minimal remain available. See [map styles and the black-polygon fix](docs/MAP_STYLES.md).
2. Point, road-corridor and polygon restrictions; exact geometry preview, coordinate editing, scheduled start/end, drafts, revisions, cancellation and GeoJSON import/export.
3. Up to three genuinely different driving routes for the same departure over a bundled OSM graph; clear blue route lines/time labels, distance/ETA cards, closure traversal-time checks and separate earlier/later departure comparisons.
4. Weekly saved commutes, next-occurrence checks and deduplicated in-app impact alerts while the backend runs.
5. Fifteen-minute public X collection attempt, honest status/freshness, manual notices and a durable pending-agent queue.
6. Consent-gated foreground navigation GPS history, weekly/monthly totals, profile distance/fuel-price charts, bright green historical paths and branded PNG sharing/downloads, plus private GeoJSON/deletion and separate future road-discovery contribution consent. Activity has totals/history without a manual recorder.
7. A persistent local profile, preferences, opt-in browser notifications and separately consented learning/closure alerts for usual recorded journeys.
8. Route-step preview, foreground GPS guidance, optional voice prompts and recalculation from a fresh position. No background/Google-equivalent navigation claim.

The implemented stack is React/TypeScript/Vite, MapLibre GL JS, OpenFreeMap, a local OSM routing engine, Express and a shared SQLite/Firestore repository boundary. Firebase emulators exercise the same adapter/token integration used by the hosted core. The flat vector map needs internet and WebGL but no map API key; it removes POIs/building detail in Clean mode and retains attribution. Gemini interpretation and FCM remain future work. Live traffic, transit routing, crowd verification, automatic learned-road publication and camera avoidance remain on the roadmap. Read the [environment guide](docs/ENVIRONMENTS.md) for current configuration and the [15 October redesign guide](docs/REDESIGN_2026-10-15.md) for historical UI decisions.

## Validation

```sh
npm test
npm run test:firebase
npm run build
```

The released checkout passed **345 standard tests across 44 files** and **15 real Auth/Firestore emulator cases** (360 total across 45 files), plus the cloud TypeScript/frontend/backend build. **27 live checks pass against each origin** (direct API and Hosting), covering routing, Pakistan coverage, normalized authorization, new admin/fuel/statistics guards, consent defaults and real road-section geometry. Browser checks cover login-first guest entry, the tour, two Lahore routes, fixed PKT planning, return to live time, remembered dates and English/Urdu phone layouts, with no captured JavaScript/API errors. No production user was created for QA; live signed-in/admin workflows, real-device GPS/audio, OS notifications and successful X retrieval were not newly verified. Gemini/cloud speech remain inactive. See [dated evidence](docs/IMPLEMENTATION_STATUS.md#feature-release-deployed--17-october).

Main **Map** shows current PKT time. Use **Plan ahead** to view closures and routes at a chosen PKT date/time; return to a validated live route before starting navigation. Add up to five intermediate stops. Open **Demo closures** for ten test scenarios; **Add defaults** enables the original six, and the four focused street examples can be tested individually. See [map time and stops](docs/MAP_TIME_AND_STOPS.md) and [demo guide](docs/DEMOS.md). Map browsing is worldwide; local routing covers central Islamabad, with online routing elsewhere in Pakistan.

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
