# Local implementation status

Local core delivered 14 October 2026; map/routing/profile/navigation redesign implemented 15 October. This document records tested behavior and limitations. Full retained scope: [PROJECT_CONTEXT](../PROJECT_CONTEXT.md). Current UX and integration details: [15 October redesign](REDESIGN_2026-10-15.md).

## Initial analysis and implementation sequence (14 October)

1. **Shared contracts and local shell:** React/TypeScript/Vite, Leaflet, Express, Node 22.13+, local persistent storage. Defined GeoJSON coordinate order and domain models.
2. **Real routing data:** obtain bounded OSM roads for Islamabad, retain ODbL provenance, build an actual directed car graph. Route locally without keys, respecting accessible roads and reviewed closure geometry/time. Return unavailable outside coverage or when disconnected.
3. **Map/editor:** origin/destination selection and search, point/road/area drawing, editable vertices and coordinate alternatives, event details, schedule, drafts/publication/cancellation, layer visibility and geometry export/import.
4. **Journey planning:** actual path, distance, estimated duration, road sequence, closure explanation, validated detour and bounded departure alternatives. No live traffic or turn-by-turn navigation claim.
5. **Recurring commutes and local alerts:** repeat-day/time persistence, occurrence checks and in-app impact inbox. Closed-browser notification infrastructure remains deployment work.
6. **Source handoff:** isolated public X browser adapter, 15-minute due times, ID/content revision deduplication, original timestamps, durable pending-agent queue, explicit partial/blocked coverage, manual notice import. User builds the Gemini reasoning agent later.
7. **Personal activity:** explicit foreground geolocation recording, local history summaries, deletion and separate road-discovery contribution consent. No automatic road publishing.
8. **Verification and handoff:** meaningful routing/API/source tests, type/build check, actual browser workflows at desktop/mobile size, localhost startup instructions, update README and push private repository.

## Current progress

| Area | Status |
| --- | --- |
| Repository research, brand and full feature context | Present |
| Shared types / npm scaffolding | Implemented and installed; Node 22.20.0 |
| Local graph and routing | Real bounded OSM graph; ordered stops; 33 routing + ten geometry-cache tests pass |
| Local API/storage/source/profile | Persistent SQLite; 32 backend/source/profile/demo tests pass |
| Map/editor/interface | Five map styles, shared timeline, red road coating without enclosing polygons, cached/deduplicated overlays; ten frontend overlay/source tests pass |
| Personal notifications | Saved + consented inferred journeys; opt-in browser delivery; six notification guard tests pass |
| Navigation | Route preview and approximate foreground GPS/voice guidance; 15 navigation tests pass |
| Browser verification | New renderer inspected at 1280×800 and small-phone size; workflow evidence below |
| Build and tests | Type/build passes; 106/106 tests pass; last dependency audit reports zero vulnerabilities |
| Live X collection | Scheduler and collector implemented; this network rejected navigation, so live retrieval is unverified |
| Gemini, Cloud deployment and external push | Deferred to the owner as requested |

## Local versus planned Cloud adapters

The localhost request takes precedence over the earlier deployment proposal. The local router uses the bundled OSM graph without an ORS key. SQLite avoids requiring Firebase credentials. Since 15 October, MapLibre/OpenFreeMap vector tiles replace Leaflet/MapTiler; no map key is required. The 15-minute X choice supersedes the earlier RSS/WhatsApp priority. The Cloud/agent design in MANZIL_ARCHITECTURE.md remains a future target.

## Initial evidence log (14 October)

- Initial repository contained documents/branding only; no application code.
- Runtime detected: Node 22.20.0, npm 10.9.3, Windows PowerShell.
- Real OSM snapshot timestamp: **2026-10-14T18:17:34Z**. Extent: west 72.97, south 33.60, east 73.16, north 33.75. Runtime graph: **99,777 nodes / 203,828 directed edges**. Source, integrity hashes, license and import instructions are tracked under `assets/routing/` and [ROUTING.md](ROUTING.md).
- `npm test`: **31/31 passing**, four files, including a detour over the actual bundled graph, direction/access/topology, time-overlap and unavailable routing, persistence/revisions, geometry validation, commute occurrences, notice deduplication/outbox and GPS retention.
- `npm run build`: **passes** TypeScript checking and Vite production bundling. Main output approximately 447 kB JavaScript / 136 kB gzip and 47 kB CSS / 14 kB gzip. Basemap tiles are loaded as needed; there is no 3D renderer.
- `npm audit`: **0 vulnerabilities** after upgrading the test runner to Vitest 5.0.4. This is dependency-audit evidence, not a production security assessment.
- Live local health and frontend requests returned HTTP 200. API reports the graph ready. The retained dev processes serve http://127.0.0.1:5173/ and http://127.0.0.1:3001/.

## Browser workflow evidence

Actual Chromium-based in-app browser checks on 14 October 2026:

