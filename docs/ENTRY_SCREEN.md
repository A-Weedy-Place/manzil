# Login entry artwork and account verification

Feature-branch localhost work, updated 18 October 2026. The deployment developer handles release to the existing Firebase app. No production account, email configuration or cloud service is changed here.

## Controls

- The account panel has one explicit **Continue as guest** action. The redundant corner X is removed; Escape retains the existing guest/close behavior.
- Sign in uses the ordinary door/arrow icon, Create account a person/plus, and Reset password a key. Decorative icons are hidden from assistive technology; visible text names each action.
- Registration, password reset, Back to sign in and guest access remain available. Loading disables the form, failures retain a retryable form, and changing screen clears old feedback/password text.
- The backdrop stays flat matte green (`#15362d`), with a small card shadow (`0 8px 20px`, 15% dark ink). There is no backdrop gradient, glow or blur. Desktop layout reserves side gutters and a top band for the scenery; narrow screens prioritize the form.

## Fixed road-map preview

The map **inside the login card** is a fixed SVG generated from the bundled public OpenStreetMap Islamabad road snapshot, rather than a hand-drawn street pattern. Roads, the blue detour, red affected road section and A/B markers use the same geographic projection. The local router calculates the detour around an explicitly synthetic Park Road closure in F-8. This is an example of the product, not a current verified traffic advisory; the legend identifies the example route and illustrative closure.

Generate the committed asset with `npm run art:entry-preview` using the project's Node runtime. The generator reads public bundled road data and does not use account records, private traces, live closures, tile services or GPS. It must fail if the example cannot be validated, rather than draw an invented alternative. The snapshot represents available OSM data at its recorded timestamp and does not promise current road/access conditions or exhaustive cartographic detail. No invented parks, buildings or waterways are added to the road-only extract.

The current asset uses **420 actual OSM road ways** from the **14 October 2026, 18:17:34 UTC** snapshot and a **1,324 m** detour with **13 directed segments**. Every route segment must exist in both the router graph and the displayed raw OSM street geometry. A Turf intersection check rejects any route crossing the synthetic closure; red sections come from the ordinary closure/road clipping code. The latest illustrative center is `[73.0360954, 33.7127012]`, on an actual Park Road segment farther inside the bypassed section, with a **100 m drawing width**. This is a synthetic closure-area parameter, not the road width or a real incident. The generator checks the marker's alignment to Park Road and requires at least **10 SVG pixels** between the blue casing and both the red casing and closure marker, accounting for round stroke caps. Current measured gaps are **12.94 / 29.40 SVG pixels** respectively in the 700×900 viewBox. This replaces the earlier 120 m illustration whose thick strokes visually touched, without changing the blue route or any live closure/routing behavior. All geometry uses a single uniformly scaled, rotated local projection. The generator is deterministic, and output metadata retains its source timestamp, attribution and fictional-closure provenance.

The image is fitted without cropping, keeping both endpoints and the closure visible across card proportions. A visible linked **© OpenStreetMap contributors** credit stays outside the image and above the card edge, independent of image scaling. The static image adds no runtime mapping library or external map request to login.

The image URL includes a version query for this replacement, so browsers can fetch the corrected asset rather than retain the old illustration. The background-animation control sits at the preview's top right, clear of the wrapping legend. At phone widths the existing form-only layout still hides the preview. The peripheral Pakistan silhouette and its roads remain decorative as described below; this correction applies to the card's geographic route preview.

## Decorative background artwork

`EntryDoodles.tsx`, `entryCountryOutline.ts`, `entryRoadNetwork.ts`, `EntryIntersection.tsx` and their CSS contain SVG/CSS artwork. The country outline is generalized from the source below; the decorative roads, person, bus and signs are original illustrations. The scenes load no map/tiles, read no location, create no events and run no JavaScript frame loop.

