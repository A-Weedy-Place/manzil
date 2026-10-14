# Manzil: product context to retain

Owner's instructions, updated 14 October 2026. Team of two; usable prototype target October 17, leaving time for UI polish. Project/team name **Manzil (منزل)**, Urdu for destination. Brand artwork is in assets/brand. Keep the private GitHub repository private. Run locally now; the owner will arrange deployment later.

## Current build request

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
