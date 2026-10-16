# Admin interface proposal — awaiting owner approval

This document is a discussion draft. **No new admin dashboard, correction/audit workflow or publication agent has been implemented.** The 16 October [environment foundation](ENVIRONMENTS.md) adds Firebase token verification, custom admin claims and protected shared-data mutations in emulator/production modes. The original standalone dummy identities still only unlock local screens and do not secure that shared SQLite API. No production deployment exists.

## Decisions confirmed by the owner

1. Publish valid agent-detected blockades automatically; admins correct mistakes afterward.
2. Cancelling an incorrect blockade removes its routing effect while retaining evidence/history. Do not permanently delete it or let reprocessing silently recreate it.
3. Guests may plan/navigate. Normal users use personal features; admins manage shared closure information. Firebase integration and deployment are separate later tasks.

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

| Role | Proposed access |
| --- | --- |
| Guest | Published closures, route planning, navigation, tour |
| Normal user | Guest features plus their saved journeys, preferences/history and personal alerts |
| Admin | Shared blockade editing/cancellation/restoration, evidence and correction log |

Production permissions must be enforced by the API using verified Firebase identity and a server-managed admin role. Hiding a button or editing browser role state is not authorization. Normal users must not grant themselves admin status. Admin access to shared closures does not imply access to users' private GPS traces.

Standalone dummy development accounts share the SQLite database, with no multi-user isolation or server authorization. In Firebase emulator/production modes, accounts have private records and shared closure/source mutations require verified custom admin claims. An emulator launcher seeds local test accounts; production startup never seeds them. Dummy UI login is absent from production builds.

The UI restoration keeps the **Closures** tab and always-visible map **Add restriction** button visible, alongside direct demo and route block-point controls. **Activity** appears only after sign-in. Standalone tools retain their trusted-local behavior; Firebase modes reject guest/normal-user shared mutations at the API. A separate guest demo sandbox is not implemented. The correction/history/override workflow in this proposal still needs agreement and implementation before automatic agent publication.

## Suggested delivery order after approval

1. Define stable event/source links, correction reasons, override semantics and revisioned mutation APIs.
2. Add transactional audit history and replay/suppression tests. Exercise wrong location/time, cancellation, agent replay and later legitimate closure cases.
3. Build the admin-only list/detail/map screen and edit/cancel/restore interactions in English and Urdu.
4. Connect verified Firebase roles and per-user data ownership before public access; test normal-user rejection at the API.

User management, analytics dashboards, bulk actions and a general database browser are outside the first version. The initial focus is quickly correcting an incorrect blockade without losing the evidence explaining the correction.
