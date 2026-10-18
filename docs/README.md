# Manzil documentation

Start with the [project README](../README.md), [product context](../PROJECT_CONTEXT.md) and [current implementation status](IMPLEMENTATION_STATUS.md). This index separates current operating guidance from research and historical release evidence.

## Start here

| Reader | Suggested path |
| --- | --- |
| New developer | [Contributing](../CONTRIBUTING.md) → [local setup](engineering/LOCAL_DEVELOPMENT.md) → [architecture](../ARCHITECTURE.md) |
| Coding agent | [Repository instructions](../AGENTS.md) → [agent guide](engineering/AGENT_GUIDE.md) → [status](IMPLEMENTATION_STATUS.md) → affected contracts |
| Release developer | [Hosted releases/licensing](operations/RELEASES.md) → [Deployment](operations/DEPLOYMENT.md) → [configuration](operations/CONFIGURATION.md) → [password-action setup](guides/AUTH_PASSWORD_RESET.md) |
| Product reviewer | [Map/editor](guides/MAP_EDITOR.md), [closure workflow](guides/CLOSURE_WORKFLOW.md), [Local routing](reference/TRANSIT_ROUTING.md), [admin workspace](guides/ADMIN_WORKSPACE.md) |
| Source/AI operator | [Pipeline walkthrough](guides/PIPELINES.md), [ingestion](operations/INGESTION_IMPLEMENTATION.md), [Gemini](operations/GEMINI_INTEGRATION.md), [road review](operations/AGENT_MAP_REVIEW.md), [bus-service review](operations/AGENT_TRANSIT_REVIEW.md) |

## Product guides

| Guide | Contents |
| --- | --- |
| [Map and editor](guides/MAP_EDITOR.md) | Journey controls, road selection and map behavior |
| [Closure reporting/review](guides/CLOSURE_WORKFLOW.md) | Road interval vs blockade, permissions, evidence and moderation |
| [Map time and stops](guides/MAP_TIME_AND_STOPS.md) | Live map, Plan ahead and intermediate stops |
| [Map styles](guides/MAP_STYLES.md) | Independent app/map appearance and rendering decisions |
| [Account and profile](guides/ACCOUNT_AND_PROFILE.md) | Identity, vehicle, grouped settings and consent |
| [Administrator workspace](guides/ADMIN_WORKSPACE.md) | Users, Review queue, Closures and Pipelines |
| [Navigation and voice](guides/BILINGUAL_NAVIGATION_AND_CLOUD.md) | Foreground location, accuracy and English/Urdu speech |
| [Trip history and sharing](guides/TRIP_HISTORY_AND_SHARING.md) | Historical map views, branded PNG and data export |
| [Entry screen](guides/ENTRY_SCREEN.md) | Authentication controls and lightweight artwork |
| [Password recovery](guides/AUTH_PASSWORD_RESET.md) | Branded action page and required release configuration |
| [Pipelines](guides/PIPELINES.md) | Collection, saved analysis and review walkthrough |

## Technical references

| Reference | Contents |
| --- | --- |
| [API](reference/API.md) | Domain requests/responses, authorization and failure states |
| [Driving routing](reference/ROUTING.md) | Directed graph, candidates, geometry/access/time validation |
| [Road coverage](reference/ROAD_COVERAGE.md) | Bundled fast path and bounded on-demand road loading |
| [Local routing](reference/TRANSIT_ROUTING.md) | Stops, transfers, service notices, eligibility and focus |
| [Transit fares](reference/TRANSIT_FARES.md) | Dated reference collection and partial/unknown totals |
| [Fuel costs](reference/FUEL_COSTS.md) | PSO refresh, rate history and vehicle/trip estimates |
| [Weather](reference/WEATHER.md) | Hourly city cache, forecast bounds and trip snapshots |
| [Personal travel data](reference/PERSONAL_TRAVEL_DATA.md) | Consent, navigation-owned recording, retention and privacy |
| [Terms and privacy content](reference/LEGAL_AND_PRIVACY.md) | In-app policy behavior and limitations |

## Data sources and reproducibility

