# Local transport fare references

Reviewed **18 October 2026**. Local journey cards show a compact **Fare estimate**. The selected itinerary shows the base fare for each boarding and an expandable **Fare details** section with reference links, check date and evidence status. Urdu labels are included. These are general adult reference estimates, not live ticket quotes or a payment integration.

## Reference collection

| Imported service | Base reference per boarding | Evidence and limitations |
| --- | ---: | --- |
| PMA Pakistan Metrobus (`RLRT01`, `RLRT03`, `RLRT04`) | PKR 30 | [PMA Fare Policy](https://pma.punjab.gov.pk/index.php/fare-policy) explicitly lists the Pakistan Metrobus one-way fare. The current page has no effective date. It also requires exit within 75 minutes and allows an additional fare afterwards. A known ride longer than that has an unavailable total. A route excluded by existing source/road validation remains excluded regardless of its fare reference. |
| Punjab Rawalpindi electric routes (`EV05101`, `02`, `04`, `05`, `09`, `10`, `1A`) | PKR 20 | [Punjab government E-Buses policy](https://punjab.gov.pk/index.php/e-buses) lists the general public flat fare. [Radio Pakistan, 17 September 2026](https://radio.gov.pk/17-09-2026/punjab-to-have-3000-electric-buses-by-june-2027-cm-maryam) reports the same provincial base fare. [Rawalpindi inauguration report, 19 November 2025](https://www.radio.gov.pk/19-11-2025/cm-punjab-inaugurates-electric-bus-project-in-rawalpindi) links that fare to the first four named Rawalpindi corridors; newer imported Rawalpindi EV codes use the provincial policy reference, not a newly verified route-specific tariff. |
| CDA regular mapped FR feeder routes, Blue, Green and Orange BRT | PKR 50, **reported reference** | [APP government news, 15 June 2025](https://www.app.com.pk/national/metro-bus-struggles-to-balance-cheaper-fares-with-reliable-service/) reports the reversal of the PKR 100 hike back to PKR 50. [APP, 2 March 2025](https://www.app.com.pk/features/metro-e-bus-services-win-public-acclaim-2/) separately describes Metro and E-bus fares. The [current CDA route directory](https://www.cda.gov.pk/cdaTransitMap) supplies route references but no current machine-readable tariff. This is deliberately marked **Reported reference** with its publication date in the UI; it is not described as an independently verified October 2026 operator tariff. |
| Orange airport segment, EX/ST special services and diplomatic shuttle | Unknown | The available evidence does not establish their current separate charges or through-ticket treatment. No fare is inferred merely because they have a CDA agency name. |
| Other or unidentified route families | Unknown | No transfer of Lahore/Multan feeder discounts, Orange **train** tariffs or unrelated-city policies into Islamabad buses. |

Search results contain contradictory old fare increases, reversals and unofficial 2026 claims. The implementation uses the linked, identified evidence with its limitations; a search snippet or an old CDA 2022 board table is not treated as a current fare feed. The `cmta.com.pk` homepage currently presents unrelated directory/news content, so it was not accepted as an operator authority.

## Calculation and API contract

Implementation: `server/transit/fares.ts`; types: `shared/transit-fares.ts`. `planTransit` attaches the fare **after** route eligibility, temporal closure checks, scheduling and geometry validation. Fare references do not alter route ranking or authorize a missing service.

- Each actual ride leg gets optional `fare` metadata: currency, amount or `null`, `reference`/`unknown` status, and source provenance or an explicit unknown reason.
- A journey gets `fare.total` only when **all** boardings have a supported base reference. `status` is `complete`, `partial` or `unknown`.
- A partial quote keeps `total: null`; `knownSubtotal` is shown only as **Known subtotal** inside fare details. Unknown is never rendered as a free PKR 0 ride.
- Count separate boardings separately. Do not infer integrated tickets, discounts, free eligibility or concession status from a person's profile. References describe ordinary adult base fares only.
- The reviewed snapshot is used for departures on/after **18 October 2026 in Asia/Karachi**, including future plans as reference estimates. Earlier departures are explicitly historical-price-unavailable: this module cannot reconstruct old tariffs or temporary free-travel periods.
- Untimed services retain their explicit missing departure/arrival/ETA. Their base reference does not imply a verified operating timetable.
- Old API responses with no fare metadata render **Fare unavailable** safely.

This is a deliberately small reviewed reference module with no new polling, subscriptions, runtime external API calls or raw source archive. Fares can change; update the scoped rules, evidence/date and tests after another deliberate source review. A future official tariff feed or administrator-managed versioned fare policy can replace these references without relaxing transit eligibility.

## Connection-search review

The owner clarified that the reported no-eligible-connection example used an unsuitable location, and no reproducible faulty endpoints remain. No routing constraint was relaxed and no unproven bug is claimed fixed.

The planner still requires stops within 1 km of each endpoint, walking transfers within 250 m, at most two transfers, applicable calendar/pickup/drop-off rules, a 90-minute scheduled wait and a four-hour horizon. It does not connect across unresolved road/source gaps, restricted services or current approved restrictions. Unknown timetable and source differences stay explicit. The bounded search may miss additional connections and reports that limit when reached. Walking segments remain straight-line estimates, not validated pedestrian paths. These are meaningful MVP limits rather than evidence that all real-world bus connections have been exhaustively searched.

## Validation

The focused fare/planner/transit UI run passes **54 tests across 4 files**, including scoped operator matching, current reference provenance, per-boarding totals, unknown/partial states, historical PKT dates, long PMA ride charges, genuine imported untimed Orange options, accessible expandable evidence and Urdu/missing-metadata presentation. Existing timetable, closure, gap and Local focus tests pass unchanged. The release handoff records the final aggregate suite/build/browser checks in `IMPLEMENTATION_STATUS.md`.
