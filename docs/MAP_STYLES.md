# Map styles

Updated 17 October 2026. Open **Style** on the map, or **Profile → Appearance → Map style**, to switch between three distinct choices. Outdoors is now called **Classic**; Streets and High contrast are retired from both choosers.

| Style | Appearance | Base | Saved id |
| --- | --- | --- | --- |
| Classic — default | Green parks, blue water, warm main roads and a pale cream/green backdrop | OpenFreeMap Bright, tuned colours | `outdoors` |
| Minimal | Quiet pale colours | OpenFreeMap Positron | `minimal` |
| Night | Deep blue background, clear road outlines and light labels | OpenFreeMap Dark, tuned colours | `night` |

**App theme** controls the interface's light/dark/system appearance. **Map style** independently controls the basemap. **Map detail** independently controls label/building/POI density; Clean remains the default. Flat 2D, blue route alternatives and bright red closures apply to every style. Switching styles does not reroute, reset endpoints or clear an unsaved drawing.

The chooser previews illustrate each palette; they are not geographic screenshots or route data. The panel supports selected-state focus, Escape and outside-click dismissal. Profile exposes the same labelled buttons.

## Existing profiles

The API/storage contract continues to accept `streets | outdoors | contrast | minimal | night`, so existing SQLite and Firebase profiles do not need a data migration. The client normalizes `streets`, `contrast` and a missing value to Classic (`outdoors`) for rendering and selected-state display. Switching from another palette to Classic writes `outdoors`; unrelated profile fields and consents are untouched. Existing server defaults/backfills may still store the legacy `streets` id, which displays Classic consistently.

Base JSON is cached per provider URL. Classic and both legacy aliases share Bright; superseded style fetches are cancelled. No new mapping dependencies, credentials or provider subscriptions were added. Internet is still required for provider styles/tiles and attribution is retained. See [OpenFreeMap's official customisation guide](https://openfreemap.org/quick_start/).

## Black polygon fix

The former Clean transformation removed `fill-pattern` from every fill. The [official Liberty JSON](https://tiles.openfreemap.org/styles/liberty), inspected 17 October, contains pattern-only `landcover_wetland` and `road_area_pattern` layers with **no `fill-color`**. Removing their pattern exposed MapLibre's default black fill. The wetland layer starts at zoom 12, explaining a stable polygon that disappears when zooming below its layer threshold. See the [MapLibre fill-colour specification](https://maplibre.org/maplibre-style-spec/layers/#fill-color), which defines the default as `#000000`.

Clean now substitutes an explicit palette-appropriate solid colour before removing a pattern when its layer has no fill colour. Wetlands keep a muted green; pedestrian/other patterned areas receive a pale neutral fill. Existing explicit colours/expressions, opacity, filters and zoom ranges are preserved. Standard detail retains the upstream pattern. This fixes a deterministic style transformation defect without adding repaint loops, tile retries or changing route/closure overlays. It does not claim to fix every possible graphics-driver or tile-service issue.

## Verification

`tests/map-style.test.ts` adds **eight focused regression cases**: exactly three offered palettes, legacy normalization, non-black pattern-only fills across all five accepted ids, preservation of explicit colour expressions and original style objects, Standard restoration, shared provider caching and source attribution. Fixtures reproduce the inspected upstream pattern layers; the tests make no external network calls. Overall integration/build/browser evidence is recorded separately in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

The earlier five-style/69-test browser evidence in implementation history describes the 15 October version, not this reduced chooser.
