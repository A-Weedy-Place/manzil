# Manzil: product context to retain

Owner's instructions, updated 16 October 2026. Team of two; usable prototype target October 17, leaving time for UI polish. Project/team name **Manzil (منزل)**, Urdu for destination. Brand artwork is in assets/brand. Keep the private GitHub repository private. Run locally now; the owner will arrange deployment later.

## Current build request

**Environment follow-up (16 October):** Node has been upgraded from 24.11.1 to **24.22.0**, with npm **11.19.1**; the configuration checker confirms the Node requirement is satisfied. Use `npm.cmd` in Windows PowerShell when `npm.ps1` is blocked. The recommended local authentication/storage workflow is `npm.cmd run dev:firebase`; standalone `npm.cmd run dev` remains available. Keep the [environment guide](docs/ENVIRONMENTS.md) and [implementation status](docs/IMPLEMENTATION_STATUS.md) current. Discuss the initial deployment procedure next; no deployment or paid model activation is authorized by this documentation update.

**Local/production parity (16 October):** owner authorized implementing one codebase for local development and future production; do not deploy yet. Preserve standalone SQLite mode. Add recommended Auth/Firestore emulator development and the same Firestore adapter for production, verified Firebase tokens/custom admin claims, private user records, validated environment configuration, durable speech cache/budgets, compiled backend/container/Hosting configuration, and an authenticated external worker boundary. Cloud startup must reject local/emulator fallback. Gemini extraction remains future integration work; the admin dashboard/audit/override proposal remains unimplemented. Costs must be bounded without assuming trial credits. See [environment guide](docs/ENVIRONMENTS.md). After implementation, report required environment setup, then discuss the initial deployment plan separately.

**Restore direct controls (15 October):** keep Closures in primary navigation for everyone and Activity there for signed-in users. Restore the visible street-detour action, demo catalogue, route block-point action and always-visible map Add restriction button. Guests receive the skippable spotlight tutorial on each app visit and after sign-out, even if previously completed; signed-in users retain first-use/replay behavior.

This supersedes the earlier decision to hide closure/demo tools behind Help and use only Map/Saved/Profile tabs. Current guest tabs are Map, Closures, Saved and Profile; signed-in users also see Activity. Saved journeys, activity/history, personal alerts and personal profile settings remain gated by sign-in. Skip/Finish/Escape dismiss the guide for the current visit; ordinary navigation/polling does not reopen it. Help and Profile retain replay access. These controls remain localhost tools; the future role-enforced admin interface is still a proposal.

**Tour/dev-account follow-up (15 October):** make the spotlight tour card follow its highlighted element without covering it or dimming itself. Add explicitly dummy localhost development normal/admin sign-ins and remove Google sign-in. The dummy roles share existing local data and do not claim production authorization. Plan and discuss the admin interface before implementing it. The owner selected automatic agent publication with admin correction afterward, and cancellation retaining source/history to prevent silent republication. See [development guide](docs/DEV_ACCOUNTS_AND_TOUR.md) and [unimplemented admin proposal](docs/ADMIN_INTERFACE_PROPOSAL.md).

**Bilingual/navigation/account phase (15 October):** English and Urdu interface and speech, Urdu RTL layouts, a skippable/replayable first-use spotlight tour, simpler everyday controls and automatic foreground GPS rerouting. Guests may plan/navigate; personal features use a Firebase-ready account surface, with real Firebase authentication deferred. Prepare server-side Google Cloud TTS with ADC, audio caching and bounded usage for eventual Cloud deployment. Cloud audio remains disabled without configuration. The previous welcome trial has expired; do not assume new credits or change billing. Resolve visible flicker while preserving validation. See [feature guide](docs/BILINGUAL_NAVIGATION_AND_CLOUD.md) and [implementation plan](docs/FEATURE_PLAN_2026-10-15.md).

**Clear detours and street example:** red highlighting must stop at the actual blockade boundary and leave open junctions/side streets visually clear. Do not paint the unblocked remainder of an intersecting OSM edge. Preserve conservative routing checks rather than hiding conflicts by drawing blue above red. A top **Try street detour** action loads a real F-8 Park Road example through Streets 20 → 25 → 21, with **Reopen demo road** for comparison. Other closures remain intact. See [demo guide](docs/DEMOS.md).

**Overlay refinement:** do not encircle blocked roads with filled/outlined polygons during ordinary browsing. Keep the red road coating and editing previews. Prioritize prompt red/blue line appearance: cache unchanged road geometry, avoid repeated worker re-indexing and retain overlays during basemap style changes, while preserving time/revision validation. See [performance evidence](docs/PERFORMANCE.md).

