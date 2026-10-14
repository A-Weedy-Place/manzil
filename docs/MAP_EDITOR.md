# Map editor and local journey workflows

This describes the implemented localhost interface. The full product inventory remains in [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md); [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) records verification and remaining work. Google Cloud deployment and Gemini interpretation are future integrations.

## Journey endpoints and scheduling

In **Journey**, choose a starting point and destination using local search, the map-pick buttons, or draggable A/B markers. Search covers selected landmarks and road names in the imported Islamabad graph; it is not an address or worldwide geocoder. Select a suggestion to establish an endpoint. Arrow keys move through loaded suggestions and Enter selects one. Typing another query clears the selected endpoint and invalidates its old suggestions.

The endpoint search and editor coordinate entry accept **latitude, longitude**, for example `33.7000, 73.0500`. Domain objects, API requests, recorded points and GeoJSON always store **[longitude, latitude]**, for example `[73.0500, 33.7000]`. The UI converts between these orders.

**Use my location as start** requests one browser location fix and sets A. It does not start trip recording. Permission failure leaves map selection available. Swap reverses A/B. Changing either endpoint, the departure field, or the comparison setting clears the previous plan and prevents an older pending request from replacing the new selection.

All scheduling fields use **Asia/Karachi (PKT, UTC+05:00)**, independently of the computer's display timezone. **Leave now** refreshes the departure field; it is a selected timestamp rather than a continuously advancing clock. Choose **Find my route** after setting a departure.

## Add a restriction

Open **Closures → Add a restriction**, or use the map's plus button. A new editor starts with the Road tool and a total width of 35 metres. Changing tools clears the current drawing's coordinates.

| Tool | Input | Saved affected area |
| --- | --- | --- |
| Point | One map click or entered coordinate | A polygon approximating a circle around that point |
| Road | At least two points along the affected stretch | A buffered corridor around the drawn line; it does not automatically follow or snap to a road |
| Area | At least three distinct boundary points | A closed polygon; do not repeat the first point manually |

For Point, **Closure diameter** is the full diameter. For Road, **Total corridor width** is the full width, half on each side. A 100 m value therefore means a 50 m radius or a 50 m buffer on each side. The UI slider offers 10–200 m in 5 m steps; the API's validated range is wider. Area geometry uses its drawn boundary rather than this width.

After a valid number of points is present, the map requests the preview polygon from `POST /api/geometry` after a short debounce. Saving uses the same server geometry conversion and validation. While the preview is pending or unavailable, the map can show the point circle or drawing line/boundary instead; that temporary outline does not establish that a save succeeded. Save failures remain visible in the editor.

Drag numbered vertices to adjust the drawing. **Undo point** removes the last vertex. **Finish drawing** or Escape pauses point placement; **Resume drawing** continues it. Pausing does not save the event. The **Enter or adjust coordinates** section offers a keyboard alternative, including per-vertex latitude/longitude edits and removal. Numeric vertex fields use `step="any"`, so valid high-precision map coordinates do not fail a fixed decimal-step constraint.

Supply a title, reason, start and end, with optional notes and source URL. End must follow start. **End time unknown** saves an open-ended restriction that remains applicable after its start until cancelled or revised. Reason labels are descriptive; the implemented event is a complete polygon closure, not a lane-capacity or congestion model.

Leave **Apply to route planning** checked to publish; clear it to save a draft. Publication is a manual decision, not evidence verification. **Cancel** closes the unsaved editor. Navigating to another panel pauses drawing and hides its draft overlay; the in-memory editor is retained when returning. A page reload does not retain an unsaved edit. Starting another restriction replaces that unsaved editor.

## Edit, filter and cancel

Select a restriction card or its map area to focus it. **Edit** loads its details and drawing. Imported polygons without drawing metadata open as editable Area vertices. Saves send the loaded revision; conflicting edits are rejected rather than silently overwriting a newer revision.

Drafts do not affect routing and are accessible through the list's Drafts or All filters. Published map areas are coloured by their scheduled status; ended areas are faded. Cancelled events are omitted from the normal map overlay. The list's status is evaluated at the Journey departure field, not necessarily the present time. In Journey, choosing an earlier/later route option updates the map's displayed schedule and closure colouring to that option's departure.

**Cancel restriction** changes its saved status to cancelled, retaining its details. Use All restrictions to find it later. Editing a cancelled record offers **Apply to route planning** checked by default: review that checkbox and schedule before saving, because saving it checked republishes the event.

Closures are a separate routing layer; they do not edit OSM roads or basemap tiles. Polygons affect intersecting roads in both directions and have no bridge or carriageway identity. Review flyovers and parallel roads before publication. The Restrictions layer toggle changes display only; hiding it does not disable its routing effect.

## GeoJSON import and export

**Export GeoJSON** downloads the loaded restrictions as a `FeatureCollection` with Polygon geometry and event properties, including status and schedule. The current state view loads at most 2,000 restrictions; this export is a view export, not an unlimited database backup.

