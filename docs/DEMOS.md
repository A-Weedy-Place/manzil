# Local road-closure scenarios

These are synthetic testing controls over real imported Islamabad roads. They are never scraped notices or verified traffic reports. Every generated closure title begins **Demo ·** and its description retains an internal ownership tag. The ordinary closure editor can inspect these records.

Demo controls are directly accessible to guests and signed-in users. **Demo closures** appears in both the planner and Closures view; expand it for the six scenarios and Add all/Clear demos. **Block a point on this route** appears in route results, and the map always shows the **Add restriction** plus button. Opening Help is not required. Guests can skip the automatic tutorial to use these controls immediately.

## One-click street detour

Click **Try street detour** directly below the planner heading. It loads **Park Road · F-8 northeast → Park Road · F-8 southwest**, adds/refreshes a short owned Demo closure on Park Road at the selected time, and calculates the real route automatically. No intermediate stops are forced into the request: the normal router chooses the detour itself.

- Direct route with the demo road open: approximately **1.09 km / 2 min**.
- First validated detour: approximately **1.35 km / 3 min**, via **Street 20 → Street 25 → Street 21**.
- About **489 m** of that detour is on original OSM ways tagged `highway=residential`. The regression checks exact OSM way IDs and directed edges, not merely names. Street 25's nearby footway is excluded.
- **Reopen demo road** cancels only this owned synthetic restriction and automatically restores the direct route. **Try street detour** blocks it again. The existing six scenarios and ordinary closures are preserved.
- This example also passes with all six catalogue demos enabled. Other user restrictions can still make it unavailable; no precomputed geometry is substituted for a plan.

The source ways include Park Road `8096411`/`159502667`, Street 20 `288861053`, Street 25 `22723925`/`22724330` and Street 21 `158316584` in the bundled attributed OSM snapshot. Estimates are ordinary road speeds without live traffic. The UI shows the street names from the currently selected result, and rounded time/distance.

## Toggleable road scenarios

| Scenario ID | Location | Initial schedule relative to selected map time |
| --- | --- | --- |
| `faisal-avenue` | Faisal Avenue near the PIMS/Centaurus approaches | Active: −30 min to +2 hr |
| `nazimuddin-road` | Sir Khwaja Nazimuddin Road | Active: −30 min to +2 hr |
| `ibn-e-sina` | Ibn-e-Sina Road near PIMS | Active: −30 min to +2 hr |
| `margalla-road` | Margalla Avenue | Active: −30 min to +2 hr |
| `aabpara-future` | Muncipal Road by Aabpara | Future: +45 min to +2 hr 30 min |
| `zero-point-expired` | Islamabad Expressway by Zero Point | Expired: −2 hr to −1 hr |

Each scenario follows a short contiguous chain of named graph edges. A 60-meter-wide corridor deliberately closes several graph segments; this can affect adjacent carriageways, ramps or stacked roads conservatively. Red coating is clipped to the portions actually inside/on that area, leaving open approach junctions clear. It does not claim lane-level precision. **Clear demos** in this catalogue affects these six toggles; use **Reopen demo road** for the separately loaded street example.

Active sample chains avoid the preset landmark pins so that closing a road demonstrates a detour rather than automatically closing the destination itself. With all four active samples enabled, the tested Faisal Mosque → Centaurus preset still produces valid detours. This does not guarantee that every endpoint pair remains reachable with multiple closures; unavailable results can still be correct or reflect the bounded search.

1. Enable one active scenario, select nearby endpoints on opposite sides, and plan at the selected time. Recommended blue routes must pass closure validation; an inaccessible original route can be retained separately as evidence.
2. Add several active scenarios to test wider disruptions. If no route is verified, the result must say unavailable rather than draw a disconnected shortcut.
3. Enable Aabpara, then move the map time to its displayed start. It becomes bright red exactly at that start, and disappears at its end. The route planner separately checks whether your vehicle would reach it while active.
4. Enable Zero Point to inspect an expired example. It remains absent from the red layer until the map time moves back inside its window.
5. Turn demos off to remove their routing effect. Saved ordinary closures are preserved. Repeated enabling is idempotent; to schedule a demo around a different instant, disable and enable it again there.

Toggle records and schedules persist in the ignored local SQLite database. Generated closures, GPS data and local preferences are not committed. Enabling a demo does not create a source notice or Gemini outbox job.

The router includes eligible public residential/service streets, so it can find smaller-street detours when they are connected and legal in the imported graph. Missing roads, private/access-restricted roads and streets outside coverage are not invented. Bounded search can still miss an alternative. See [ROUTING.md](ROUTING.md) for limits and [API.md](API.md) for the catalogue/toggle contract.
