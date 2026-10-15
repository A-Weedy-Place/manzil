# Map time, closed roads and stops

## Quick guide

1. **Click the clock at the top.** Now is the default. Choose any date/time in Pakistan time, or choose **Back to now**. Closures and route departures use this same instant.
2. **Red roads are closed at the displayed time.** Amber warning markers are upcoming closures. Expired events are hidden. Click a marker for its schedule and editing controls.
3. **Blue routes are validated travel options.** A conflicting original route is pale red and labelled **Blocked**. It is not selectable for navigation.
4. **Add stop** adds an intermediate location. Search or pick on the map, reorder with arrows, remove with ×, or reverse the entire journey. Up to five stops are supported.
5. **Demo closures** is directly available in the planner and Closures view and offers six independently toggleable examples. Use **Add all**, or select one at a time. **Clear demos** leaves ordinary closures alone. All generated events say Demo.
   **Try street detour**, below the planner heading, loads a real Park Road example through Streets 20, 25 and 21. **Reopen demo road** restores the direct route for comparison. Route results also expose **Block a point on this route**. None of these requires opening Help.
6. Zoom and pan freely around the world. The local routing graph still covers central Islamabad; worldwide routing is not implemented.

**Closures** remains a primary tab for everyone; the map's **Add restriction** plus button is always visible. **Activity** appears after sign-in. Guests receive the skippable tutorial each fresh visit/reload and after sign-out, even if previously completed; signed-in users retain remembered first-use behavior. Everyone can replay it from Help or Profile. See [accounts and tour](DEV_ACCOUNTS_AND_TOUR.md).

## Time and route behavior

There is one authoritative map instant. A scheduled selection stays fixed. Now refreshes roughly once a minute, on returning focus, and when a known published closure starts/ends. An existing planner request automatically recalculates when that instant or the closure revision changes. Previous geometry remains neutral grey with Updating labels while replacing it, and route actions are disabled until a current validated result arrives; a late request cannot replace a newer result. Automatic refresh preserves the camera position and selected option where its ID still exists.

Choosing an earlier/later departure changes the visible map time and recalculates the journey there. Departure alternatives are never overlaid as if they belonged to the current map snapshot.

Map red state uses exact `[startsAt, endsAt)` membership, without the routing margin. Routing evaluates when the vehicle reaches each polygon, with the existing 30-second margin. A road which closes after the trip has passed can remain usable; a road reopening before arrival can also be usable. These time-dependent cases are different from a permanent road exclusion. Future closures intersecting the original route within 24 hours appear as a short upcoming notice, explicitly labelled as applying to the original route.

Foreground navigation keeps its accepted in-progress route while the map clock advances. It does not silently replace that route every minute. Existing stale-closure/GPS guards still apply; continuous time-dependent resimulation during GPS travel remains future work.

## Road painting

`GET /api/closures/roads?at=...` returns the affected portions of actual graph edges for published closures active at that instant. Rendering and routing share one cached graph/polygon intersection calculation. Red endpoints are interpolated at the actual polygon boundary rather than extended to the full OSM edge. Holes split the painted line; tangent-only contacts do not paint a false arm. Reverse directed copies are deduplicated, and flat red end caps avoid extending past the reported endpoints. Ordinary browsing has no surrounding polygon outline/fill; the editor still previews its authoring geometry. Unchanged active sets and road geometry are cached to avoid delayed or disappearing lines on clock updates. See [performance evidence](PERFORMANCE.md).

The red line represents the affected portion of a road, not the entire road sharing its name. Draw the whole blocked stretch as a road corridor to close a longer stretch. A two-dimensional polygon may also cover a nearby carriageway, ramp or flyover; lane-specific and direction-specific closure editing remain future work. No GPS shortcut, missing road or visual crossing is invented as a connection. Routing still treats uncertain boundary contact conservatively; trimming paint does not relax route validation. A time-dependent route can use a road after its announced reopening, even if the departure snapshot still paints it red.

## Ordered stops

`PlanRequest.waypoints?: Place[]` and `CommuteDraft.waypoints?: Place[]` accept at most five ordered intermediate places. Responses include `snappedWaypoints` when stops exist. One continuous A* state carries the incoming edge and next-stop progress. This preserves one-way/turn restrictions at a stop and cumulative arrival time for later-leg closures. Stops add no dwell time. The whole path is revalidated, including alternative and departure options. Unsupported or disconnected stops return unavailable.

Public mapped residential/service streets can be used as detours. Private, access-restricted, disconnected and missing roads remain excluded. The search is bounded and does not prove every possible real-world alternative has been found.

Saved journeys preserve stops and check them for notifications. Route preview works with stops. Foreground GPS guidance now tracks remaining stops and automatically reroutes after sustained deviation. See [bilingual navigation](BILINGUAL_NAVIGATION_AND_CLOUD.md) for evidence requirements, restart behavior and limitations.

## Verification

The expanded test suite covers waypoint order, cumulative temporal checks, turn restrictions through stops, residential detours, graph/display agreement, snapshot boundaries, demo ownership/idempotence and stale overlay guards. See [implementation status](IMPLEMENTATION_STATUS.md) for the final test/build and browser evidence. Demo records remain in the ignored local database, not Git.
