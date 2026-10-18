# Accounts and profile

This guide describes current account entry, preferences and personal-data controls. Release/configuration state belongs in [implementation status](../IMPLEMENTATION_STATUS.md). Local data is never migrated to the hosted app implicitly. [Environment configuration](../operations/CONFIGURATION.md), [deployment procedure](../operations/DEPLOYMENT.md).

## Account entry and recovery

- Initial entry shows the circular logo, English **Manzil**, a prominent **Continue as guest**, email/password, Create account and Forgot password. It has no redundant corner X.
- Login/signup have an accessible Show/Hide password eye. An in-app sign-in opened during guest browsing has **Close sign in**, returning to the existing workspace without restarting the tour.
- Firebase mode supports actual registration and password-reset email requests. Standalone dummy mode does not provide those identity operations. The branded `/account/action` page handles reset-code verification, matching new-password fields, explicit errors and success. Production email templates need separate configuration; code tests do not prove mailbox delivery. [Password recovery](AUTH_PASSWORD_RESET.md).
- The right-hand entry map is a fixed, real-road-aligned route illustration with a synthetic blockade, not a live feed. Matte-green scenery has original road/country/bus artwork, pause/play and hidden-tab/reduced-motion/phone handling. [Entry artwork and behavior](ENTRY_SCREEN.md).
- A tour follows registration (after its optional data choice) or explicit guest entry. Ordinary login and resumed guest reload skip it. [Tour and development accounts](../engineering/DEV_ACCOUNTS_AND_TOUR.md).

## Header and appearance

The avatar opens Profile; administrators see Account. The circular photo uses a centered cover crop. Theme, language and notifications are separate controls. The language menu supports keyboard selection, Escape, Tab and outside dismissal.

| Preference | New/missing default | Other choices |
| --- | --- | --- |
| App appearance | Dark | Light, System |
| Driving map | Classic | Minimal, Night |
| Local map | Minimal, independent browser preference | Classic, Night |
| Map detail | Clean | Standard |

Saved explicit choices remain intact, including System following the OS. Light uses neutral-grey outer panels and pale-blue cards; Dark uses its existing teal/slate palette. Header toggles save only the requested preference, avoiding stale snapshots restoring unrelated consent/identity fields. [Map-style persistence](MAP_STYLES.md).

**My location** recentres only and never changes journey endpoints, starts a watcher or records a trip. Explicitly choose Use current location in a starting/destination field when that is intended.

## Profile sections

The overview contains identity and compact rows showing current values. Ordinary membership is labelled **Not verified**; **Verified** and **Admin** identify contributor/account privileges, not independent verification of every report.

| Section | Contents and save behavior |
| --- | --- |
| Personal information | Edit name, optional photo, city and neighbourhood; Save profile commits the draft |
| Personal trip data | Explicit off-by-default collection choice and learning permission |
| Personal statistics | Week/month retained summaries, daily distance and cached fuel-price trend |
| Trip history | Date/distance/time/cost cards; View on map, Save journey, Share and deletion |
| Your vehicle | Car/motorcycle, optional name, petrol/diesel and km/litre; separate Save vehicle |
| Fuel prices | Dated petrol/diesel reference cards, effective date, source and last-check state |
| Appearance & language | App theme, driving map style/detail and English/Urdu |
| Journey alerts | Browser-notification choice and usual-journey learning, with normal consent prerequisites |
| Terms & Conditions / Privacy Policy | Read-only bilingual policy pages and provider links |

Each section opens beside the overview in the shared settings panel; small screens use a scrollable dialog. X, Escape, repeating the active row and outside click close it and return focus. The outside click is consumed rather than activating the map. Interactions/dragging inside do not dismiss it. Dismissal cancels an unsaved identity/vehicle draft; a failed save retains it for retry. View/account changes clear the section, and late responses cannot populate another account or section.

The city chooser loads a curated **96-city alphabetical list**, searchable without pagination. It is an editorial major-city/regional-centre list, not an official census. One rounded wrapper contains a borderless input; unmatched saved cities remain valid. First Escape closes the list, the next closes settings. City/area editing never requests GPS. Photos are locally resized/re-encoded and staged before saving. [City selection and attribution](../data-sources/PAKISTAN_CITIES.md).

Administrators have operational **Users**, **Review queue**, **Closures** and **Pipelines** navigation. Their Account retains identity, appearance/language, policies and sign-out, without commuter vehicle, consent, statistics, history or journey-alert rows. Users supports contributor verification and confirmed administrator grant/removal, checked against current server authority. [Administrative role and directory privacy](ADMIN_WORKSPACE.md).

