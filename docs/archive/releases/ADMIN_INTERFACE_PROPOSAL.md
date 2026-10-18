# Admin workspace and extended agent-correction proposal

> **Historical record — retained 18 October 2026.** This may contain superseded requirements, UI, activation state or release evidence. It is not a current instruction/runbook. Use the [documentation index](../../README.md) and [current status](../../IMPLEMENTATION_STATUS.md).

**17 October update:** the owner authorized and the feature branch implements the community admin workspace, user verification, pending report review, shared blockade editing/cancellation and source-pipeline status. These changes run locally until the other developer integrates/releases them. Firebase admin claims and server-managed verified membership enforce permissions; production has no seeded dummy users. Standalone dummy identities do not secure shared SQLite. [Current tested status](../../IMPLEMENTATION_STATUS.md), [API](../../reference/API.md), [deployment](FIRST_DEPLOYMENT.md).

## Implemented workspace

1. Admin sign-in opens **Control centre**. **Blockades** provides pending/all filters, expandable schedule/photo/reporter details, approve/reject and edit/cancel. Verified contributors can review reports from ordinary users in Closures too.
2. **People** lists Firebase Auth users with pagination and contributor verify/unverify. It cannot grant admin and exposes no private trip traces, profile city or personal photo records.
3. **Pipeline** uses the real source status/notices and existing collector/manual-import controls. Disabled or failed/partial access remains visible. Gemini interpretation and automatic publication remain future work.
4. Regular authors can edit pending drafts. Rejected reports are read-only for them; approved records become shared and routing uses the published snapshot. Cancellations retain the record/evidence and remove routing effects. Photos are loaded on authorized expansion rather than in every state poll.

The following design retains the **future extended agent correction/audit/override** requirements. A complete before/after audit ledger, cancellation reasons, agent replay suppression and model correction workflow are not implemented by community moderation.

## Decisions confirmed by the owner

1. Publish valid agent-detected blockades automatically; admins correct mistakes afterward.
2. Cancelling an incorrect blockade removes its routing effect while retaining evidence/history. Do not permanently delete it or let reprocessing silently recreate it.
3. Guests may plan/navigate. Regular users submit reports for review; verified contributors/admins can publish and review. Admins manage users and pipeline controls. Extended agent correction remains separate work.

Automatic publication still requires structured geometry/time/source validation. A non-closure notice, invalid geometry or unresolved location/time must not become a published blockade simply because a model generated text. Such candidates belong in an exception queue. The Gemini agent itself remains future work owned by the user.

## Recommended first version

An **Admin** entry for admin accounts opens a blockade list with a linked map. Desktop uses a list/detail/map layout; mobile opens the selected record in a detail sheet. Normal planning remains uncluttered.

Filters: active, scheduled, cancelled and needs attention; source (agent/manual/demo); road/place search; updated time. Show the relevant Pakistan-time schedule, provenance and last update. Distinguish automatically published information from human-reviewed corrections rather than treating model confidence as verification.

Selecting a blockade shows:

- Exact affected road/polygon, start/end, open-ended status and current routing effect.
- Original notice text/link, publication time, retrieval time and notice revision. Preserve source evidence verbatim in both UI languages.
- Origin (agent/manual/demo), proposed versus corrected fields and correction history.
- Actions: **Edit**, **Cancel blockade**, and **Restore** a cancelled record after checking its schedule.

Editing reuses the existing geometry/time validation and previews affected roads before saving. Cancellation uses a short reason selector (incorrect location, incorrect timing, duplicate, unsupported notice, road reopened, other) plus an optional note. Its confirmation names the record and explains that evidence remains. Wrong information and a genuinely reopened road are distinct reasons, so notifications need not claim a physical reopening when only an interpretation was corrected.

After a mutation, routing uses the new revision, active guidance revalidates and saved-journey checks run. A successful write should not wait for another polling interval to update that admin's map. If another operator changed the same record, a revision conflict reloads the differences before another save.

## Prevent accidental republication

Source notices already retain revisions; closures currently retain a revision number but not a complete before/after correction log. The proposed implementation adds:

1. A durable closure audit/history store containing actor, timestamp, action, reason, old/new fields and source/model references.
2. A durable correction/override record linked to the event's stable identity and notice revision/content hash.
3. Agent publication checks against those overrides before writing, in the same transaction as revision/audit updates where applicable.

Reprocessing the same rejected notice revision cannot create a replacement active blockade. A new source revision that conflicts with an admin correction should enter Needs attention rather than undo the correction. Overrides must be scoped to the specific event/evidence, not ban all future restrictions on that road. A genuinely new closure is a separate event; uncertain duplicate/new-event classification goes to review. Restoring a cancelled event is explicit and audited, and cannot make an expired schedule active without editing its times.

## Role boundary

| Role | Current feature-branch access |
| --- | --- |
| Guest | Published closures, route planning, navigation, tour |
| Normal user | Guest features, private account features and pending reports/photos |
| Verified contributor | Normal features, direct publication and pending report review; own report editing |
| Admin | Shared blockade editing/cancellation, review, user verification and pipeline controls |

Production permissions must be enforced by the API using verified Firebase identity and a server-managed admin role. Hiding a button or editing browser role state is not authorization. Normal users must not grant themselves admin status. Admin access to shared closures does not imply access to users' private GPS traces.

Standalone dummy development accounts share the SQLite database, with no production multi-user authorization. Firebase modes isolate private records by verified UID and enforce per-action permissions, with source/demo controls requiring custom admin claims. The emulator launcher seeds test accounts; production startup never seeds them. Dummy UI login is absent from production builds.

The **Closures** tab and map **Add restriction** remain visible; guests must sign in to submit. Demo and route-block testing controls are admin-only. Activity appears for ordinary signed-in users. A separate guest demo sandbox is not implemented. The extended correction/history/override workflow still needs implementation before claiming automatic agent correction and replay protection.

## Suggested delivery order after approval

1. Define stable event/source links, correction reasons, override semantics and revisioned mutation APIs.
2. Add transactional audit history and replay/suppression tests. Exercise wrong location/time, cancellation, agent replay and later legitimate closure cases.
3. Build the admin-only list/detail/map screen and edit/cancel/restore interactions in English and Urdu.
4. Connect verified Firebase roles and per-user data ownership before public access; test normal-user rejection at the API.

Contributor verification/user listing is implemented. General analytics dashboards, bulk actions and a database browser remain outside this version.
