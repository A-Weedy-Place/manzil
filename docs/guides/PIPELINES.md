# Pipelines and source review

Administrators use **Pipelines** for operations and **Review queue** for decisions. Evidence and saved analysis open in an adjacent panel. Collection, model settings and approval are separate controls. This describes the current UI, not a claim that jobs are enabled in every runtime.

## Walkthrough

1. Open **Pipelines**. Collector, Gemini, weather and fuel cards show saved state, availability, last checks and bounded controls. Expand the relevant card.
2. **Fetch latest posts** collects supported public Champ Alerts evidence. New/edited posts are deduplicated. It does not call Gemini or publish restrictions. Public X coverage is partial.
3. If configured and eligible work exists, **Run Gemini now** invokes the private worker under existing batch/allowance limits. Progress distinguishes evidence reading, extraction and preparation. Refresh reads saved results.
4. Under **All posts**, select evidence. The adjacent panel shows source text/images/times, interpretation, uncertainty, work log and outcome. Reopening it does not rerun the model.
5. **Review queue** combines pending community reports and current undecided agent proposals. Counts represent individual pending proposals, including multiple events within one post. Expired and already decided events are excluded.
6. Clear validated road and Metro events publish automatically. Unknown source end receives a labelled 48-hour provisional expiry; later matching reopening ends the restriction sooner. For unresolved proposals, inspect/correct road geometry and PKT times, or confirm a bus line/direction, whole-line/ordered-stop scope and window. Missing fields stay explicit. **Approve** publishes atomically; **Reject** records a decision without changing the public map.

## States

| State | Meaning |
| --- | --- |
| Waiting for AI | Saved evidence has no completed current interpretation. |
| Analysing | A worker claimed this version; limits/cooldowns/failures can delay it. |
| Needs review | Saved interpretation/proposals require a human decision; previews remain private. |
| Expired | Source-supported window ended; no current restriction was added and no approval is pending. |
| Analysis failed | Evidence remains; inspect the reason and retry eligibility. |
| Rejected | The prepared proposal was rejected; no resulting map change. |
| Map/service updated | A decision recorded a change, which may now be future, ended, corrected or reopened. |
| Handled / archived | Inbox state changed; this does not cancel public restrictions. |
| Older version / unavailable | No matching current saved result; older analysis is not substituted silently. |

Use **Closures** to maintain published road events. Service notices have a separate edit path; bus suspension does not imply a car-road closure. Verified contributors can review community reports and maintain public notices without access to private agent decisions.

## Operational boundaries

- Collection and Gemini pause independently; a running bounded job can finish after pause. Neither control bypasses approval.
- Enabled source defaults to five minutes. Example cloud collection is `00,05,10,…` and analysis `02,07,12,…` PKT; the operator must configure actual jobs.
- Saved extraction can prepare/revalidate without another Gemini call. Source/target revisions, duplicates and manual overrides are checked before publication.
- Weather uses an hourly city cache, not a nationwide download or separate worker job. Fuel refresh is configured separately. Opening a card does not enable jobs.
- Emulator fixtures do not establish live source/model availability, current fuel tariffs or real bus suspensions.

See [ingestion](../operations/INGESTION_IMPLEMENTATION.md), [Gemini](../operations/GEMINI_INTEGRATION.md), [road review](../operations/AGENT_MAP_REVIEW.md), [service review](../operations/AGENT_TRANSIT_REVIEW.md) and [deployment](../operations/DEPLOYMENT.md).
