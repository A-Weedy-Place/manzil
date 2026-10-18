# Map styles and appearance

Open **Style** on the map or **Profile → Appearance & language** to choose a driving style. **Classic** is the default for new/missing driving preferences; **Dark** is the independent app default. Existing deliberate choices remain saved. **Local independently defaults to Minimal.**

| Style | Appearance | Provider base | Saved ID |
| --- | --- | --- | --- |
| Classic | Green parks, blue water, warm roads and pale cream/green land | OpenFreeMap Bright, tuned colours | `outdoors` |
| Minimal | Pale land, understated areas and light roads; prominent transit overlays stand out | OpenFreeMap Positron, upstream palette | `minimal` |
| Night | Deep blue land, clear road outlines and light labels | OpenFreeMap Dark, tuned colours | `night` |

Only these three choices are offered. Legacy Streets/High contrast IDs remain accepted for compatibility and render as Classic. Style previews illustrate palettes, not geographic data. The chooser supports selected-state focus, Escape and outside dismissal; Profile provides the same labelled choices.

## Independent settings

- **App theme** controls Light/Dark/System interface surfaces. Explicit System follows the OS. Light uses neutral-grey outer panels and pale-blue bordered cards.
- **Map style** controls basemap colours independently of app theme.
- **Map detail** controls label/building/POI density: Clean is the default; Standard restores ordinary upstream detail.
- All maps remain flat/north-up. Route alternatives, bright-red closure strokes and selection overlays work across styles.

Style changes do not reroute, reset endpoints or clear an unsaved drawing. Base JSON is cached per provider URL, with cancelled superseded fetches. Tiles/styles/fonts/sprites still require internet and graphics support. No paid basemap credential is used; OpenFreeMap/OpenMapTiles/OpenStreetMap attribution remains available. [Provider customization](https://openfreemap.org/quick_start/).

## Local preference

Local uses Minimal unless that guest/account selected another Local style in this browser. The choice is stored under `manzil-local-map-style-v1:guest` or a UID-scoped browser key. It never PATCHes the profile, changes app appearance or overwrites the driving style. Profile's appearance controls continue to edit driving preferences.

Choices persist across reloads when browser storage is available; blocked storage keeps mounted-session memory. Invalid values fall back to Minimal. Account switching does not expose another account's choice. This preference is browser-local rather than cloud-synced.

## Existing profiles and compatibility

The domain accepts `streets | outdoors | contrast | minimal | night`. Client normalization maps retired Streets/High contrast to Classic; explicit Classic/Minimal/Night stay intact. New standalone/Firebase profiles and guest API defaults use `outdoors`. Missing fields receive the same default.

SQLite fills a missing map-style field without changing unrelated preferences/timestamps. Firestore reads a missing field with a Classic fallback, without a read-time write, retaining it on the next ordinary update. New/missing app appearance uses Dark. Guest v1/v2 valid preferences are preserved, including explicit Night/Minimal/System; legacy `detailed` becomes Standard. Missing/unsupported appearance fields alone receive defaults. There is no wholesale profile reset or data migration.

## Restored Minimal

Minimal uses the upstream Positron colour palette rather than the experimental darker road/casing overrides. It retains Clean's reduced label/POI density and the pattern-only fill safeguard below. Classic and Night have their own colour transforms. The [upstream style](https://github.com/openmaptiles/positron-gl-style/blob/master/style.json) supplies real geographic geometry; palette changes do not change routes, source coordinates, road access, selected-time validation or closures.

## Stable map lifecycle

The basemap effect depends on normalized style, detail and explicit restart. Selecting route options, receiving equivalent polling data or changing app appearance does not recreate the MapLibre map or reload its style. Equivalent legacy IDs normalize before comparison. Genuine style changes retain the existing `manzil-` overlay sources/layers through the style transform.

Unchanged overlay content avoids source re-indexing. Uncached areas still require tile requests, and network/graphics-context failures remain explicit. Lifecycle regression tests do not promise to fix every graphics-driver or tile-service flash.

## Pattern-only fill safeguard

Some upstream fills, such as wetlands and pedestrian road areas, define `fill-pattern` without `fill-color`. Removing only the pattern exposes MapLibre's default black fill. [Fill-colour specification](https://maplibre.org/maplibre-style-spec/layers/#fill-color).

Before removing a pattern in Clean detail, `prepareMapStyle` supplies a palette-appropriate solid fallback only when no explicit colour exists. Wetlands retain muted green; other areas receive an appropriate neutral. Existing colour expressions, opacity, filters and zoom ranges remain intact. Standard retains upstream patterns. The original provider style object is cloned, so detail/style switches can restore upstream settings without mutation.

## Code and verification

Implementation lives in `src/lib/mapStyle.ts`, the map lifecycle effects and browser/profile preference helpers. Tests cover three offered choices, Dark/Classic defaults, compatibility IDs, restored Minimal, pattern fallback without black fills, source attribution, upstream object preservation, cache/cancellation, unchanged-map route switches and independent account-scoped Local choices. API/SQLite/Firebase checks cover persistence and missing-value fallbacks. Executed suite/build/browser evidence belongs in [implementation status](../IMPLEMENTATION_STATUS.md).