**Import** accepts a JSON/GeoJSON `FeatureCollection` up to 2 MB and 100 Polygon features. Geometry must pass server validation: one closed, nonzero-area ring, without holes, crossing edges or repeated adjacent vertices. Use separate features for separate areas. Coordinates remain GeoJSON order.

Supported imported properties are `title`, `description`, `reason`, `startsAt`, `endsAt`, `status`, optional `drawing`, and optional `sourceUrl`. Missing values default to an imported title, empty description, reason `other`, start now, unknown end, and draft status. An explicit `published` status is preserved and can immediately affect routing. Imported IDs are not used for updates: importing an export creates new records, so repeated imports can duplicate restrictions.

Features save sequentially. If a later feature fails, earlier successful imports remain saved and the message reports the partial count. Import is not an all-or-nothing transaction. Exported schedules and properties therefore deserve review before reimport.

## Route results and comparison

The solid green route is the selected validated option. The dashed original route is a comparison baseline and may cross a restriction; its presence is not a recommendation to drive it. Results show estimated duration, distance, departure/arrival times, road sequence, warnings and original-route conflicts. No valid connected option produces an explicit unavailable result.

With **Also compare leaving earlier or later**, the local router checks a bounded set of alternatives around the requested departure. Available options can include a direct route, detour, earlier departure or later departure. Later departure means waiting before starting; it does not model waiting at a roadside closure. Options are not guaranteed for every direction or time, and the search is not globally optimal.

Closure validation checks when the route traverses the affected geometry, with the router's disclosed timing margin. Unknown-end restrictions do not acquire an invented reopening. See [ROUTING.md](ROUTING.md) for the search bounds, access rules and limitations.

Saved restriction changes advance an event revision. When the app receives a revision different from the plan's, it hides the stale route/results and asks for replanning. State is refreshed after local edits and polled every 20 seconds; changes made elsewhere are not instantaneous. Missing API or graph access remains visible. Endpoint snapping can leave an unrouted connector from a pin to the road; estimates exclude live traffic and do not provide turn-by-turn navigation.

**Try a demo restriction** deliberately saves a labelled synthetic event on the original route and recalculates. It is not a live report. Cancel that event in Closures when finished.

## Saved commutes and alerts

Use **Save as a regular commute** from results or open **Commutes → Save a commute**. The form uses the current Journey endpoints and asks for a name, usual PKT departure time and repeat weekdays. Its time initially defaults to 17:00; choosing a route option does not automatically copy that option's time into the commute form. Up to 100 commutes can be saved. The current UI supports creation, checking and removal; editing an existing commute or toggling its enabled state is not exposed there.

**Check next departure** checks the next matching occurrence and opens its plan if the user is still in Commutes when the request finishes. Automatic checks also run after relevant saves and once a minute while the local API is running. New conflicts and cleared disruptions can produce local in-app alerts; duplicate impacts for the same occurrence and closure revisions are suppressed. The bell opens the alert inbox, where alerts can be marked read. There is no external push or closed-server delivery.

## Optional personal activity

In **Activity**, give the trip a name, explicitly opt into precise local history, then select **Start recording** and respond to the browser's location prompt. Road-discovery contribution is a separate optional checkbox. That flag only marks the local record for possible future review: no trace is uploaded and no road is added to the routing graph.

Recording requests fresh, high-accuracy fixes; samples older than the start or with reported accuracy above 100 m are ignored. Accepted samples are at least four seconds apart, with a 20,000-point cap. **Pause** and **Resume** retain the same trip; **Finish and save** requires at least two accepted samples. Pending samples are in memory until saved and are lost on page reload. Permission or location failures remain visible. Saving pauses recording, and Resume/Discard are disabled while that save is pending.

Keep the browser page visible. Switching Manzil panels keeps the recording component mounted, but background tabs, device sleep or browser limits can interrupt GPS; background recording is not guaranteed. The recorded line is a GPS trace, not a verified accessible road.

Trip history offers summary distance/time, gap counts, map viewing, GeoJSON line export and confirmed deletion. Elapsed time includes pauses. Distance omits gaps over 60 seconds and implausible segments; it is not map-matched. The app displays up to 50 recent summaries. Raw points are retained for 30 days from trip end and summaries for 90 days, with cleanup while the server runs or records are read. Summary-only trips cannot be viewed or exported as a trace. See [API.md](API.md) for exact retention and validation details. Local deletion does not promise forensic erasure from disks or backups.

## Verification boundary

The implementation passed 31 automated tests on 14 October 2026. Actual desktop and 375×812 browser checks confirmed routing, a synthetic detour, manual geometry and high-precision coordinates, future date persistence, a saved commute and its next-departure options, manual notice intake and reload persistence. This guide describes the reviewed code paths, not a claim that every workflow has been exercised on every browser or that a real outdoor GPS trip has been verified. Use [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the full handoff evidence.
