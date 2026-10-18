# Map editor and journey workflows

This guide describes the current interface and its safety boundaries. For technical contracts, use [API](../reference/API.md), [routing](../reference/ROUTING.md), [closure reporting](CLOSURE_WORKFLOW.md) and [current implementation status](../IMPLEMENTATION_STATUS.md).

## Workspaces

| Workspace | Purpose |
| --- | --- |
| Map | Live-time driving routes, up to five ordered stops and navigation |
| Plan ahead | A separate PKT date/time snapshot, scheduled closures and departure comparisons |
| Local | Islamabad/Rawalpindi bus catalogue, stop-to-stop connections and reference fares |
| Closures | Report, inspect and review road closures or physical blockades |
| Saved | Repeating commute schedules and disruption checks |
| Activity | Consented trip summaries, history, map replay and share images |
| Profile | Identity, vehicle, privacy, statistics, appearance and language |

Administrators instead have primary **Users**, **Review queue**, **Closures** and **Pipelines** sections, plus operational Map/Local inspection and Account. They do not receive commuter statistics, vehicle/history/consent or personal navigation/saving controls. Post evidence and Gemini analysis open in an adjacent review panel. See [administrator workspace](ADMIN_WORKSPACE.md).

Registration or explicit guest entry offers a skippable tour; ordinary login and resumed guest reload do not replay it. The initial account screen offers Continue as guest. A sign-in dialog opened from guest browsing can be closed without losing the guest's work. [Accounts and tour](../engineering/DEV_ACCOUNTS_AND_TOUR.md).

## Map appearance

- **MapLibre GL JS** renders OpenFreeMap vector tiles. New/missing preferences use **Dark** app appearance and **Classic** map style. Existing deliberate choices remain saved.
- **Classic, Minimal and Night** are independent of Light/Dark/System app appearance. Local has a separate Minimal default to emphasize bus lines.
- **Clean** detail reduces POIs/buildings/shields and delays small street labels; Standard restores ordinary detail. Maps remain flat and north-up.
- Tiles, styles, fonts and sprites need internet. Preserve OpenFreeMap/OpenMapTiles/OpenStreetMap attribution. No paid basemap key is required.
- Pixel ratio is capped at 1.75 and tile-cache zoom levels are bounded. Basemap failures remain visible; WebGL/context failures offer Restart map. Fields and coordinate editing remain usable, but a rendered map needs graphics support.

See [map styles](MAP_STYLES.md) and [performance](../engineering/PERFORMANCE.md). These measures are not a guarantee of low-end device speed.

## Choose a journey

1. Set **Starting point** and **Destination** by selecting a search suggestion, choosing on the map, or entering coordinates. Opening a field offers **Use current location** first. Photon/OSM search has different place coverage and ranking from Google Places.
2. Add up to **five ordered stops**. Arrow controls reorder them; the trash icon removes one. Reverse journey reverses the endpoints and stop order.
3. Select **Find routes**. A fresh visit has no preselected A/B journey.
4. Choose a validated route card, its map line or minute label. Routes show estimated duration, distance and arrival; a saved vehicle/mileage and applicable dated price enable a reference fuel-cost estimate.

The labelled UI coordinate input uses **latitude, longitude**; domain/API/GeoJSON uses **[longitude, latitude]**. The UI converts between them. Selecting a place establishes an endpoint; typing a replacement invalidates the old endpoint and pending lookup. Search has a bounded deadline and explicit failure state. Map picking and coordinate entry remain available.

**My location** recentres the map only. It preserves endpoints, stops, selected route and map time, starts no recording and does not select a start automatically. An explicit location choice in a journey field updates only that field. **Fit journey** fits the selected journey. Browser/OS permission, location services and hardware determine the returned fix; the display does not manufacture precise GPS.

## Live and planned time

**Map** always uses now. Its compact **Live map** header shows PKT time/date and available Islamabad hourly weather. **Plan ahead** owns the alternative date/time picker and optional earlier/later departure comparison. Returning to Map restores live time and remembers the planned selection separately. All schedules use **Asia/Karachi (UTC+05:00)**.

Time/revision refreshes recalculate in the background and retain the previous display during a passive refresh, then replace it with a complete result. A retained stale display is not permission to navigate: guidance requires a current validated result. Planned journeys offer **View live route** before current navigation. [Map time and stops](MAP_TIME_AND_STOPS.md), [weather coverage](../reference/WEATHER.md).

## Route display

| Map element | Meaning |
| --- | --- |
| Thick blue line with casing | Selected validated driving route |
| Muted blue alternatives | Other validated routes at the same departure |
| Pale-red original and Blocked badge | Inspectable unblocked-time comparison; never eligible for navigation |
| Bright-red road interval or cross-road stroke | Published active road closure or blockade |
| Yellow marker | Upcoming restriction; hover/focus previews its section, click/tap pins the preview |
| Prominent green history trace | Previously recorded travel, with start/end markers; not a newly validated route |

