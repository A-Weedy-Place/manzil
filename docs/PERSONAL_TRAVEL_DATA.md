# Personal profile and trip permission

This feature is developed on `codex/feature-development`. Publishing the branch does not update the deployed website. No existing SQLite database or GPS history is migrated to Firebase.

## What a person sees

- **User profile** summarizes name, email, optional photo, city and neighbourhood. **Edit** opens the fields; Save persists the draft together and Cancel discards it. Photo selection alone does not persist an image. City/area are manually entered text; saving them does not request GPS.
- Photos are selected locally, checked as JPEG/PNG/WebP, resized to at most 512 pixels and re-encoded as JPEG before sending. Canvas re-encoding removes embedded metadata. The encoded result is limited to 150,000 characters; profile photos remain private account records.
- **Personal trip data** is visibly **Off** until the person explicitly allows it. Missing fields on an older profile also mean Off.
- **Allow personal trip data & usual-route alerts** enables trip history and repeated-journey alerts together. Usual-route learning has a separate switch, available only while trip permission is on.
- **Stop collecting trip data** turns off both collection and learning. Existing records remain available in Activity for export or deletion.
- Browser notifications require a separate explicit action and browser permission. In-app alerts remain available independently.

## Optional choice after registration

Successful account creation marks only that new UID as pending in memory/session storage. Once the matching private profile is loaded, the UI asks **Allow personal trip data / Not now** before its first-use tour. Existing sign-ins do not receive a forced prompt just because an older profile lacks acknowledgement. Guests never receive this personal-data prompt.

Either confirmed choice stores `travelDataChoiceMade:true` in the private profile. Allow also sets `collectTravelData:true` and `inferFrequentRoutes:true`; Not now sets both false. Escape/backdrop dismissal follows Not now. Acknowledgement is a strict optional boolean, separate from consent: setting it alone never enables collection or inference. The pending session marker is removed only after the API confirms the matching account's choice. A failed request keeps retry controls visible rather than claiming the preference changed; a lost response can follow a committed write, so retrying either explicit choice is safe. Account changes cannot apply another UID's response.

Granting the preference does not request browser location or start GPS. The person still starts navigation or manual recording explicitly. Profile keeps the permission near identity setup, with grouped vehicle, appearance/language and journey-alert settings below it. Consent can be changed later; existing stored trips remain available for export/deletion. [Account/profile guide](ACCOUNT_AND_PROFILE.md).

## Monthly personal statistics

**Personal statistics** opens a separate dialog beside Profile on wide screens and a centered scrollable dialog on smaller screens. Activity also shows the current month's totals. The interface presents monthly distance, time, trip count and estimated fuel spending only; the API retains `{week,month,all}` for compatibility. Months use Asia/Karachi and the trip departure date. Totals include retained summaries beyond the latest-50 history list, with explicit unpriced-trip and partial-history states.

The read-only statistics component requests only aggregate `/trips/statistics` data. Opening it never starts a location watcher, grants data permission or fetches raw trip traces. Loading/failure/retry states remain distinct from an actual zero-trip month. Recording, viewing a trip's path, export and deletion remain separate Activity actions.

## Foreground collection

Optional vehicle name/type, petrol/diesel and km/litre are private profile preferences, saved separately from identity edits. Saving them does not enable GPS. New consented trips can retain an immutable estimated fuel-cost snapshot using that configured vehicle and applicable dated PSO reference prices. Changes to the profile or global prices never rewrite old trip estimates. Unknown vehicle/history or a price day not covered by a successful check stays unpriced. Monthly UI summaries expose missing pricing and remain subject to 90-day retention; backend weekly/all-retained aggregates remain supported. Deleting a trip also removes its saved cost snapshot. These are estimated consumption costs, not fuel receipts; see [fuel provenance and limits](FUEL_COSTS.md).

`useTravelCapture` receives accurate samples from the existing Navigation GPS watcher. It never starts a watcher of its own. The person must start GPS guidance; planning a route, previewing directions or opening Profile does not start recording. Navigation without personal trip permission uses location for immediate guidance but does not retain those fixes as trip history.

With permission, accurate navigation samples are held in memory. Stopping/leaving guidance saves a session only if it has at least two accepted samples, lasts at least 60 seconds and covers at least 100 metres. Samples require reported accuracy of 60 metres or better, a recent timestamp, valid GeoJSON coordinates and at least four seconds between samples. Gaps longer than two minutes start a new fragment. A session is bounded to 20,000 samples. Navigation trips never opt into future road-discovery contributions automatically.

Hiding the page discards the unsaved navigation fragment and aborts pending saves. Permission withdrawal or account changes also discard/abort. A changed account must start its own GPS session. Browser shutdown or network loss can lose an unsaved session; this is not background or closed-app recording.

Activity offers a separate manual recording control with the same account-level permission. Leaving Activity or hiding the page pauses its GPS watcher, preventing two recording watchers during navigation. Paused manual samples remain in memory while consent is retained, so the person can resume, save or discard them. Revoking permission clears the pending recording. Future road-discovery contribution is a separate per-trip checkbox; no road is automatically published or made routable.

## Server boundaries and usual routes

The API rejects trip saves without collection permission. Both storage adapters recheck permission at the write boundary; Firestore does so in its transaction. Learned-route reads/checks require **both** collection and inference flags, including after awaited work. Inferred alert writes recheck these flags in their storage operation. Revocation prevents new collection/learning; it does not retroactively delete a trip or alert already committed before revocation.

The inference system needs at least three matching, usable journeys on separate Pakistan dates. It learns direction, start/end and approximate Pakistan departure time, not home/work labels. Public proposals contain no raw points or trip identifiers. For personal alerts, the server also selects one real observation closest to the usual departure, favouring the latest equally representative day. It preserves that observation's quality-filtered GPS segments and relative timing privately; it never joins different days into an invented path.

Published closure polygons are clipped against those recorded segments. Expected passage time is the next usual departure plus each sample's original offset, with a bounded **60-second margin** on each side. A closure scheduled outside that passage window does not trigger an observed-path warning. A closure on the recorded street can therefore warn even when a fresh planner chooses a different, clear main road. Alerts explicitly say **“Your observed journey may be affected”** and describe a **historical corridor warning**. Segments longer than 300 metres or 60 seconds are marked approximate. Poor/interrupted traces still fail the retained trip-quality gates; this is not live traffic, reliable road-access evidence or proof of the next route a person will drive. One representative observation can miss other historical variants.

Fresh planner checks continue to produce independently validated route/departure options. The historical path never becomes a navigation route or modifies the road graph, and it does not turn a clear planned route into a blocked recommendation. Only endpoints/timing are sent to an optional online planner; raw GPS samples remain server-side. Matching saved-commute closure alerts are deduplicated only for the same event revision; a saved journey that avoids an observed street does not suppress that street's warning. Saved commutes remain an independent, manually selected feature.

Raw samples are retained for 30 days and summaries for 90 days by the existing retention policy. Export/deletion remain available in Activity. Real Firebase modes scope personal records to a verified UID. Standalone development still shares one local database and is not production authentication.

The deployed private worker/Scheduler remains separate deployment work. Do not claim reliable closed-app alerts from this UI addition. No Gemini analysis, cloud speech activation or real-device GPS permission was exercised for this change. Focused automated checks mock browser GPS and verify consent, account changes, cancellation, manual pause, image processing and inference gates; final integrated verification is recorded in `IMPLEMENTATION_STATUS.md`.
