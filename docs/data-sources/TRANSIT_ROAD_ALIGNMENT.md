# Local bus road alignment

This local feature replaces stop-to-stop schematic chords with **precomputed road-alignment estimates**. It does not verify which street a bus operator actually uses. The existing public stop coordinates, stop order, timetables, access restrictions, authority comparisons and source conflicts remain unchanged. Four publisher-supplied shapes were themselves exactly stop-to-stop chords (FR-04B `z3t6g`, FR-08A `rn4hb`, FR-08B `hb2jn`, FR-17 `wqwen`); sparse FR-14A `n95vp` is also refined using its intermediate supplied vertices as ordered anchors. Their full originals remain in the derivative's `refinedSupplied` evidence. Fourteen other supplied shapes and the four independently mapped Orange directions remain unchanged.

The runtime reads a compact normalized asset. Opening Local never requests dozens of road routes, downloads Pakistan road data or runs this preprocessing. The public network projection omits backend-only consecutive-stop paths and distances, and omits a duplicate one-section shape. Its geometry remains sufficient for the map; exact ridden geometry comes from the planner.

## Reviewed coverage and remaining gaps — 18 October

The final derivative replaces **49 directions**: all 44 original stop-only directions plus five sparse supplied shapes. **954 of 974 consecutive source-stop pairs (97.95%)** have an inferred road path. **20 pairs remain explicit gaps**, including the existing Rahimabad source defect and 19 unresolved bounded/directional road connections. **37 estimated directions** have continuous geometry; adding the unchanged 14 supplied and four Orange directions gives **55 of 67 directions** with continuous geometry. These are geometry counts, not claims of running services or planner eligibility: the restricted shuttle and contradictory partial Metro variants remain excluded.

All **37 route references, 1,210 stop records, 2,064 timetable trips** and their original coordinates/ordering remain. The public stop count still includes route-specific records at the same physical station. The EV-9 outbound direction `d9zrg`, including the screenshot's Asghar Mall/Chandni area, now has all **10 consecutive pairs** on connected mapped roads. Its return direction retains two unresolved pairs rather than inventing a wrong-way connection on the Murree Road/flyover approach.

| Route / pattern | Unresolved ordered sections |
| --- | --- |
| EV-2 `ap3cz` | Gawalmandi → Liaqat Bagh; Liaqat Bagh → Marrir Chowk Metrobus |
| EV-2 `eqyn8` | Umar Baig Chowk → Ammar Chowk (**original missing Rahimabad source section**); Marrir Chowk Metrobus → Liaqat Bagh; Liaqat Bagh → Gawalmandi |
| EV-9 `dh7gf` | Pine Banquet Hall → Chandni Chowk Metrobus; Chandni Chowk Metrobus → Chah Sultan |
| FR-01 `vsh9f` | Zia Masjid → Kuri Road |
| FR-01 `bn2g6` | Nust Metro → Police Foundation Metro; I-8 Markaz → Faizabad Metro; Dhok Kala Khan → Iqbal Town; Iqbal Town → Kuri Road; Kuri Road → Zia Masjid |
| FR-03A `h586j` | PIMS Metro → PIMS Hospital |
| FR-04 `e2z4p` | Ministry of Foreign Affairs → Sukh Chayn Park |
| FR-04A `an8n4` | Shahdara → Malpur |
| FR-08A `rn4hb` | Fire Brigade G-7 → CDA |
| FR-15 `f2eb4` | Koral Town → Gulberg |
| PMBS/RLRT01 `xa6yp` | Parade Ground → Pak Secretariat |
| PMBS/RLRT04 `npbta` | Parade Ground → Pak Secretariat |

The unresolved intervals above do not prove a road or bus is closed. They need operator/source geometry or a reviewed mapping correction; the current bounded road matcher could not establish the intended connection. They stay absent from line rendering and cannot be ridden across by the planner. Valid portions on either side remain available subject to ordinary restrictions.

The bounded road extract contains **697,938 original nodes / 99,647 highway ways / five turn relations**. The bus-access graph retains **610,093 nodes / 1,241,651 directed edges / five basic turn rules**, with **91,540 accepted ways**. Its OSM replication timestamp is **17 October 2026, 20:20:51 UTC**. The compact derivative includes **12,291 used directed proof edges**; every inferred output edge is checked against it.

