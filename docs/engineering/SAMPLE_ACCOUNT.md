# User 123: localhost sample account

Use this fictional account to preview populated settings, weekly/monthly statistics, saved journeys and trip history. It is an ordinary, unverified user in the **local Firebase emulators**, not a live production account.

| Field | Value |
| --- | --- |
| Display name | **User 123** |
| Sign-in email | `user123@manzil.test` |
| Password | `User 123` — includes one space, with uppercase U |
| Firebase UID | `dev-user-123` |
| City / area | Islamabad / F-8 |
| Vehicle | Toyota Corolla · Car · Petrol · 14.5 km/L |
| New-fixture appearance | Dark app · Classic map |

Open [localhost](http://127.0.0.1:5173/), expand **Choose a development account**, select **User 123**, then **Sign in**. The email is the login identifier; the display name alone is not a Firebase email credential. The development picker and fixture credentials are omitted from production bundles.

## What the preview contains

- **12 fictional current-month trips with simulated paths**, totaling **75.152 km**, **4 h 59 min**, and **2,001 generated points** in the complete 17 October 2026 generator fixture. Six directed public-road templates repeat twice: F-8 ↔ Blue Area, Faisal Mosque ↔ Aabpara, and PIMS ↔ Zero Point. `scripts/lib/sample-track.ts` computes these paths from the bundled public OpenStreetMap graph when the guarded local seed runs; no captured GPS or generated trace arrays are committed.
- **5.1829 L / approximately PKR 1,451.21** estimated fuel: `75.152 km ÷ 14.5 km/L × PKR 280/L`. The **PKR 280/L petrol rate is fictional**, not a checked PSO price or a fuel receipt. Saved estimate provenance uses `https://example.invalid/manzil-demo-fuel`; no shared live price cache is replaced.
- **Two disabled demo saved journeys**, office and home, with coarse public Islamabad endpoints. They do not run scheduled route checks.
- **One explicitly labelled demo in-app notification** describing its presentation, without claiming an actual road closure. No shared closure is created.
- A server-owned `demoData: true` marker on the sample profile and each seeded trip. Repeated **Demo data** banners are absent from the profile, statistics and history UI at the owner's request. Documentation and downloaded GeoJSON retain explicit simulation provenance; the data must never be presented as real-device testing or used as evidence of a real journey.

**View on map**, **Save journey** and **Share** work for these simulated paths through the same authorized detail endpoint used for real trips. Cards show date, kilometres, duration and fuel cost, without a raw GPS point count. View fits the full recorded path in bright green with white halo and S/E markers. Save journey opens the normal editor for review rather than silently creating a schedule. Share creates a branded PNG preview with the actual basemap when tiles/WebGL are available; an unavailable basemap is explicitly labelled as a route illustration. Download PNG is primary, with native image sharing where supported and GeoJSON under More options. [Sharing behavior and limits](../guides/TRIP_HISTORY_AND_SHARING.md).

Summary responses keep `points: []` and retain `pointCount`; explicit detail requests load the private Firestore point chunks. PNGs identify these samples as simulated, and exported GeoJSON uses `[longitude, latitude]` with `simulated: true` plus a provenance statement that no device GPS was captured. Fictional fuel references have no misleading PSO source link.

Trip collection, usual-journey learning and browser notifications remain **off**. The profile records the skipped optional data choice; this acknowledgement does not grant consent or request location access. The simulation's `accuracy` values and timestamps are generated, not sensor measurements. Photos are not seeded; the avatar uses initials. The account has its own UID-scoped Firestore records and no admin claim or contributor verification. Generated trips are excluded from usual-route inference even if the owner later allows learning, and the API rejects contributing them to road discovery. Their illustrative history can still populate private statistics.

**Personal statistics** defaults to **This month**, with a **This week** tab and two daily charts: kilometres travelled and dated fuel-price trends. Rounded metric cards show trip count, distance and travel time. Information buttons expose calculation details on hover/focus/tap; exact daily values are also available as a table. These summaries/charts use private aggregates and never load trace coordinates or start recording. Week/month boundaries and chart days use Asia/Karachi and trip departure dates. Missing pricing and unavailable older-server chart series remain explicit.

## Reproduce safely

The standard `npm.cmd run dev:firebase` launcher, or Windows helper `npm.cmd run dev:local`, seeds the account automatically after Auth and Firestore start. To add it to **already running** local emulators without restarting or replacing their data, run this from the repository root:

```powershell
$env:MANZIL_MODE = 'emulator'
$env:FIREBASE_PROJECT_ID = 'demo-manzil'
$env:GOOGLE_CLOUD_PROJECT = 'demo-manzil'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
node --import tsx scripts/seed-demo-user.ts
```

Use Node 24.12 or newer; this workstation also has `.local-tools/node-v24.22.0-win-x64/node.exe` if the system Node is older. The script checks runtime configuration before opening Firebase services and refuses production, standalone mode, another project, non-loopback hosts or ports other than Auth **9099** / Firestore **8080**. It does not infer cloud credentials or supply silent emulator defaults.

Fresh seeding is atomic and **runs once per untouched UID**. Durable version markers prevent later launches from resetting edited settings, consent, deleted sample trips or read notifications. An existing profile/account belonging to someone else or carrying admin access is preserved rather than converted. Other users and shared source/closure/fuel records are untouched. Existing passwords and account names are not reset on restart.

For an existing **v1 summary-only** sample account, a one-time **v2 trace upgrade** recognizes the original fixture time from its existing marker and regenerates that same fixture's public-road paths. It replaces only exact, untouched known sample trip rows that still fall inside the **30-day raw-trace retention** window and have no pre-existing point chunks. Deleted, renamed or otherwise changed trips are skipped, never recreated. All profile fields—including edited name/photo/city/vehicle, saved appearance and consent—remain unchanged. Disabled saved journeys and read/deleted alerts are untouched. The v2 marker also records skipped upgrades, so a restart cannot restore later deletions. This is a localhost fixture upgrade, not a general migration or production repair.

Dates are generated in **Asia/Karachi** within the current month and before the seed time. At the start of a month there may be fewer than 12 completed sample journeys; a two-minute early-month preview uses an abbreviated local path instead of compressing a full city journey into an implausible speed. Distances and saved fuel estimates are recalculated from each generated path. Seeding does not roll samples into each new month or restore records deleted through the UI; monthly totals naturally change across calendar boundaries, **30-day trace retention** and **90-day summary retention**. An emulator reset creates fresh fixtures when the launcher next starts; reset only a deliberately disposable local emulator environment, since it also removes its other local records.

## Scope and verification

The privileged seed script writes summaries and simulated point chunks directly into this one guarded emulator UID. Ordinary API paths remain consent-gated: clients cannot set `demoData`, supply their own trip money or save new travel without collection consent. This seed is not a production import, a GPS migration, live source data or permission to collect travel. Simulated paths are historical illustrations, not independently validated current access or navigation recommendations.

Focused automated tests cover host/project guards, idempotence, preserving other records/edits/deletions, point-chunk storage, timestamps/distance/fuel arithmetic, abbreviated early-month generation, retention, authorized history/share actions and simulated download metadata. Current integrated seed/API/browser/build evidence and final counts belong in [implementation status](../IMPLEMENTATION_STATUS.md).

Historical verification: the earlier 17 October v1 local Auth/API check confirmed **12 summary-only trips / 142.5 km / PKR 2,751.72**, two disabled journeys, one sample alert and collection off. Those figures describe the superseded fictional summary fixture. They do not describe the new simulated geometry totals or prove a real GPS capture.

See [development accounts](DEV_ACCOUNTS_AND_TOUR.md), [account/profile behavior](../guides/ACCOUNT_AND_PROFILE.md), [API](../reference/API.md) and [personal data boundaries](../reference/PERSONAL_TRAVEL_DATA.md).
