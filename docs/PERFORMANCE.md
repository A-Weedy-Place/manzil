# Local map overlay performance

## Changes on 15 October

- Normal browsing paints the affected road red without a surrounding closure polygon outline or fill. Polygon/corridor previews remain in the editor for accurate authoring.
- Red-road requests start immediately; the former 180 ms debounce is removed.
- The browser keeps up to eight road snapshots, keyed by active closure IDs and revisions. Advancing the clock inside the same active period no longer clears/refetches unchanged red roads. Starts, ends, cancellations and edits change the key; old revisions cannot be displayed.
- Identical GeoJSON is not repeatedly sent to MapLibre workers. Geometry, selection, clear operations, replacement sources and failed-update retries still work. Planner route arrays and unchanged polled closure objects retain their references.
- Switching basemap styles preserves local overlay sources and layers. Overlay installation is idempotent. Local road/route geometry does not have to be fetched or computed again just because colours change.
- The backend caches graph/polygon intersection results by all polygon coordinates, including holes, separately per immutable graph object. Callers receive independent copies. LRU limits bound entries and affected-edge counts; very large results are not cached. Closure schedules and traversal-time validation still run for every request, including on cache hits.

## Measurements

Run `npx tsx scripts/benchmark-map.ts` from the project directory. The script uses the real bundled 203,828-directed-edge graph and four explicitly synthetic corridors. It does not read the local database or GPS history. Measurements below are local development observations, not a device-independent performance guarantee.

| Measurement | Before cache | After cache |
| --- | ---: | ---: |
| Repeated geometry work, median | 23.45 ms | 0.07 ms |
| Repeated geometry work, worst observed | 34.11 ms | 0.17 ms |
| Full plan, three same-time options | 112.73 ms | 95.88 ms |
| First geometry computation | 29.24 ms | 33.73 ms |

The improvement is reuse of previously calculated geometry; the initial scan is not faster. Route validation has not been skipped. These timings exclude HTTP, map tile loading, rendering and departure comparison. Initial basemap downloads, WebGL and larger constrained searches can still take longer.

## Verification

The subsequent junction correction clips red paint to the actual polygon intervals rather than whole intersecting graph edges. Display and conservative routing fractions share one graph scan/cache; holes and tangencies have explicit regression coverage. Cache keys in the browser are versioned for the revised geometry. The latest run measured first geometry 30.01 ms, warm median 0.07 ms (worst 0.16 ms), and a three-option plan 117.90 ms. The earlier table records the original cache comparison, not a claim that every run becomes faster. The full suite now has **115 passing tests in 14 files**, including the real F-8 residential-street demo.

The production type/build check passes. Cache tests cover edits/holes, graph isolation, output mutation, active/cancelled/reopened timing, deadline enforcement and eviction. Frontend tests cover active-set/revision boundaries, redundant worker suppression, clears/retries, out-of-order failures and style preservation.

Actual browser checks found the blue routes and red roads visible in the first captured frame after Find routes. Fresh-page Outdoors → Night → Outdoors changes retained lines without new rendering errors. A warning seen during development came from an older hot-reload handler; it did not recur after a fresh load. This is visual verification, not a frame-time benchmark. No claim of physical low-end-device profiling is made.
