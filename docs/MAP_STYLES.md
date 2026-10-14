# Map styles

The 15 October colour refinement replaces the grey default with **Streets**. Open **Style** on the map, or **Profile → Appearance → Map style**, to switch. The selection is saved in the local profile and survives restart.

| Style | Appearance | Base |
| --- | --- | --- |
| Streets — default | Warm main roads, green parks/woodland, blue water and a cream background | OpenFreeMap Liberty, tuned colours |
| Outdoors | Richer greens, blue waterways and softer warm roads | OpenFreeMap Bright, tuned colours |
| High contrast | More distinct road edges, stronger place labels, bolder greens/water | OpenFreeMap Liberty, contrast palette |
| Minimal | Quiet pale colours; the earlier grey option remains available by choice | OpenFreeMap Positron |
| Night | Deep blue background, clear road outlines and light labels | OpenFreeMap Dark, tuned colours |

**App theme** controls the interface's light/dark/system appearance. **Map style** independently controls the basemap. For example, a light interface can display Night, and a dark interface can display colourful Streets. **Map detail** independently controls label/building/POI density; Clean remains the default. Flat 2D, blue route alternatives and bright red closures apply to every style. Switching styles does not reroute, reset endpoints or clear an unsaved drawing.

The chooser previews illustrate each palette; they are not geographic screenshots or route data. The panel supports keyboard focus, Escape and outside-click dismissal. On narrow screens it scrolls within the viewport. Profile also exposes the same labelled, selected-state buttons.

`LocalProfile.mapStyle` accepts `streets | outdoors | contrast | minimal | night`. Existing profiles missing the field backfill to Streets without changing names, consent, app theme or timestamps. PATCH validates the enum. No credentials, provider subscriptions or new mapping dependencies were added. The provider still requires internet; source attribution is retained. [OpenFreeMap's official style/customisation guide](https://openfreemap.org/quick_start/).

Implementation: shared contract and SQLite profile; `src/lib/mapStyle.ts` for provider URLs/palettes; `MapStylePicker.tsx` for both selectors; `MapView.tsx` reloads style layers and reattaches current overlays. Base JSON is cached per provider URL, so Streets/High contrast reuse Liberty. Superseded style fetches are cancelled. Rendering remains flat with the existing worker/pixel-ratio limits.

Validation: **69 tests pass**, including legacy-profile migration, restart persistence and invalid-style rejection; production type/build passes. Browser checks exercised all five style selections, kept three route options through changes, confirmed Night with a light interface, and restored Streets after reload. At 375×812, all five options fit in a 344 px panel without horizontal overflow. Escape closed the picker and returned focus to the Style button; the viewport was reset afterward. Detailed evidence is in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).