Final network version: `pakbus-2026-10-17-a17c931a9d85-81b022db-review-d2205044-roads-8d109199`. The normalized runtime asset is **451,858 compressed bytes / 3,150,670 normalized bytes**, including timetables that are not returned with the map network. The public network without live notices contains **658,923 raw bytes** and **18,343 displayed vertices**. A standalone compression check produced 176,103 bytes; the actual HTTP endpoint's faster level-four gzip produced **181,952 wire bytes** in a measured **70 ms warm localhost request**. Standalone cold load, validation, projection, serialization and compression together took approximately **234 ms** on this machine; hosted cold starts, repository access, bandwidth and browser rendering add their own latency. These are observations, not latency guarantees.

| Integrity item | SHA-256 |
| --- | --- |
| Exact normalized reviewed base | `2113cb68fbc2a3b862aa7e09dc1b26420769f561a86bc4c542f66b50ab10777d` |
| Bounded normalized OSM roads | `07d58a13fed883a2ae4be81ff910bae3e476b47efc9c466051ef34311bc0cff2` |
| Compressed road-alignment derivative | `8d109199719a9a7c23041ccf5dd3a6ebd0e21d41fa0a29ee4141b5f32085a246` |
| Final normalized transit runtime asset | `4800b769a316a92dbe5b806fee842da35861e427b9f66222aec889655e3726d1` |

## Sources and reproduction

