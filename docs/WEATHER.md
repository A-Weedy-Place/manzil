# Islamabad hourly weather

The MVP uses one **Open-Meteo** city forecast for Islamabad. The header shows its temperature and weather icon at the live or planned map hour. A saved navigation trip can retain the departure-hour reading for its share image; ordinary Activity/history cards do not show weather. No account, API key, paid service, new package, browser location permission or Pakistan-wide weather download is required.

## Data and refresh

The server requests only `temperature_2m`, `weather_code` and `is_day` at the fixed GeoJSON coordinate **[73.0479, 33.6844]**. It asks for UTC epoch hours, Celsius, two past days and up to sixteen forecast days. These are **weather-model estimates**, including the current-hour display, not on-site live sensor observations. A planned time beyond returned coverage stays unavailable. Conditions map to shared WMO day/night icons. [Provider API and parameter documentation](https://open-meteo.com/en/docs).

`WeatherService` checks immediately when the standalone/emulator API starts and every minute thereafter for an elapsed one-hour refresh interval. It performs **at most one upstream request per hour per API process**, including failed attempts. Simultaneous requests coalesce. One shared, bounded dataset and last-attempt/next-refresh instants persist in repository metadata under `weather:islamabad:v1`, surviving restarts. Firestore uses the shared root metadata path, never a user's metadata. A missing cache can also be initialized by the weather endpoint; warm reads return immediately while refresh runs. A five-second upstream timeout, 100 kB streamed-body cap, bounded hourly rows and strict location/unit/time/value validation prevent oversized or malformed downloads.

Freshness is less than one hour after the last successful fetch. Cached readings can be shown as **stale** for less than six hours; afterward they are unavailable. Failures retain the prior dataset and enforce the same hourly backoff. The exact requested hour must exist: no nearest-date substitution, extrapolation or synthetic weather. HTTP/data errors do not change closures, ETAs or road accessibility. Routing and `/state` never request weather. Tests disable default external weather access; injected fixtures remain available for deterministic API tests.

The browser normally requests weather only for a changed map hour or an hourly refresh. A transient local API/network error retries the same lightweight city endpoint after one minute, recovering from development-server restarts without waiting for the next hour. The shared server-side provider limit remains hourly; a known out-of-range forecast response does not trigger minute retries.

The hourly guard is in-process with persisted restart backoff, **not a distributed lease**. Multiple API processes could race to refresh; a release with multiple replicas needs a transactional shared claim. No production timer, worker job, scheduler or deployment is activated by this localhost change. The deployment developer can explicitly wire a bounded worker schedule later. A production API can refresh through `/api/weather` on demand.

## API

`GET /api/weather?at=<ISO instant>` is public under the existing host/origin controls. `at` is optional and defaults to the request instant; offsets are normalized to UTC. Unknown query parameters, multiple values and timezone-free dates are rejected. Location is fixed: the endpoint accepts no coordinates, URLs or city names.

The response contains `location`, requested `at`, `state` (`fresh`, `stale`, `unavailable`), nullable `reading`, `fetchedAt`, `nextRefreshAt`, `availableFrom`, `availableUntil` and a short `message`. `availableUntil` is exclusive. `reading.at` is the UTC beginning of the matching hour; UI scheduling remains Asia/Karachi. For example, 12:45 PKT selects 07:00 UTC. Metadata describes the last dataset even if the selected hour is unavailable.

## Private trip snapshots and share images

`Trip.weather` is optional and server-owned. On trip creation the server reads its **existing cache only**, attaching a fresh valid departure-hour reading when the start is not in the future and the first GPS point is within 30 km of Islamabad's fixed center. No private GPS coordinates, account identifiers or selected destinations are sent upstream. Trips outside this city region, uncovered dates, stale/missing cache and old legacy records remain without weather. The two-day model window can cover a recently completed trip; it must not be described as a historical station observation.

The existing strict trip input schema rejects submitted `weather`; trip edits cannot replace it. The repository still verifies the owning account's travel consent atomically after asynchronous work. Saved readings persist unchanged when forecasts/profile preferences later change and follow the trip's existing deletion/retention lifecycle. Sharing uses only that persisted reading, never a current-weather lookup for an old trip. The branded PNG adds a compact temperature/icon and source credit without adding weather to the ordinary history list. Legacy/sample trips do not acquire invented readings through viewing or sharing.

## Provider usage

The provider's free API is for noncommercial use, including qualifying private/prototype use; it has no uptime guarantee. Current published free limits are 600/minute, 5,000/hour and 10,000/day. One city with an hourly refresh is small; the provider can count a request spanning more than two weeks as more than one billing-equivalent call. Commercial release needs a suitable licence or another provider. [Pricing](https://open-meteo.com/en/pricing), [terms](https://open-meteo.com/en/terms).

Open-Meteo data uses **CC BY 4.0**. Header/source links and exported source credits attribute the provider; the application rounds temperature and maps WMO codes into simplified condition icons. [Provider attribution requirements](https://open-meteo.com/en/licence), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Accessed 18 October 2026.

## Verification

Deterministic weather/API tests cover UTC/PKT hour boundaries, WMO icons, null rows, bounded parser/download validation, coalescing, persisted restart backoff, background refresh, explicit stale/unavailable states, timer shutdown, shared Firestore metadata, strict public query inputs, server-only immutable snapshots, city limits, no provider fetch from routing-state/trip writes, consent revocation and concurrent private account scope. Live-provider and browser results are recorded separately in `IMPLEMENTATION_STATUS.md`; fixture tests do not establish current weather truth.
