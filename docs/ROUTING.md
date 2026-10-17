# Pakistan car routing

**Deployment scope:** Pakistan-wide routing/search is present in the merged local checkout. The first live Cloud Run revision still runs the earlier Islamabad-only implementation until a separate release. The national-provider behavior below describes the merged code; select suitable provider capacity and review coordinate-sharing behavior before redeploying it.

The foreground guide now automatically replans after sustained GPS deviation, closure revisions or substantial delay, preserving unvisited stops. See [bilingual navigation](BILINGUAL_NAVIGATION_AND_CLOUD.md) for thresholds, speech configuration and device limitations. It uses local routing in the Islamabad extract and an online adapter elsewhere in Pakistan, without live traffic or lane-aware map matching.

Manzil routes over a genuine imported OpenStreetMap road network. It needs no routing API key. The map renderer and its tiles are a separate display system; editing a tile or drawing a line does not modify this graph.

## Pakistan-wide coverage — 16 October

Origins, destinations and up to five ordered stops may be anywhere within the bundled Pakistan coverage boundary, including Lahore, Karachi, Peshawar, Quetta, Gilgit and Muzaffarabad. There is no Islamabad endpoint gate at the public planner. The country guard runs before routing, so arbitrary foreign map pins or typed coordinates are rejected without an online route request. A simplified mapped boundary can be imperfect at a border/coast; this is an application coverage check, not a legal boundary statement.

- **Inside the imported Islamabad extent:** keep the existing local engine, closure detours, access/turn checks and local graph. A blocked local plan never falls back to a closure-unaware provider.
- **Elsewhere in Pakistan:** request real OSM car routes from the configurable OSRM-compatible endpoint. `OSRM_BASE_URL` defaults to the public `https://router.project-osrm.org` demo; no API key is required for this localhost prototype. Disconnected endpoints, excessive snapping, provider errors and unverifiable geometry/timing return explicit unavailable results.
- **Search:** retain local landmarks/road names and add Photon (`PHOTON_BASE_URL`, default `https://photon.komoot.io`) with `countrycode=PK`, an independent country-code response filter and a Pakistan polygon check for returned coordinates. Coordinate entry works even when online search fails.
- **Closure validation:** inspect each returned candidate against every published closure, preserving ordered-stop elapsed time and the 30-second safety margin. OSRM annotation durations exclude turn costs, so conservative per-leg timing bounds cover uncertain turn-cost placement. Unknown/malformed timing is rejected. Returned alternatives are filtered; OSRM cannot accept the app's arbitrary closure polygons, so it may supply no usable detour even when another road exists. The service's OSM access/turn profile is separate from local import rules and is not independently re-created by Manzil.
- **Caching and fair use:** bounded short-lived in-memory geometry/search caches, concurrent-request deduplication, bounded queues, timeouts and at most one remote request start per second. Cached geometry is revalidated against current closures, revisions and the selected departure. Responses arriving after a closure revision are rechecked before delivery/alerts.
- **Connectivity/privacy:** online search sends query text to Photon; online planning sends endpoint/stop coordinates to OSRM. Saved-commute checks and explicitly enabled usual-journey checks outside the local graph also send their saved or representative endpoints/stops, including during scheduled checks. Raw trace arrays are never sent to these routing/search providers. Personal records stay in the selected adapter: local SQLite, local Firestore Emulator, or private hosted Firestore in a future production configuration. The services have no availability or live-traffic guarantee. Use compatible self-hosted/managed endpoints before heavier use. Defaults follow the providers' [OSRM demo policy](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) and [Photon demo guidance](https://github.com/komoot/photon#demo-server).
- **Weight:** no Pakistan/world road database is added. The server-only gzip country boundary is about 121 kB and is not imported by browser code. The earlier standalone Pakistan build added 2,164 raw browser JavaScript bytes / 528 gzip bytes against its preceding UI; this is historical evidence, not a comparison against the merged Firebase bundle.
- **Map coating:** the red affected-road overlay still uses the bundled Islamabad graph. Published closures elsewhere retain their map markers and are checked against online route candidates, but do not gain nationwide red road coating.
- **Tolls/checkposts:** the road route may physically pass mapped toll plazas/checkposts, but Manzil currently does not list them, quote toll charges, estimate queues or claim current checkpoint coverage. Route results state this explicitly. Existing OSM `toll_booth` passability is not a dedicated POI/cost dataset.

### Boundary provenance

