# Local Islamabad car routing

Manzil routes over a genuine imported OpenStreetMap road network. It needs no routing API key. Leaflet and the map tiles are a separate display system; editing a tile or drawing a line does not modify this graph.

## Data and regeneration

`assets/routing/islamabad.json.gz` is the runtime directed graph. `osm-islamabad.json.gz` retains the source OSM elements and `osm-source.json` records the actual query, extent and fetch provenance. Run `npm run data:import` to rebuild from the bundled source (or download from Overpass when the source is absent). Import refuses unexpectedly small data and never substitutes invented roads.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Preserve attribution and the applicable database obligations when redistributing source or derived graph data. Geometry belongs to the OSM database, not the software's license. Source snapshots are not real-time reports of road access.

## What the router enforces

- Actual OSM node connectivity, including separated bridge/tunnel geometry where mapped correctly; no connection is invented at a visual crossing.
- Directed one-way and roundabout edges, explicit car/vehicle/access restrictions, and a conservative supported public-road profile. Footways, construction and private/destination-only roads are excluded. Explicit higher-specificity car access takes precedence.
- Node-based `no_*` and `only_*` OSM turn restrictions, including prohibited U-turns. Unsupported via-way sequences conservatively exclude their via roads. Conditional access/one-way and reversible/alternating roads are excluded; conditional turn restrictions are applied continuously. This can remove usable routes.
- A* search using estimated road-class speeds, posted-speed caps, rough-surface caps and small junction penalties. These are ordinary estimates, not measured traffic speeds or turn-by-turn navigation guarantees.
- Endpoint snapping to actual road nodes within 220 metres. The response returns snapped coordinates and discloses the distance. Access from the original pin to that point is not routed; choose the correct carriageway on the map.

## Scheduled closures

Only published closures participate; cancelled and draft events do not block roads. The router intersects complete edge segments with the reviewed polygon, interpolates entry/exit along each edge and checks the traversal window against `[start,end)`, with a disclosed 30-second margin before entry and after exit. It checks every traversal, not just the trip departure. Unknown end remains open-ended. Invalid published schedules return an unavailable result pending review.

The baseline is retained for comparison even when blocked. A blocked baseline is never returned as a validated option. Conflicting edges are excluded for another connected route search, up to eight iterations, followed by complete revalidation. Optional departure comparison samples changes of 10, 20, 30, 45 and 60 minutes in each direction; past departures are not offered for a current/future trip. Each alternative is checked independently. Available choices are the best found among a bounded set, not a proof of global temporal optimality: a longer path arriving at a reopening later may be missed by fixed query exclusions.

Polygons are two-dimensional and do not encode travel direction or bridge identity. A polygon may conservatively remove both carriageways or the flyover above a closure. Human review and visible unavailable states remain essential. An announced end supports a conditional reopening assumption; a later still-active notice should revise its event end to unknown.

## Integration

Import `graphStatus` (alias `getGraphStatus`), `planJourney` and `searchPlaces` from `server/routing/index.ts`. Calls are synchronous and return the shared contracts. Missing graph data returns `ready:false` and an unavailable plan, never straight-line routing. Search uses original landmark presets and names from the actual road graph; it is not a worldwide geocoder.

Preset endpoints are road approaches, not a claim of building entrances. Primary OSM verification (base 14 October 2026, 18:22 UTC) identifies Faisal Mosque Road node [3269003185](https://www.openstreetmap.org/node/3269003185), PIMS Gate FR / Ibn-e-Sina Road node [189236486](https://www.openstreetmap.org/node/189236486), Centaurus / Nazimuddin Road node [9108779906](https://www.openstreetmap.org/node/9108779906), and Aabpara Market / Municipal Road node [10041114361](https://www.openstreetmap.org/node/10041114361). No field verification of access or main entrances is implied. The earlier approximate PIMS and F9 labels were not used in the final presets.

The bundled central extract covers **[72.97, 33.60, 73.16, 33.75]** (west, south, east, north), with **99,777 car-road nodes and 203,828 directed edges** after filtering. Complete source ways can extend outside the query rectangle; endpoint selection is bounded to the documented rectangle. It includes the one mapped restriction relation returned for this extent; absence of an OSM restriction does not establish that every physical turn is legal. Import and runtime validation cannot replace local signs.

Run `npm test -- tests/routing.test.ts tests/routing-real.test.ts` for topology, one-way/access, detour, temporal boundary, unknown-end, unreachable, grade-separation, departure comparisons with a controlled clock, and the bundled real-data rerouting regression. All 15 cases passed on Node 22.20.0 / Vitest 5.0.4 on 14 October 2026. Synthetic graphs appear only in isolated unit tests, never as the production route source. A 25 m synthetic demo restriction at the actual Faisal Mosque Road → PIMS approach route midpoint produced a connected detour and independently validated earlier/later choices; full comparison took about 0.4 seconds in one local run, not a device/server performance guarantee.
