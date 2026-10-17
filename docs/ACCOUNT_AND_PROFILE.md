# Accounts and profile — 17 October

These changes are localhost work on `codex/feature-development`. The core app already has a Firebase deployment; publishing this feature branch does not release these screens or activate cloud scheduling. The deployment developer handles integration and release. No local database, GPS history or credentials are migrated.

## Using the screens

1. **Start:** the left column shows the circular logo, English **Manzil**, a prominent **Continue as guest**, and email/password sign-in. **Create account** and **Forgot password?** open their own forms; guest access remains available. The right-hand map is a lightweight static illustration of a closed road and a detour, not a live closure feed. Narrow screens prioritize the form.
2. **Header:** the avatar opens **User profile**. The duplicate account-name control is removed. A small **English / اردو** dropdown selects the interface language; notifications remain separate.
3. **Map:** new accounts, new guest preferences and missing styles start with **Classic**. Existing deliberate style selections remain saved. Legacy Streets/High contrast IDs render as Classic; Minimal and Night remain available independently of the app's light/dark appearance.
4. **Profile:** **Edit** opens name, optional photo, city and neighbourhood fields. The photo is prepared locally as a draft. **Save profile** persists the whole edit; **Cancel** discards the draft. Changing city/area does not request location access.
5. **Personal trip data:** the optional permission sits immediately below identity/profile setup. It starts Off. New registrations receive **Allow personal trip data / Not now** before the tour. Either choice is remembered; existing accounts are not forced through a new prompt. Collection and usual-route learning can be stopped later in Profile.
6. **Personal statistics:** opens monthly distance, time, trip count and estimated fuel spending in a separate dialog next to Profile on wide screens. On smaller screens it becomes a centered, scrollable dialog. **Trip history** opens Activity, retaining explicit recording, export and deletion controls.
7. **Settings:** separate expandable sections contain **Your vehicle**, **Appearance & language**, and **Journey alerts**. Vehicle details have their own **Save vehicle** action. Browser notification permission remains a separate explicit action; learning requires trip-data permission.

## Fuel prices and monthly spending

The expanded fuel card shows the latest applicable dated petrol/diesel reference, effective date, source link, last check and cached/unavailable state. The free public [PSO POL archive](https://psopk.com/fuel-prices/pol/archives) supplies the existing collector; [PSO's fuel-price page](https://psopk.com/en/fuels/fuel-prices) links its price information. No social-media subscription or Champ extraction is needed for this source.

The running local worker checks **once per Pakistan date**. A daily check does not mean prices change every day. Published effective dates are kept separately from retrieval dates; PSO reference prices exclude outlet freight. There is no assumed government JSON API or hardcoded live price. Production scheduling remains separate release work. See [fuel contracts and coverage](FUEL_COSTS.md).

Vehicle type, optional name, petrol/diesel and user-entered **km/litre** are private preferences. Saving them does not grant GPS consent. Routes retain the car-road access/time model even for motorcycle fuel estimates. Recorded trips keep immutable vehicle/rate snapshots; unknown or uncovered periods remain unpriced. Monthly totals identify missing prices and partial retained-history coverage.

## Developer boundaries

- `AccountPanel` uses the existing accessible modal/focus handling. `public/manzil-route-preview.svg` is repo-native illustrative artwork, with no map/network dependency. Development-account shortcuts stay collapsed and localhost-development-only; normal screens omit emulator implementation notices.
- Profile editing stages photo/name/location locally. Photo processing retains image validation/re-encoding and account-change guards; a late result for another UID cannot become the current draft. Form errors keep the draft available for retry.
- `MonthlyStatistics` reads only `GET /api/trips/statistics`, with loading, timeout, retry and partial/unpriced states. Opening the dialog never starts a GPS watcher, requests browser location or loads raw trip traces. Activity reuses the same monthly presentation; backend `week`, `month` and `all` fields remain available for compatibility.
- Optional `LocalProfile.travelDataChoiceMade` records acknowledgement, **not collection consent**. Only successful registration marks that UID pending in memory/session storage; the API stores the acknowledged choice. Allow sets collection and inference true; Not now sets both false. Dismissing the consent dialog follows Not now. Failed writes remain retryable and do not claim the preference changed. See [personal-data lifecycle](PERSONAL_TRAVEL_DATA.md) and [API](API.md).
- Route, closure/time/access validation, private UID storage, explicit unavailable states and retention rules are unchanged. Gemini, cloud speech activation, background GPS and reliable closed-app push are not activated by these UI changes.

Focused profile/fuel UI verification covers **22 passing cases**, including staged photo Save/Cancel, late-photo UID isolation, permission toggles, separate statistics navigation, monthly retained-history totals, unavailable/partial totals and no statistics GPS watcher. Final integrated checks and browser evidence belong in [implementation status](IMPLEMENTATION_STATUS.md).
