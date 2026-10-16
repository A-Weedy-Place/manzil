# Development accounts and target-aware tour

**16 October:** this page's shared dummy login describes standalone SQLite mode only. Recommended `npm.cmd run dev:firebase` seeds the same test emails/passwords into the real local Auth Emulator, uses verified tokens/admin claims and isolates user records in the Firestore Emulator. Production uses configured Firebase Authentication with no seeded dummy users. The admin dashboard/audit proposal remains unimplemented. See [environment setup](ENVIRONMENTS.md).

Implemented locally on 15 October 2026. The proposed admin screen is separately described in [ADMIN_INTERFACE_PROPOSAL.md](ADMIN_INTERFACE_PROPOSAL.md) and is **not implemented**.

## Dummy sign-in

Run `npm.cmd run dev`, open localhost and select Sign in. The account picker fills credentials; select Sign in to activate that development identity.

| Role | Email | Dummy password |
| --- | --- | --- |
| Normal user | `user@manzil.test` | `ManzilUser123!` |
| Admin user | `admin@manzil.test` | `ManzilAdmin123!` |

These are public test credentials, not real accounts or secrets. Both identities unlock the existing local personal screens and have distinct role badges. Profile offers Sign out. Google sign-in has been removed. Sign-up/password-reset remain future Firebase screens with disabled actions.

Development login requires both Vite development mode and a loopback hostname. Production builds remove the account/password fixture list and retain the unconfigured Firebase state. Only the known dummy UID is remembered in sessionStorage; entered passwords and editable browser role objects are not persisted. Switching accounts/signing out does not reload the page.

The current local API and SQLite data are still shared, single-user development services. The admin badge is a test identity, not production authorization or a new admin dashboard. There are no new API privileges, per-user data isolation, Firebase users, or server-side role claims. Existing local closure/source tools are unchanged until the admin proposal is approved and implemented.

## Current UI access

| Control | Current behavior |
| --- | --- |
| Main navigation | Map, Closures, Saved and Profile for everyone; Activity added after sign-in |
| Try street detour | Directly below the planner heading, available to guests and signed-in users |
| Demo closures | Expandable catalogue directly in the planner and Closures view |
| Block a point on this route | Shown in route results; requires a baseline route and is disabled while adding/updating |
| Add restriction | Always-visible map plus button; opens the existing closure editor |
| Help & demos | Replay tour and closure/source shortcuts; opening it is not required for demo controls |
| Personal features | Saved journeys, recording/history, personal alerts and personal profile settings require sign-in |

Both dummy roles unlock the existing personal UI. Closures, manual editing and source tools remain shared localhost development features, with no new server-side admin enforcement.

## Tour correction

Guests now receive the tutorial on every fresh app visit and after sign-out, regardless of the device's previous completion flag. Skip, Finish and Escape dismiss it for the current visit; normal polling and navigation do not reopen it. Signed-in users keep the remembered first-use behavior. Help and Profile still offer replay. Closures is again a primary tab for everyone; Activity appears after sign-in. The planner directly exposes Try street detour, Demo closures and the route's Block a point action, and the map always exposes Add restriction.

The screenshot exposed two issues: every step placed its card at the bottom, and the spotlight's large shadow lived inside that card's stacking context. It could overlap the legend and shade its own instructions.

The dialog now renders through a body portal. Dimming is a separate SVG layer behind the card, with an opening around the current target. The card chooses available space above/below/beside that target, clamps to the visual viewport and scrolls its content if necessary. It remeasures when steps, content, language, scroll position or viewport dimensions change. The search step highlights the compact destination field rather than the entire form, opening a collapsed search temporarily when needed. Previous/Next/Skip/Escape and focus containment remain available.

Tests reproduce the 715×431 legend overlap, phone/landscape/desktop layouts and RTL placement, and assert that the dimming layer is outside the dialog content. Browser discovery found no connected session, so new live visual/WebGL verification remains outstanding.

Latest verification after restoring the controls: **149 tests pass across 21 files**, and production TypeScript/build passes with the existing map bundle-size warning. App component checks cover guest control visibility, the Activity tab after login and its removal after logout, tutorial reappearance after sign-out/remount, and the route block-point action without Help being open.

## Next discussion

The owner selected automatic agent publication followed by admin correction, and cancellation with retained source/history. The proposal recommends a first release focused on a blockade list/map, evidence, geometry/time editing, cancellation/restoration and an audit log with anti-replay overrides. No agent publication, cancellation-history persistence or new admin UI was added in this change.
