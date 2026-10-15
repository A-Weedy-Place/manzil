# Map editor and local journey workflows

This describes the implemented localhost interface. The full product inventory remains in [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md); [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) records verification and remaining work. Google Cloud deployment and Gemini interpretation are future integrations.

## Map display and preferences

The map uses **MapLibre GL JS 6** and OpenFreeMap. **Streets** is the colourful default; **Outdoors, High contrast, Minimal and Night** are available from Style on the map or Profile. Map styles are independent of the app's light/dark/system theme. Default **Clean** detail removes venue/POI labels, building details and road shields, and delays smaller street names until closer zoom. **Standard** restores ordinary two-dimensional detail. All choices remain flat and north-up, with pitch/rotation disabled. See [MAP_STYLES.md](MAP_STYLES.md).

Style, tile, font and sprite requests need internet. This configuration has no paid basemap key and does not use the old `VITE_MAPTILER_KEY` raster option. OpenFreeMap/OpenMapTiles/OpenStreetMap attribution remains available in the map's attribution control; preserve it. Provider setup follows the [official OpenFreeMap guide](https://openfreemap.org/quick_start/).

The map caps its pixel ratio at 1.75 and limits tile-cache zoom levels, avoiding unbounded high-density canvas work. Focus changes are immediate, and location following respects the browser's reduced-motion preference. These are implementation measures, not a claim of measured low-end device performance.

If basemap resources fail, a visible warning accompanies the existing map or a plain backdrop; local route and editor overlays still use their real coordinates. No road image is invented. WebGL startup/context failure shows an explicit message and a **Restart map** action; journey fields and coordinate editing remain usable. Graphics support is required to see the map itself.

## Journey endpoints and scheduling

In **Journey**, choose a starting point and destination using local search, the map-pick buttons, or draggable A/B markers. Search covers selected landmarks and road names in the imported Islamabad graph; it is not an address or worldwide geocoder. Select a suggestion to establish an endpoint. Arrow keys move through loaded suggestions and Enter selects one. Typing another query clears the selected endpoint and invalidates its old suggestions.

The endpoint search and editor coordinate entry accept **latitude, longitude**, for example `33.7000, 73.0500`. Domain objects, API requests, recorded points and GeoJSON always store **[longitude, latitude]**, for example `[73.0500, 33.7000]`. The UI converts between these orders.

**Use my location as start** requests one browser location fix and sets A. It does not start trip recording. Permission failure leaves map selection available. **Add stop** adds up to five ordered intermediate locations with search, map selection and numbered markers. Arrow controls reorder stops; × removes one; **Reverse journey** reverses A/B and stop order. Changing an endpoint, stop or comparison setting clears the previous plan and prevents an older pending request from replacing it.

All scheduling fields use **Asia/Karachi (PKT, UTC+05:00)**, independently of the computer's display timezone. The prominent **top clock** controls the whole map and route departure. **Now** advances roughly once a minute and at known closure boundaries; selecting a PKT date/time fixes that snapshot. Existing planner results automatically recalculate on time/revision changes. Confirming an unchanged scheduled instant retains the route. **Back to now** restores the advancing clock. Choose **Find routes** to begin a journey. See [map time and stops](MAP_TIME_AND_STOPS.md).

## Add a restriction

Open **Closures → Add a restriction**, or use the map's plus button. A new editor starts with the Road tool and a total width of 35 metres. Changing tools clears the current drawing's coordinates.

| Tool | Input | Saved affected area |
| --- | --- | --- |
| Point | One map click or entered coordinate | A polygon approximating a circle around that point |
| Road | At least two points along the affected stretch | A buffered corridor around the drawn line; it does not automatically follow or snap to a road |
| Area | At least three distinct boundary points | A closed polygon; do not repeat the first point manually |

For Point, **Closure diameter** is the full diameter. For Road, **Total corridor width** is the full width, half on each side. A 100 m value therefore means a 50 m radius or a 50 m buffer on each side. The UI slider offers 10–200 m in 5 m steps; the API's validated range is wider. Area geometry uses its drawn boundary rather than this width.

