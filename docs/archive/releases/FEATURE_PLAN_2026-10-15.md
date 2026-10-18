# Bilingual journeys and Google Cloud speech

> **Historical record — retained 18 October 2026.** This may contain superseded requirements, UI, activation state or release evidence. It is not a current instruction/runbook. Use the [documentation index](../../README.md) and [current status](../../IMPLEMENTATION_STATUS.md).

**16 October follow-up:** the owner authorized [local/production environment support](ENVIRONMENTS.md). Firebase SDK authentication, server token/admin enforcement and user-scoped Firestore storage now exist for emulator/production configuration, alongside standalone SQLite. Hosted project setup/live deployment and Gemini extraction remain future work. This supersedes earlier statements below that Firebase must stay entirely disconnected; no admin correction dashboard has been added.

Owner-authorized follow-up: explicit dummy normal/admin login is now permitted for localhost development only. The admin dashboard itself remains a discussion draft: [admin proposal](ADMIN_INTERFACE_PROPOSAL.md). See [dev accounts/tour](../../engineering/DEV_ACCOUNTS_AND_TOUR.md) for the actual local behavior; real Firebase identity is still deferred.

Approved direction: English/Urdu interface and speech; guests may plan and navigate; Firebase authentication will be connected later. Google Cloud is the eventual deployment target, but this change does not deploy or publish the project.

Latest owner direction supersedes the original secondary-access simplification: restore Closures for everyone, Activity after sign-in, direct street-detour/demo controls, the route block-point action and the always-visible map Add restriction button. Guests receive a skippable tour on every fresh visit and after sign-out; signed-in users retain remembered first-use/replay behavior. These changes are implemented, with **149 tests passing across 21 files** and a passing production type/build check. New live browser verification remains outstanding.

## Implementation sequence

1. Stabilize polling, route snapshots and persistent map markers. Preserve closure/time validation and camera position. Keep invalidated routes unavailable while new results are calculated.
2. Add a persisted device language preference, English/Urdu translations, Urdu RTL layout and language-aware dates. Keep coordinates, map bearings and left/right navigation semantics unchanged.
3. Add Google Cloud Text-to-Speech behind the server API using Application Default Credentials (local gcloud credentials now; attached service identity on Cloud Run later). Restrict requests to structured navigation prompts, deduplicate/cache audio, meter characters durably and limit concurrency. Never ship service credentials to the browser. No live synthesis without explicit configuration.
4. Add automatic foreground GPS recovery, accuracy-aware sustained deviation detection, request/session guards, retries with backoff, cancellation of obsolete speech, bilingual maneuvers and route revalidation on closure changes. Preserve unvisited stops; do not silently bypass them.
5. Provide account/sign-up/reset screens and a guest path. Firebase remains disconnected; never simulate a real sign-in or store passwords. Personal cloud features explain that account connection is pending. Existing local development data remains private and preserved.
6. Keep Map, Closures, Saved and Profile directly accessible, with Activity added after sign-in. Show Try street detour and Demo closures in the planner, Block a point on this route in results, and Add restriction on the map. Help retains replay/source shortcuts. Use an accessible, skippable/replayable spotlight tour on every guest visit and after sign-out, with device-local first-use completion for signed-in users. Dismissing the tour does not cause it to reopen during ordinary navigation or polling; tours never create closures or request GPS permission.

## Verification

Meaningful regression tests for update stability, stale route guards, off-route jitter/backoff, stop preservation, bilingual instructions, cloud cache/budget/concurrency/error handling and credential-free unavailable responses. Run routing/API suite and production TypeScript/build checks. Attempt browser checks in both languages and mobile layouts; record actual availability. Outdoor GPS, cloud audio pronunciation and real Firebase authentication require the corresponding device/account configuration and must not be reported as verified without it.

## Deployment follow-through

Cloud Run hosting still needs production host/origin policy, authentication/authorization, per-user records, admin closure publishing, hosted durable storage/cache/budget accounting and job scheduling. Local SQLite counters/cache are suitable for one process, not a global multi-instance spending cap. Budget alerts are not hard spending caps. The expired welcome trial is not required to use applicable monthly TTS free allowances with active billing.
