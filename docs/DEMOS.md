# Local road-closure scenarios

These are synthetic testing controls over real imported Islamabad roads. They are never scraped notices or verified traffic reports. Every generated closure title begins **Demo ·** and its description retains an internal ownership tag. The ordinary closure editor can inspect these records.

| Scenario ID | Location | Initial schedule relative to selected map time |
| --- | --- | --- |
| `faisal-avenue` | Faisal Avenue near the PIMS/Centaurus approaches | Active: −30 min to +2 hr |
| `nazimuddin-road` | Sir Khwaja Nazimuddin Road | Active: −30 min to +2 hr |
| `ibn-e-sina` | Ibn-e-Sina Road near PIMS | Active: −30 min to +2 hr |
| `margalla-road` | Margalla Avenue | Active: −30 min to +2 hr |
| `aabpara-future` | Muncipal Road by Aabpara | Future: +45 min to +2 hr 30 min |
| `zero-point-expired` | Islamabad Expressway by Zero Point | Expired: −2 hr to −1 hr |

Each scenario follows a short contiguous chain of named graph edges. A 60-meter-wide corridor deliberately closes several graph segments; this can affect adjacent carriageways, ramps or stacked roads conservatively. The red road coating reflects actual graph edges intersecting that area. It does not claim lane-level precision.

Active sample chains avoid the preset landmark pins so that closing a road demonstrates a detour rather than automatically closing the destination itself. With all four active samples enabled, the tested Faisal Mosque → Centaurus preset still produces valid detours. This does not guarantee that every endpoint pair remains reachable with multiple closures; unavailable results can still be correct or reflect the bounded search.

1. Enable one active scenario, select nearby endpoints on opposite sides, and plan at the selected time. Recommended blue routes must pass closure validation; an inaccessible original route can be retained separately as evidence.
2. Add several active scenarios to test wider disruptions. If no route is verified, the result must say unavailable rather than draw a disconnected shortcut.
3. Enable Aabpara, then move the map time to its displayed start. It becomes bright red exactly at that start, and disappears at its end. The route planner separately checks whether your vehicle would reach it while active.
4. Enable Zero Point to inspect an expired example. It remains absent from the red layer until the map time moves back inside its window.
5. Turn demos off to remove their routing effect. Saved ordinary closures are preserved. Repeated enabling is idempotent; to schedule a demo around a different instant, disable and enable it again there.

Toggle records and schedules persist in the ignored local SQLite database. Generated closures, GPS data and local preferences are not committed. Enabling a demo does not create a source notice or Gemini outbox job.

The router includes eligible public residential/service streets, so it can find smaller-street detours when they are connected and legal in the imported graph. Missing roads, private/access-restricted roads and streets outside coverage are not invented. Bounded search can still miss an alternative. See [ROUTING.md](ROUTING.md) for limits and [API.md](API.md) for the catalogue/toggle contract.
