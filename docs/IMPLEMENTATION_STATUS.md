# Implementation status

## Agent lifecycle / PR #4 integration ? locally validated

Combines main `2c893e2` with feature `a53519b`, retaining admin UI, fares, password recovery, licensing/docs and existing cloud voice/fuel/shared demos. Explicit road and Metro closures publish after validation at confidence >=0.85; source end or labelled 48-hour provisional expiry; newer matching reopening cancels early. Metro writes shared Local disruption records. Saved pending work is reassessed without a new model call, with bounded retries and decision/concurrency protection. **194 relevant tests across 18 files, 11 focused Auth/Firestore emulator tests (20 unrelated cases skipped), TypeScript/cloud frontend/server build and documentation checks pass.** Only affected checks were run; this is not a claim that the full suite ran. Upload manifest: 432 files, private/runtime exclusions verified. Expired proposals are labelled and excluded from review counts. **GitHub merge/deployment pending at this checkpoint**; prior deployment remains API `00015-7cr`, worker `00012-t2z`, Hosting `fh-208bbe9aa098303b`. [Policy](operations/SELECTIVE_AGENT_PUBLICATION.md).

**Reviewed: 18 October 2026.** Current capabilities through application checkpoint **`94a48c7`**, plus the documentation/licensing and hosted-release metadata updates described below. The [full historical implementation log](archive/releases/IMPLEMENTATION_LOG_THROUGH_2026-10-18.md) retains detailed verification and releases.

## Release boundary

| Item | Interpretation |
| --- | --- |
| Feature branch | `codex/feature-development`; application checkpoint `94a48c7` |
| Hosted site | [manzil-app-v1.web.app](https://manzil-app-v1.web.app), released independently |
| Latest recorded deployment | Application `8702fb9`, documented at `2c893e2`; API `manzil-api-00015-7cr`, worker `manzil-source-worker-00012-t2z`, Hosting `fh-208bbe9aa098303b`. Current public frontend fingerprint and health match; exact cloud settings/revisions are teammate-recorded. [Release evidence](operations/RELEASES.md) |
| Feature/release divergence | Hosted code incorporates feature work through `aac7ef8` and independent fuel/voice/selective-publication changes. Feature-only `94a48c7` admin/fare/recovery work and current licensing/docs require review/integration; no main merge is performed here |
| Current task | Scoped MIT licence, source notices, public-project guidance, README deployment information and a GitHub MVP prerelease at the recorded application commit; no deployment, visibility change, main merge, account-role change or data migration |

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
| Gemini | Worker credentials, bounded claims/batches/retries/allowances and selective automatic publication | Availability/key/quota are runtime choices; local fixtures are not live reasoning |
| PSO/Open-Meteo | Dated prices and shared weather | Freshness comes from actual state/timestamps, not a documentation claim |
| Optional jobs | Worker supports source/agent/fuel/commutes | Weather is request/cache based. The latest deployment record enables daily fuel and Cloud TTS; this checkout keeps separate optional configuration. Commute scheduling was not newly verified |

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

## Licensing and hosted-release follow-up

The owner requested MIT licensing/public-project preparation and a GitHub release for the hosted app. Original code/documentation now use [MIT](../LICENSE), with explicit [third-party exclusions/notices](../THIRD_PARTY_NOTICES.md), package metadata and [security reporting](../SECURITY.md). The user's README tagline is retained. PakBus noncommercial terms, OSM/GeoNames obligations and unresolved Survey of Pakistan outline permission remain explicit; adding MIT does not make all assets unrestricted. Repository visibility remains unchanged.

Read-only GitHub/deployment evidence identifies newer hosted code `8702fb9`, recorded at `2c893e2`, whose frontend fingerprint matches the public app. The public health endpoint returned 200 with Firestore/graph ready. The release notes separate that snapshot's selective-publication/fuel/cloud-speech policy from the earlier feature checkpoint's mandatory review. No model, source job, cloud setting or public road record was changed. The tag predates licence files, so its release includes licence/notice supplements. See [release details](operations/RELEASES.md).

A targeted publication audit scanned 57 reachable commits / 1,338 text blobs without matching the checked secret/private-key patterns or tracked private runtime/archive paths. That bounded scan is not proof that every possible secret was inspected. This documentation/package-metadata follow-up passes the offline checker (70 Markdown files / 772 local links and anchors), `git diff --check`, matching MIT package/lock metadata and an unchanged dependency graph. The user tagline is retained. Application test/build results above belong to the preceding checkpoint; no application code/dependency change requires a new behavior run.

Release **v0.1.0** was created as a published MVP prerelease at exact deployed application commit `8702fb9`. The tag target, published notes (normalizing GitHub CRLF), and SHA-256 digests of both uploaded licence assets were verified. Licensing-document commit is `0beb849`. GitHub still reports private visibility and default branch `main`; licensing/README integration into that branch remains a separate handoff. No deployment or main merge occurred.
