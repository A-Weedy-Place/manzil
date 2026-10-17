# User 123: localhost sample account

Use this fictional account to preview populated settings, monthly statistics, saved journeys and trip history. It is an ordinary, unverified user in the **local Firebase emulators**, not a live production account.

| Field | Value |
| --- | --- |
| Display name | **User 123** |
| Sign-in email | `user123@manzil.test` |
| Password | `User 123` — includes one space, with uppercase U |
| Firebase UID | `dev-user-123` |
| City / area | Islamabad / F-8 |
| Vehicle | Toyota Corolla · Car · Petrol · 14.5 km/L |

Open [localhost](http://127.0.0.1:5173/), expand **Choose a development account**, select **User 123**, then **Sign in**. The email is the login identifier; the display name alone is not a Firebase email credential. The development picker and fixture credentials are omitted from production bundles.

## What the preview contains

- **12 fictional current-month trip summaries**, totaling **142.5 km** and about **5 hours** of travel in the initial 17 October 2026 fixture.
- **PKR 2,751.72** estimated fuel cost: `142.5 km ÷ 14.5 km/L × PKR 280/L`. The **PKR 280/L petrol rate is invented demo data**, not a checked PSO price or a fuel receipt. Saved estimate provenance uses `https://example.invalid/manzil-demo-fuel`; no shared live price cache is replaced.
- **Two disabled demo saved journeys**, office and home, with coarse public Islamabad endpoints. They do not run scheduled route checks.
- **One explicitly labelled demo in-app notification** describing its presentation, without claiming an actual road closure. No shared closure is created.
- A server-owned `demoData: true` marker on the sample profile and each seeded trip; visible sample labels distinguish the preview from recorded travel.

There are **no GPS fixes or raw traces**: every sample trip has `points: []` and `pointCount: 0`. Trip collection, usual-journey learning and browser notifications remain **off**. The profile records the skipped optional data choice; this acknowledgement does not grant consent or request location access. Photos are not seeded; the avatar uses initials. The account has its own UID-scoped Firestore records and no admin claim or contributor verification.

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

Seeding is atomic and **runs once per untouched UID**. A durable marker prevents later launches from resetting edited settings, consent, deleted sample trips or read notifications. An existing profile/account belonging to someone else or carrying admin access is preserved rather than converted. Other users and shared source/closure/fuel records are untouched. Existing passwords and account names are not reset on restart.

Dates are generated in **Asia/Karachi** within the current month and before the seed time. At the start of a month there may be fewer than 12 completed sample journeys. Seeding does not roll samples into each new month or restore records deleted through the UI; monthly totals naturally change across calendar boundaries and ordinary **90-day summary retention**. An emulator reset creates fresh fixtures when the launcher next starts; reset only a deliberately disposable local emulator environment, since it also removes its other local records.

## Scope and verification

The privileged seed script writes summaries directly into this one guarded emulator UID. Ordinary API paths remain unchanged: clients cannot set `demoData`, supply their own trip money or save new travel without collection consent. This seed is not a production import, a GPS migration, live source data or permission to collect travel.

Focused automated tests cover host/project guards, idempotence, preserving other records, sample arithmetic and consent. A real local Auth/API check on 17 October 2026 confirmed the ordinary UID, twelve sample summaries, **142.5 km**, **PKR 2,751.72**, two disabled journeys, one demo alert and collection off. Current integrated build/browser evidence belongs in [implementation status](IMPLEMENTATION_STATUS.md).

See [development accounts](DEV_ACCOUNTS_AND_TOUR.md), [account/profile behavior](ACCOUNT_AND_PROFILE.md), [API](API.md) and [personal data boundaries](PERSONAL_TRAVEL_DATA.md).