| Evidence | Contents |
| --- | --- |
| [Transit sources](data-sources/TRANSIT_SOURCES.md) | Source scope, Safar comparison, attribution and reuse |
| [Transit data](data-sources/TRANSIT_DATA.md) | Import/version workflow and snapshot inventory |
| [CDA verification](data-sources/CDA_TRANSIT_VERIFICATION.md) | Official PDFs, source conflicts and missing geometry |
| [PMA verification](data-sources/PMA_TRANSIT_VERIFICATION.md) | Official directions/coordinates and retained defects |
| [Transit road alignment](data-sources/TRANSIT_ROAD_ALIGNMENT.md) | OSM derivative, estimates and unresolved gaps |
| [Pakistan cities](data-sources/PAKISTAN_CITIES.md) | Curated profile city list and source attribution |

Public records and inferred geometry do not certify current bus operation. Raw source archives are ignored; bounded factual derivatives retain provenance.

## Engineering and operations

| Guide | Contents |
| --- | --- |
| [Local development](engineering/LOCAL_DEVELOPMENT.md) | Prerequisites, runtimes, emulators and checks |
| [Development handoff](engineering/DEVELOPMENT_WORKFLOW.md) | Shared branch and release ownership |
| [Agent guide](engineering/AGENT_GUIDE.md) | Subsystem map, invariants and test selection |
| [Design](engineering/DESIGN.md) / [performance](engineering/PERFORMANCE.md) | Interface and resource decisions |
| [Accounts and tour](engineering/DEV_ACCOUNTS_AND_TOUR.md) / [sample account](engineering/SAMPLE_ACCOUNT.md) | Guarded local fixtures and onboarding |
| [Closure demos](engineering/DEMOS.md) / [long-lived test closures](engineering/LOCAL_TEST_CLOSURES.md) | Synthetic route-testing scenarios |
| [Deployment](operations/DEPLOYMENT.md) / [configuration](operations/CONFIGURATION.md) | Self-deploy, release order, IAM and variables |
| [Source implementation](operations/INGESTION_IMPLEMENTATION.md) | Collector bounds, evidence and queue lifecycle |
| [Gemini operations](operations/GEMINI_INTEGRATION.md) | Worker-only key, limits, retry and review policy |
| [Road proposals](operations/AGENT_MAP_REVIEW.md) / [service proposals](operations/AGENT_TRANSIT_REVIEW.md) | Private proposals and atomic administrator decisions |

## Licensing and release records

- [MIT licence](../LICENSE) for original software; [third-party notices](../THIRD_PARTY_NOTICES.md) for separate data/artwork terms and unresolved permission.
- [Hosted release evidence and publication guidance](operations/RELEASES.md), [v0.1.0 release notes](operations/RELEASE_NOTES_v0.1.0.md) and [private security reporting](../SECURITY.md).

## Research and history

**Research is dated context. Archives preserve superseded plans and historical tests, not current instructions or proof of live configuration.** Current architecture, contracts and deployment guides take precedence.

| Record | Purpose |
| --- | --- |
| [Mapping/market comparison](research/MAPPING_PROJECT_COMPARISON.md) | Safar, Deflock, Flockhopper, open-source engines, Mapbox and Google integration research |
| [Champ Alerts research](research/CHAMP_ALERTS_INGESTION.md) | Original acquisition/source feasibility investigation |
| [Hackathon research](research/AI_BUILDER_CUP_RESEARCH.md) | Original event/feasibility assessment; dates/pricing require rechecking |
| [Archive index](archive/README.md) | Planning, context and release records with their replacement guides |
| [Original full inventory](archive/planning/ISLAMABAD_COMMUTE_PROJECT_PLAN.md) | Full initial feature and architecture proposal |
| [Original architecture proposal](archive/planning/MANZIL_ARCHITECTURE.md) | Earlier proposed design, superseded by current root architecture |
| [Historical context](archive/context/PROJECT_CONTEXT_2026-10-18.md) | Complete earlier owner requests and evolving preferences |
| [Historical implementation log](archive/releases/IMPLEMENTATION_LOG_THROUGH_2026-10-18.md) | Detailed tested checkpoints and release evidence |

## Maintaining this documentation

- Keep `IMPLEMENTATION_STATUS.md` concise: current capabilities, release boundary, actual checks and material limits.
- Put behavior/contracts in the relevant guide; record lengthy dated release evidence in the archive and link it.
- Update moved links, including source-script documentation references. Keep asset READMEs with their assets.
- Run `npm run docs:check` and `git diff --check` for documentation changes. The checker validates local targets/anchors offline; it does not certify external links or current provider policy.
- Preserve secrets, databases, GPS traces and raw source downloads outside Git.