`assets/routing/pakistan-boundary.geojson.gz` contains the simplified geoBoundaries gbOpen `PAK-ADM0-80972501` geometry, source commit `9469f09`, representing an OpenStreetMap/Wambacher 2017 boundary. Retrieved 16 October 2026 from the [geoBoundaries API](https://www.geoboundaries.org/api/current/gbOpen/PAK/ADM0/) / [pinned source](https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/PAK/ADM0/geoBoundaries-PAK-ADM0_simplified.geojson). © OpenStreetMap contributors, ODbL 1.0. Preserve upstream attribution and database-license obligations.

## Local graph data and regeneration

`assets/routing/islamabad.json.gz` is the runtime directed graph. `osm-islamabad.json.gz` retains the source OSM elements and `osm-source.json` records the actual query, extent and fetch provenance. Run `npm run data:import` to rebuild from the bundled source (or download from Overpass when the source is absent). Import refuses unexpectedly small data and never substitutes invented roads.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Preserve attribution and the applicable database obligations when redistributing source or derived graph data. Geometry belongs to the OSM database, not the software's license. Source snapshots are not real-time reports of road access.

## What the local router enforces

- Actual OSM node connectivity, including separated bridge/tunnel geometry where mapped correctly; no connection is invented at a visual crossing.
- Directed one-way and roundabout edges, explicit car/vehicle/access restrictions, and a conservative supported public-road profile. Footways, construction and private/destination-only roads are excluded. Explicit higher-specificity car access takes precedence.
- Node-based `no_*` and `only_*` OSM turn restrictions, including prohibited U-turns. Unsupported via-way sequences conservatively exclude their via roads. Conditional access/one-way and reversible/alternating roads are excluded; conditional turn restrictions are applied continuously. This can remove usable routes.
- A* search using estimated road-class speeds, posted-speed caps, rough-surface caps and small junction delays. These are ordinary estimates, not measured traffic speeds or a turn-by-turn navigation guarantee.
- Endpoint snapping to actual road nodes within 220 metres. The response returns snapped coordinates and discloses the distance. Access from the original pin to that point is not routed; choose the correct carriageway on the map.

### Streets are part of ordinary routing

Public residential, living-street and permitted service roads participate in every local search; no street-detour mode, forced waypoint or UI opt-in is needed. Routes optimize ordinary estimated driving time, including the lower street speeds and junction delays. A shorter street is therefore chosen when it saves estimated time; a longer faster main road may still win. Published closures exclude affected traversals through the same ordinary connected search. Private/destination-only roads, footways and other excluded access classes remain unavailable.

The [demo catalogue](DEMOS.md) now supplies optional endpoint pairs and synthetic closures on Park Road, Rohtas Road, Tipu Sultan Road and Sumbal Road. `tests/routing-public-streets.test.ts` checks original directed OSM edges and residential tags for all four (489 m, 361 m, 1,042 m and 396 m of residential detour respectively), cancellation/reopening, travel-time ranking and private/footway exclusion. These are real-graph local test results, not current traffic advice. National OSRM requests use the provider's car profile; candidate filtering there cannot force an arbitrary street detour around Manzil polygons.

## Scheduled closures in the local router

Ordered intermediate stops are supported through `waypoints?: Place[]` (maximum five). The continuous search retains the incoming edge across each stop, so a prohibited turn is not bypassed by splitting the trip into independent legs. It carries elapsed travel time across the whole journey, adds no stop dwell time, and returns snapped stop coordinates. Saved commute checks preserve the same ordered stops. See [map time and stops](MAP_TIME_AND_STOPS.md).

Only published closures participate; cancelled and draft events do not block roads. The router intersects complete edge segments with the reviewed polygon, interpolates entry/exit along each edge and checks the traversal window against `[start,end)`, with a disclosed 30-second margin before entry and after exit. It checks every traversal, not just the trip departure. Unknown end remains open-ended. Invalid published schedules return an unavailable result pending review.

The baseline is retained for comparison even when blocked. A blocked baseline is never returned as a validated option. Conflicting edges are excluded for another connected route search, up to eight iterations, followed by complete revalidation. Optional departure comparison samples changes of 10, 20, 30, 45 and 60 minutes in each direction; past departures are not offered for a current/future trip. Departure changes are extra schedule choices, separate from the same-departure routes below. Each candidate is checked independently. Available choices are the best found among a bounded set, not a proof of global temporal optimality: a longer path arriving at a reopening later may be missed by fixed query exclusions.

## Local distinct routes at the same departure

The planner now returns **up to three useful connected driving routes for exactly the selected departure**, ordered by original estimated driving time. The first has kind `direct` or `detour`; additional choices have kind `alternative`, unique IDs and a distinguishing road label where available. Fewer than three is an honest result when there is only one valid corridor, the alternatives are too similar, a route is excessively indirect, or the bounded search cannot validate more. The app does not invent extra choices.

Generation tries up to eight combinations of interior road-corridor exclusions and nonnegative overlap penalties. Both directions of a physical segment receive the generation constraint, to discourage a U-turn around the same corridor. **Artificial search penalties never change reported time:** after choosing geometry, the engine reconstructs every edge entry/exit, step time, total duration and arrival from original road speeds and junction delays, then validates all published closure intervals again. A closure on a candidate-only corridor is checked even if the baseline is unaffected.

An alternative must pass all of these product heuristics against accepted choices:

- No repeated-node loop introduced solely to manufacture a different route.
- At most 82% shared physical edge distance, measured against the shorter route.
- At least 120 m or 12% of the shorter route (whichever is larger) more than 80 m from the other route. A nearby parallel carriageway or tiny local detour therefore does not count as a separate route.
- Duration at most 1.5 times the first validated choice plus 60 seconds; distance at most 1.65 times that choice plus 250 metres. These are usefulness limits, not a claim that a longer real route is impossible.

The whole request shares a maximum of 32 A* searches and a three-second computation deadline, checked during closure geometry work and route expansion. Same-departure choices take priority over optional departure comparisons. If a limit is reached, only fully validated choices are retained and a planning note discloses the incomplete search. Static ordinary-speed baseline geometry can be reused at a different departure, but its closure traversal windows are always reevaluated. These limits bound local processing; they are not a physical-device latency guarantee or a globally optimal k-shortest-path algorithm.

Polygons are two-dimensional and do not encode travel direction or bridge identity. A polygon may conservatively remove both carriageways or the flyover above a closure. Human review and visible unavailable states remain essential. An announced end supports a conditional reopening assumption; a later still-active notice should revise its event end to unknown.

## Integration

Import `graphStatus` (alias `getGraphStatus`), `planJourney` and `searchPlaces` from `server/routing/index.ts`. `graphStatus` is synchronous and describes the local extract only. `planJourney` and `searchPlaces` return promises and must be awaited. A missing local graph reports `ready:false` but Pakistan journeys can still use the online adapter; failures never produce straight-line routes. Search combines local landmark/road names with Pakistan-filtered Photon results. `PlanResponse.source` distinguishes `local-osm` and `osrm`.

Preset endpoints are road approaches, not a claim of building entrances. Primary OSM verification (base 14 October 2026, 18:22 UTC) identifies Faisal Mosque Road node [3269003185](https://www.openstreetmap.org/node/3269003185), PIMS Gate FR / Ibn-e-Sina Road node [189236486](https://www.openstreetmap.org/node/189236486), Centaurus / Nazimuddin Road node [9108779906](https://www.openstreetmap.org/node/9108779906), and Aabpara Market / Municipal Road node [10041114361](https://www.openstreetmap.org/node/10041114361). No field verification of access or main entrances is implied. The earlier approximate PIMS and F9 labels were not used in the final presets.

The bundled central extract covers **[72.97, 33.60, 73.16, 33.75]** (west, south, east, north), with **99,777 car-road nodes and 203,828 directed edges** after filtering. Complete source ways can extend outside the query rectangle; only the local engine bounds endpoint selection to this rectangle. The public planner uses the online adapter for other Pakistan endpoints. It includes the one mapped restriction relation returned for this extent; absence of an OSM restriction does not establish that every physical turn is legal. Import and runtime validation cannot replace local signs.

Run `npm test -- tests/routing.test.ts tests/routing-real.test.ts tests/routing-alternatives.test.ts` for topology, one-way/access, detour, temporal boundary, unknown-end, unreachable, grade-separation, clock-controlled departure comparisons, diverse alternatives, unchanged times under search penalties, safe deadline expiry, and bundled real-data routing. **All 22 routing cases passed** on Node 22.20.0 / Vitest 5.0.4 on 15 October 2026. Synthetic graphs appear only in isolated unit tests, never as the production route source.

Measured once locally on the bundled graph: Faisal Mosque Road → PIMS approach returned three distinct same-time choices in about 98 ms: approximately 9.9 minutes, 12.7 minutes via Parveen Shakir Road and 13.1 minutes via 9th Avenue. A 25 m synthetic midpoint closure produced three validated same-time routes plus independently checked earlier/later departure choices in about 209 ms. These are illustrative local observations, not a server/device performance guarantee. They use ordinary speed estimates without live traffic.