1. Opened the working map at 1280×720; OSM tiles, attribution, Urdu logo and controls rendered. Checked 375×812 mobile layout; no horizontal document overflow, the map remained usable above controls, and navigation/layer controls had accessible labels. Restored the ordinary viewport afterward.
2. Planned a real Faisal Mosque approach → Centaurus road journey. Added a clearly labelled synthetic closure on the path and obtained a connected detour and departure alternatives. Route estimates are explicitly without live traffic.
3. Selected an endpoint by clicking the map: the field changed to the selected coordinates and the prior plan cleared. Also exercised typed coordinates and local place search.
4. Saved a high-precision point restriction, changed its schedule to **15 October 17:00–18:00 PKT**, changed another field and verified that the schedule survived the rerender and persisted. Corrected HTML coordinate-step and date-input handling issues found by these checks.
5. Saved a weekday **17:00** demo commute. After a page reload it remained present. **Check next departure** opened **15 October 17:00 PKT**, detected the future synthetic restriction, and offered a validated detour, **16:50** earlier departure and **18:00** later departure. An in-app impact alert was generated.
6. Imported a labelled synthetic notice through Updates. It entered the durable pending-agent queue without creating a closure. Dismissed the test notice afterward so a future agent will not process fabricated evidence.
7. Inspected source failure and next-check information. Both installed Edge and official isolated Playwright Chromium launched in source smoke tests, but X navigation failed; Chromium reported `ERR_HTTP_RESPONSE_CODE_FAILURE`. No source item was fabricated and no successful scrape is claimed.

Local synthetic restrictions and the commute are labelled **Demo** and stored only in the ignored SQLite database. They can be cancelled/removed through the app. Unsaved editor work and a route result are memory state; they are not claimed to survive reload.

## 15 October redesign evidence

- The owner's Safar Android attribution screenshot identifies MapLibre/OpenFreeMap/OpenMapTiles/OSM. Replaced the old raster renderer while retaining the closure editor, geometry previews, coordinate entry and actual local road graph.
- New routes are genuine distinct same-time choices, separate from departure changes. Algorithm tests prove closure validation, physical diversity, bounded search and uninflated ETAs.
- Browser checks exercised three driving cards/time labels, map selection, navigation preview/next step, point placement and an arrow-key adjustment with high-precision coordinates, persisted theme preferences and visible red closure markers. Light/dark basemaps both loaded. Attribution duplication was removed; route-label placement recalculates on viewport moves.
- New-renderer responsive checks: **1280×800**, **375×812**, and **812×375**. No horizontal document overflow in phone or landscape checks. Expanded phone controls measured 607 px high; collapsed controls retained a ~327 px map. Selecting an alternative card selected its map label, and clicking the map time label selected the matching card. The viewport override was reset after testing.
- Found and corrected a stale Leave now form timestamp: now-based searches use request time, while manually entered schedules remain fixed. Route results reset panel scroll to show the first option. Stale profile reload responses cannot overwrite newer preferences.
- Production map code is split from the shell. Measured output: shell JS ~323 kB / 100 kB gzip, map JS ~1,068 kB / 293 kB gzip, worker ~506 kB, CSS ~137 kB / 22 kB gzip. Vite warns about the renderer chunk size. This is not smaller than the original raster download; WebGL/device performance remains a real tradeoff.
- **67 tests passed across eight files**, plus the full production type/build check. Dependency audit reports zero vulnerabilities after MapLibre installation and removal of unused Leaflet dependencies.
- GPS/voice/OS delivery rely on mocked fixtures in automated checks. No real outdoor navigation, browser location permission or OS notification permission was exercised. New initial alerts are seeded quietly, and disabled/old/read alerts cannot be replayed by enabling preferences.

## Practical boundaries and remaining work

### Overlay simplification and latency

Removed ordinary closure polygon fill/outlines as requested; actual red road strokes remain. Red-road requests no longer wait 180 ms, and unchanged active sets are cached across clock ticks. Repeated source data is not sent back to map workers; unchanged polled closures and route arrays retain their references. Style swaps preserve local layers and data with idempotent installation. Backend intersections now use bounded graph/content caches with edit, deadline and mutation-isolation regression tests. The full suite has **106 passing tests in 13 files** and the production type/build check passes. A fresh-page Find routes check showed lines in the first captured screenshot; Outdoors/Night swaps retained them without new rendering errors. The actual local graph benchmark reduced repeated geometry work from **23.45 ms to 0.07 ms median**, and its three-option plan from **112.73 ms to 95.88 ms**; first computation was not faster. This is not a whole-map/low-end-device benchmark. Full method and limits are in [PERFORMANCE.md](PERFORMANCE.md). Current output is approximately 337 kB shell JS, 1,069 kB map JS, 506 kB worker and 144 kB CSS; the existing map-chunk warning remains.

### Map time, closed roads and stops

Implemented the owner's next testing feedback on 15 October. [Map time and stops](MAP_TIME_AND_STOPS.md) documents all controls and contracts; [demo guide](DEMOS.md) describes the six scenarios.

