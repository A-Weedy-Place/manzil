# Implementation status

**Reviewed: 18 October 2026.** Current capabilities through application checkpoint **`94a48c7`**, plus this documentation reorganization. The [full historical implementation log](archive/releases/IMPLEMENTATION_LOG_THROUGH_2026-10-18.md) retains detailed verification and releases.

## Release boundary

| Item | Interpretation |
| --- | --- |
| Feature branch | `codex/feature-development`; application checkpoint `94a48c7` |
| Hosted site | [manzil-app-v1.web.app](https://manzil-app-v1.web.app), released independently |
| Recorded deployed checkpoint | `1f196c3`, API `manzil-api-00012-g9q`, worker `manzil-source-worker-00009-6bf`, Hosting `fh-84ad6494196d6945`: historical 18 October evidence, not newly checked live state |
| Later feature work | Navigation, transit alignment/focus, closure simplification/coverage, admin workspace, fares and service review need a separate integrated release |
| Current task | Documentation only; no deployment, main merge, source/model activation, account-role change or data migration |

Remote `main` and the public site may differ from this branch. Check exact commits and use the [release runbook](operations/DEPLOYMENT.md) when authorized.

## Capability matrix

| Area | Implemented | Limits / configuration |
| --- | --- | --- |
| Map/search | MapLibre/OpenFreeMap, Classic/Minimal/Night, dark/light/system, English/Urdu, place search | Public tile/search availability is not guaranteed |
| Driving | Directed bundled graph/external candidates, streets/stops, up to three distinct validated options, blocked comparison, quiet refresh | Pakistan journey scope, speed-based ETAs, no live traffic |
| Time | Live now, Plan ahead, traversal windows and upcoming previews | Asia/Karachi; unknown/unavailable stays explicit |
| Closure editor | Road interval or short transverse blockade, road validation beyond bundled area, six photos, notes/source/unknown expiry | Bounded on-demand topology; no lane-level proof or full-country offline graph |
| Moderation | Private pending reports, verified/admin review/edit/cancel and Users/role management | Pending edits remain pending; original reporter/revisions retained |
| Agent | Bilingual text/image integration, private road/service proposals, map preparation and incident/revision guards | Worker/model configuration required; every action needs admin approval; ambiguous scope/times/places need confirmation |
| Local network | 37 routes, 1,210 source stop IDs, 67 patterns, 2,064 source trips; focused journeys, grey uncertainty/suspensions, transfers and fares | Snapshot, not live operations; gaps cannot be crossed; restricted/conflicting patterns excluded; old/unknown fare references labelled |
| Transit geometry | Solid precomputed road alignment; 954/974 consecutive pairs aligned and 20 retained gaps | Estimates, not certified operator shapes; walking connectors remain estimates |
| Accounts | Firebase SDK, guest flow, profile/photo/city/vehicle/preferences, branded reset handler | Custom emailed action URL needs release-time template setup; SQLite is not production auth |
| Navigation/voice | Foreground refinement, accuracy/freshness gate, guidance/recovery, preferred available female voice, basic Urdu fallback | Synthetic tests cannot prove real GPS precision; limited Urdu prompts; cloud speech optional |
| Personal travel | Opt-in navigation capture, retained paths/statistics/PNG sharing/export/delete, saved/learned journeys and foreground alerts | Raw points 30 days, summaries up to 90 days; no closed-app push or automatic road publication |
| Weather | Shared hourly Islamabad forecast, exact live/planned hour and cache-only eligible trip snapshot | Forecast bounds and stale/unavailable states; no weather worker job |
| Fuel | Dated PSO petrol/diesel, daily-check service, vehicle/rate snapshots and cost estimates | Enabled refresh required; not guaranteed pump tariff or extra fuel types |
| Admin | Users, Review queue, Closures, Pipelines and adjacent evidence/analysis | Directory has limited identity/city/consent, never another user's GPS/trips/vehicle |

## Integrations and operating state

| Integration | Code/configuration | Do not infer |
| --- | --- | --- |
| Firebase/Google Cloud | Auth, Firestore, Hosting/Cloud Run, worker OIDC, Scheduler, Secret Manager, private Storage | Emulator success does not verify new production IAM/configuration |
| Champ Alerts | Bounded public X collection/deduplication/evidence/manual import; current enabled default five minutes | No complete-feed guarantee; no WhatsApp ingestion |
| Gemini | Worker credentials, bounded claims/batches/retries/allowances and mandatory proposals | Availability/key/quota are runtime choices; local fixtures are not live reasoning |
| PSO/Open-Meteo | Dated prices and shared weather | Freshness comes from actual state/timestamps, not a documentation claim |
| Optional jobs | Worker supports source/agent/fuel/commutes | Weather is request/cache based. Fuel/commute schedules and Cloud TTS were inactive at the recorded deployment checkpoint |

## Verification evidence

The preceding application checkpoint passed **1,155 standard tests across 108 files**, **28/28 isolated Auth/Firestore Emulator cases**, frontend TypeScript/Vite and API/worker builds. Browser observations and the initial emulator-startup contention/rerun are in the [historical log](archive/releases/IMPLEMENTATION_LOG_THROUGH_2026-10-18.md#admin-workspace-reference-fares-and-branded-recovery--18-october). Local synthetic evidence does not establish actual GPS precision, complete source access or a deployed feature release.

This reorganization moved 50 guides/research records into topic folders, retained original context/agent/release evidence in the archive, replaced the accumulated root briefs and rebuilt the README/index/architecture/contributor/deployment guides. It adds an offline `npm run docs:check` command and updates source-script documentation references; application behavior is unchanged.

Verification for this changeset:

- **66 Markdown files / 729 local links and anchors** pass; negative cases also confirm missing targets/anchors and outside/network paths are rejected. External URLs were not fetched by the checker.
- **52/52 focused routing/API tests across four files** pass. The initial sandbox run could not connect to its loopback API; the rerun with localhost access passed unchanged.
- Frontend TypeScript/Vite and compiled API/worker builds pass. The existing large-bundle advisory remains.
- `git diff --check` passes. The broad/Firebase counts above are prior checkpoint evidence, not reruns for this documentation-only change.

Architecture/setup/operations were checked against code/configuration. Current provider prices/tariffs and live deployment were not re-verified; no cloud resource, role or pipeline was changed.

## Documentation map

- [Index](README.md): guides, contracts, data evidence and historical research.
- [Architecture](../ARCHITECTURE.md): services, trust boundaries and data flow.
- [Contributing](../CONTRIBUTING.md): workflow and verification.
- [Product context](../PROJECT_CONTEXT.md): durable requirements and deferred directions.
- [Deployment](operations/DEPLOYMENT.md): independent release/self-hosting.
