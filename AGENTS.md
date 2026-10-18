# Manzil workspace

**Latest deployed release:** PR #4 merged at 33b5af5; frontend Urdu correction f4a1460. API 00016-zll, private worker 00013-2g6, Hosting a55c56530ffd0f97 with API pin fh-5a3d9adde787598e. Clear road/Metro closures auto-publish; unknown expiry is 48 hours and a matching reopening ends it early. Metro updates Local services. 195 relevant tests + 11 focused emulator cases, cloud build and focused live checks pass. Real live-alert publication was not observed in this release check. See implementation status for precise evidence.

**Approved current integration (18 October):** preserve feature PR #4 admin/fare/password recovery and documentation/licensing work alongside main fuel/cloud voices and shared labelled demos. Explicit, precisely resolved road and Metro closures publish automatically; unresolved scope remains in review. Unknown expiry is provisionally **two days**, ending earlier on matching reopening evidence. Metro notices update Local service availability. Reassess pending saved work without new model calls; preserve admin overrides. No bundled/offline Urdu voice pack. Run only relevant tests. See [current policy](docs/operations/SELECTIVE_AGENT_PUBLICATION.md) and implementation status for actual validation/deployment.

## Start here

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), [implementation status](docs/IMPLEMENTATION_STATUS.md) and [ARCHITECTURE.md](ARCHITECTURE.md) before changing scope. Follow [CONTRIBUTING.md](CONTRIBUTING.md); the [agent guide](docs/engineering/AGENT_GUIDE.md) maps subsystems and verification. [docs/README.md](docs/README.md) is the documentation index. Original requirements and release evidence are retained in its clearly marked archive.

## Current working boundary

- Feature work is on `codex/feature-development`; preserve teammate changes and uncommitted work. Never force-push shared history.
- Application feature work is tested on localhost. Licensing/public-project documentation and release tags must preserve the distinction between the deployed source and this feature branch. Do not deploy, merge `main`, change repository visibility, activate external/model jobs or change production roles without the owner's instruction.
- Previously deployed services and integration code exist. A feature-branch push does not establish that its features are live. The user's next Gemini reasoning work remains a separate scope; do not activate/extend the existing bounded integration by inference.
- Archives are historical evidence, not current instructions. Older automatic-publication preferences or city-only restrictions are superseded by current guides and owner requests.

## Invariants

- Use GeoJSON **[longitude, latitude]** throughout domain/API contracts. UI scheduling uses **Asia/Karachi**; persist unambiguous instants.
- Preserve directed-road access, closure geometry/time/traversal checks, revision guards and explicit unavailable states. Never fabricate geometry, routes, fares, timetables, source completeness or weather.
- Guests do not publish. Ordinary reports stay private pending review. Verified contributors/admins review community reports; clear agent road/service changes publish after validation; uncertain changes require administrator approval.
- Enforce current server authority and private UID ownership. Keep model credentials worker-only and service boundaries authenticated. Standalone SQLite is trusted single-user development, not production authentication.
- Personal travel collection requires opt-in. Preserve consent revocation, retention, deletion/export and navigation accuracy/freshness gates. Synthetic fixtures do not verify live source access or real-device GPS accuracy.

## Handoff and verification

Keep `docs/IMPLEMENTATION_STATUS.md` and affected API/routing/source guides current with actual tested behavior and material limitations. Run meaningful routing/API tests for behavior changes, isolated Firebase checks for identity/storage changes and production frontend/server checks before application handoff. Documentation-only changes require link/anchor validation and `git diff --check`; do not claim tests you did not run.

Do not commit local databases, GPS traces, raw source archives, API keys, browser profiles, session credentials or emulator exports. Keep ignored runtime data intact during cleanup. Project-specific release YAML must not be applied to another project unchanged.

## Licensing and releases

Original code/docs use MIT; keep THIRD_PARTY_NOTICES.md exclusions and upstream rights intact. Do not relabel the mixed transit data or Survey of Pakistan-derived outline as MIT. The owner plans public visibility; do not change visibility or rewrite history implicitly. Release tags identify exact source commits; never tag feature HEAD as deployed without matching deployment evidence. Releases do not deploy code.
