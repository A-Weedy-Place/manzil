# Map styles

Updated 18 October 2026. Open **Style** on the map, or **Profile → Appearance → Map style**, to switch between three distinct choices. **Classic is the initial/default driving map for new or missing preferences**; an explicitly saved palette is respected. **Local independently defaults to Minimal.** Outdoors is called **Classic**; Streets and High contrast are retired from both choosers.

| Style | Appearance | Base | Saved id |
| --- | --- | --- | --- |
| Classic — default | Green parks, blue water, warm main roads and a pale cream/green backdrop | OpenFreeMap Bright, tuned colours | `outdoors` |
| Minimal — Local default | Earlier pale land, understated areas and light roads; coloured transit overlays stand out | OpenFreeMap Positron, original palette | `minimal` |
| Night | Deep blue background, clear road outlines and light labels | OpenFreeMap Dark, tuned colours | `night` |

**App theme** controls the interface's light/dark/system appearance, defaulting to **Dark** for new or missing preferences. Saved Light/Dark/System choices stay intact; explicit System follows the operating system. Light has neutral-grey outer panels and pale-blue inner cards. **Map style** independently controls the basemap, defaulting to **Classic**. **Map detail** independently controls label/building/POI density; Clean remains the default. Flat 2D, blue route alternatives and bright red closures apply to every style. Switching styles does not reroute, reset endpoints or clear an unsaved drawing.

The chooser previews illustrate each palette; they are not geographic screenshots or route data. The panel supports selected-state focus, Escape and outside-click dismissal. Profile exposes the same labelled buttons.

## Independent Local preference

Entering Local uses **Minimal** unless that guest/account has explicitly chosen another Local style in this browser. Local's Style chooser writes only `manzil-local-map-style-v1:guest` or its signed-in UID-scoped browser key. Switching to Map, Plan ahead or Profile restores the saved driving/profile map style; Local changes never PATCH the profile or change app appearance. Profile's Appearance settings continue to edit the driving preference. Choices persist across reloads when browser storage is available; blocked storage retains a choice for the mounted session. Invalid stored choices fall back to Minimal, and account switching does not briefly expose another account's choice. This is a browser preference, not a cloud-synced profile field.

## Existing profiles

The API/storage contract continues to accept `streets | outdoors | contrast | minimal | night`, so existing SQLite and Firebase profiles do not need a general data migration. The client normalizes only the retired `streets` and `contrast` aliases to Classic (`outdoors`); explicit `outdoors`, `minimal` and `night` choices stay intact. A missing value renders Classic. New standalone/Firebase profiles and guest API state use `outdoors`. SQLite fills a missing field once without changing other preferences or timestamps; Firestore reads a missing field as Classic without a read-time database write and retains the fallback on the next ordinary profile update.

**Latest 18 October choice:** Dark interface + Classic map supersedes the earlier Night default. Fresh guest preferences and User 123 fixtures use Dark/Classic. Existing `manzil-guest-appearance-v2` choices are retained, including deliberate Night/Minimal/System choices. A saved v1 preference is copied with its valid choices intact rather than forced to Night; legacy `detailed` detail is interpreted as `standard`. Only missing/unsupported appearance fields receive current defaults. Unavailable browser storage uses session memory. No new version key or general preference reset is introduced, and the trace upgrade never overwrites an existing account profile.

Base JSON is cached per provider URL. Classic and both legacy aliases share Bright; superseded style fetches are cancelled. No new mapping dependencies, credentials or provider subscriptions were added. Internet is still required for provider styles/tiles and attribution is retained. See [OpenFreeMap's official customisation guide](https://openfreemap.org/quick_start/).

## Route-switch stability

The basemap effect depends only on normalized map style, map detail and an explicit restart. Selecting a route, refreshing the same snapshot, or changing the app's light/dark controls does not recreate the MapLibre map or reload its style. Retired Classic aliases normalize before the effect so switching equivalent IDs does not restyle. A missing preference uses the Classic fallback backdrop, independently of the Dark app theme. Genuine style changes retain existing `manzil-` route/closure sources and layers through the style transform.

`tests/map-lifecycle.test.tsx` mounts the real React map component against an instrumented MapLibre boundary: route switches, copied polling payloads and app theme changes keep one map/style/source, unchanged data avoids worker re-indexing, and explicit detail changes perform a style update. Missing preferences and equivalent Classic aliases are covered too. These are lifecycle regression checks, not a claim to reproduce or fix every intermittent graphics/tile flash. Moving or zooming into uncached areas still requires network tiles; network errors and graphics-context interruptions retain explicit error/restart states.

## Restored Minimal palette

The owner's latest choice restores the pale Minimal behavior from `9f902c2`, before `cac2313` added darker slate roads, casings and label overrides. Minimal again uses the upstream Positron palette, retaining Clean's reduced label/POI density and the pattern-only fill safeguard below. Its preview uses light roads again. Classic and Night transformations remain intact. The [official upstream Positron style](https://github.com/openmaptiles/positron-gl-style/blob/master/style.json) supplies real basemap geometry; restoring its palette changes no routes, source coordinates, road access or closure/time validation. Local's heavier coloured route overlays remain distinct from the pale basemap.

## Black polygon fix

The former Clean transformation removed `fill-pattern` from every fill. The [official Liberty JSON](https://tiles.openfreemap.org/styles/liberty), inspected 17 October, contains pattern-only `landcover_wetland` and `road_area_pattern` layers with **no `fill-color`**. Removing their pattern exposed MapLibre's default black fill. The wetland layer starts at zoom 12, explaining a stable polygon that disappears when zooming below its layer threshold. See the [MapLibre fill-colour specification](https://maplibre.org/maplibre-style-spec/layers/#fill-color), which defines the default as `#000000`.

Clean now substitutes an explicit palette-appropriate solid colour before removing a pattern when its layer has no fill colour. Wetlands keep a muted green; pedestrian/other patterned areas receive a pale neutral fill. Existing explicit colours/expressions, opacity, filters and zoom ranges are preserved. Standard detail retains the upstream pattern. This fixes a deterministic style transformation defect without adding repaint loops, tile retries or changing route/closure overlays. It does not claim to fix every possible graphics-driver or tile-service issue.

## Verification

`tests/map-style.test.ts` has focused regression coverage for exactly three offered palettes, Classic for missing driving preferences, legacy Classic normalization, non-black pattern-only fills across all five accepted ids, preservation of explicit colour expressions and original style objects, Standard restoration, restored upstream Minimal colours in both detail modes while retaining Clean density, shared provider caching and source attribution. Fixtures reproduce inspected upstream pattern/transportation layer structures; the tests make no external network calls. Local preference and transit UI tests cover its Minimal default, independent persistent choice, account isolation, invalid/blocked storage and one-map tab switching without profile writes. Guest tests cover new Dark/Classic driving preferences, preserving saved v1/v2 choices and missing-field fallback. SQLite/API and Firebase integration expectations cover Classic for new/missing profiles and persistence of all five accepted saved ids; actual emulator and overall integration/build/browser evidence is recorded separately in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

The earlier five-style/69-test browser evidence in implementation history describes the 15 October version, not this reduced chooser.
