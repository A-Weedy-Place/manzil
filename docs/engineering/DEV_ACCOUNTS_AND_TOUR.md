# Development accounts, roles and tour

Use the Firebase emulator workflow for real token, role and ownership checks. The hosted app uses real Firebase accounts and has no seeded dummy users. Development fixtures, SQLite data and GPS history are never uploaded implicitly. [Local setup](LOCAL_DEVELOPMENT.md), [environment configuration](../operations/CONFIGURATION.md), [release procedure](../operations/DEPLOYMENT.md).

## Local test sign-in

Run `npm.cmd run dev:firebase` (or the Windows helper `dev:local`), open localhost and expand **Choose a development account**. Choosing a fixture fills the fields; select Sign in to authenticate.

| Fixture | Email | Public fixture password |
| --- | --- | --- |
| Ordinary member | `user@manzil.test` | `ManzilUser123!` |
| Administrator | `admin@manzil.test` | `ManzilAdmin123!` |
| Populated ordinary sample | `user123@manzil.test` | `User 123` |

These values are emulator fixtures, not production secrets. The picker is limited to Vite development on loopback in development/emulator auth modes; production bundles omit its credentials. Passwords and editable role objects are not persisted in browser storage. Standalone dummy mode disables actual account creation/reset; Firebase mode uses the configured client SDK.

The emulator admin has `admin:true`. The ordinary user starts unverified. In **Users**, an administrator can Verify/Remove verification to change server-owned contributor metadata. Confirmed administrator grant/removal is a distinct operation with current-claim checks, self-demotion protection and disabled-account restrictions. Contributor verification does not itself grant admin access. Role tests use disposable emulator accounts, never production accounts. [Permissions and directory limits](../guides/ADMIN_WORKSPACE.md), [API](../reference/API.md).

**User 123** remains ordinary/unverified. Its guarded seed creates fictional trip histories, a vehicle, disabled saved journeys and a sample notification with collection/learning/browser notifications off. Simulated public-road traces are not captured GPS and remain explicitly marked in domain/exports. Seeding never resets an edited account, another UID, deleted records or consent. Its password contains a space. [Exact fixture contents and safe seeding](SAMPLE_ACCOUNT.md).

Plain `npm.cmd run dev` uses shared SQLite with UI-only dummy identities and one trusted local API identity. It cannot establish separate users' privacy or moderation permissions. Its directory reports a local developer record and account-management changes are explicitly unavailable. Use emulators for authorization tests.

## Role-aware navigation

| Account | Workspace |
| --- | --- |
| Guest | Map, Plan ahead, Local, Closures, Saved sign-in gate and Profile; public browsing without GPS permission |
| Ordinary/verified member | Map, Plan ahead, Local, Closures, Saved, Activity and Profile |
| Administrator | Users, Review queue, Closures, Pipelines, operational Map/Local and Account |

Admin Account excludes commuter vehicle/consent/statistics/history/alerts, and admin map inspection omits personal navigation/saving actions. The header bell opens the combined community/agent review queue for an admin; it opens journey alerts for a commuter.

| Control | Permission and behavior |
| --- | --- |
| Add closure | Guest sign-in gate; ordinary member submits privately; verified/admin may publish their own report |
| Road closure | Two endpoints on one connected mapped road, following its bends |
| Blockade | Short transverse stroke/two endpoints across the obstructed road; separate physical barriers remain separate reports |
| Community review | Verified/admin can approve/reject pending reports and correct/cancel pending or approved public reports; pending edits remain pending |
| Agent review | Administrator-only private road/service proposals; no automatic map publication |
| Users | Admin directory with minimal identity/city/consent projection; contributor verification and confirmed admin-role changes |
| Pipelines | Admin source/Gemini/weather/fuel status with distinct Fetch, Run and Refresh actions |
| Synthetic demonstrations | Admin-only labelled test closures; never presented as live verified reports |
| Personal activity | UID-scoped consented foreground navigation history; no separate manual recording UI |

APIs enforce these rules independently of buttons. Contributors do not gain access to others' private GPS, Auth directory or source evidence by reviewing a closure. The closure picker has no Islamabad gate; driving, bus and weather source coverage still have their documented limits. [Closure workflow](../guides/CLOSURE_WORKFLOW.md), [personal data](../reference/PERSONAL_TRAVEL_DATA.md).

## Entry and tour lifecycle

Initial entry offers sign-in/create account and **Continue as guest**. Guest acceptance is remembered for that tab session without creating a personal profile or requesting location. Ordinary login opens Map; admin login opens its operational workspace. Sign-out returns to account entry. In-app guest sign-in can be closed to retain the current route/workspace.

The skippable tour starts only after successful registration (following the optional personal-data choice) or explicit guest entry. Ordinary sign-in and resumed guest reload never start it. Sign-out clears unfinished registration intent; choosing guest again can start a fresh tour. Skip, Finish and Escape dismiss it. Help/Profile can replay it; polling/navigation do not reopen it.

The guide highlights:

1. Starting point, Destination and Add stop.
2. Plan ahead, followed by the map key: blue routes, red closures and yellow upcoming markers.
3. Find routes/navigation, language, map styles and closure-layer visibility.
4. Closures, Saved and Profile, including their normal account/consent prerequisites.

It opens read-only workspaces without writing roads, granting consent, requesting GPS or bypassing guest gates. Plan ahead is explained without silently changing time. Finish/Skip restores the original workspace; existing pins, departure and geometry remain intact. Automatic replanning pauses during the tour and resumes normal freshness checks afterwards. Administrators do not receive the commuter tour.

## Tour layout and tests

`WelcomeTour` renders its dialog through a body portal with a separate dimming SVG behind it. The spotlight surrounds the current target; the card chooses available space, clamps to the visual viewport and scrolls when necessary. It remeasures on steps, content, language, scroll and viewport changes, including after a workspace transition. Endpoint steps temporarily expose their individual collapsed controls. Previous/Next/Skip/Escape, focus containment and responsive/RTL placement remain available.

Tests cover entry/login/guest distinction, account changes, consent, admin landing, guest closure gating and phone/desktop/landscape placement. Executed builds/browser checks are recorded in [implementation status](../IMPLEMENTATION_STATUS.md). Tests do not enable production accounts, model calls or scheduling.
