# Map styles

Updated 17 October 2026. Open **Style** on the map, or **Profile → Appearance → Map style**, to switch between three distinct choices. **Night is the initial/default map for new or missing preferences**; an explicitly saved palette is respected. Outdoors is called **Classic**; Streets and High contrast are retired from both choosers.

| Style | Appearance | Base | Saved id |
| --- | --- | --- | --- |
| Classic | Green parks, blue water, warm main roads and a pale cream/green backdrop | OpenFreeMap Bright, tuned colours | `outdoors` |
| Minimal | Quiet pale land, muted green/blue areas and darker slate roads/labels | OpenFreeMap Positron, tuned colours | `minimal` |
| Night — default | Deep blue background, clear road outlines and light labels | OpenFreeMap Dark, tuned colours | `night` |

**App theme** controls the interface's light/dark/system appearance, defaulting to **Dark** for new or missing preferences. Saved Light/Dark/System choices stay intact; explicit System follows the operating system. Light has neutral-grey outer panels and pale-blue inner cards. **Map style** independently controls the basemap, defaulting to **Night**. **Map detail** independently controls label/building/POI density; Clean remains the default. Flat 2D, blue route alternatives and bright red closures apply to every style. Switching styles does not reroute, reset endpoints or clear an unsaved drawing.

The chooser previews illustrate each palette; they are not geographic screenshots or route data. The panel supports selected-state focus, Escape and outside-click dismissal. Profile exposes the same labelled buttons.

## Existing profiles

The API/storage contract continues to accept `streets | outdoors | contrast | minimal | night`, so existing SQLite and Firebase profiles do not need a general data migration. The client normalizes only the retired `streets` and `contrast` aliases to Classic (`outdoors`); explicit `outdoors`, `minimal` and `night` choices stay intact. A missing value renders Night. New standalone/Firebase profiles and guest API state use `night`. SQLite fills a missing field once without changing the other preferences or timestamps; Firestore reads a missing field as Night without a read-time database write and retains the fallback on the next ordinary profile update.

**18 October correction:** the old guest v1 appearance could keep restoring Light/Classic. First access now initializes `manzil-guest-appearance-v2` with Dark/Night, retaining valid map detail from v1. Later explicit selections persist across reloads; unavailable browser storage uses session memory. Fresh User 123 fixtures also use Dark/Night. The current sample account was observed with Dark/Night after login, preserving its uploaded photo and existing consent. The trace upgrade never overwrites an existing profile. This is a one-time guest correction, not a forced reset on every login.

Base JSON is cached per provider URL. Classic and both legacy aliases share Bright; superseded style fetches are cancelled. No new mapping dependencies, credentials or provider subscriptions were added. Internet is still required for provider styles/tiles and attribution is retained. See [OpenFreeMap's official customisation guide](https://openfreemap.org/quick_start/).

## Route-switch stability

The basemap effect depends only on normalized map style, map detail and an explicit restart. Selecting a route, refreshing the same snapshot, or changing the app's light/dark controls does not recreate the MapLibre map or reload its style. Retired Classic aliases normalize before the effect so switching equivalent IDs does not restyle. A missing preference now uses a dark Night fallback backdrop immediately, matching the eventual Night map rather than flashing a light placeholder. Genuine style changes retain existing `manzil-` route/closure sources and layers through the style transform.

`tests/map-lifecycle.test.tsx` mounts the real React map component against an instrumented MapLibre boundary: route switches, copied polling payloads and app theme changes keep one map/style/source, unchanged data avoids worker re-indexing, and explicit detail changes perform a style update. Missing preferences and equivalent Classic aliases are covered too. These are lifecycle regression checks, not a claim to reproduce or fix every intermittent graphics/tile flash. Moving or zooming into uncached areas still requires network tiles; network errors and graphics-context interruptions retain explicit error/restart states.

## Minimal road visibility

Minimal now uses darker slate minor roads (`#7a8c97`) and main roads (`#607988`), muted casings, stronger labels and pale green/blue geographic areas. This colour-only transformation retains upstream road widths, geometry, filters, opacity and zoom thresholds, including Clean's reduced label/POI density. Rail/ferry/pier lines are not recoloured as streets. Route blue and closure red remain separate overlays; the palette does not change legal access, route ranking or closure/time validation. The transformation follows the transportation layer names and filters in the [official upstream Positron style](https://github.com/openmaptiles/positron-gl-style/blob/master/style.json), rather than bundling another map engine or road network.

## Black polygon fix

The former Clean transformation removed `fill-pattern` from every fill. The [official Liberty JSON](https://tiles.openfreemap.org/styles/liberty), inspected 17 October, contains pattern-only `landcover_wetland` and `road_area_pattern` layers with **no `fill-color`**. Removing their pattern exposed MapLibre's default black fill. The wetland layer starts at zoom 12, explaining a stable polygon that disappears when zooming below its layer threshold. See the [MapLibre fill-colour specification](https://maplibre.org/maplibre-style-spec/layers/#fill-color), which defines the default as `#000000`.

Clean now substitutes an explicit palette-appropriate solid colour before removing a pattern when its layer has no fill colour. Wetlands keep a muted green; pedestrian/other patterned areas receive a pale neutral fill. Existing explicit colours/expressions, opacity, filters and zoom ranges are preserved. Standard detail retains the upstream pattern. This fixes a deterministic style transformation defect without adding repaint loops, tile retries or changing route/closure overlays. It does not claim to fix every possible graphics-driver or tile-service issue.

## Verification

`tests/map-style.test.ts` has **eleven focused regression cases**: exactly three offered palettes, Night for missing preferences, legacy Classic normalization, non-black pattern-only fills across all five accepted ids, preservation of explicit colour expressions and original style objects, Standard restoration, darker Minimal roads/labels in both detail modes while retaining density/non-road lines, shared provider caching and source attribution. Fixtures reproduce inspected upstream pattern/transportation layer structures; the tests make no external network calls. Targeted map-style and SQLite/API tests pass **27 cases across two files**. Firebase integration expectations also cover Night for new/missing profiles and persistence of all five accepted saved ids; actual emulator and overall integration/build/browser evidence is recorded separately in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

The earlier five-style/69-test browser evidence in implementation history describes the 15 October version, not this reduced chooser.
