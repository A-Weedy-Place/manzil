# Local API

This API implements the local Manzil prototype. It binds to **127.0.0.1:3001**, uses one durable SQLite database, and has **no account or tenant authentication**. The Vite development server proxies `/api` here. Do not expose this server to a network. Loopback host and origin checks reject ordinary cross-site browser access; they do not authenticate other processes on your computer.

Responses are the domain objects in [`shared/types.ts`](../shared/types.ts), without an envelope. All coordinates are `[longitude, latitude]`. Send `Content-Type: application/json` for every POST, PUT, or PATCH, including an empty `{}` for check operations. API times are ISO 8601 instants with an offset; responses normalize supplied instants to UTC. Commute wall-clock times and weekdays use Pakistan Standard Time, UTC+05:00.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/health` | — | Storage, graph readiness, pending-agent count; no private content |
| `GET /api/state` | — | `AppState`: closures, commutes, alerts, notices, trips, source state, graph state, event revision |
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

Trip distance excludes segments separated by more than 60 seconds, non-increasing timestamps, accuracy worse than 100 meters, or apparent speed above 65 m/s. Such segments count as gaps and do not become invented straight-line travel. Raw points are removed after 30 days from trip end, leaving `points: []` and the computed summary; the summary is deleted after 90 days. Retention runs on startup, every minute, and when trips/state are read. No trip automatically changes the road graph, and the contribution flag does not upload data anywhere in this local build. SQLite deletion is not a guarantee of forensic erasure from disks or backups.

`GET /api/state` returns up to 2,000 closures, 100 commutes, 200 alerts, 150 notices, and 50 trip summaries. Trip summaries omit raw point arrays and include `pointCount`; fetch a trip by ID for its full trace. These are prototype bounds, not a paginated production API. A future agent should drain `/api/agent/outbox` using notice status updates rather than rely on the latest-notice view. No Gemini call or automatic interpretation is present yet. Notice review and closure publication are separate operations; a reviewed notice does not create a closure by itself.

Error bodies are `{ "error": "...", "details": "..." }`. Validation and malformed JSON return 400, missing records 404, version conflicts 409, bodies above 4 MB return 413, and incorrect write content types return 415. Unexpected errors return a generic 500 without stack traces or raw post content. Route requests that cannot be satisfied normally return a `PlanResponse` with an unavailable reason instead of a fabricated route.

Configuration: `PORT` defaults to 3001; `HOST` must be `127.0.0.1`; `MANZIL_DATA_DIR` defaults to `data`; optional `MANZIL_DB_PATH` overrides the full database filename. Source collection settings are described in [INGESTION_IMPLEMENTATION.md](INGESTION_IMPLEMENTATION.md). Keep the database, `.env`, browser state, and personal GPS out of Git.
