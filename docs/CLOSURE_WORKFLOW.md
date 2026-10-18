# Closures and blockades

**18 October approved integration (implementation/validation in progress, deployment pending):** merged GitHub main `f07778c` while retaining the deployed fuel scheduler and cloud voices. Selective >=95%-confidence road blockade/section and timed Metro publication replaces mandatory review only when independent source, geometry/service and time checks pass; uncertain events stay in review and counts are per decision. Admin corrections and shared demo provenance are retained. The owner explicitly excluded the bundled/offline Urdu voice pack. Earlier review-only, local-only and basic-Urdu notes below are historical. [Current behavior and operations](SELECTIVE_AGENT_PUBLICATION.md).

## What a contributor does

1. Open **Closures → Add closure** and choose **Road closure** or **Blockade**.
2. For a **road closure**, select the start and end on the same road. The selection follows the road's bends. The first pick previews a short piece of that road.
3. For a **blockade**, drag a short line across the affected road, or select its two endpoints. The line marks the physical barrier. Add each separate barrier as its own report; two barriers do not automatically close every road between them.
4. Add the road/place name, reason and start time. Choose an end time or **End time unknown**. Notes, photos and a source link are optional.
5. An ordinary account selects **Submit for review**. A verified contributor or administrator can publish their own report and approve or reject community reports.

The review card contains the reporter, place, schedule, notes and photos. A selected pending report has an **amber private preview** for an authorized author/reviewer. It does not affect public routes. Approved published restrictions appear for everyone: active restrictions are bright red, and upcoming restrictions have yellow markers with an inspectable yellow preview. Rendering follows the selected Live map or Plan ahead time.

Road closures paint the affected road interval. Blockades retain their short cross-road stroke. If there are two physical barriers with an accessible junction between them, create two blockade reports: routing can still use the middle section through other legal, open connections.

## Roles and account management

| Account | Can submit a report | Can publish its own report | Can review community reports | Can manage accounts |
| --- | --- | --- | --- | --- |
| Guest | Sign-in required | No | No | No |
| Ordinary | Yes; private pending draft | No | No | No |
| Verified contributor | Yes | Yes | Yes | No |
| Administrator | Yes | Yes | Yes | Yes |

Admins have a separate **Users** tab. It lists Auth accounts in pages of 50, supports searching the loaded accounts and loading more, and offers contributor verification and administrator access changes. Administrator changes require a confirmation. No directory response includes another person's private profile, location history or raw GPS.

Verification is server-owned metadata, checked on every request. Administrator access is read from the current enabled Firebase Auth account after token verification, so an old token does not retain a revoked administrator role. Granting/removing admin access preserves unrelated custom claims and separately granted contributor verification. Self-demotion and promotion/verification of a disabled account are blocked. The acting administrator is checked again immediately before each queued role write.

Role writes are serialized **within one API process**. Firebase Auth claims and verification metadata are not updated through a distributed transaction, and this queue does not provide an atomic last-administrator guarantee across multiple independent API instances. Standalone SQLite mode has one trusted local identity and cannot demonstrate account isolation; use Auth/Firestore emulators for role tests.

## Geometry and coverage

All domain/API coordinates use GeoJSON **`[longitude, latitude]`**. The editor may display latitude first in its labelled coordinate input; it converts before sending the API request. Schedule inputs use **Asia/Karachi (UTC+05:00)**; API instants require an explicit ISO 8601 offset and are normalized to UTC. `endsAt: null` means unknown, remaining active after its start until cancelled or given an end.

| Tool | Result | Boundaries |
| --- | --- | --- |
| Road point | Short mapped interval, approximately 20 m; follows bends and stops at connected junctions | Pick within 45 m of a supported public car road; 14 m full buffer width |
| Road section | Connected interval between projected endpoints on the same named road, or same OSM way for unnamed/generic roads | 3 m–6 km, at most 400 output points, bounded search; both picks within 45 m; 14 m full buffer width |
| Blockade | Exact two-point line crossing the affected mapped road | 2–80 m long; 4 m full buffer width; both endpoints within 45 m of a crossed supported road segment |

A blockade must intersect a supported public-road centerline transversely. A parallel/collinear stroke, a distant line or a private-road-only crossing is rejected. Endpoint contact with a supported road is accepted; the 4 m polygon supplies the routing footprint. Preview helpers save nothing and have no off-road fallback. Failed or ambiguous selections stay unavailable.

There is **no Islamabad city boundary** on closure editing. The bundled graph `osm-islamabad-2026-10-14T18:17:34Z-v1`, bounds **`[72.97, 33.6, 73.16, 33.75]`**, is an offline fast path. Outside it, the API automatically loads a small cached public OSM road graph around the selected coordinates through Overpass. `GET /api/state → graph.bounds` still describes only the bundled offline graph, not an editor boundary. Missing, incomplete or failed external road data returns HTTP 503 rather than a fabricated road. Resource/section-length limits in the table still apply. [Sources, cache, timeouts and tested coverage](ROAD_COVERAGE.md).