**Map time and stops (15 October):** one prominent top clock controls all visible closure state and planner departure; default Now, selectable PKT date/time. Only active published closures are bright red, clipped to their actual affected road portions. Upcoming warnings are small amber markers, ended closures hidden. Blocked baseline routes are pale red, labelled unavailable and never recommended. Add up to five ordered intermediate stops, retain them in saved journeys, and preserve cumulative closure timing and turn restrictions. Allow worldwide map browsing while keeping honest bounded routing. Provide six toggleable demo scenarios and concise controls, removing the header tagline and repeated explanatory copy. See [map time and stops](docs/MAP_TIME_AND_STOPS.md).

**Colour correction:** keep the low-clutter map, but avoid a grey/dull default. Offer independent basemap styles with green parks, blue water and warm main roads. Streets is the new default; Outdoors, High contrast, Minimal and Night remain selectable and persisted separately from app theme. See [Map styles](docs/MAP_STYLES.md).

**15 October refinement:** the owner found the original raster map cluttered. The supplied Safar Android attribution identifies MapLibre, OpenFreeMap, OpenMapTiles and OSM. The implemented replacement uses MapLibre GL JS in flat 2D, clean OpenFreeMap styles, larger blue route lines and bright red closures. Offer up to three genuinely different driving paths at the same departure, with ETA/distance; departure-time changes remain separate. Add a persisted local personal profile, light/dark/system theme, map detail, explicit browser notification preference and separate opt-in for learning/alerting on usual recorded journeys. Provide route preview and foreground GPS/voice guidance. This remains a localhost prototype: no account authentication, background GPS, live traffic or closed-app push claim.

Build the whole fast 2D map/editor/router experience first. Gemini agent implementation is owned by the user later. The selected source approach is a public, accountless X profile collector checking every **15 minutes**, persisting new notices into an agent-ready queue. Do not silently replace the requested source with WhatsApp, RSS or a paid API. Public access may be partial or blocked; disclose actual coverage and retain deliberate import. Do not bypass access controls.

The local edition should run without paid services or API keys. A real, bounded OSM road graph and local storage are appropriate development adapters; future Google Cloud deployment remains documented in MANZIL_ARCHITECTURE.md. Internet is still needed for basemap tiles and source updates. Never draw synthetic routes and label them real.

## Feature inventory

| Feature from the founder | Current implementation priority |
| --- | --- |
| Simple Safar-inspired 2D map, fast on ordinary devices | Build now |
| Select origin/destination and departure date/time | Build now |
| Agent/manual blockades on map | Manual editor now; typed agent handoff/queue now; Gemini reasoning later |
| Schedule a restriction and show its affected period | Build now |
| Connected rerouting around applicable blockades | Build now; validate path and traversal times |
| Compare leaving earlier, waiting/later departure and detouring | Build bounded options now |
| Saved recurring office/school/home commutes | Build now |
| Warn about upcoming commute impacts | Local in-app checks/alerts now; reliable closed-browser/server push after deployment |
| Champ notices via X/WhatsApp, corrections and reopenings | X public collector every 15 minutes + manual intake now; other adapters researched |
| Urdu/Roman Urdu/English notice understanding | Preserve schema/evidence for the later Gemini agent; do not pretend extraction is implemented |
| Live traffic like Google Maps | Future; estimates must be labelled without live traffic |
| Crowd reports and verification | Future; raw report count is not independent verification |
| Safar-like local transit and Metro disruptions | Future; needs usable authorized schedules/stops/services |
| Multimodal alternatives during transit suspension | Future |
| Opt-in foreground GPS trip history/personal route analytics | Local basic recording/history now if supported; no background GPS promise |
| Compare personal route durations/distance | Local summary now; more advanced comparisons later |
| Detect repeatedly used missing/off-road paths | Retain separate contribution consent/schema; later review candidates and owned graph import |
| Add a discovered path to routable graph | Future, after access/surface/connectivity review; a drawn line alone is not a road |
| Camera/privacy avoidance inspired by DeFlock/FlockHopper | Separate future direction; no promise of an undetected journey |
| Extensible beyond Islamabad | Adapters/contracts now; initial graph deliberately bounded to Islamabad |
| Google/Gemini integration useful for the Cup | Cloud architecture documented; local phase needs no Cloud credentials |

## Product invariants

- Distinguish a closure from congestion, a partial lane restriction, a transit suspension and unrelated news.
- Original publication/observation times and collection time are different. Interpret schedules in Asia/Karachi.
- A closure matters when the vehicle reaches it, not only at departure. Unknown-end active events persist until corrected/cancelled.
- No valid route means a clear unavailable result. Never fall back to a blocked route as a recommended option.
- Show source, freshness, uncertainty and demo status. Sample events are explicitly labelled.
- Local history and account/session credentials must not enter Git. Foreground trip recording is explicit opt-in; contribution consent is separate.
- Preserve the earlier research as evidence; current implementation status, not an older proposal, describes what actually works.