1. The left country silhouette follows the owner's requested claimed depiction including Kashmir. Its **296-point** exterior comes from native province/claimed-region fills in the Survey of Pakistan's **Political Map, fifth edition (2020)**, uniformly scaled without vertical stretching. It has a padded **300×284** viewBox, with the main silhouette at **x10–290 / y10–264.44**. This replaces the inaccurate narrow hand-drawn shape. After the outline draws, a downward scanner reveals **351 deterministic irregular road paths** across the entire country, followed by a hold, fade and repeat. City-grid clusters and city circles are removed. No per-frame randomness is used. After the drawing phase, the outline becomes a continuous solid stroke; its reduced-motion fallback is also solid, avoiding an incomplete-looking dashed corner.
2. The top scene follows a location pin along a detour around a barricade, from its origin to an endpoint kept within the illustration's safe bounds.
3. The right roadside scene is an intersection of vertical and horizontal roads. A side-view bus with windows, doors and wheels travels left to right, with two fading exhaust wisps replacing bubble-like circles. Its body/exhaust translation is **y266**, eight SVG units above the former y274 in every moving and static pose. Wheel bottoms are y320 (320.85 including stroke), inside the horizontal road's y260–324 edges. A clothed pedestrian crosses the vertical road at a zebra crossing, using separate hip/knee joints and opposing arm/leg phases. Their movement is sequenced rather than passing through one another. Both peripheral scenes are centered inside their respective desktop gutters, including on wide screens.

The country drawing is a generalized decorative silhouette, **not an authoritative boundary file**. The source map includes disputed-territory/final-status notes; this artwork retains the requested claimed depiction without asserting resolution of a territorial dispute. Native fills are flattened, unioned with a small closing buffer, simplified and uniformly scaled; the largest continuous exterior is retained, omitting internal divisions and insets. Source hash and derivation parameters are recorded in `entryCountryOutline.ts`. Roads inside the silhouette are invented illustration. Neither silhouette nor decorative streets enter GeoJSON/API contracts, map providers, search coverage, country validation or routing. Those data and boundaries are unchanged.

The existing desktop pause/play control also pauses the scenery, and hidden tabs pause it. Below **1100 px**, side scenes are hidden instead of being partially cropped beside the card. Phone/reduced-motion layouts keep the remaining composition static. Artwork is `aria-hidden`, cannot intercept clicks, and does not replace form labels or status feedback. Animation uses browser CSS/SVG rendering with no new dependency; this is not a benchmark claim for every low-end device.

Visual references, without copying third-party assets:

- [Survey of Pakistan Political Map, fifth edition (2020), reproduced by Women University AJK](https://wuajk.edu.pk/uploads/2021/political_map_pakistan.pdf) is the native-vector source for the corrected exterior. Its SHA-256 is `fecc5cf325542854dce76964ce2d6041eb966a0d90462a10b696263946301a72`. The PDF and QA rasters remain ignored local files; the app bundles only the generalized outline coordinates. The earlier [PPIB reproduction](https://www.ppib.gov.pk/pakistan.html) was a visual reference for the superseded hand-drawn outline.
- [Meta's WhatsApp design account](https://www.meta.com/design-at-meta/blog/whatsapp-user-interface-update/) describes rounded outlined illustrations and everyday doodle objects; it informs the visual direction. The bus, person, signs and route here are original code-native drawings.

## What account verification proves

The isolated `demo-manzil-test` Auth/Firestore suite now creates a unique disposable account through the Firebase client SDK and verifies:

1. Registration succeeds; duplicate registration is rejected.
2. The new UID has ordinary member permissions, Dark/Classic defaults, empty private journeys and trip collection/inference Off. It cannot access the admin directory. Classic supersedes the Night default in the subsequent 18 October startup refinement.
3. Its profile can be saved and read with its verified token.
4. A password-reset request generates an emulator action code. The code verifies and changes the disposable password, then rejects reuse.
5. The old password fails and the new password signs into the same UID, retaining its profile.

The test signs out and deletes its disposable Auth user afterward. It runs against isolated loopback test ports, not the ongoing development accounts or hosted app. Codes/links are not committed. Firebase's own emulator logger can print its test-only reset link to ignored local logs.

Client/UI tests separately cover registration callbacks and consent/tour intent, reset dispatch with a trimmed email, success feedback, failure/retry and feedback clearing. Password managers, paste and email/password autocomplete remain supported.

**Limitation:** the Auth emulator does not send email. These checks verify SDK/UI/backend/reset-code behavior, not real mailbox delivery, production email templates/domains or spam filtering. A production inbox/reset-link acceptance test is separate deployment-owner work; no claim of a live email arriving is made. See [Firebase's emulator documentation](https://firebase.google.com/docs/emulator-suite/connect_auth).

Final integrated test counts, builds and browser evidence are recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).