After a valid number of points is present, the map requests the preview polygon from `POST /api/geometry` after a short debounce. Saving uses the same server geometry conversion and validation. While the preview is pending or unavailable, the map shows the entered point or drawing line/boundary instead; that temporary outline does not establish that a save succeeded. An unavailable preview displays a warning, and save failures remain visible in the editor.

Drag numbered vertices to adjust the drawing. **Undo point** removes the last vertex. **Finish drawing** or Escape pauses point placement; **Resume drawing** continues it. Pausing does not save the event. The **Enter or adjust coordinates** section offers a keyboard alternative, including per-vertex latitude/longitude edits and removal. Numeric vertex fields use `step="any"`, so valid high-precision map coordinates do not fail a fixed decimal-step constraint.

Focused endpoint and vertex markers also accept arrow-key nudges of five screen pixels, or twenty with Shift. Exact latitude/longitude fields remain the precision alternative. Keyboard nudging changes map coordinates according to the current zoom; it is not a fixed distance in metres.

Supply a title, reason, start and end, with optional notes and source URL. End must follow start. **End time unknown** saves an open-ended restriction that remains applicable after its start until cancelled or revised. Reason labels are descriptive; the implemented event is a complete polygon closure, not a lane-capacity or congestion model.

Leave **Apply to route planning** checked to publish; clear it to save a draft. Publication is a manual decision, not evidence verification. **Cancel** closes the unsaved editor. Navigating to another panel pauses drawing and hides its draft overlay; the in-memory editor is retained when returning. A page reload does not retain an unsaved edit. Starting another restriction replaces that unsaved editor.

## Edit, filter and cancel

Select a restriction card or its map area to focus it. **Edit** loads its details and drawing. Imported polygons without drawing metadata open as editable Area vertices. Saves send the loaded revision; conflicting edits are rejected rather than silently overwriting a newer revision.

Drafts do not affect routing and remain accessible through Drafts or All filters. Only published events active at the top clock's instant have a bright red road coating and closed-road marker. Browsing does not draw a surrounding polygon outline/fill; authoring previews remain in the editor. Scheduled events have small amber warning markers; ended/cancelled events are hidden from the normal overlay. The red coating follows whole imported graph edges intersecting the closure, using the router's shared cached geometry helper. The list uses the same top-clock instant. Earlier/later departure selection changes the global map time and replans there. See [performance notes](PERFORMANCE.md).

**Cancel restriction** changes its saved status to cancelled, retaining its details. Use All restrictions to find it later. Editing a cancelled record offers **Apply to route planning** checked by default: review that checkbox and schedule before saving, because saving it checked republishes the event.

Closures are a separate routing layer; they do not edit OSM roads or basemap tiles. Polygons affect intersecting roads in both directions and have no bridge or carriageway identity. Review flyovers and parallel roads before publication. The Restrictions layer toggle changes display only; hiding it does not disable its routing effect.

## GeoJSON import and export

**Export GeoJSON** downloads the loaded restrictions as a `FeatureCollection` with Polygon geometry and event properties, including status and schedule. The current state view loads at most 2,000 restrictions; this export is a view export, not an unlimited database backup.

**Import** accepts a JSON/GeoJSON `FeatureCollection` up to 2 MB and 100 Polygon features. Geometry must pass server validation: one closed, nonzero-area ring, without holes, crossing edges or repeated adjacent vertices. Use separate features for separate areas. Coordinates remain GeoJSON order.

Supported imported properties are `title`, `description`, `reason`, `startsAt`, `endsAt`, `status`, optional `drawing`, and optional `sourceUrl`. Missing values default to an imported title, empty description, reason `other`, start now, unknown end, and draft status. An explicit `published` status is preserved and can immediately affect routing. Imported IDs are not used for updates: importing an export creates new records, so repeated imports can duplicate restrictions.

Features save sequentially. If a later feature fails, earlier successful imports remain saved and the message reports the partial count. Import is not an all-or-nothing transaction. Exported schedules and properties therefore deserve review before reimport.

## Route results and comparison

The thick saturated blue route, with a white casing, is the selected validated option. Other validated direct/detour/alternative routes for the **same departure instant** are drawn in muted blue. Click an alternative line or its minute label to select it; the side-panel result cards provide the same choice. Time-change options are not overlaid as if they shared the current departure. Minute labels estimate driving duration, not live traffic.

