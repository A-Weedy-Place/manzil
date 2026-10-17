# Closure testing scenarios

**Demo closures** contains ten explicitly synthetic examples over real imported Islamabad roads. They are not scraped notices or verified traffic reports. Every generated event has a **Demo ·** title and an ownership tag. Published examples use the same closure geometry, selected-time display and normal route validation as other published events.

In Firebase/emulator modes, enabling, cancelling or trying a scenario changes shared closures and requires an administrator. Guests and ordinary users can view already published examples and plan around them. Standalone localhost mode retains its single-user development controls. These are not separate navigation modes.

## Try ordinary street rerouting

Four rows offer **Try route**. The action enables that row's closure, fills its suggested start and destination, clears intermediate stops and invokes the ordinary planner. No streets or detour waypoints are forced. There is no separate Street T2 feature or special routing engine.

| Demo | Direct route, road open | First validated detour | Residential part of detour |
| --- | --- | --- | --- |
| Park Road · F-8 | 1.09 km / about 2 min | 1.35 km / about 3 min, Streets 20 → 25 → 21 | 489 m |
| Rohtas Road · G-9 | 1.12 km / about 2 min | 1.25 km / about 3 min, Streets 36 → 37 → 43 | 361 m |
| Tipu Sultan Road · I-8 | 0.78 km / about 2 min | 1.12 km / about 3 min, Streets 104 → 102 | 1,042 m |
| Sumbal Road · F-10 | 0.73 km / about 2 min | 0.92 km / about 2 min, Streets 57 → 53 → 40 | 396 m |

These measurements are for one example at a time on the bundled OSM snapshot, with ordinary speed estimates and no live traffic. The UI rounds durations to the nearest minute, with a one-minute minimum. Other published closures, graph updates or departure times can change the chosen route. No measured result is stored as a route substitute. An unavailable plan remains unavailable.

The new regression tests verify that every selected segment is an original directed graph edge, check its source OSM `highway=residential` tags, validate the closure conflict and clear detour, then cancel the event and confirm the original route returns. Private roads and footways are not shortcuts. Street routing is enabled for every normal journey: the engine uses estimated travel time, so a longer main road can still beat a shorter slow street. A separate speed/access regression verifies both orderings and automatic street selection after the main road closes.

Try the four rows individually to compare different parts of Islamabad. Turn a row off to reopen its road. **Clear demos** cancels owned catalogue events and retains their history. Re-enabling reuses their event IDs. The optional route examples are excluded from **Add defaults** to keep the original six-scenario baseline stable; they can still be combined deliberately using their individual toggles.

## Full catalogue and schedules

Schedules are created relative to the selected map time when a disabled example is enabled. An already enabled example is not silently rescheduled when the map clock moves.

| Scenario ID | Road/area | New schedule | Included in Add defaults |
| --- | --- | --- | --- |
| `faisal-avenue` | Faisal Avenue near PIMS/Centaurus approaches | Active: −30 min to +2 hr | Yes |
| `nazimuddin-road` | Sir Khwaja Nazimuddin Road | Active: −30 min to +2 hr | Yes |
| `ibn-e-sina` | Ibn-e-Sina Road near PIMS | Active: −30 min to +2 hr | Yes |
| `margalla-road` | Margalla Avenue | Active: −30 min to +2 hr | Yes |
| `aabpara-future` | Muncipal Road by Aabpara | Future: +45 min to +2 hr 30 min | Yes |
| `zero-point-expired` | Islamabad Expressway by Zero Point | Expired: −2 hr to −1 hr | Yes |
| `park-road-street-detour` | Park Road · F-8 | Active: −30 min to +2 hr | No |
| `rohtas-road-streets` | Rohtas Road · G-9 | Active: −30 min to +2 hr | No |
| `tipu-sultan-streets` | Tipu Sultan Road · I-8 | Active: −30 min to +2 hr | No |
| `sumbal-road-streets` | Sumbal Road · F-10 | Active: −30 min to +2 hr | No |

The original six follow contiguous chains of real named road edges with a 60 m corridor. The four optional examples use short 35 m point closures. Polygons can conservatively affect adjacent carriageways, ramps or stacked roads; this is not lane-level modeling. Bright red road coating is clipped to the area actually affected, leaving open approach junctions clear. Future examples show upcoming markers until the selected clock reaches their start; ended examples disappear from the active red layer. Route timing separately checks when a vehicle reaches the event, with the normal safety margin.

Active bulk sample chains avoid preset landmark pins. With all four active bulk samples enabled, the Faisal Mosque → Centaurus preset still produces a validated detour. The Park Road example also passes with the original six enabled. These cases do not guarantee every endpoint combination stays reachable when many events are enabled together.

Turn an example off and on at another selected instant to reschedule it. Ordinary closures are preserved: cancellation requires the catalogue's exact saved ID and ownership tag, never a matching road name alone. Records live in the selected SQLite or Firestore adapter; enabling a synthetic example creates no source notice or Gemini job. Local databases and private records are not committed.

## Compatibility and API

`GET /api/demos?at=...` includes optional `suggestedJourney: {origin, destination}` and `includeInBulk: false` on the four route examples. Coordinates remain GeoJSON `[longitude, latitude]`. `POST /api/demos` uses the existing `{scenario, at, enabled}` contract for every row. The returned `coordinates` describe a closure centre/chain, never a route polyline.

The older `/api/demos/street-route` preview/load endpoint remains for compatibility and fixture tests. It shares Park Road's event ID, ownership and cancellation history with the catalogue, so older clients do not create a second Park Road event. The main UI uses the catalogue and ordinary `/api/plan` workflow.

Run `npm test -- tests/closure-roads-demos.test.ts tests/street-route-demo.test.ts tests/routing-public-streets.test.ts` for the 18 focused cases. API cases require localhost sockets. See [routing](ROUTING.md) for graph/search limits and [API](API.md) for authentication.