The planner returns **up to three genuine alternatives**, not three fabricated choices. A smaller set or unavailable result is explicit. Shared open parts are removed from the blocked comparison display, keeping blue routes clear. Hiding Closures or Blocked route changes display only; it never removes routing restrictions.

Only Plan ahead offers departure comparisons. A later departure means waiting before setting off; it does not model waiting at a roadside barrier. Ordinary public residential/service streets already participate in local routing when they save estimated time. There is no separate street-detour mode. See [routing limits](../reference/ROUTING.md).

## Report and review a closure

Open **Closures → Add closure**. Guests are prompted to sign in and may dismiss that dialog.

- **Road closure:** select two ends of the same connected mapped road; the interval follows its bends. A first pick previews a short road section.
- **Blockade:** drag a short line across the affected road, or select its two endpoints. Each separate physical barrier is a separate report.
- Add road/place, reason, start and end or **End time unknown**. Notes, source link and up to **six bounded photos** are optional.
- Ordinary reports remain private pending drafts. Verified contributors/admins may publish their own reports, review submissions and correct/cancel pending or approved public reports. Editing a pending report keeps approval separate.

The editor uses a bundled graph where covered and bounded public OSM road requests elsewhere; there is no Islamabad city gate. Unsupported or unavailable road geometry stays explicit. It models car-road centerlines rather than individual lanes. A two-dimensional footprint can conservatively affect flyovers or shared carriageways. [Full workflow, geometry bounds, photos and agent API](CLOSURE_WORKFLOW.md).

Select a card or marker to inspect its place, From/Until, author, photos and notes. Full evidence loads only after authorization. Edit sends the loaded revision; conflicting changes are rejected. Cancellation retains the report/evidence while removing its routing effect. Pending previews are private and amber; they do not change public routes.

## GeoJSON import/export

Export downloads the loaded closure view, up to 2,000 records, as a Polygon FeatureCollection; it is not a complete database backup. Import accepts up to **2 MB / 100 Polygon features**, one valid closed non-self-crossing ring per feature, without holes. Imported records use the same authenticated role, geometry and moderation validation as other closure writes.

Supported properties include title, description, reason, startsAt, endsAt, status, drawing and sourceUrl. Missing status defaults to draft and end to unknown. Imported IDs do not update existing records: repeated imports can duplicate reports. Sequential import can partially succeed; review its saved count rather than assume an atomic batch. Legacy untyped area records remain API-compatible without restoring the removed Point/Draw/Area editor menu.

## Saved commutes and notifications

Use **Save journey** from results, save a history trip, or open **Saved → Save a commute**. Choose a name, PKT departure and repeat weekdays. Saved commutes preserve ordered stops; up to 100 are retained. **Check next departure** evaluates the next matching occurrence and can open its plan.

Checks run after relevant saves and under the configured local/worker scheduler. New conflicts or cleared disruptions can create in-app alerts; duplicate occurrence/revision impacts are suppressed. Browser notifications require separate permission and an open page. Production commute scheduling is a separate operational configuration: do not infer that it is active from a saved route. There is no closed-app push, email or SMS delivery. [Travel/notification behavior](../reference/PERSONAL_TRAVEL_DATA.md).

## Navigation, activity and sharing

Route preview alone collects no GPS. **Start GPS guidance** explicitly requests location; turn guidance requires a sufficiently fresh/accurate fix. Approximate/stale/denied states remain distinct. Voice settings and steps are folded away from the main instruction. English/Urdu use suitable device voices when available, optional configured cloud speech, or the bundled basic synthetic Urdu pack with its documented fixed vocabulary. [Navigation and voice limits](BILINGUAL_NAVIGATION_AND_CLOUD.md).

Personal trip collection is off until allowed. With consent, navigation reuses its existing watcher; meaningful foreground trips of at least **60 seconds / 100 m** can save to history. Hiding the page discards an unsaved fragment; account changes and opt-out discard it and abort pending saves. Activity is read-only history/summary, without a separate manual Record trip workflow.

History offers map replay, Save journey, Share/download image and deletion. The share image includes branding, trip metrics, available saved fuel/weather context and the retained trace. Broken or implausible GPS sections remain gaps. Raw points expire after **30 days**, summaries after **90 days**; summary-only records cannot invent a trace. A road-discovery flag never adds roads automatically. Emulator sample histories retain server-owned synthetic provenance and must not become real-road evidence or be copied to production. [Personal data](../reference/PERSONAL_TRAVEL_DATA.md), [API](../reference/API.md).

## Validation boundary

Executed checks and material remaining work belong in [implementation status](../IMPLEMENTATION_STATUS.md), rather than dated test counts in this guide. Automated routing/UI tests do not establish physical-device GPS accuracy, operator bus schedules, live traffic, guaranteed voice pronunciation or low-end hardware performance.
