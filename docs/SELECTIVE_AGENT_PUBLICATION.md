# Selective road and Metro publication

Owner-approved release scope, 18 October 2026. This supersedes older mandatory-review notes. See IMPLEMENTATION_STATUS.md for actual deployment/test evidence.

## What happens to a post

1. The existing five-minute collector saves original public text, timestamps and bounded private images. Repeated unchanged posts do not generate new analysis.
2. The private Gemini worker extracts at most three events. Each event identifies road versus transit, quoted evidence, location/service, confidence and PKT times. Missing-person content is discarded; fuel announcements do not overwrite the authoritative PSO cache.
3. Road names are resolved against real public-road data. A `road_closure` follows connected road geometry between endpoints; a `blockade` is a short transverse barrier. Junctions and ambiguous/divided carriageways require review. Landmark pins alone never qualify for automatic routing changes.
4. Metro/bus services resolve against the bundled local network. Generic “Metro”, unsupported cities, uncertain scope/direction or unmatched stops require review. Whole Red Line notices cover its three catalogue route variants explicitly; Blue/Green have named aliases. Orange main and airport corridors require a precise service reference. No new transit network or timetable is invented.
5. Automatic publication requires confidence >=0.95 **and** complete literal text evidence, explicit closure/suspension, source-grounded location/service, verified timing and no warnings/uncertainties. Tentative, negated, truncated or image-only restrictions stay in review. A current/upcoming period must have both ends, last <=24 hours, begin no more than seven days ahead and not already have ended. Unsupported time/date phrasing stays in review rather than receiving an invented expiry.
6. Clear events publish; uncertain events remain pending **individually**, even inside the same post. Result/history and road/service changes commit atomically with revision and source-claim checks. A concurrent correction defers the entire proposed automatic change set to review. Repeated updates match an existing agent incident where unique; conflicting targets remain in review.

## Metro availability

Service suspensions use shared `transit:disruptions` records, not car-road polygons or edits to the bundled source timetable. Network availability, Local journey planning and selected-time map styling read the same records. A 19:00–20:00 PKT suspension excludes the affected service/ordered stop segment during that period; it expires at 20:00 without a scheduled delete. Unrelated routes remain available. Partial notices respect stop order and direction. Existing planner rules also reject a ride overlapping a suspension during the journey.

The Local client checks lightweight revisions every 20 seconds while visible and refreshes at known service boundaries; this is not a live vehicle feed. No guarantee is made that the partial public X preview captures every notice.

An explicit newer restoration may cancel only a uniquely matched unchanged agent incident inside its existing active window. Admin edits/cancellations retain provenance and block silent agent recreation; source/newer-evidence guards apply to roads and transit.

## Review and demonstration

Open **Admin → Pipeline**. Compare Original post, Gemini analysis, per-event work log, policy issues and actual outcome. `Auto-published after validation` means committed publication. `Needs review` counts individual pending decisions, including Metro notices and community reports. One post can appear in both Needs attention and Map changes.

- Road proposals: **Review on map**, complete/check the extent and PKT times, then approve/reject.
- Service proposals: **Review service notice**, select a known service, optional direction/ordered stops and both PKT times, then approve/reject. Service publication updates Local availability; it does not close private-car roads.
- Published road proposals have **View on map**. Service outcomes are shown in Pipeline and Local journeys.
- Saved older interpretations are retained. They are not silently reclassified/reanalysed or retroactively published on deployment. A generic historical road-disruption interpretation is not evidence of a specific Metro suspension.
- Fetch collects, Run Gemini analyses at most two queued posts, Refresh reads saved records only.

Existing 20 generation attempts per PKT day, token limits, cooldowns, durable deduplication and the worker-only Free tier key remain. No account/key rotation or paid fallback is introduced.

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
