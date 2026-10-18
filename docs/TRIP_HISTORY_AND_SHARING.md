# Trip history and sharing — 18 October 2026

Local feature-branch work; no deployment, GPS-data migration or external image upload is included.

## Using it

1. Open **Trip history** in Profile or Activity. Each card shows the trip name, PKT date/time, distance, duration and saved fuel estimate. Raw GPS point counts are omitted from ordinary cards.
2. **View on map** opens the retained path in bright **green**, with a white halo and separate **S / E** start/end markers. The camera fits the full path, including intermediate points. Live planning routes, ETA labels and A/B pins are hidden while history is displayed, then restored with Hide recorded trip; the planner inputs are preserved. Fit journey prioritizes the displayed historical trace. Red closure styling remains separate.
3. **Save journey** opens the regular saved-journey editor using the trip's valid start/end. Review the name, departure time and repeat days before **Save commute** enables its recurring checks; opening the editor alone creates no schedule. A saved commute is a new independently planned journey, not a promise to replay historical road geometry.
4. **Share** opens an image preview. **Download PNG** saves a branded Manzil image with the route map, date/time, endpoints, kilometres, duration and available estimated fuel cost. A saved Islamabad departure-hour weather snapshot adds its small temperature/condition icon; ordinary history cards do not show weather. **Share image** also appears when the browser supports sharing PNG files through its native share sheet.
5. **More options → Download GeoJSON** retains a secondary data export. Delete still requires confirmation.

Viewing history, creating an image or saving a commute does not request location permission, start a GPS watcher or enable collection. A retained summary whose raw trace expired can still show metrics; its View/Share/Save journey controls are unavailable. Raw traces remain subject to **30-day retention** and summaries to **90 days**.

## Image generation

The **MY JOURNEY** heading now sits clearly below the logo (baseline154, logo bottom115). Optional `Trip.weather` is drawn from the immutable server-owned snapshot only, with a code-native day/night symbol, rounded Celsius temperature, Islamabad label and **Open-Meteo model / open-meteo.com** credit. Sharing never requests weather or substitutes current conditions for the trip's hour. Old/sample trips without a real saved forecast omit the weather chip. [Weather collection and trip limits](WEATHER.md).

The preview uses a temporary offscreen MapLibre map created only after explicit Share. It uses the existing **OpenFreeMap / OpenMapTiles / OpenStreetMap** style/provider, the selected map style (Classic fallback), a full-path camera fit and the green recorded-route overlay. The map has `preserveDrawingBuffer` enabled only for this disposable render. A fresh local canvas combines its screenshot with the local circular Manzil logo and English brand, readable trip statistics and required map attribution. The output is **1080 × 1360 PNG**.

The same public provider receives ordinary style/tile requests for the viewed area; it does not receive the trip JSON, identity or raw trace array. The generated image and private data are not uploaded to a Manzil image service. An explicit native Share action hands the PNG to the device/browser share sheet, whose chosen destination is controlled by the user. The preview warns that the image includes the route, endpoints and journey details. Public tile requests still expose the requested geographic tile area and ordinary connection metadata to that provider.

Tile/WebGL failure or a bounded rendering timeout produces a **clearly labelled route illustration** instead. This geographic fallback has a grid, real retained route shape and endpoints; it does not invent street names or pretend to contain a loaded basemap. The preview and PNG both state that the basemap is unavailable. The overall map attempt is bounded to 15 seconds, with a 10-second map-render deadline after style/module loading. The logo load has a 1.5-second deadline and falls back to the English brand if unavailable. No new paid API or service is required.

Closing history, returning from Share or changing accounts aborts rendering and removes the temporary map/container; preview object URLs are revoked. Failed generation retains Retry, and a browser that cannot share files still supports PNG download. Cancelling the native share sheet is not reported as an application failure. Browser/OS sharing availability varies; downloading is the portable path.

## Trace and account boundaries

History summaries do not contain raw points. View, Share and Save journey explicitly request one authorized `GET /api/trips/:id`; UID changes and unmounts abort/discard late requests. Image rendering, preview publication and download/share actions retain the matching UID guard. The share view stays inside the existing history settings panel, avoiding a second nested modal/focus trap.

Map display, screenshots and data export preserve recording gaps and invalid/inaccurate fixes rather than connecting them into invented shortcuts. GeoJSON uses `[longitude, latitude]`, with LineString/MultiLineString for accepted segments and MultiPoint if only isolated valid fixes remain. These are historical paths, not current validated navigation routes or road-access evidence. The map does not make an off-road trace automatically routable.

The localhost **User 123** account contains generated public-OSM paths. Its PNG includes **Simulated journey · fictional GPS and fuel estimate**, and its GeoJSON retains `simulated:true` with explicit fictional provenance. The main history/profile cards omit repetitive demo banners, while documentation and downloads retain the distinction from real captured travel. Such trips remain excluded from usual-route inference and road-discovery contributions. See [sample account](SAMPLE_ACCOUNT.md) and [personal-data boundaries](PERSONAL_TRAVEL_DATA.md).

Fuel costs use each trip's immutable saved estimate. Editing a vehicle or today's global price does not reprice history. Missing fuel snapshots remain unavailable; they do not become zero-cost trips. Dates use **Asia/Karachi**. The exported image currently uses English labels and number formatting, even when the surrounding app is Urdu; the interface remains translated/RTL-capable.

## Verification

Focused tests cover explicit detail fetching, no GPS activation, card actions, Save journey callback, PNG versus secondary GeoJSON, simulated provenance, share-sheet cancellation, image retry/fallback, UID races, URL/temporary-map cleanup, bounded stalled renders, full-trace bounds, gap preservation, green overlays and unchanged blue route colors. Passive background route refresh retains the visible blue path without pending colors; explicit stale input revalidation keeps its existing safeguards. Final integrated build/browser evidence and test counts belong in [implementation status](IMPLEMENTATION_STATUS.md).
