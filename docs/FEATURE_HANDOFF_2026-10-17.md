# Community accounts, fuel, routing and map handoff

Feature branch: **`codex/feature-development`**, based on `main` at `34e9e4a`. Retains branch-workflow commit `738a4b1` and map-polish commit `9f902c2`, then adds the community implementation described here. Use the feature branch's current head for integration. Everything in this handoff was developed/verified locally; the other developer integrates and releases it.

## Changes

**Latest fuel extension after community commit `0f9751a`:** Profile stores an optional car/motorcycle, label, petrol/diesel and km/litre. Each route shows an approximate PKR/litre-consumption cost from a dated PSO reference; Activity provides week/month/all-retained estimates from fixed trip snapshots. Missing vehicle/price history stays unpriced. Source checks run once per PKT day in the local standalone/emulator worker, and Admin Pipeline exposes a bounded check. No keys/packages or schema migration are required. [Fuel source and calculation guide](FUEL_COSTS.md), [API](API.md).

1. Login-first entry with visible guest skip; regular users open the planner, admins open Control centre. Server-enforced guest/regular/verified/admin access.
2. Ordinary reports/photos stay pending until verified contributor/admin review. Published approved blockades are shared. Author/reviewer identities come from the server; optimistic revisions prevent stale review. Admins verify/unverify contributors and edit/cancel blockades. Source/demo controls remain admin-only.
3. Two-endpoint **Road section** selection follows connected named Islamabad roads, with keyboard input and explicit errors. Point/Draw/Area remain available. Expandable cards emphasize place and PKT times, then show photos, notes and provenance.
4. Profiles add photo/city/coarse area and prominent default-off personal trip consent. Navigation can retain qualifying foreground trips only after opt-in. Three usable independent-day observations enable usual-journey proposals and private historical-corridor closure alerts; the fresh planner still supplies validated alternatives. Revocation/account switching blocks pending capture and inferred writes. [Data/retention limits](PERSONAL_TRAVEL_DATA.md).
5. Inspect the blocked original's estimate separately from navigable alternatives. Pale-red original geometry excludes shared blue portions; its badge avoids blue-route overlap. Required return stops no longer incorrectly suppress alternatives. Up to three real alternatives, with an explanation if fewer exist; no fabricated paths or live-traffic estimates.
6. Admin Pipeline displays actual disabled/partial/error/notice state without implying successful collection or Gemini extraction. New interfaces are translated into Urdu. [Permissions/contracts](API.md), [routing](ROUTING.md).

Retained map work from `9f902c2`:

1. Fixed black patterned map polygons in Clean mode by supplying missing solid fallback colours.
2. Reduced choices to **Classic, Minimal, Night**. Existing Streets/High contrast preferences display Classic; Outdoors is renamed Classic.
3. Added pale-blue light panels; retained the dark palette. Removed the rail's Manzil/ISB footer.
4. Made the header account name visibly interactive and verified it opens Profile. Saved profile names are reflected in the header and profile identity.
5. Removed the prominent street-detour experiment and its special result controls. Public residential streets are considered by ordinary time-ranked routing.
6. Added four focused blockade examples to **Demo closures**, for ten total. **Try route** sets real public test endpoints and uses the normal planner. Synthetic restrictions are labelled and can be cancelled without deleting history.

## Try locally

