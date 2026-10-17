# Development accounts, roles and target-aware tour

**17 October feature branch:** opening the app first shows sign-in/create-account with a visible **Continue as guest** action. Ordinary sign-in opens the map; admin sign-in opens **Control centre**. Signing out returns to the account entry page. Explicit guest entry is remembered for the browser tab's session, so a reload can resume guest browsing. Guest access does not request location or create a personal profile.

Recommended `npm.cmd run dev:firebase` seeds local Auth/Firestore accounts with real verified tokens and isolated personal records. `npm.cmd run dev:local` is the optional Windows runtime helper for this mode. The [hosted release](https://manzil-app-v1.web.app) uses real Firebase accounts and has **no seeded dummy users**. Branch publication does not deploy these features. See [environment setup](ENVIRONMENTS.md), [release procedure](FIRST_DEPLOYMENT.md) and current [implementation status](IMPLEMENTATION_STATUS.md).

## Local test sign-in

Open localhost, select a test account to fill its credentials, then select Sign in.

| Role | Email | Dummy password |
| --- | --- | --- |
| Normal user | `user@manzil.test` | `ManzilUser123!` |
| Admin user | `admin@manzil.test` | `ManzilAdmin123!` |

These are public fixtures, not production credentials. The emulator admin has a verified custom claim `admin: true`. The normal user starts unverified; use **Control centre → People → Verify** to test contributor access, and **Remove verification** to revoke it. This changes server-owned contributor metadata; it never grants an admin claim. Administrators are provisioned separately by the operator. No live Auth accounts or claims are changed by local tests.

The picker is limited to Vite development on loopback in development/emulator auth modes. Configured Firebase mode supports actual account creation/password reset; those actions remain disabled in standalone dummy mode. Production bundles omit local fixture credentials. Passwords and editable role objects are not persisted in browser storage. Profile provides Sign out.

Plain `npm.cmd run dev` still uses standalone shared SQLite and UI-only dummy identities. Its API is one trusted local admin, so it cannot demonstrate user authorization or private data isolation. Its People view shows a local developer record; verification changes return an explicit unavailable response. Use the emulator workflow to test the full user/admin separation. Neither workflow uploads existing SQLite/GPS data.

## Current UI access

| Control | Current behavior |
| --- | --- |
| Main navigation | Map, Plan ahead, Closures, Saved and Profile; Activity after sign-in, Admin for administrators |
| Street routing | Part of ordinary time-ranked routing; no separate street-detour feature |
| Demo closures / route block-point action | Admin-only synthetic testing controls; ten catalogue scenarios, four with suggested journeys |
| Add restriction | Visible map button; guest is asked to sign in, ordinary member submits for review, verified/admin may publish |
| Road section | Select two ends on one connected mapped road; point/drawn tools remain available |
| Closures | Place and From/Until shown immediately; expanding loads notes, photo evidence and reporter/reviewer metadata |
| Review | Verified/admin can approve/reject pending drafts; cancelled or stale reports cannot be approved |
| Control centre | Admin tabs: Blockades, People, Pipeline; source management and verification are not ordinary member privileges |
| Personal features | Private saved journeys, alerts, profile and history; trip collection is explicitly off by default |
| Profile | Photo/name/city/area, language/theme/map style, separate browser-notification permission, visible trip-data consent |

Firebase APIs enforce these permissions independently of button visibility. Approving reports does not give a contributor access to other people's private trips, the Auth directory or the source collector. Profile photos are resized/re-encoded before saving; precise travel history is separate from manually entered city/area. [Personal travel data](PERSONAL_TRAVEL_DATA.md) describes consent, foreground limits and retention.

## Tour correction

After choosing guest entry, guests receive the skippable tour on fresh visits regardless of the device's prior completion flag. Signing out first returns to sign-in; choosing guest resumes the guest tour behavior. Skip, Finish and Escape dismiss it for the current visit; polling/navigation do not reopen it. Signed-in users retain remembered first-use behavior. Help and Profile offer replay. The tour never mutates roads, grants trip consent or asks for GPS.

The screenshot exposed two issues: every step placed its card at the bottom, and the spotlight's large shadow lived inside that card's stacking context. It could overlap the legend and shade its own instructions.

The dialog now renders through a body portal. Dimming is a separate SVG layer behind the card, with an opening around the current target. The card chooses available space above/below/beside that target, clamps to the visual viewport and scrolls its content if necessary. It remeasures when steps, content, language, scroll position or viewport dimensions change. The search step highlights the compact destination field rather than the entire form, opening a collapsed search temporarily when needed. Previous/Next/Skip/Escape and focus containment remain available.

Automated checks cover the small landscape viewport, phone/desktop/RTL placement, entry/skip flow, admin landing, guest report gating, account changes and consent. Actual integrated build/browser evidence is recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), not inferred from the old prototype results.

## Earlier proposal and remaining work

The 15 October statements that an admin dashboard was entirely unimplemented and that guests could use demo/editor writes are superseded by this feature branch. [ADMIN_INTERFACE_PROPOSAL.md](ADMIN_INTERFACE_PROPOSAL.md) remains historical design context. The current dashboard provides review, closure correction/cancellation, verification and pipeline status; a full immutable audit/override system, Gemini automatic publication and reliable private cloud scheduling remain separate work. Existing source/review metadata are not a claim that those proposed systems are active.
