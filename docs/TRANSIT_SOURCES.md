# Local transport: sources and coverage

**18 October road-alignment follow-up:** the additional road source is the [Geofabrik Pakistan OpenStreetMap extract](https://download.geofabrik.de/asia/pakistan.html), downloaded only during development. Its exact dated file, checksums, OSM timestamp, bus-aware derivation, source-gap handling and reproduction are recorded in [road-alignment provenance](TRANSIT_ROAD_ALIGNMENT.md). It provides mapped roads for inferred bus alignment, not evidence of the operator's actual streets or current service. Existing PakBus/CDA/PMA evidence and licences remain scoped to their original source records. Raw downloads remain ignored; the compact OSM-derived geometry/proof asset retains OpenStreetMap/ODbL attribution. A separate public release must retain the existing derivative/reuse obligations below.

Research and local source inspection: **18 October 2026, Asia/Karachi**. This is a static public-transit dataset, not live vehicle tracking or a guarantee of current operation. Manzil keeps operator/service suspensions separate from the route catalogue and treats road intersections as uncertainty rather than asserting an operator has cancelled a bus.

**Expanded official verification, 18 October:** all 42 CDA directional PDFs and the official Punjab eTransit public planner's 10 Rawalpindi entries / 20 directions / 313 stop-coordinate occurrences were checked. Source agreement and conflicts now appear in each route's **Official references** disclosure. Older CDA documents and official source defects do not certify current operations or field coordinates. FR-05/ST-01 are additional unmapped references; contradictory partial RLRT03 patterns are excluded from recommendations. See [CDA comparison](CDA_TRANSIT_VERIFICATION.md), [PMA comparison and public acquisition](PMA_TRANSIT_VERIFICATION.md), and [current reviewed dataset](TRANSIT_DATA.md). The following initial source research remains useful provenance.

## What is usable now

1. **PakBus** publishes downloadable, reusable transit data. Its current Twin Cities catalogue contains **32 routes / 63 directions**. Its underlying published sources include CDA and PITB. Use the downloadable data, rather than copying Safar's software or private application endpoints. [Downloads and noncommercial permission](https://pakbus.app/data), [publisher's source and timing method](https://pakbus.app/about).
2. **OpenStreetMap** supplies the missing Orange corridor geometry and actual mapped platforms. Manzil derives four directional corridors: Faiz Ahmed Faiz–N5 and N5–airport in both directions. These have no invented schedule and are labelled `mapped-corridor`. [Reviewed relation](https://www.openstreetmap.org/relation/13911250).
3. **CDA's FR-12 PDF** confirms ordered stop names, but supplies no coordinates or current service-validity dates. FR-12 is catalogue-only until its locations are independently verified; it must not silently become a made-up route on the map. [Official forward timetable](https://lists.cda.gov.pk/Assets/metro_transit_route/FR-12_Forward.pdf), [backward timetable](https://lists.cda.gov.pk/Assets/metro_transit_route/FR-12_Backward.pdf).

Do not advertise this first import as every local bus in Pakistan or every current Twin Cities service. Missing coverage is visible in the data, rather than filled with synthetic stops or guessed timetables.

## PakBus acquisition and quality

The [feed listing](https://pakbus.app/gtfs/feeds.json) provides dated availability, hashes and immutable archive URLs. Download [GTFS ZIP](https://pakbus.app/gtfs/pakbus.zip) and [route catalogue JSON](https://pakbus.app/gtfs/catalogue.json). Reviewed source `asOf` is **2026-10-17**, with GTFS calendar coverage **17 October–16 November 2026**. Expiry must remain meaningful; an expired timetable must not be extrapolated indefinitely.

The inspected Twin Cities subset is filed under `city: Rawalpindi`. It has **1,194 direction/route stop IDs**; these are not 1,194 distinct physical stations. There are **19 supplied shape patterns**, **20 routes with full scheduled trips**, and **2,064 trips**. All 2,064 first-stop timepoints are marked exact; 43,101 intermediate stop times are approximate. The publisher explains that intermediate times can be calculated from distance. Do not label them live arrivals or wholly operator-published running times. Nineteen further patterns have first-stop departure records but no full GTFS trip timing.

Keep the source's `locationUsable`, `unplacedStops`, `blockedSegments`, `restricted_access` and directional ordering. In particular, EV05102's Koral-to-Fawara pattern flags Rahimabad's location unusable: its raw coordinate is near Lahore. The broken neighbouring segments must not be joined. FR-04B is marked restricted access; ordinary recommendations must not bypass that restriction.

The snapshot includes FR-01, FR-03A, FR-04/04A/04B, FR-06/07, FR-08A/08B/08C, FR-09/10/11/13/14/14A/15/17, EX-16, ST-02, Blue/Green, PMBS full/partial services, and EV05101/02/04/05/09/10/1A. Short EV aliases are presentation only; retain original IDs. Orange and FR-12 are absent from this source. No reviewed source established currently operating EV-3/6/7/8 coverage; numbering gaps are not evidence of a missing operating route.

Downloaded raw archives stay under ignored `.local-tools/transit/`. Normalized public data keeps per-source provenance. Nothing here contains a private journey, account, GPS trace or credential.

## Orange derivation, not an operator timetable

Source: [OSM API full relation 13911250](https://api.openstreetmap.org/api/0.6/relation/13911250/full), **version 12**, edited **23 August 2026**. Its 97 way members include one unrelated hotel polygon, `1340156666`, which is excluded. It has no ordered platform-role member list. It does, however, include actual `highway=bus_stop` / `public_transport=platform` nodes within its mapped highways.

`scripts/build-orange-transit.py` reads the pinned XML and creates `assets/transit/supplement.json` using only the Python standard library:

- Keep only relation highway ways and their original vertices; obey `oneway=yes/-1`.
- Solve each direction independently through connected edges. Never create a straight connector, reverse the other direction's geometry or substitute a general car route.
- Require every selected stop to be an actual mapped platform on that directed path, in monotonic path order. Store original `[longitude, latitude]` and distance along the corridor.
- Export **17 platform nodes / 4 patterns**. Out/in BRT lengths are **12,363.80 / 12,354.69 m**; airport lengths **16,502.99 / 17,108.51 m**, with **167/162/263/283** vertices respectively.

The two unnamed platforms at the relation's Faiz Ahmed Faiz terminus receive that terminus association for display; a specific numbered bay is not asserted. Other OSM names remain unchanged, even when current signs or other apps use different labels. The direction order follows road topology and platform positions, rather than an official ordered route-member list. A `mapped-corridor` shape is therefore distinct from an operator/feed `provided-shape`.

The separate BRT/airport grouping is corroborated by CDA's **9 September 2022** board description of Faiz Ahmed Faiz–N5 and N5–NIIA services. This old record establishes the grouping's provenance, **not current fares or frequency**. No current timetable, through-service or dispatch is inferred. [CDA board minutes](https://www.cda.gov.pk/public/Assets/YEAR_2022/9th-Sept-2022.pdf).

Reproduce after obtaining the reviewed raw XML:

```powershell
python scripts/build-orange-transit.py --input .local-tools/transit/orange-relation-13911250.osm --output assets/transit/supplement.json
```

The generator fails on a changed source hash; review the changed relation and platform membership before changing the pin. For identical metadata across regeneration, supply the recorded `--retrieved-at` and `--fr12-retrieved-at` timestamps. Default metadata uses the local source files' UTC modification times. Current normalized supplement is public data; it can be inspected without the ignored archive. Rebuilding with the recorded metadata was checked to reproduce the supplement exactly; an altered source hash is rejected. Both directions have strictly increasing stop distances and all 25 FR-12 names are retained without coordinates.

## FR-12 and official references

The downloaded forward/backward PDFs were created **16 July 2025**, contain **25 named stops**, 12 trips in each direction and hourly departure examples. First-page rendering and text extraction agree. They are older published schedules, not proof the complete service runs today. Coordinates are absent, so those times are not imported as routable journeys.

Forward sequence: Taxila Chowk; University of Wah; Nawab Abad; Wah Cantt Barrier No 2; Gulshan e Anwar; Jinnah Colony; New City Phase 01; Losar Sharfoo; New City Phase 02; Bahtar Morh; Wah Model Town Phase 01; Wah Model Town Phase 02; Swedish College; Malakand Stop; Basti; Sabri Gali; Wah Cantt Barrier 03; Ahmad Nagar; Shah Wali Colony Road; Wah Gardens; Askari Cement Factory Road; Dhok Dhollian; WAPDA Colony; Hassan Abdal; Tipu Sultan Shaheed Chowk. The backward PDF independently reverses that named sequence.

[CDA transit portal](https://lists.cda.gov.pk/cdaTransitMap) has route-direction timetable PDFs and a [network diagram](https://lists.cda.gov.pk/Assets/pdf/Transit-Map-Islamabad-V-08.pdf). The diagram distinguishes future services; it is not georeferenced geometry, and some route names differ from the newer catalogue. Do not trace its schematic pixels into supposedly precise road coordinates. [PMA Rawalpindi](https://pma.punjab.gov.pk/rawalpindi) and its [integrated-transport phase description](https://pma.punjab.gov.pk/rawalpindi-integrated-transportation-system-phase-1) expose plans/PDFs, but the latter explicitly describes future feeder operation. Tender/proposal documents must not become confirmed active services.

## Safar comparison

[Safar credits](https://www.safar.fyi/collaborators) name its developer, a Twin Cities mapping contributor and community update channels. Its [Twin Cities directory](https://www.safar.fyi/islamabad) currently lists 31 routes, including Orange BRT/airport and FR-12; this is useful for identifying coverage gaps. Its [terms](https://www.safar.fyi/terms), updated 21 August 2026, protect original software/branding and defer transit/map rights to their owners. No public bulk-download reuse grant was identified. This implementation does not copy Safar source code, artwork, private endpoints or stop database. Public route-page comparison is not proof its database is open source or fully current.

## Reuse and attribution

- **PakBus:** its download page expressly permits noncommercial educational projects/apps without prior permission; revenue/profit use requires permission. This is a custom permission, not a blanket open-source software/data licence. Preserve source links and date. Commercialisation needs a separate source review.
- **OSM supplement:** © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), with [OSM attribution](https://www.openstreetmap.org/copyright). Keep this independent derivative's licence/provenance intact; do not relabel PakBus data ODbL. Public use should offer recipients the OSM derivative or reproducible alterations as required by ODbL, while application source and private data remain separate.
- **CDA PDFs:** public reference, no explicit open redistribution licence found. Link and reference the route; do not commit the source PDFs or claim a government partnership.

## Snapshot hashes

| Source artifact | SHA-256 |
| --- | --- |
| PakBus catalogue | `8fe797dd1bc770f0f7ca6284a94af5ab685d7c7f92b8cc529ab6f0516c9b90cd` |
| PakBus GTFS | `a17c931a9d85d4e6919a6c1aa07d34b3653df4fe76e440341b6123fa716af514` |
| OSM Orange relation v12 | `bd7dc7d862b180fd5cb619a181479c0d9cf136bb54dec50620404336621d9c5d` |
| CDA FR-12 forward | `752333ab1c19fef269385beb9b5a9de1fe46c59440a3382d08f47561fa0842c6` |
| CDA FR-12 backward | `6cc4c3135ec92b6b8dcb8a5ce35ec9f7744f77b3d95e0b8e7a451b0b531be97f` |
