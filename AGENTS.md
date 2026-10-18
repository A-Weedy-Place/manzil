# Manzil workspace

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
- Guests do not publish. Ordinary reports stay private pending review. Verified contributors/admins review community reports; **every agent map/service change requires administrator approval**.
- Enforce current server authority and private UID ownership. Keep model credentials worker-only and service boundaries authenticated. Standalone SQLite is trusted single-user development, not production authentication.
- Personal travel collection requires opt-in. Preserve consent revocation, retention, deletion/export and navigation accuracy/freshness gates. Synthetic fixtures do not verify live source access or real-device GPS accuracy.

## Handoff and verification

Keep `docs/IMPLEMENTATION_STATUS.md` and affected API/routing/source guides current with actual tested behavior and material limitations. Run meaningful routing/API tests for behavior changes, isolated Firebase checks for identity/storage changes and production frontend/server checks before application handoff. Documentation-only changes require link/anchor validation and `git diff --check`; do not claim tests you did not run.

Do not commit local databases, GPS traces, raw source archives, API keys, browser profiles, session credentials or emulator exports. Keep ignored runtime data intact during cleanup. Project-specific release YAML must not be applied to another project unchanged.

## Licensing and releases

Original code/docs use MIT; keep THIRD_PARTY_NOTICES.md exclusions and upstream rights intact. Do not relabel the mixed transit data or Survey of Pakistan-derived outline as MIT. The owner plans public visibility; do not change visibility or rewrite history implicitly. Release tags identify exact source commits; never tag feature HEAD as deployed without matching deployment evidence. Releases do not deploy code.