- Run `npm.cmd run dev:local` on this workstation for the compatible portable runtime and Firebase emulators. On a machine with Node 24.12+/Java 21+, `npm.cmd run dev:firebase` also works.
- Open **http://127.0.0.1:5173/**. Continue as guest for planning, or use the seeded **Normal user/Admin user** sign-in buttons. These use local emulators, not production credentials. Admin starts in Control centre.
- Admin **People → Verify** the normal account to test direct publication/review, then remove verification to test pending reports. Verification never grants admin. Re-login or refresh state as that account to reflect the new role.
- As regular user, **Add restriction → Road section**, choose two points on one connected road, set PKT times and optionally attach photos; submit for review. Admin/verified contributors approve/reject in Closures or admin Blockades. An unapproved event must not appear in another ordinary account's map/routing.
- Open the header name to edit Profile. Personal trip data starts Off. Enabling it is separate from granting browser GPS permission, and collection only happens during foreground GPS navigation or explicit Activity recording. Do not use real private traces for shared QA.
- In Profile **Your vehicle**, set an optional name, Car/Motorcycle, Petrol/Diesel and mileage in km/litre; **Save vehicle**, then plan a route. Expand Fuel prices for the effective date/source/check time. Empty mileage disables estimates. Vehicle selection does not enable GPS or motorcycle-specific routes. Activity's period selector shows priced/unpriced retained trips; old history is not retroactively assigned today's vehicle.
- Open **Demo closures → Park Road · F-8 → Try route**. The normal planner should offer a real residential detour and alternatives. Try Rohtas Road/G-9, Tipu Sultan Road/I-8 and Sumbal Road/F-10 too.
- Disable a scenario to compare the reopened road; **Clear demos** cancels all owned catalogue examples. Other enabled closures continue to affect results. Published demo schedules remain fixed; disable/re-enable to reset one around the chosen map time.
- Compare all three map styles with a route displayed, and test light/dark app appearance independently. Click the signed-in header name to open settings.

## Verification and setup

**334 standard tests across 43 files and 15 real Auth/Firestore emulator tests pass (349 total across 44 files)**. Production TypeScript/Vite, compiled backend and cloud-configured frontend/backend builds pass. The cloud check uses explicit public build placeholders and is not a deployed-site test. Coverage includes community/account/routing guards and the new fuel parser/day cache/history, vehicle races, immutable trip estimates, private aggregates and price UI. The emulator run also exercises compiled API/worker startup and real Firestore fuel privacy. Full evidence is in [implementation status](IMPLEMENTATION_STATUS.md).

Actual browser checks used local Firebase sign-ins, verified/unverified the demo traveller, selected a connected Park Road section, attached a valid test image, submitted it as a regular user and approved it as admin. The QA closure was then cancelled with evidence retained. Pipeline showed Disabled/Not checked/partial coverage; no source retrieval was triggered. G-9 returned three real street alternatives (about 3/4/5 minutes) and an inspectable unavailable two-minute original. Desktop/phone layout checks are recorded in current status. No real GPS or OS permission was exercised. Ignored proof JPEGs are local artifacts and must not be committed.

**No new dependency, environment variable, Firestore rule/index or data migration is required.** Optional backward-compatible profile/closure fields and trusted contributor metadata are created on first use. Missing consent flags mean Off; legacy published records remain readable. Firebase runtime identity must be able to get/list Auth users for People (the first deployment documents `roles/firebaseauth.viewer`); a permission failure returns explicit 503. Do not change IAM implicitly. Photos are bounded data URLs in existing documents, not a new Storage bucket: at most two closure images, each at most 150 KB decoded, and a bounded personal profile image. Polls omit photo content; authorized detail loads it. No keys, private records or local test databases are included.

Map styles need internet/WebGL. Road-section selection uses the bundled Islamabad graph only. Pakistan-wide online routing validates returned OSRM candidates but cannot guarantee arbitrary closure-avoiding detours or three distinct safe choices. Estimates exclude live traffic. Observed GPS paths are private historical warnings, never automatic road imports/navigation routes. Recording is foreground-only; browser shutdown/network loss can lose unsaved fragments. Reliable closed-app alerts need the separately deployed private worker/push integration. Gemini, cloud speech activation and agent replay/audit overrides remain future work. The existing large map bundle warning remains.

Fuel collection needs outbound HTTPS to PSO. A production worker can accept authenticated `{"job":"fuel"}` on `/internal/tick`; do not activate paid scheduling or deploy implicitly. The existing commutes worker also performs the daily coalesced check. PSO reference prices exclude outlet freight; estimates are not receipts and future rates can change. Exactly one attempt is allowed per PKT date, including failures, so a failed initial source check stays unavailable until the next daily opportunity. No direct browser scraping, guessed old expenses or automatic GPS permission is introduced.

## Release

Fetch and integrate the agreed feature-branch commit(s), resolve any overlapping teammate changes, then run checks on the combined checkout. Follow [FIRST_DEPLOYMENT.md](FIRST_DEPLOYMENT.md): cloud frontend build, API deployment and verification, then Hosting publication to update the pinned API revision. Record the released source commit and service/release identifiers. This handoff does not perform a deployment or change `main`.
