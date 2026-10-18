# Automatic road and Metro lifecycle

Owner-approved integration, 18 October 2026. Deployed through main merge 33b5af5 with frontend correction f4a1460; see the exact API/worker/Hosting evidence in implementation status. See [implementation status](../IMPLEMENTATION_STATUS.md).

## Collection, interpretation and publication

The five-minute collector saves original public text, publication/edit timestamps and bounded private images. Unchanged content is deduplicated before model analysis. The private Gemini worker extracts up to three events, with English/Urdu summaries and quoted evidence. Missing-person notices are excluded; fuel announcements never overwrite authoritative PSO prices.

Clear road closures and blockades publish automatically after evidence and actual road-geometry checks. A point blockade is transverse to its affected carriageway; an interval follows connected road geometry between endpoints. Named locations must be supported by saved source text, including shared list headings. A bare landmark pin is insufficient. National M/N road references may resolve without an unnecessary city, but unknown interchange ramp/direction or ambiguous carriageways still require review. Long OSM segments can be projected onto rather than requiring a nearby node; an unambiguous one-way road is not rejected just for being one-way.

Extraction confidence >=0.85 is necessary, not sufficient. Explicit access/service closure, a unique mapped scope and source-grounded timing are required. Missing expiry alone is not material uncertainty; uncertain location, direction or whether access is actually closed remains reviewable. A supporting image does not prevent publication when the saved text independently establishes the event; image-only/unlocated evidence still needs review. Truncated sources, material extraction warnings, tentative/negated restrictions and invented source facts remain blocked.

An explicit announcement that a named road/section will close for VIP movement schedules that closure at the evidenced start. VIP movement alone does not close Srinagar Highway, Expressway, Serena or Red Zone by assumption. Congestion is not a closure. Future announcements without an established start require clarification.

## Two-day provisional expiry

When the source gives no reopening time, use **48 hours from the source-supported start**, mark agent.expiryBasis as provisional and label the application expiry in the UI/description. This applies to roads and Metro services. It is not presented as a source-confirmed reopening. An explicit source end takes precedence. A source clock omitted by the interpretation requires correction rather than silently substituting 48 hours.

A current closed/blocked/suspended statement without a clock can start at known original publication time. A clock without a date is anchored only to the original PKT publication day. Unknown publication or unsupported dates stay reviewable. Recollecting the same tweet never renews expiry; fresh evidence can update the uniquely matching active incident. Expired old evidence cannot restart its lifetime from collection or reassessment time.

A newer explicit reopening/restoration cancels the uniquely matching unchanged agent incident, retaining source and history. Model target IDs are checked; unique deterministic matching can supply a missing target. Admin corrections/cancellations and newer evidence take precedence. Road/service revisions and result/history commit atomically; concurrent changes withhold publication.

## Metro updates Local

Service suspensions write shared transit:disruptions records, not car-road polygons or invented timetables. Local map availability, selected-time route display and journey planning read those records. A known line, direction and whole-service/ordered-stop scope must resolve against the public catalogue. Red Line service-family variants are represented explicitly; unrelated lines remain available. Generic Metro without an identifiable line/city does not close every service.

Scheduled suspensions take effect at their stated start, expire at their source/provisional end and can end earlier on a matching restoration announcement. Stop order and direction remain enforced. No live bus positions or invented diversions are added.

## Review and saved work

Admin > Pipelines shows original post, analysis, per-event decisions and committed map/service outcomes. Automatic decisions are labelled separately from administrator approvals. Review queue counts individual unresolved road/service proposals plus community reports; a partially applied post can still need review. Published roads have View on map; Metro outcomes identify the effect on Local.

Saved current pending interpretations are reassessed using the same policy and map tools without another Gemini call: at most one saved post per idle sweep, every 15 minutes, up to three reassessments for policy version 2. Approved/rejected decisions are retained exactly; source edits, archived posts and concurrent decisions invalidate stale work. Older legacy service proposals are converted rather than approved as car-road blockades. Policy retries do not add model usage; fresh model analysis retains the existing 20-attempt/day cap, two-post batch, cooldowns and worker-only Free-tier key. No paid fallback or account rotation is added.

## Shared synthetic demo closures

`scripts/publish-shared-demos.ts` previews ten existing active/upcoming fixtures using canonical mapped roads, then `--apply` explicitly imports them into project `manzil-app-v1`. Seven start at import and expire after 32 days; three start next month and each last 32 days. The former 26 Number illustration is re-resolved to a real nearby road segment before importing. Failure to resolve any geometry aborts before any database write.

Imported records are `Demo`/`demoData:true` and affect shared guest and signed-in routes while active. A visible banner identifies synthetic restrictions. Admins cancel them in Blockades. Stable IDs and an atomic marker prevent duplicates or resurrection after cancellation. Existing records are never overwritten. This command creates no authentication account and imports no User 123 journeys, GPS, photos or fake fuel prices. Emulator-only personal sample seeders retain their production guard.

## Operations and rollback

Deploy the tested API image, deploy that same immutable image to the private worker (retain its existing Secret Manager binding), then republish Firebase Hosting to move its API pin. Inspect the upload manifest; env files, local databases, source archives and test artifacts must stay excluded.

After both backends are ready, enable the approved policy:

```powershell
powershell.exe -NoProfile -File scripts/agent-cloud.ps1 -Action EnableValidated
```

`EnableReview` immediately makes future batches review-only; `Disable` pauses future analysis. An already running batch can finish. Before rolling back to an older worker, switch to EnableReview and wait for active work to finish. Retain matched API/Hosting revisions. Cancellation of demo records is independent of the agent policy.

Navigation uses configured Google Cloud voices first, then compatible device voices. The owner excluded the incoming bundled/basic Urdu WAV fallback; its code, generator and assets are removed. The nightly PSO job at 01:00 Asia/Karachi and shared 100,000-character cloud-speech cap are retained.