## Consent and data boundaries

New registrations receive **Allow personal trip data / Not now** before the tour. Either choice is acknowledged; existing accounts are not forced into a fresh prompt. Collection starts off. Allow enables collection/learning; learning can later be disabled independently. Disabling collection forces learning off and aborts unsaved navigation data. Browser notification permission and browser location permission remain separate explicit choices.

`travelDataChoiceMade` records acknowledgement, not consent. Only a successful registration marks that UID as awaiting the prompt. A failed write remains retryable and cannot claim permission changed. Planning and route preview start no GPS watcher. With consent, explicit foreground navigation can save eligible trips; Activity itself has no separate manual recording workflow.

Raw points expire after **30 days**, summaries after **90 days**. Profiles/history are UID-scoped in Firebase; standalone SQLite is shared single-user development storage. Opening policy pages does not accept terms or grant collection. The UI describes existing provider flows and controls without promising legal compliance or self-service account deletion. [Personal-data lifecycle](../reference/PERSONAL_TRAVEL_DATA.md), [policy scope](../reference/LEGAL_AND_PRIVACY.md), [API](../reference/API.md).

## Statistics and history

Personal statistics offers week/month totals with a daily **distance** chart and a separate cached PSO **fuel-price trend**. Activity uses week/month summary cards and history without duplicate graphs. Private daily aggregates contain no raw coordinates; viewing statistics never starts recording or loads traces. Exact distance values are available in an accessible table; information buttons explain estimation and incomplete coverage.

Periods use completed trips' **departure date in Asia/Karachi**: Monday-start weeks and calendar months. A midnight-crossing trip belongs to its departure date. Quiet days have zero distance; missing pricing stays unpriced rather than implying free travel. Fuel totals use immutable saved estimates and may cover fewer trips than distance/time totals. Older/incomplete responses remain explicit instead of inventing a daily distribution.

History trace actions load one authorized detail only. **View on map** fits the whole retained path in prominent green with separate S/E markers; it is recorded travel, not a newly validated route. **Save journey** opens the normal commute editor for review. **Share** creates a branded PNG preview with Download PNG, native file sharing when supported and GeoJSON under More options. A temporary actual basemap is preferred; unavailable tiles/WebGL produce a labelled route illustration. Summary-only records retain metrics but cannot view/share/save a missing trace. Closing/account changes abort image work and revoke its object URL. [Sharing behavior](TRIP_HISTORY_AND_SHARING.md).

## Vehicle and fuel references

The public [PSO POL archive](https://psopk.com/fuel-prices/pol/archives) supplies dated petrol/diesel references. The local worker checks at most once per PKT date; this is a check cadence, not an assertion that rates change daily. Effective dates and retrieval dates remain separate. Source failure preserves explicit stale/unavailable state. Production fuel scheduling is an independent operational configuration. [Fuel calculation and source limits](../reference/FUEL_COSTS.md).

Vehicle settings are private and do not grant GPS consent. Motorcycle selection changes estimates, not the car-routing access/ETA profile. Recorded trips keep immutable vehicle/rate snapshots. Unknown, pre-vehicle or uncovered dates remain unpriced. Prices exclude outlet freight and estimates are not receipts.

## Fictional localhost sample

The development-only **User 123** account populates settings, statistics and history using simulated coordinates generated from public OSM roads. It has no administrator claim, and collection/learning/browser notifications remain off. The ordinary profile omits repeated sample banners, but server-owned `demoData:true`, exported simulation labels and provenance remain intact. Simulated traces never count as actual GPS tests, road evidence or road-discovery contributions. Seed upgrades preserve user edits, deletions and consent rather than resetting an account. [Fixture contents, credentials and safe seeding](../engineering/SAMPLE_ACCOUNT.md).

## Implementation and verification

`AccountPanel` owns account entry; `ProfileSettingsDialog` provides the shared focus/dismissal behavior. `MonthlyStatistics` retains its component name while supporting week/month aggregates. `TripHistory` is shared with Activity without a GPS watcher. UID/late-result guards cover profile photos, saves, details and share images.

Tests cover registration/reset, shared-panel behavior, staged Save/Cancel, photo/account races, consent, city selection/legacy values, partial statistics and history actions. Actual test/build/browser runs belong in [implementation status](../IMPLEMENTATION_STATUS.md). Simulated positions do not establish physical GPS accuracy, and UI changes do not enable cloud speech, background GPS or closed-app push.
