# Login entry artwork and account verification

Feature-branch localhost work, 17 October 2026. The deployment developer handles release to the existing Firebase app. No production account, email configuration or cloud service is changed here.

## Controls

- The account panel has one explicit **Continue as guest** action. The redundant corner X is removed; Escape retains the existing guest/close behavior.
- Sign in uses the ordinary door/arrow icon, Create account a person/plus, and Reset password a key. Decorative icons are hidden from assistive technology; visible text names each action.
- Registration, password reset, Back to sign in and guest access remain available. Loading disables the form, failures retain a retryable form, and changing screen clears old feedback/password text.
- The backdrop stays flat matte green (`#15362d`), with a small card shadow (`0 8px 20px`, 15% dark ink). There is no backdrop gradient, glow or blur. Desktop layout reserves side gutters and a top band for the scenery; narrow screens prioritize the form.

## Decorative artwork

`EntryDoodles.tsx` and `entry-doodles.css` contain original SVG/CSS artwork. The scenes illustrate the product without loading a map, fetching tiles, reading location, creating events or running a JavaScript frame loop.

1. The left country silhouette follows the owner's requested depiction including Pakistan's claimed Kashmir region. An outline draws first, then a downward scanner reveals schematic roads clipped to the silhouette, followed by a hold, fade and repeat.
2. The top scene follows a location pin along a detour around a barricade, from its origin to an endpoint kept within the illustration's safe bounds.
3. The right roadside scene contains a drawn road, a detailed bus with exhaust, an articulated walking figure and road signs.

The country drawing is an artistic schematic, **not an authoritative boundary file**. It follows the requested claimed depiction rather than asserting resolution of a territorial dispute. The roads inside are invented illustration. Neither silhouette nor drawn streets enter GeoJSON/API contracts, map providers, search coverage, country validation or routing. Those data and boundaries are unchanged.

The existing desktop pause/play control also pauses the scenery, and hidden tabs pause it. Phone and reduced-motion layouts show a static composition rather than a continuously animated background. Artwork is `aria-hidden`, cannot intercept clicks, and does not replace form labels or status feedback. Animation uses browser CSS/SVG rendering with no new dependency; this is not a benchmark claim for every low-end device.

Visual references, without copying third-party assets:

- [Survey of Pakistan political-map reproduction at PPIB](https://www.ppib.gov.pk/pakistan.html), linked there as a Survey of Pakistan map; the [government image](https://www.ppib.gov.pk/img/political_map_pakistan.jpg) informs the schematic silhouette. This is not a bundled official-map image or full-resolution geospatial extraction.
- [Meta's WhatsApp design account](https://www.meta.com/design-at-meta/blog/whatsapp-user-interface-update/) describes rounded outlined illustrations and everyday doodle objects; it informs the visual direction. The bus, person, signs and route here are original code-native drawings.

## What account verification proves

The isolated `demo-manzil-test` Auth/Firestore suite now creates a unique disposable account through the Firebase client SDK and verifies:

1. Registration succeeds; duplicate registration is rejected.
2. The new UID has ordinary member permissions, Dark/Night defaults, empty private journeys and trip collection/inference Off. It cannot access the admin directory.
3. Its profile can be saved and read with its verified token.
4. A password-reset request generates an emulator action code. The code verifies and changes the disposable password, then rejects reuse.
5. The old password fails and the new password signs into the same UID, retaining its profile.

The test signs out and deletes its disposable Auth user afterward. It runs against isolated loopback test ports, not the ongoing development accounts or hosted app. Codes/links are not committed. Firebase's own emulator logger can print its test-only reset link to ignored local logs.

Client/UI tests separately cover registration callbacks and consent/tour intent, reset dispatch with a trimmed email, success feedback, failure/retry and feedback clearing. Password managers, paste and email/password autocomplete remain supported.

**Limitation:** the Auth emulator does not send email. These checks verify SDK/UI/backend/reset-code behavior, not real mailbox delivery, production email templates/domains or spam filtering. A production inbox/reset-link acceptance test is separate deployment-owner work; no claim of a live email arriving is made. See [Firebase's emulator documentation](https://firebase.google.com/docs/emulator-suite/connect_auth).

Final integrated test counts, builds and browser evidence are recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).
