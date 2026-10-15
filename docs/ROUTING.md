# Local Islamabad car routing

The foreground guide now automatically replans after sustained GPS deviation, closure revisions or substantial delay, preserving unvisited stops. See [bilingual navigation](BILINGUAL_NAVIGATION_AND_CLOUD.md) for thresholds, speech configuration and device limitations. It uses the existing bounded router, without live traffic or lane-aware map matching.

Manzil routes over a genuine imported OpenStreetMap road network. It needs no routing API key. The map renderer and its tiles are a separate display system; editing a tile or drawing a line does not modify this graph.

## Data and regeneration

`assets/routing/islamabad.json.gz` is the runtime directed graph. `osm-islamabad.json.gz` retains the source OSM elements and `osm-source.json` records the actual query, extent and fetch provenance. Run `npm run data:import` to rebuild from the bundled source (or download from Overpass when the source is absent). Import refuses unexpectedly small data and never substitutes invented roads.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Preserve attribution and the applicable database obligations when redistributing source or derived graph data. Geometry belongs to the OSM database, not the software's license. Source snapshots are not real-time reports of road access.

## What the router enforces

- Actual OSM node connectivity, including separated bridge/tunnel geometry where mapped correctly; no connection is invented at a visual crossing.
- Directed one-way and roundabout edges, explicit car/vehicle/access restrictions, and a conservative supported public-road profile. Footways, construction and private/destination-only roads are excluded. Explicit higher-specificity car access takes precedence.
- Node-based `no_*` and `only_*` OSM turn restrictions, including prohibited U-turns. Unsupported via-way sequences conservatively exclude their via roads. Conditional access/one-way and reversible/alternating roads are excluded; conditional turn restrictions are applied continuously. This can remove usable routes.
- A* search using estimated road-class speeds, posted-speed caps, rough-surface caps and small junction delays. These are ordinary estimates, not measured traffic speeds or a turn-by-turn navigation guarantee.
- Endpoint snapping to actual road nodes within 220 metres. The response returns snapped coordinates and discloses the distance. Access from the original pin to that point is not routed; choose the correct carriageway on the map.

## Scheduled closures

Ordered intermediate stops are supported through `waypoints?: Place[]` (maximum five). The continuous search retains the incoming edge across each stop, so a prohibited turn is not bypassed by splitting the trip into independent legs. It carries elapsed travel time across the whole journey, adds no stop dwell time, and returns snapped stop coordinates. Saved commute checks preserve the same ordered stops. See [map time and stops](MAP_TIME_AND_STOPS.md).

Only published closures participate; cancelled and draft events do not block roads. The router intersects complete edge segments with the reviewed polygon, interpolates entry/exit along each edge and checks the traversal window against `[start,end)`, with a disclosed 30-second margin before entry and after exit. It checks every traversal, not just the trip departure. Unknown end remains open-ended. Invalid published schedules return an unavailable result pending review.

The baseline is retained for comparison even when blocked. A blocked baseline is never returned as a validated option. Conflicting edges are excluded for another connected route search, up to eight iterations, followed by complete revalidation. Optional departure comparison samples changes of 10, 20, 30, 45 and 60 minutes in each direction; past departures are not offered for a current/future trip. Departure changes are extra schedule choices, separate from the same-departure routes below. Each candidate is checked independently. Available choices are the best found among a bounded set, not a proof of global temporal optimality: a longer path arriving at a reopening later may be missed by fixed query exclusions.

## Distinct routes at the same departure

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

Import `graphStatus` (alias `getGraphStatus`), `planJourney` and `searchPlaces` from `server/routing/index.ts`. Calls are synchronous and return the shared contracts. Missing graph data returns `ready:false` and an unavailable plan, never straight-line routing. Search uses original landmark presets and names from the actual road graph; it is not a worldwide geocoder.

Preset endpoints are road approaches, not a claim of building entrances. Primary OSM verification (base 14 October 2026, 18:22 UTC) identifies Faisal Mosque Road node [3269003185](https://www.openstreetmap.org/node/3269003185), PIMS Gate FR / Ibn-e-Sina Road node [189236486](https://www.openstreetmap.org/node/189236486), Centaurus / Nazimuddin Road node [9108779906](https://www.openstreetmap.org/node/9108779906), and Aabpara Market / Municipal Road node [10041114361](https://www.openstreetmap.org/node/10041114361). No field verification of access or main entrances is implied. The earlier approximate PIMS and F9 labels were not used in the final presets.

The bundled central extract covers **[72.97, 33.60, 73.16, 33.75]** (west, south, east, north), with **99,777 car-road nodes and 203,828 directed edges** after filtering. Complete source ways can extend outside the query rectangle; endpoint selection is bounded to the documented rectangle. It includes the one mapped restriction relation returned for this extent; absence of an OSM restriction does not establish that every physical turn is legal. Import and runtime validation cannot replace local signs.

Run `npm test -- tests/routing.test.ts tests/routing-real.test.ts tests/routing-alternatives.test.ts` for topology, one-way/access, detour, temporal boundary, unknown-end, unreachable, grade-separation, clock-controlled departure comparisons, diverse alternatives, unchanged times under search penalties, safe deadline expiry, and bundled real-data routing. **All 22 routing cases passed** on Node 22.20.0 / Vitest 5.0.4 on 15 October 2026. Synthetic graphs appear only in isolated unit tests, never as the production route source.

Measured once locally on the bundled graph: Faisal Mosque Road → PIMS approach returned three distinct same-time choices in about 98 ms: approximately 9.9 minutes, 12.7 minutes via Parveen Shakir Road and 13.1 minutes via 9th Avenue. A 25 m synthetic midpoint closure produced three validated same-time routes plus independently checked earlier/later departure choices in about 209 ms. These are illustrative local observations, not a server/device performance guarantee. They use ordinary speed estimates without live traffic.
