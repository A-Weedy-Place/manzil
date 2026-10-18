# Agent onboarding

Use this guide to locate code and verify a change. The root [AGENTS.md](../../AGENTS.md) is the instruction entry point; this document supplements it rather than introducing a second release history.

## Read before editing

1. [Project context](../../PROJECT_CONTEXT.md): product intent and current constraints.
2. [Implementation status](../IMPLEMENTATION_STATUS.md): tested source behavior, deployed release and unfinished work.
3. [Architecture](../../ARCHITECTURE.md): services, trust boundaries, data flows and integration coverage.
4. [Contributor guide](../../CONTRIBUTING.md) and the relevant subsystem guide below.

Inspect `git status --short --branch` and the actual files first. Do not assume a previous conversation's branch, running process, deployment revision or uncommitted edits are still current. Treat release receipts and archived plans as historical evidence; never use their old counts or activation statements as current verification.

## Find the right boundary

| Task | Start in code | Read |
| --- | --- | --- |
| Driving / detours / times | `server/routing/index.ts`, `engine.ts`, `world.ts`, `shared/types.ts` | [Routing](../reference/ROUTING.md), [API](../reference/API.md) |
| Road selection / blockade | `server/routing/road-selection.ts`, `road-coverage.ts`, `src/lib/useRoadSelection.ts`, closure editor | [Closure workflow](../guides/CLOSURE_WORKFLOW.md), [road coverage](../reference/ROAD_COVERAGE.md) |
| Bus network / planner | `server/transit/`, `src/lib/transitMap.ts`, `src/components/TransitPanel.tsx` | [Transit data](../data-sources/TRANSIT_DATA.md), [routing](../reference/TRANSIT_ROUTING.md), [road alignment](../data-sources/TRANSIT_ROAD_ALIGNMENT.md), [fares](../reference/TRANSIT_FARES.md) |
| Roles / report review / users | `server/community.ts`, `server/app.ts`, `AdminPanel.tsx`, `ClosureList.tsx` | [Admin workspace](../guides/ADMIN_WORKSPACE.md), [closure workflow](../guides/CLOSURE_WORKFLOW.md) |
| Source / Gemini / private worker | `server/source*.ts`, `agent*.ts`, `gemini.ts`, `worker.ts` | [Agent review](../operations/AGENT_MAP_REVIEW.md), [transit review](../operations/AGENT_TRANSIT_REVIEW.md), [source operations](../operations/DEPLOYMENT.md), [Gemini operations](../operations/GEMINI_INTEGRATION.md) |
| Account / reset / profile | `src/lib/auth.ts`, `emailActions.ts`, account/profile/reset components | [Account](../guides/ACCOUNT_AND_PROFILE.md), [password reset](../guides/AUTH_PASSWORD_RESET.md) |
| GPS / history / statistics | Location/navigation client modules, `server/app.ts`, repository adapters | [Personal data](../reference/PERSONAL_TRAVEL_DATA.md), [trip sharing](../guides/TRIP_HISTORY_AND_SHARING.md) |
| Weather / fuel / speech | Corresponding `server/*.ts` and `shared/*.ts` | [Weather](../reference/WEATHER.md), [fuel](../reference/FUEL_COSTS.md), [voice](../guides/BILINGUAL_NAVIGATION_AND_CLOUD.md) |
| Runtime / infrastructure | `server/config.ts`, `bootstrap.ts`, `config/`, `firebase.json`, `Dockerfile` | [Environments](../operations/CONFIGURATION.md), [local setup](LOCAL_DEVELOPMENT.md), [deployment](../operations/DEPLOYMENT.md) |

Paths in the code column are relative to the repository root; a bare filename continues the directory named earlier in that cell. Inspect exact exports and tests before changing a shared contract.

## Protect these invariants

**Geometry and time.** GeoJSON `[longitude, latitude]` everywhere in domain/API data; `Asia/Karachi` for user scheduling. Restriction polygons, road/carriageway evidence and traversal time all matter. A blockade across a road is different from closing the interval between distant points. Two-dimensional geometry is not proof of lane or grade separation.

**Publication and revisions.** Ordinary reports remain private until approved. Pending edits do not approve them. Verified community reviewers may review/correct eligible community reports; only administrators approve Gemini proposals. Every agent map change needs approval. Expected source, proposal, target and event revisions/manual overrides prevent stale model output or concurrent edits from winning silently.

**Identity and privacy.** Request-scoped personal repositories must remain isolated. Check current server authority rather than trusting UI controls or a stale token claim. Directory projections do not include someone else's trips, GPS or vehicle. Personal trip samples require consent, precision and freshness. Account/consent changes must cancel or invalidate pending data, location and speech work.

**Evidence and availability.** A visible map road, source post, AI interpretation, road-aligned bus estimate and confirmed operator suspension are different evidence levels. Preserve provenance and explicit unavailable/partial states. Do not fill missing schedules, source access, fare references or broken transit connections with plausible fixtures.

**Resource boundaries.** Preserve bounded request bodies, geometry sizes, external reads, timeouts, cache budgets, source/model leases and retry/daily limits. Public OSRM/Photon/Overpass providers are prototype dependencies, not unlimited bulk APIs. Never add arbitrary client-controlled fetch URLs or a paid fallback while fixing availability.

## Work in a shared checkout

- Keep changes scoped; identify file ownership before parallel agents edit the same subsystem. Share decisions about shared types, API fields and entry points early.
- Do not reset, clean, stash, overwrite or silently stage someone else's edits. Inspect diffs and coordinate when a prerequisite is outside your ownership.
- Follow existing adapters and injection points. Most provider/review tests can be deterministic without network access; do not call Gemini or fetch source posts merely to run a unit test.
- Use the existing runtime rather than replacing it. Confirm ports/process ownership before restarting a shared server or ephemeral emulator.
- Record observations accurately: a successful local build is not a deployed change; an API capability is not an enabled job; an emulator check is not a production account check.

## Verification and finish

Use the [contributor verification matrix](../../CONTRIBUTING.md#verification) to select meaningful checks. Routing/API changes need routing/API tests and production type/build; identity/persistence changes also need the real emulator suite. For UI changes, inspect the actual browser at desktop and phone widths and check Urdu/RTL where affected. Synthetic GPS and intercepted provider data are test inputs and must be identified as such in the handoff.

Update the current subsystem guide and implementation status with tested behavior and limitations. For documentation-only reorganization, validate internal Markdown links, preserved evidence/provenance and script references; do not run a deploy or model probe as a documentation check.

The final handoff should identify what changed, what was checked, what remains limited, and where the code exists. Commit/push only within the owner's authorized workflow. Production deployment, role changes, migrations, source/model execution, paid services and schedule changes require applicable authorization; consult the operations runbooks before proposing them.