The public road source is [Geofabrik's Pakistan OpenStreetMap extract](https://download.geofabrik.de/asia/pakistan.html), with © OpenStreetMap contributors / [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) attribution. Raw PBF and intermediate roads stay in ignored `.local-tools/transit/road-alignment/`. No private GPS, account or local database is read. The compact `assets/transit/road-alignment.json.gz` is a separate OSM derivative, including used directed road edges for verification; PakBus data retain their own reuse terms.

The reviewed exact download is [pakistan-261017.osm.pbf](https://download.geofabrik.de/asia/pakistan-261017.osm.pbf), **157,110,689 bytes**. Its MD5 matches the [publisher's HTTPS checksum](https://download.geofabrik.de/asia/pakistan-261017.osm.pbf.md5): `1534b71f0a0cee5b0772c5d0d497cc25`. The computed, pinned SHA-256 is `2f0682b93d0ce0f83a9c03b38bfe3734314deda5f21dbb9ef2fee2e1b6e7379a`. Source data age is the PBF header's OSM replication timestamp, not a guessed date from the filename.

Reproduce the exact existing reviewed transit base before deriving roads:

```powershell
python scripts/import-transit.py --supplement assets/transit/supplement.json --official-review assets/transit/official-review.json --output .local-tools/transit/road-alignment/base.json.gz
```

Use a verified downloaded Pakistan PBF and its reviewed exact SHA-256. Changed bytes are rejected. `extract-transit-roads.py` requires **pyosmium 4.1.1** only during development; it can be installed into `.local-tools/transit/road-alignment/python`. It is not an app dependency or shipped runtime. The extractor retains the PBF's actual OSM replication timestamp and source retrieval time; it does not claim an extraction date is new map data.

```powershell
python -m pip install --target .local-tools/transit/road-alignment/python osmium==4.1.1
python scripts/extract-transit-roads.py --input .local-tools/transit/road-alignment/pakistan-261017.osm.pbf --sha256 2f0682b93d0ce0f83a9c03b38bfe3734314deda5f21dbb9ef2fee2e1b6e7379a
node node_modules/tsx/dist/cli.mjs scripts/build-transit-road-alignment.ts
python scripts/import-transit.py --supplement assets/transit/supplement.json --official-review assets/transit/official-review.json --road-alignment assets/transit/road-alignment.json.gz
```

The alignment derivative is bound to the exact **reviewed** transit base version and normalized-byte checksum. Importing it against changed stops, ordering, official comparison or timetable inputs fails and requires regeneration/review. Its own compressed-byte hash is recorded in provenance and the final version. Stop identity/order and existing source breaks cannot be overwritten by this overlay. Unchanged shapes are retained with individual hashes; refined supplied originals are retained in full, and the original coordinate list has its own checksum.

Rebuilding the final alignment into ignored storage reproduced its compressed bytes exactly; reimporting reproduced both runtime asset and provenance exactly. An optimized native-filter PBF extraction was also compared against the original unfiltered full-country pass: both produced identical **10,559,336-byte** bounded road extracts with SHA-256 `67054fbfe227c58b0ad768184d1897f663e51c03e3c5f4cfe1df065e3b24703f`. The native filters skip unrelated ways/nodes before Python callbacks while retaining original locations, barriers and relevant turn relations. This source work remains development-only.

## How paths are derived

1. Extract full original highway ways touching a bounded Twin Cities area and their original referenced nodes. Retain barrier/access tags and relevant turn relations. Roads use shared OSM node topology; geometrically crossing roads do not become connected by appearance.
2. Build a bus/PSV graph. Access priority is `bus`, `psv`, `motor_vehicle`, `vehicle`, then general `access`. Include dedicated `busway` / `bus_guideway`; obey bus-specific one-way overrides. This is not the ordinary car router. Conditional access/direction and unsupported via-way restrictions are excluded conservatively; basic node turn restrictions are retained and bus/PSV exceptions respected.
3. Project each source stop onto up to three nearby supported road-segment candidates, at most **150 m** away, ordinarily within **30 m** of the best candidate's error. For the known PMBS/BRT patterns, prefer mapped dedicated busway candidates where present, rather than the parallel general road. When a non-BRT stop's nearest candidate is a dedicated busway, retain nearby distinct general bus-permitted carriageways inside the same 150 m limit; this handles source EV/feeder stops published at a BRT median without placing every candidate on disconnected bus infrastructure. Split the original edge at the projection. Preserve the public source stop coordinate; do not draw a fabricated off-road access segment from the stop to its projected road point.
4. Solve consecutive stop pairs in source order with a bounded shortest-distance road search. For refined supplied shapes, add their intermediate original vertices as ordered road anchors, then collapse the result back to original source stop pairs. Choose consistent shared road projections across a connected run, and carry the incoming edge through each intermediate stop/anchor so a prohibited turn is not forgotten between legs. A search pair is bounded to `max(700 m, straight-distance × 3.5 + 300 m)` and at most 100,000 search expansions. This prevents extreme detours being silently substituted for unresolved source data; it is not proof of the operator's chosen streets.
5. Keep every valid pair in `roadSegments`; represent an unresolved pair as `null` with its reason and break index. Separate connected display groups go in `geometrySegments`. The representative `geometry` is just the first valid group, never an aggregate chord over gaps. No supported road connection means no bus line is fabricated there.

The derivative includes the exact used directed road edges, including projected subdivisions, their OSM way IDs and the pinned full road-source checksum. Tests check every output inferred segment against these proof edges. No smoothing, lateral displacement, arbitrary straight connector or car-only route is introduced.

## Runtime safety and limitations

`geometryQuality: road-aligned-estimate` is deliberately distinct from `provided-shape` and Orange's `mapped-corridor`. The planner returns an explicit warning that actual operator streets may differ. It does not invent a bus detour when a closure crosses the estimated path. Published road events conservatively exclude affected ridden portions at their traversal time; reviewed bus notices remain the only assertion of a service suspension.

Exact per-pair slicing is used for ridden geometry and closure assessment. The planner cannot cross a source or unresolved road gap. Existing restricted-access shuttle and source-conflicted Metro patterns remain excluded. Unknown/expired timetables, pickup/drop-off restrictions, partial/directional service notices and revision guards retain their earlier behavior.

A source stop can be off the mapped road or wrong, OSM can omit a bus-only access rule, the nearest carriageway can be ambiguous, and a shortest mapped path can differ from a fixed bus route. These estimates improve road-aligned presentation without resolving those evidence gaps. Walking access/transfer connectors remain independently labelled straight-line estimates, not pedestrian navigation. No live bus positions, traffic feed or automatic operator diversion is implied.

The preceding commands are developer tools. Do not add them to page loads, a scheduled production worker or an unbounded download loop. Run the transit geometry/planner/API tests and production build, inspect unresolved coverage and visually review representative corridors before a separate release.
