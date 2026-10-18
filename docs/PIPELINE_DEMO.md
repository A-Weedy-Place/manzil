# Demonstrating source updates

**18 October approved integration (implementation/validation in progress, deployment pending):** merged GitHub main `f07778c` while retaining the deployed fuel scheduler and cloud voices. Selective >=95%-confidence road blockade/section and timed Metro publication replaces mandatory review only when independent source, geometry/service and time checks pass; uncertain events stay in review and counts are per decision. Admin corrections and shared demo provenance are retained. The owner explicitly excluded the bundled/offline Urdu voice pack. Earlier review-only, local-only and basic-Urdu notes below are historical. [Current behavior and operations](SELECTIVE_AGENT_PUBLICATION.md).

**18 October pipeline update:** Control centre opens on Pipeline. Review queue and Awaiting review combine current Gemini post reviews with pending community reports; multiple events count as one post until its last decision. Run Gemini now invokes the private worker through the authenticated public API, with the same claims, five-minute schedules and daily limits. Live saved-state progress and per-proposal tool logs make the stages observable. The agent matches unique current incidents and retries eligible failed mapping from saved extraction, at most three attempts with fifteen-minute cooldown; every map action still requires admin approval. [Current workflow](AGENT_MAP_REVIEW.md), [release evidence](IMPLEMENTATION_STATUS.md). Older scheduling-only and automatic-publication entries are historical.

Open Manzil as an admin, then **Control centre → Pipeline**. The screen follows three stages: **Collect → Understand → Decide**. Daily fuel controls are still available in the expandable **Daily fuel prices** section below the source workflow.

## A short walkthrough

1. Point to **1. Post collection** and its last successful check. **Fetch latest posts** reads the public Champ page and saves new/edited source evidence. It does not call Gemini or create a blockade. Unchanged evidence is deduplicated. Public-page coverage stays partial.
2. Choose **Run Gemini now** in **2. Gemini analysis** when eligible posts are waiting. It invokes the private worker and analyses at most two posts using the existing daily allowance. Watch the live stage: reading evidence, interpreting, then mapping. Scheduled AI checks also run at `02,07,12,…`, while collection runs at `00,05,10,…`, in Pakistan time. Delivery, cooldown and the twenty-attempt daily allowance can delay a post. **Refresh results** only reads saved data. A disabled Run button with no waiting posts is normal: analysis has already finished.
3. Under **Posts & outcomes**, leave **All posts** selected and expand a post. **Original post** shows saved source text, its original link, publication/collection/edit times and available images. **Gemini analysis** shows the interpretation, location, start/end in PKT, original quotes and uncertainty. **Map outcome** shows whether this version actually recorded any map change.
4. Open **Review queue**, or select the **Awaiting review** counter. It contains current Gemini post reviews and pending community reports. Expand a post and inspect its per-event **Agent work log** when available. **Review on map** opens a populated private proposal; older interpretations are prepared without another model call. Check the fields and geometry, complete explicitly missing information, then **Approve and add to map** or **Reject proposal**. You return to the review queue after deciding. Opening the preview never changes routes. A congestion report still requires confirmation of an actual road restriction. [Review details and limits](AGENT_MAP_REVIEW.md).

## Reading the states

| Label | Meaning |
| --- | --- |
| Waiting for AI | Original evidence is saved; a current interpretation is not available yet. |
| Analysing | The worker has claimed this version and is processing it. |
| Needs review | AI finished, but evidence requires human attention. A result can contain partial map changes; always read Map outcome. |
| Proposals rejected | An administrator rejected every prepared event proposal; the decision is retained and the map was not changed by rejection. |
| Analysis failed | Evidence remains saved; inspect the reason/status. This is shown under Needs attention rather than counted as ordinary waiting work. |
| Map updated | Validated changes were saved. This does not mean the road is currently blocked: the event may be future, ended, reopened or subsequently corrected. |
| Archived / Handled | The inbox item was dismissed or handled. If no current interpretation is loaded, the UI does not invent a map outcome. |
| Older version | The visible interpretation belongs to an earlier post version; it is not used as the new version's result. |

An empty **Waiting for AI** view is normal after processing. Switch back to **All posts** for completed results. The inbox's backend `reviewed` field means processing/handling completed, not that a human approved a blockade. Each card's current AI result and map outcome carry that distinction.

**Map changes** includes current results with changed blockade IDs, including partially applied results that still need review. The IDs can be expanded for technical tracing. Some older posts may be outside the latest result listing; an unavailable result is shown as unavailable rather than as proof of no map change.

## Controls and scope

The collector and Gemini have independent pause controls. Pausing collection does not cancel an already running check or stop Gemini from processing saved evidence. Pausing Gemini does not stop source collection. A running batch can finish after it is paused. Full Scheduler pause commands remain in [model operations](GEMINI_INTEGRATION.md).

**Inbox actions** are tucked inside each expanded post. **Mark handled without AI** removes pending work without invoking the model. **Archive post** changes the inbox; it does not cancel any published blockade. Use the **Blockades** tab to edit/cancel road events. Manual text import remains below the list and enters the same queue as collected posts.

Every agent change requires administrator approval. Resolved geometry and evidenced or clearly labelled AI-proposed times prefill the editor; unknown starts remain blank and unknown expiry requires explicit acknowledgement. Each event has its own saved proposal and decision. Rejected proposals stay decided; newer source versions require new review. The agent matches a unique existing incident for updates/reopening and retries eligible failed mapping without another Gemini call, at most three attempts with fifteen-minute cooldown. Vague places remain for manual selection. Schedules and model quotas are unchanged. The API now has permission to invoke only the private worker's analysis job; it has no Gemini key.

Dark-mode collection/AI/outcome panels use a muted blue-grey surface (`#263c49`) with light text. The original fixed white background and low-contrast inherited green body text are overridden using theme-aware styles. Local visual checks use explicitly synthetic data, not production writes.