The original route appears only when conflicting: it is pale red, labelled **Blocked**, and cannot be selected for navigation. The **Blocked route** layer toggle hides it. Results show duration, distance and arrival; road sequence and detailed assumptions are expandable. No valid connected option at the selected time produces an explicit unavailable result, even when a different departure is possible. The renderer draws actual API geometry and never invents extra routes.

With **Also compare leaving earlier or later**, the local router checks a bounded set of alternatives around the requested departure. Available options can include a direct route, detour, earlier departure or later departure. Later departure means waiting before starting; it does not model waiting at a roadside closure. Options are not guaranteed for every direction or time, and the search is not globally optimal.

Closure validation checks when the route traverses the affected geometry, with the router's disclosed timing margin. Unknown-end restrictions do not acquire an invented reopening. See [ROUTING.md](ROUTING.md) for the search bounds, access rules and limitations.

Saved restriction changes advance an event revision. When the app receives a revision different from the plan's, it hides the stale route/results and asks for replanning. State is refreshed after local edits and polled every 20 seconds; changes made elsewhere are not instantaneous. Missing API or graph access remains visible. Endpoint snapping can leave an unrouted connector from a pin to the road; estimates exclude live traffic and do not provide turn-by-turn navigation.

**Try a demo restriction** deliberately saves a labelled synthetic event on the original route and recalculates. It is not a live report. Cancel that event in Closures when finished.

## Saved commutes and alerts

Use **Save journey** from results or open **Saved → Save a commute**. The form retains current planner endpoints and ordered stops, and asks for a name, usual PKT departure time and repeat weekdays. Its time initially defaults to 17:00; choosing a route option does not automatically copy that option's time into the commute form. Up to 100 commutes can be saved. The current UI supports creation, checking and removal; editing an existing commute or toggling its enabled state is not exposed there.

**Check next departure** checks the next matching occurrence and opens its plan if the user is still in Saved when the request finishes. Automatic checks run after relevant saves and once a minute while the local API runs. New conflicts and cleared disruptions can produce in-app alerts; duplicate impacts for the same occurrence and closure revisions are suppressed. The bell opens the inbox. Profile can separately enable usual-journey learning/alerts and opt-in browser notifications while the page is open. There is no closed-server or closed-app push delivery. See [the redesign guide](REDESIGN_2026-10-15.md).

## Optional personal activity

In **Activity**, give the trip a name, explicitly opt into precise local history, then select **Start recording** and respond to the browser's location prompt. Road-discovery contribution is a separate optional checkbox. That flag only marks the local record for possible future review: no trace is uploaded and no road is added to the routing graph.

Recording requests fresh, high-accuracy fixes; samples older than the start or with reported accuracy above 100 m are ignored. Accepted samples are at least four seconds apart, with a 20,000-point cap. **Pause** and **Resume** retain the same trip; **Finish and save** requires at least two accepted samples. Pending samples are in memory until saved and are lost on page reload. Permission or location failures remain visible. Saving pauses recording, and Resume/Discard are disabled while that save is pending.

Keep the browser page visible. Switching Manzil panels keeps the recording component mounted, but background tabs, device sleep or browser limits can interrupt GPS; background recording is not guaranteed. The recorded line is a GPS trace, not a verified accessible road. The map breaks trace lines at recording gaps or implausible segments instead of drawing a continuous connection across them.

Trip history offers summary distance/time, gap counts, map viewing, GeoJSON line export and confirmed deletion. Elapsed time includes pauses. Distance omits gaps over 60 seconds and implausible segments; it is not map-matched. The app displays up to 50 recent summaries. Raw points are retained for 30 days from trip end and summaries for 90 days, with cleanup while the server runs or records are read. Summary-only trips cannot be viewed or exported as a trace. See [API.md](API.md) for exact retention and validation details. Local deletion does not promise forensic erasure from disks or backups.

## Verification boundary

The 14 October localhost build recorded 31 passing automated tests and desktop/375×812 browser workflows, including date-field input and saving high-precision coordinates. Those checks predate the 15 October MapLibre renderer replacement. The replacement's browser checks and final type/build/test results are recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md); do not treat the older renderer's screenshots as evidence for the new one. A real outdoor GPS journey and low-end physical-device performance remain unverified.
