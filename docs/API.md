# Local API

This API implements the local Manzil prototype. It binds to **127.0.0.1:3001**, uses one durable SQLite database, and has **no account or tenant authentication**. The Vite development server proxies `/api` here. Do not expose this server to a network. Loopback host and origin checks reject ordinary cross-site browser access; they do not authenticate other processes on your computer.

Responses are the domain objects in [`shared/types.ts`](../shared/types.ts), without an envelope. All coordinates are `[longitude, latitude]`. Send `Content-Type: application/json` for every POST, PUT, or PATCH, including an empty `{}` for check operations. API times are ISO 8601 instants with an offset; responses normalize supplied instants to UTC. Commute wall-clock times and weekdays use Pakistan Standard Time, UTC+05:00.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/health` | — | Storage, graph readiness, pending-agent count; no private content |
| `GET /api/state` | — | `AppState`: closures, commutes, alerts, notices, trips, source state, graph state, event revision |
| `GET /api/profile` | — | The single persisted `LocalProfile` |
| `PATCH /api/profile` | Any nonempty subset of `displayName`, `theme`, `mapDetail`, `mapStyle`, `browserNotifications`, `inferFrequentRoutes`, `transport` | Updated `LocalProfile`; unknown properties and edits to ID/timestamps are rejected |
| `GET /api/frequent-routes` | — | `FrequentRouteProposal[]` learned from consented local trip analysis; empty while consent is off; no raw traces |
| `GET /api/places?q=...` | Optional local name query, at most 160 characters | Up to 12 local landmarks or imported OSM road names; this is not a global geocoder |
| `POST /api/geometry` | `Drawing` | GeoJSON `Polygon`; point/line width is the full corridor width in meters |
| `POST /api/plan` | `PlanRequest` | `PlanResponse`, including baseline conflicts, validated options, and honest unavailable reasons |
| `POST /api/closures` | `ClosureDraft` | Saved `Closure`, HTTP 201 |
| `PUT /api/closures/:id` | Full `ClosureDraft` plus the last-read `revision` | Saved `Closure`; 409 if another edit changed its revision |
| `DELETE /api/closures/:id` | — | Closure with `status: cancelled`; its evidence and history are recoverable by editing again |
| `GET /api/commutes` | — | Up to 100 saved `Commute` objects |
| `POST /api/commutes` | `CommuteDraft` | Saved `Commute`, HTTP 201 |
| `PUT /api/commutes/:id` | Full `CommuteDraft` | Updated `Commute` |
| `DELETE /api/commutes/:id` | — | Deleted `Commute` |
| `POST /api/commutes/:id/check` | `{}` | `CommuteImpact` for the next enabled weekday/time; works as a manual check even when automatic checking is disabled for that commute |
| `PATCH /api/alerts/:id` | `{ "read": true }` | Updated `Alert` |
| `GET /api/trips` | — | Up to 50 recent trip summaries: `points: []`, with `pointCount` reporting how many raw points remain |
| `GET /api/trips/:id` | — | Full `Trip` with raw points if still within retention |
| `POST /api/trips` | `TripDraft` | Saved `Trip`, HTTP 201; at most 20,000 points, ordered within a trip lasting at most 24 hours |
| `PATCH /api/trips/:id` | `name` and/or `contributeToRoadDiscovery` | Updated `Trip`; editing recorded geometry is not supported |
| `DELETE /api/trips/:id` | — | Deleted `Trip` |
| `GET /api/notices` | — | Latest 150 source notices |
| `POST /api/notices` | `{ "text": "...", "url": "https://...", "publishedAt": "2026-10-14T12:00:00+05:00" }`; URL and publication time optional | `SourceNotice`, HTTP 201, queued as `pending_agent` |
| `PATCH /api/notices/:id` | `{ "status": "reviewed" }`, `dismissed`, or `pending_agent` | Updated `SourceNotice` and matching outbox state |
| `GET /api/agent/outbox` | — | Oldest 100 currently pending notices for the future agent; only the newest revision of an edited notice is pending |
| `GET /api/source/status` | — | `SourceStatus`, with `coverage: partial` |
| `POST /api/source/check` | `{}` | `SourceStatus` after one bounded check; concurrent checks share the same run |
| `PATCH /api/source/settings` | `{ "enabled": true, "intervalMinutes": 15 }` | `SourceStatus`; interval is fixed at 15 minutes |

Saved closures change a global `eventRevision`; each closure also has its own revision. Only published closures influence routing. Drafts stay visible to the editor; cancellation removes their routing effect. Open-ended closures stay in effect after their start until cancelled or given an end, rather than silently expiring.

Closure areas use one closed, nonzero-area polygon ring. Crossing edges, repeated adjacent vertices, and holes are rejected; draw separate closure areas when needed. Routing reads every published closure, independently of the state view's display limit, so older active restrictions are not silently omitted.

Enabled commutes are checked after relevant saves and once a minute while the server is running. Alerts appear in the local app; **external push, email, SMS, and closed-server notification delivery are not implemented**. Duplicate impact alerts for the same next occurrence and closure revisions are suppressed. Route estimates use the imported OSM graph and speed assumptions, with no live traffic. Graph coverage and routing limitations are included in `AppState.graph` and each plan.

## Local profile and usual-journey consent

There is one profile per local SQLite database, shared by browsers opening this installation. It is a preferences record, **not an account, login, identity boundary, or separate person's protected storage**. Its ID is always `local`; defaults are `displayName: Traveller`, `theme: system`, `mapDetail: clean`, `mapStyle: streets`, `browserNotifications: false`, `inferFrequentRoutes: false`, and `transport: car`. The server controls `createdAt` and `updatedAt`. Display names must be 1–60 nonblank characters; theme is `light`, `dark`, or `system`; map detail is `clean` or `standard`. Other transport modes are not implemented.

`mapStyle` independently selects the basemap: `streets`, `outdoors`, `contrast`, `minimal`, or `night`. It is separate from both the app's light/dark theme and the label-detail preference. The default is colourful streets (the frontend's Liberty style), even when the app theme is dark. Existing profiles without this field are backfilled to `streets` when the database opens, preserving all other preferences and both profile timestamps; a previously selected style is never reset. Unsupported values return 400 without changing the saved profile. Each valid selection persists across server restarts.

`browserNotifications` records the user's preference; the browser must separately grant notification permission. It does not grant permission itself, stop in-app alerts, register a push service, or deliver while the local app/backend is stopped. The UI should only display inferred-route browser notifications when `inferFrequentRoutes` is also enabled. Existing in-app warning history is retained after opting out.

Turning on `inferFrequentRoutes` explicitly authorizes two local actions: learning usual journey patterns from existing and newly recorded trips, and checking those learned journeys for scheduled closure impacts. This is separate from the per-trip `contributeToRoadDiscovery` preference. The learner does not send raw trip points to another service, add a road, or assume a home/work label. Turning the preference off immediately makes `/api/frequent-routes` empty and prevents further inferred-route checks; recorded trips, past alerts, and deliberately saved commutes remain under their existing retention rules.

The learner considers up to 200 recent trips whose raw points remain within the 30-day window. It requires at least three similar journeys on **three distinct Pakistan Standard Time calendar dates**. Reimporting one day's trip does not create three independent observations. Trips need at least eight fixes with accuracy at most 50 meters, at least 80% usable fixes, at least 500 meters of reliable travel, and endpoints at least 400 meters apart. Journeys shorter than two minutes, longer than four hours, with long interruptions, excessive GPS jumps, or inadequate endpoint coverage are excluded. Grouped journeys must have same-direction endpoints within approximately 250 meters and local departure times within 45 minutes; midnight is handled as a circular clock.

The response contains up to ten strongest proposals, each with representative observed endpoints, a median departure rounded to five minutes, observed weekdays, sample count, and most recent observation. It contains no point arrays or inferred street-address labels. Unobserved weekdays are not silently assumed. IDs are deterministic and anchored to the oldest retained independent observation, so adding newer samples preserves identity; deleting or aging out that anchor can change a proposal's ID. Proposals are computed on demand, not stored as extra copies of GPS history.

Enabled learning also checks each qualifying proposal's next observed weekday/time after a closure/profile/trip change and during the minute scheduler. Its alerts have `frequentRouteId`, with no fictitious `commuteId`. The user can review and explicitly save a proposal through the ordinary commute API to adjust its name, locations, time, or weekdays. Saving is not required for the consented inferred warnings. Nearby saved commutes are a duplicate-warning hint only: learned paths are still validated, and a learned alert is suppressed only for a closure already reported by a matching saved journey's computed plan. A clear later saved departure must not hide a disrupted earlier learned departure.

Learning is a conservative heuristic, not evidence that a person will travel on a particular future day. It cannot recognize all routes or replace a deliberately reviewed commute schedule. The inferred endpoints can also fall outside the local road graph; normal routing limitations and unavailable results still apply.

Trip distance excludes segments separated by more than 60 seconds, non-increasing timestamps, accuracy worse than 100 meters, or apparent speed above 65 m/s. Such segments count as gaps and do not become invented straight-line travel. Raw points are removed after 30 days from trip end, leaving `points: []` and the computed summary; the summary is deleted after 90 days. Retention runs on startup, every minute, and when trips/state are read. No trip automatically changes the road graph, and the contribution flag does not upload data anywhere in this local build. SQLite deletion is not a guarantee of forensic erasure from disks or backups.

`GET /api/state` returns up to 2,000 closures, 100 commutes, 200 alerts, 150 notices, and 50 trip summaries. Trip summaries omit raw point arrays and include `pointCount`; fetch a trip by ID for its full trace. These are prototype bounds, not a paginated production API. A future agent should drain `/api/agent/outbox` using notice status updates rather than rely on the latest-notice view. No Gemini call or automatic interpretation is present yet. Notice review and closure publication are separate operations; a reviewed notice does not create a closure by itself.

Error bodies are `{ "error": "...", "details": "..." }`. Validation and malformed JSON return 400, missing records 404, version conflicts 409, bodies above 4 MB return 413, and incorrect write content types return 415. Unexpected errors return a generic 500 without stack traces or raw post content. Route requests that cannot be satisfied normally return a `PlanResponse` with an unavailable reason instead of a fabricated route.

Configuration: `PORT` defaults to 3001; `HOST` must be `127.0.0.1`; `MANZIL_DATA_DIR` defaults to `data`; optional `MANZIL_DB_PATH` overrides the full database filename. Source collection settings are described in [INGESTION_IMPLEMENTATION.md](INGESTION_IMPLEMENTATION.md). Keep the database, `.env`, browser state, and personal GPS out of Git.