- Removed the basemap minimum zoom restriction; actual browser testing reached a world view. Routing still uses the existing central-Islamabad extract.
- Replaced published-equals-red behavior with exact snapshot state. Active road edges are thick vivid red, future markers amber, ended events hidden. The map and router share the exact graph/polygon intersection helper. Full graph edges are painted; this is not a claim that the entire named road is blocked.
- Conflicting original routes are pale red and labelled Blocked. They are not selectable. Blue cards and lines are validated options for the selected time; earlier/later departures change the global timeline before replanning. A time option cannot enable navigation at the wrong map time.
- Added a large top clock with Now and scheduled PKT date/time, automatic planned-journey refresh, closure boundary updates, sequence/stale guards, preserved camera, and no redundant recalculation when confirming an unchanged scheduled instant. Removed the tagline and repeated introductory marketing/explanation blocks.
- Added up to five ordered stops: search/map selection, numbered draggable markers, reorder/remove/reverse, continuous turn/time-aware search and saved-commute persistence. Public mapped residential streets remain routable; a new test proves a residential detour around a closed primary road while a private shortcut is excluded. GPS for stop journeys remains disabled pending remaining-stop tracking; route preview works.
- Added six persistent toggleable Demo scenarios. Four active examples now leave the default Centaurus endpoint clear; a real-graph test verifies three connected, closure-free alternatives with all four enabled. Aabpara demonstrates future timing and Zero Point an expired event. Existing ordinary closures are not changed. The local test database was seeded through these controls and remains ignored.
- **91 tests pass across 11 files**, plus the production type/build check. Output is approximately 337 kB shell JS / 105 kB gzip, 1,069 kB map JS / 293 kB gzip, 506 kB worker and 144 kB CSS / 23 kB gzip. The existing map-chunk warning remains.
- Browser checks at default desktop size, **375×812** and **667×375**: clock/date picker, date application, return to Now, unchanged schedule confirmation, active/future/ended markers, pale red unavailable baseline, six-demo add/clear/re-add, three detours and map ETA labels, intermediate PIMS stop and its navigation preview, world zoom, and no horizontal document overflow. At 18:30 the sample closures disappeared and the original route returned. The mobile picker measured 320 px wide within the viewport. No real GPS permission or OS notification permission was granted. Temporary viewport overrides are reset before handoff.

### Colour refinement

The owner found Positron too grey. Added five persisted, independently selectable basemap palettes and a direct **Style** button with illustrated choices. **Streets** now uses colourful Liberty; Outdoors uses Bright; High contrast strengthens road/label colours; Minimal and Night remain options. The local profile migration preserves previous settings/timestamps. Actual browser checks confirmed the colourful default, style selection and route-option preservation. A light app with a Night map was verified independently. **69 tests pass** and production type/build passes. Current bundle is approximately 332 kB shell JS / 103 kB gzip, 1,066 kB map JS / 292 kB gzip and 139 kB CSS / 22 kB gzip. See [MAP_STYLES.md](MAP_STYLES.md).

- **X access:** an enabled local server attempts the fixed public profile every 15 minutes. Network/browser restrictions, login walls, incomplete timelines and missing media text can prevent or limit capture. Do not interpret a failed/partial check as an absence of closures. Manual notice import remains usable. See [INGESTION_IMPLEMENTATION.md](INGESTION_IMPLEMENTATION.md).
- **Gemini:** no extraction model or automated road publication runs yet. The future agent should consume pending notices, preserve evidence, propose geometry/timing and use review before publication. Current closure APIs and outbox contracts are documented in [API.md](API.md).
- **Routing/navigation:** bounded central Islamabad coverage, ordinary speed estimates and conservative polygon exclusions. No live traffic, lane guidance or transit. The geometry-derived foreground guide is approximate and does not continuously resimulate temporal closures against actual GPS delays. A polygon may cover stacked roads conservatively. Bounded search can miss a real-world alternative.
- **GPS:** consent, recording UI, storage/summary calculations and retention are implemented; no real outdoor GPS journey or browser permission was exercised during QA. Device sleep/background recording is not guaranteed. No trace is uploaded and no learned road is added automatically.
- **Notifications/profiles:** checks require the backend to run; browser delivery requires an open page and explicit permission. The profile is local and shared by clients of this single-user server. Reliable closed-app push, authentication and per-user data isolation remain deployment work.
- **Performance:** bundle size and responsive layouts were checked; low-end physical-device profiling, concurrent-user load and production operation were not tested.
- **Roadmap/context:** original crowd reporting, transit/Metro, multilingual source analysis, live traffic, privacy-route and reviewed learned-road features remain in [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md). They have not been dropped or labelled implemented.

## Next developer sequence

1. Run the local app and validate the core commute demo with the owner; polish the interface before October 17.
2. Add the owner's Gemini agent against the documented outbox and closure contracts, including ambiguity/reopening tests and human review.
3. Verify source access on the intended runtime/network; keep source-health and manual intake visible.
4. Integrate the chosen Google Cloud services and production user/data isolation when deployment begins. Revisit hosted routing/coverage only if the local graph no longer fits the intended scale.
