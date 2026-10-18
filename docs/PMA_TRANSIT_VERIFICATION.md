# PMA / Punjab transit verification

Reviewed **18 October 2026, Asia/Karachi** against the public Punjab Masstransit Authority, eTransit Punjab/PITB and Punjab Transport Department resources. This report verifies what the publishers expose; it does not certify that every vehicle is running, that every published coordinate is physically correct or that a route is open now.

## Main findings

1. The verified Punjab transit authority website is **[pma.punjab.gov.pk](https://pma.punjab.gov.pk/)**. Its own pages link **[eTransit Punjab](https://etransit.punjab.gov.pk/)**. The suggested `pma.gov.pk` was not established as the transit authority's source and was not used.
2. The official **public** eTransit route planner currently exposes **seven Rawalpindi EV route entries and three PMBS entries**, matching all ten corresponding route records in Manzil's PakBus snapshot. Both directions were inspected: **20 directional lists / 313 stop occurrences**. All 313 published coordinates match the raw community catalogue at tolerance `1e-7` degrees; this establishes source agreement, not independent field verification.
3. Two material defects also exist in the official records: the EV-2 return Rahimabad coordinate is near Lahore; the RLRT03 partial Metrobus lists reverse IJP/Potohar compared with the full corridor. An official source cannot make those contradictions correct. Keep the Rahimabad gap and exclude the conflicting partial patterns from recommendations pending verification.
4. The official directory does **not** establish new EV-3/6/7/8 routes. Historical plans, pre-launch numbering and empty number gaps are insufficient to add operating services or guessed stops.
5. This public site is a useful future source for a deliberately reviewed refresh. It is not an established bulk open-data licence, a GTFS feed or a real-time vehicle feed. No login, session, credential, private account endpoint or access bypass was used.

## Public acquisition path and evidence

The [PMA Rawalpindi page](https://pma.punjab.gov.pk/rawalpindi), [route maps page](https://pma.punjab.gov.pk/route-maps) and [official eTransit public planner](https://etransit.punjab.gov.pk/public/route-planner?city=97) were inspected. The public site's loaded JavaScript explicitly issues these unauthenticated route-directory reads:

```text
GET https://etransit.punjab.gov.pk/repo/backend/public/api/home-page/districts-with-lines?page=planner

POST https://etransit.punjab.gov.pk/repo/backend/public/api/home-page/get-line-schedules
Content-Type: application/json
{"line_id":26,"main_route_id":91}
```

Despite its HTTP verb, the second operation reads the same published schedule shown by the public planner; it does not submit a report, booking or account change. Only the ten IDs present in the returned public Rawalpindi directory were requested. District **97** contains **RFR-EV, line 26**, and **Red Line–PMBS, line 30**. The response includes directional stop IDs, names, sequence, latitude/longitude and dated stop-time records. No route geometry or live vehicle positions are supplied in these responses.

The reviewed client entry is `main.47bbea11ddf6dbac.js`; its public planner module is `529.88cf5c60646af65e.js`. These resource names are acquisition evidence, not stable API version promises. Raw pages, JavaScript, JSON responses, map JPEG and legacy PDF remain ignored under **`.local-tools/transit-official/`**.

The machine audit **`.local-tools/transit-official/pma-official-audit.json`** records the normalized snapshot version/hash, exact read bodies, raw-response hashes, all 20 ordered source lists, coordinate matching counts and only compact timing summaries. It is for root integration into a scoped review manifest. The full raw schedule responses are not committed or substituted into the canonical dataset by this research task.

Public planner catalogue SHA-256: `d67e4331ed831703b1f78120907f469e135241b750b8ea9a28a486c8c9f9de5a`.

### Reproducing the audit

The committed **`scripts/verify-pma-transit.py`** is a Python-standard-library, source-only audit tool. It has no runtime poll, accepts no URL/key/credential, refuses redirects and permits only the two exact public endpoints above with the ten reviewed request bodies. Offline is the default. Downloads are bounded to 2 MB for the directory and 5 MB per schedule response; the base normalized dataset is bounded to 8 MB. Every official raw response and the publisher catalogue are pinned to this reviewed snapshot's SHA-256. Changed source content fails with a review-required message rather than silently updating the evidence or canonical network.

Rebuild the same **unreviewed base** into ignored files before binding independent authority evidence. This avoids feeding the review's own additions back into its source comparison:

```powershell
python scripts/import-transit.py --source-dir .local-tools/transit --supplement assets/transit/supplement.json --output .local-tools/transit-official/base/islamabad.json.gz --retrieved-at 2026-10-17T22:02:43.601Z
python scripts/verify-pma-transit.py --source-dir .local-tools/transit-official --dataset .local-tools/transit-official/base/islamabad.json.gz --publisher-catalogue .local-tools/transit/catalogue.json --checked-at 2026-10-17T22:40:41.847612+00:00 --output .local-tools/transit-official/pma-official-audit-reproduced.json
```

For an exact rerun, use `checkedAt` from the existing full audit or committed `assets/transit/pma-verification.json` rather than inventing a fresh review instant. Without `--checked-at`, the tool uses the newest raw response file modification time. `--dataset` captures the exact unreviewed dataset version and normalized-byte hash; an already reviewed dataset is explicitly rejected. `--source-dir` can point to another offline copy of the reviewed responses. Optional `--download` makes the same bounded public reads and writes only bodies that match the pinned checksums; there is no scan or automatic checksum bypass. A later day's schedule normally needs a deliberate new source review and pin update.

The checked rerun reproduced the original **117,099-byte** audit byte for byte: **10 routes / 20 directions / 313 matched coordinate occurrences**, normalized-base hash `1e53bef0c7f17f5290ff21d126d8dfd88f4e0e30056b9d37cd6a59ac7a902832`, audit hash `25e3b31d737aa857bdaa868d9f1cb4ab4484a8b715fb8bedaec12fb1ee73c758`. Root's `scripts/build-transit-official-review.py` consumes the full audit and produces compact reviewed metadata; the canonical asset is changed only by the separate explicit import step. Raw archives, this temporary base and the full API responses stay ignored.

Read-only negative checks also confirmed rejection of a changed response checksum, an arbitrary external URL, an already reviewed input dataset, a timezone-naive review instant and an oversized source. No additional authority requests or canonical writes were needed for those checks.

## Route-by-route official comparison

Use [RFR-EV in the public planner](https://etransit.punjab.gov.pk/public/route-planner?city=97&line=26) for the EV rows and [PMBS](https://etransit.punjab.gov.pk/public/route-planner?city=97&line=30) for the Metrobus rows. The detailed endpoint above requires the listed `line_id` and `main_route_id`; the `forward` / `backward` properties independently supply the two lists. EV aliases below identify Manzil's existing source codes; the inspected response itself exposes endpoint titles and numeric IDs, so an alias is not a newly verified official route-number inscription.

| Manzil source code | Official main / directional IDs | Published endpoint pair | Stops forward / backward | Review outcome |
| --- | --- | --- | --- | --- |
| EV05101 / EV-1 | 91 / 137,138 | Railway Station – Hamrahi | 15 / 15 | Source endpoints, order and all coordinates agree. |
| EV05102 / EV-2 | 92 / 139,140 | Fawara Chowk – Koral Chowk | 20 / 20 | Same updated via-Katchery list; return Rahimabad coordinate remains invalid. Manzil plots only 19 usable return stops and preserves the gap. |
| EV05104 / EV-4 | 93 / 141,142 | Saddar Metrobus – Munawar Colony | 12 / 12 | Source endpoints, order and all coordinates agree. |
| EV05105 / EV-5 | 94 / 143,144 | Marrir Metrobus – Motorway Chowk 26 No | 22 / 22 | Stops agree; only two first-stop records, 05:00/05:01, make all-day timetable inference unsafe. |
| EV05109 / EV-9 | 99 / 147,148 | Umar Baig Chowk – TB Hospital | 11 / 11 | Source endpoints, order and all coordinates agree. |
| EV05110 / EV-10 | 100 / 145,146 | Saddar – Qabristan Chowk | 13 / 12 | Published forward list contains both Qabristan Up and Down platform records at its end; retain that directional distinction. Only one 04:00 departure record is not an established all-day timetable. |
| EV0511A / EV-1A | 172 / 275,276 | Saddar – Bhatta Chowk | 16 / 16 | Stops agree; 05:00/05:01 records remain inadequate for an all-day schedule. |
| RLRT01, full PMBS | 136 / 207,208 | Saddar – Pak Secretariat | 24 / 24 | Official full-corridor order and coordinates agree with Manzil. Portal contains many dated records; these are planned/source records, not live arrivals. |
| RLRT03, partial PMBS | 537 / 877,878 | Saddar – Faiz Ahmed Faiz | 14 / 14 | Same source defect in both lists: IJP/Potohar order contradicts full PMBS and the official corridor map. Both partial patterns must remain unavailable for planning. |
| RLRT04, partial PMBS | 538 / 879,880 | Kashmir Highway – Pak Secretariat | 10 / 10 | Stop order/coordinates agree with the matching full-corridor section, but the exposed schedule is sparse; preserve unknown ETA. |

### Full PMBS station sequence

The [official PMBS corridor map](https://pma.punjab.gov.pk/system/files/PMBS1.jpg), PMA's [system description](https://pma.punjab.gov.pk/node/14), [Punjab Transport's system table](https://transport.punjab.gov.pk/metro_bus_services) and public direction **207** support **24 stations**. The full direction **208** independently reverses the sequence, with some separate Down platform coordinates:

Saddar → Marrir Chowk → Liaquat Bagh → Committee Chowk → Waris Khan → Chandni Chowk → Rehmanabad → Sixth Road → Khatam-e-Nabuwat → Faizabad → IJP → Potohar → Khayaban-e-Johar → Faiz Ahmad Faiz → Kashmir Highway → Chaman → Ibn e Sena → Katchery → PIMS → Stock Exchange → Seventh Avenue → Shaheed e Millat → Parade Ground → Pak Secretariat.

The older static map labels the ninth station **Shamsabad**, while the current public portal uses **Khatam-e-Nabuwat** at that corridor position. Preserve the source/alias distinction rather than claim a newly verified rename date. The inspected official system descriptions say **24**, not 23; a separate older source with 23 should be documented as a conflict, not used to silently remove a current source station.

### Concrete defects that must not be copied as truth

**EV-2 return Rahimabad:** official route **140**, sequence **9**, stop **2061**, is `[74.236084,31.44535]`, the same far-away coordinate excluded by Manzil. The outbound platform **2059**, sequence **10**, is `[73.0799517,33.5990583]`. That is a different named direction/platform and cannot establish the exact return boarding position. Do not reverse-copy it or insert a straight bridge. Manzil source pattern **`eqyn8`** must retain its unusable-stop break until an independent precise return location is verified.

**Partial PMBS IJP/Potohar:** current Manzil route **`csvb2`** has partial pattern **`vtvpb`** (direction 1, Saddar→FAF) with Potohar at index 10 and IJP at 11. **`me5tv`** (direction 0, FAF→Saddar) has IJP at index 2 and Potohar at 3. Those are precisely the inconsistent lists exposed by official directions **877/878**. Full corridor **207**, however, has **IJP→Potohar** toward Secretariat, and **208** has **Potohar→IJP** toward Saddar. Coordinates make the backtracking clear:

| Platform | Public portal coordinate `[longitude, latitude]` |
| --- | --- |
| IJP, IDs 2313/2156 | `[73.072004,33.656479]` |
| Potohar Up, ID 2314 | `[73.065661,33.660648]` |
| Potohar Down, ID 5712 | `[73.065412,33.660810]` |

The official map corroborates the full corridor. This supports **flagging and excluding** the partial patterns; it does not supply a separately verified partial-service diversion. Keep full RLRT01 usable, leave partials visible grey/uncertain with an explanation, and do not claim they are operator-suspended. A source-conflict guard is different from a timed service notice.

## Schedules and operational dates

The [dedicated PMA operating-hours page](https://pma.punjab.gov.pk/operating-hours) describes PMBS as **06:15–22:00**, with a **2.25–3 minute** headway. The [Punjab Transport system table](https://transport.punjab.gov.pk/metro_bus_services) agrees and records the **4 June 2015** inauguration. The generic PMA homepage rounds Metrobus startup to 06:00, so use the dedicated system reference and retain the discrepancy rather than treating every published minute as consistent.

The official eTransit responses inspected here contain the date **2026-10-18**. They do not provide a future-validity range, live vehicle observations, an explicit stop-time accuracy flag or a documented GTFS calendar. Some directions show plausible dense records; others have only one or two suspiciously early values. Full PMBS direction 207 contains 261 first-stop records and 208 contains 267, including a last 22:02:30 record. This differs from the generic closing-hour summary and must not be flattened into a guaranteed fixed headway. Date/time strings lack an offset; interpreting them as local PKT is a jurisdiction/UI inference, not an explicit timezone field.

Manzil's existing PakBus schedules retain their own **17 October–16 November 2026** snapshot calendars and source-model intermediate-time warnings. This review does not extend that validity, promote sparse official rows into a complete timetable or replace approximate source-model stop times with allegedly exact government observations.

For EV operations, [Radio Pakistan's 19 November 2025 inauguration report](https://www.radio.gov.pk/19-11-2025/cm-punjab-inaugurates-electric-bus-project-in-rawalpindi) identifies the initial Railway–Hamrahi, Fawara–Koral, Saddar–Munawar and Marrir–Motorway corridors. It is historical launch evidence, not a current detailed stop list or timetable. [PITB's public press index](https://pitb.gov.pk/media_clippings?page=2) records its eTransit/T-Cash announcement on 25 July 2026; the government app listing attributes eTransit to PITB. Neither proves that all listed buses are operating at a chosen future instant.

## Historical material that cannot expand the active network

The [PMA Rawalpindi feeder plan](https://pma.punjab.gov.pk/rawalpindi-integrated-transportation-system-phase-1) explicitly describes six future routes and 78 planned minibuses. Its linked feeder-route PDF has creation metadata **14 January 2017**. The [Rawalpindi route download page](https://pma.punjab.gov.pk/rawalpindi) still links it, but current hosting does not make its plans current operations. Likewise, the [Punjab Transport Company's 2012 procurement RFP](https://ptc.punjab.gov.pk/system/files/Operators-RFP_27_9_12.pdf) contains routes derived from an older survey and must not become 2026 operating buses.

The 2024 [Urban Unit connectivity report](https://urbanunit.gov.pk/Download/publications/Files/20/2024/Rawalpindi%20Connectivity%20Report.pdf) is useful planning context. Its proposed interventions and feeder diagrams are not a replacement for current public source records. RDA's public services pages did not supply a current machine-readable stop/timetable feed in this review. No unverified routes are added merely because a planning map or procurement document names them.

## Integration decisions

- Keep the ten source-matched records, with scoped **official stop-record review** links and a checked date. An official-review badge must not imply verified geometry or live operations.
- Preserve EV-2's unplaced return stop/gap and its source warning.
- Mark **`vtvpb`** and **`me5tv`** with a documented `routingUnavailableReason`; leave them visible uncertain/grey while excluding them from recommendations. Preserve full RLRT01 and the rest of the network.
- For other routes with scoped official differences, preserve the reference warning in journey information; do not automatically label an entire line suspended.
- Keep EV-5/10/1A and partial PMBS sparse-time records untimed. Do not create all-day frequencies, backwards shapes or future calendars from them.
- Preserve existing non-red bus colors, closure/time/access constraints, explicit source coverage and private-data boundaries. This task changes no deployment, account permission, GPS collection or automatic source pipeline.
