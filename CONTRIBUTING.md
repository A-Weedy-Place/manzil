# Contributing to Manzil

Manzil is a shared project preparing for public source distribution. Original code/documentation use MIT; third-party material retains its own terms. Keep changes reviewable, preserve data provenance and separate application development from live operations.

## Start here

1. Read [AGENTS.md](AGENTS.md), [project context](PROJECT_CONTEXT.md) and [implementation status](docs/IMPLEMENTATION_STATUS.md). The status distinguishes current source work from the deployed release.
2. Read [architecture](ARCHITECTURE.md), then the subsystem guide linked there. For a first checkout, follow [local development](docs/engineering/LOCAL_DEVELOPMENT.md).
3. Inspect your branch and working tree before editing: `git status --short --branch`. Preserve another developer's changes and named backup stashes.
4. Use the owner's agreed branch. New development branches use `codex/` unless another name is requested. Do not merge, rebase shared history or deploy as a side effect of a feature task.

## Local setup

Use Node **24.12+** and install the locked dependency graph:

```bash
npm ci
```

Choose a runtime deliberately:

| Command | Purpose |
| --- | --- |
| `npm run dev:firebase` | Recommended account-aware development with loopback Auth/Firestore emulators; requires the Firebase emulator prerequisites described in the setup guide. |
| `npm run dev` | Loopback single-user SQLite development; not a simulation of production user isolation. Copy `.env.example` only after reviewing its source-fetch setting. |
| `npm run config:check` | Inspect environment compatibility before connecting the client and server. |

The web app normally opens at `http://127.0.0.1:5173/`. Optional Windows bundled-runtime commands and alternate ports are documented in [local setup](docs/engineering/LOCAL_DEVELOPMENT.md). Do not replace an existing working environment or start another emulator stack on occupied ports without checking first.

Sample profiles and synthetic GPS histories are emulator-only development aids. Never import them into a real project. Routine tests should inject source/provider responses instead of fetching live posts or invoking Gemini.

## Implementation conventions

- Keep domain/API coordinates in GeoJSON `[longitude, latitude]`; schedule in `Asia/Karachi` and send timezone-qualified timestamps.
- Validate writes on the server with the shared contract and `server/validation.ts`. UI restrictions are not authorization.
- Preserve approval, ownership, access, selected-time and expected-revision checks. Never solve a stale-write error by dropping a revision field.
- Preserve cancellation/account guards for async UI and location/speech work. Keep prior valid route overlays visible while a background refresh completes.
- Keep uncertain data explicit. No invented road connectors, operator schedules, fares, live traffic or evidence.
- Use the existing adjacent settings/detail panels, responsive layout and English/Urdu translation pattern. Keep important labels and controls visible; avoid explanatory paragraphs where a label/status is enough.
- Prefer meaningful behavior tests over tests that duplicate implementation details. Add regression coverage when changing routing, moderation, async races or privacy.

## Verification

Run checks that cover the change, followed by the appropriate production build. Examples below use checked-in test names; select all affected tests rather than treating an example as an exhaustive list.

| Change | Important coverage |
| --- | --- |
| Driving, road geometry or editor | `routing*.test.ts`, `rerouting.test.ts`, `closure-types-routing.test.ts`, `road-selection.test.ts`, `road-coverage*.test.ts`, `blockade-api.test.ts`; inspect real mapped-road examples when relevant. |
| Auth, moderation, directory or persistence | `community*.test.*`, `api-identity.test.ts`, affected `server*.test.ts`, `agent-store.test.ts`; run real Auth/Firestore emulator tests. |
| Source, model or review | `source*.test.ts`, `agent*.test.*`, `gemini.test.ts`, `pipeline.test.ts`; retain private-worker and mandatory-review boundaries. |
| Local routes / notices / fares | `transit*.test.*`, `agent-transit*.test.*`; verify gaps, direction/scope, selected-time changes and source provenance. |
| Location, navigation or travel data | `location*.test.ts`, `navigation*.test.*`, `travel*.test.*`, trip-history/sharing and account-change tests. Use synthetic fixes for deterministic QA. |
| UI, profile or entry | Relevant component tests, production type/build, actual browser desktop and phone checks; check keyboard use, overflow and Urdu where affected. |
| Documentation only | Check links, paths and commands against the repository, and distinguish code capability from live deployment. No live service activation is needed. |

```bash
npm test -- --maxWorkers=4
npm run build
npm run build:server
# When Auth / Firestore / roles / persistence behavior changes:
npm run test:firebase
```

`npm run build` includes TypeScript checking and the client build. `build:server` bundles the Node service. `build:cloud` additionally enforces a real Firebase frontend configuration; it builds artifacts and does not deploy them. Emulator tests are a separate run, not a claim that skipped cases passed in the ordinary suite.

## Documentation and handoff

Update [implementation status](docs/IMPLEMENTATION_STATUS.md) and the relevant API, routing, data or operations guide when behavior changes. Keep the README an entry point; put detailed contracts and limitations in their subsystem guide. Keep old proposals in the archive rather than copying their assumptions into current docs.

A useful handoff states the resulting behavior, meaningful tests run, material limitations and whether the work is local, pushed or deployed. For a pull request, describe the final implementation and validation without reproducing the conversation or every interim attempt.

Before staging, review the diff and untracked files. Exclude `.env` files with values, keys, service-account credentials, databases, GPS traces, browser profiles, source archives and generated build/QA output. Commit only intentional source, bounded public derivatives/provenance and documentation. Use the lockfile for dependency updates.

## Live operations

Read [deployment guidance](docs/operations/DEPLOYMENT.md), [source operations](docs/operations/DEPLOYMENT.md) and [Gemini operations](docs/operations/GEMINI_INTEGRATION.md) before proposing infrastructure changes. Deployment, production role changes, data migration, paid-service activation, source/model execution and schedule changes need the owner's applicable authorization. A feature request or successful local test is not an instruction to perform those operations.

Agents should also follow the [agent onboarding guide](docs/engineering/AGENT_GUIDE.md).

## Licensing contributions

Original code/documentation contributions are submitted under the project's [MIT License](LICENSE). Preserve upstream notices and source provenance; do not introduce third-party data/artwork with assumed permissions. Read [third-party notices](THIRD_PARTY_NOTICES.md) before redistributing datasets or releasing a commercial product. Repository visibility is an owner-controlled setting; package.json's `private: true` only prevents accidental npm publication.

For vulnerability reports, follow [SECURITY.md](SECURITY.md). Do not put credentials, private source evidence or GPS histories in public issues.