The graph models car-road/carriageway **centerlines**, not individual lanes, live lane counts or current traffic. A short stroke can distinguish separately mapped carriageways when its footprint reaches only one. It cannot reliably represent an individual closed lane on a shared centerline. A road interval on one mapped carriageway does not automatically close its separately mapped opposite carriageway; report that affected interval separately when both are closed. A two-dimensional footprint can conservatively affect overlapping flyovers or both directions represented by the same geometry. A road-section preview does not join flyovers merely because their lines visually cross; later polygon conflict checks still have this two-dimensional limitation.

## Evidence and validation

- Up to **six** JPEG, PNG or WebP photos per closure.
- Each photo: at most 150,000 decoded bytes and 205,000 data-URI characters, matching raster header and canonical base64.
- Combined closure photos: at most **750,000 data-URI characters**. This keeps the closure document bounded below Firestore's document limit; HTTP JSON remains limited to 4 MB.
- SVG, arbitrary data URIs and remote photo URLs are rejected. An optional source link is a separate HTTP/HTTPS evidence URL, at most 1,500 characters.
- Profile avatars retain their existing single-image limits. Closure photos are evidence, not profile avatars.

`/state` contains summaries and photo counts; expanding a report fetches authorized full details. Pending reports are visible to their author, verified reviewers and admins. A different ordinary member or guest cannot read them. Approved published evidence becomes publicly readable with the report. Rejected reports remain drafts and are not a global road restriction.

Client-supplied authors, roles or moderation fields cannot grant authority. The server records authorship, reviewer identity, review time and revision; these are not a full immutable administrative audit log. Reviews and updates require the current revision, and stale/already-decided reports return 409. Cancelling retains the record/evidence but removes its routing effect.

## API and later agent integration

| Request | Body | Result |
| --- | --- | --- |
| `POST /api/roads/point` | Strict `{coordinate}` | `RoadSection` preview |
| `POST /api/roads/section` | Strict `{from, to}` | Road-following `RoadSection` preview |
| `POST /api/roads/blockade` | Strict `{from, to}` | Short transverse `RoadSection` preview |
| `POST /api/geometry` | Validated `Drawing` | Canonical GeoJSON `Polygon` |
| `POST /api/closures` | `ClosureDraft` | Human report, with server-enforced publication/review role |
| `PUT /api/closures/:id` | Full draft plus `revision` | Authorized revision-checked update |
| `POST /api/closures/:id/review` | Strict `{revision, decision: 'approve' \| 'reject'}` | Community review decision |
| `PATCH /api/admin/users/:uid` | Strict `{verified: boolean}` **or** `{admin: boolean}` | Safe current `CommunityUser` |

`RoadSection` is `{drawing: Drawing, roadNames: string[], distanceMeters: number}`. `Drawing` is `{kind, coordinates, widthMeters}`. Road helpers are public read-only previews; invalid bodies return 400, unsupported geometry returns 422, and missing/outside graph coverage returns 503. They grant no publication permission.

For new explicit `ClosureDraft.restrictionType: 'road_closure' | 'blockade'`, `drawing` is required and `geometry` must exactly equal the canonical polygon derived from that drawing. Obtain it from `/geometry`; do not enlarge, replace, simplify or independently rebuild the routing area. A blockade requires `kind: 'line'`, exactly two coordinates and `widthMeters: 4`. Its mapped transverse-road checks run again on creation, update and approval, including typed agent drafts. Rejection can still dismiss malformed stored pending evidence. Imports use the same closure API.

Old untyped polygons remain compatible. Omitting an existing explicit type on update preserves that type and its validation; it cannot remove the blockade constraints. No new generic drawing/area controls are exposed in the simplified editor.

A deterministic preparation sequence for a tool caller is:

```ts
// from/to are evidence-resolved GeoJSON coordinates, not guessed coordinates.
const preview = await post(
  restrictionType === 'blockade' ? '/api/roads/blockade' : '/api/roads/section',
  { from, to },
);
const geometry = await post('/api/geometry', preview.drawing);
const draft = {
  restrictionType,
  drawing: preview.drawing,
  geometry,
  title, reason, description,
  startsAt, endsAt, // ISO instants with offset; null only for unknown end
  status: 'published',
  sourceUrl,
};
```

This prepares data, not an authorization bypass. A human community report uses `/closures` and its role rules. **Gemini map changes continue through private proposals and the administrator-only `/agent/notices/:id/review` workflow.** Verified community reviewers do not gain permission to approve Gemini proposals. That workflow retains proposal/source/target revision checks and required acknowledgement of unknown expiry or uncertain restriction impact. [Agent review contract](AGENT_MAP_REVIEW.md).

The geometry helpers do not call Gemini, fetch a new notice or activate a schedule. This follow-up adds no model calls, production role grants or deployment. Source collection and existing agent operations remain governed by their separate release configuration.

Meaningful coverage is in `tests/blockade-api.test.ts`, `tests/road-selection.test.ts`, `tests/community.test.ts`, `tests/community-ui.test.tsx`, `tests/firebase-integration.test.ts` and the map/road-selection hook tests. See [implementation status](IMPLEMENTATION_STATUS.md) for the final run counts and browser evidence.
