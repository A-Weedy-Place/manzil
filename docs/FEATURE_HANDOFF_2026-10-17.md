# Map polish and street-routing handoff

Feature branch: **`codex/feature-development`**, based on `main` at `34e9e4a`; the preceding branch-workflow commit is `738a4b1`. This feature is developed and verified locally. The deployment developer integrates the branch before releasing it.

## Changes

1. Fixed black patterned map polygons in Clean mode by supplying missing solid fallback colours.
2. Reduced choices to **Classic, Minimal, Night**. Existing Streets/High contrast preferences display Classic; Outdoors is renamed Classic.
3. Added pale-blue light panels; retained the dark palette. Removed the rail's Manzil/ISB footer.
4. Made the header account name visibly interactive and verified it opens Profile. Saved profile names are reflected in the header and profile identity.
5. Removed the prominent street-detour experiment and its special result controls. Public residential streets are considered by ordinary time-ranked routing.
6. Added four focused blockade examples to **Demo closures**, for ten total. **Try route** sets real public test endpoints and uses the normal planner. Synthetic restrictions are labelled and can be cancelled without deleting history.

## Try locally

- Run `npm.cmd run dev:local` on this workstation for the compatible portable runtime and Firebase emulators. On a machine with Node 24.12+/Java 21+, `npm.cmd run dev:firebase` also works.
- Open **http://127.0.0.1:5173/**. Sign in with the seeded **Admin user** account to change shared demo events. This uses local emulators, not production credentials.
- Open **Demo closures → Park Road · F-8 → Try route**. The normal planner should offer a real residential detour and alternatives. Try Rohtas Road/G-9, Tipu Sultan Road/I-8 and Sumbal Road/F-10 too.
- Disable a scenario to compare the reopened road; **Clear demos** cancels all owned catalogue examples. Other enabled closures continue to affect results. Published demo schedules remain fixed; disable/re-enable to reset one around the chosen map time.
- Compare all three map styles with a route displayed, and test light/dark app appearance independently. Click the signed-in header name to open settings.

## Verification and setup

**250 standard tests across 32 files pass**, plus TypeScript/Vite production and compiled backend builds. New coverage includes pattern fills/legacy styles, ordinary residential-route time/access ranking, real-graph detour/reopening, header profile navigation and late demo-response guards. Twelve emulator-suite cases were not rerun; direct browser testing did use real local Auth/Firestore sign-in and shared admin writes. Full dated evidence is in [implementation status](IMPLEMENTATION_STATUS.md).

**No new dependency, environment variable, Firestore rule/index or data migration is required.** Existing map-style IDs remain valid in API/storage. New catalogue fields are optional `suggestedJourney: {origin, destination}` and `includeInBulk: false`; coordinates remain `[longitude, latitude]`. The legacy Park Road fixture API remains compatible. No keys, private records or local test databases are included.

Map styles need internet/WebGL. Street experiments use the bundled Islamabad graph; online national routing still validates returned OSRM candidates and cannot guarantee an arbitrary closure-avoiding detour. No live traffic or real-world navigation accuracy claim is added. The known large map bundle warning remains.

## Release

Fetch and integrate the agreed feature-branch commit(s), resolve any overlapping teammate changes, then run checks on the combined checkout. Follow [FIRST_DEPLOYMENT.md](FIRST_DEPLOYMENT.md): cloud frontend build, API deployment and verification, then Hosting publication to update the pinned API revision. Record the released source commit and service/release identifiers. This handoff does not perform a deployment or change `main`.
