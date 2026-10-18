# Pakistan profile city selector

Personal information has one searchable **City** dropdown with **96 curated major or familiar Pakistani cities and regional centres**. Both browsing and search results are alphabetical. The complete small list fits one scrollable dropdown; **Previous / Next** paging is removed. Search accepts familiar alternate spellings and available Arabic-script aliases, with province/territory labels within each option and keyboard/touch support. There are no additional province/district form fields.

Selecting a result changes only the profile draft; **Save profile** persists it. A search that is not selected does not overwrite the current city. Cancel discards the draft. An older saved city string remains intact even if the catalogue does not contain it, and **Clear city** explicitly removes the optional value. The search field has one rounded outer border; its inner text input stays transparent and borderless even when the app's general field styles load later.

This is a deliberately short product list, **not a census, an official population ranking or every legally designated city**. It replaces the earlier 117,579-place catalogue, which included many villages and made the profile choice unnecessarily long. Selection includes major urban centres and familiar regional/tourism locations across the seven listed provinces/territories. Smaller places omitted from the curated dropdown remain valid previously saved profile values; an update does not erase them.

City is a coarse profile label, not a geocoded position, a routing restriction or a request to collect GPS. The existing profile API saves the city name as a string. Region labels identify suggestions; the region is not separately persisted or inferred as a verified user location. Familiar display names such as **Attock, Jhang, Mirpur, Sheikhupura, Vehari** and **Wah Cantt** retain source spellings as search aliases.

## Data and licence

- Author/source: **GeoNames**, [Pakistan country download](https://download.geonames.org/export/dump/PK.zip), downloaded 17 October 2026. Upstream `Last-Modified` was 17 October 2026 at 02:01:11 UTC.
- Licence: [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). GeoNames grants commercial reuse with attribution and supplies the data without an accuracy/completeness warranty. See the [official download readme](https://download.geonames.org/export/dump/readme.txt) and [terms](https://www.geonames.org/export/index.html).
- Region names follow [GeoNames administrative codes](https://download.geonames.org/export/dump/admin1CodesASCII.txt), with readable app labels. Source country/region assignments are used for profile selection; the picker makes no boundary or sovereignty determination.
- Derivation: filtered country `PK`, feature class `P`, current populated-place codes `PPL`, `PPLA`, `PPLA2`, `PPLA3`, `PPLA4`, `PPLA5`, `PPLC`, `PPLG`, `PPLL`, `PPLF`. Abandoned, historical and city-section records are excluded. Empty/over-80-character names are excluded to match the profile contract. Candidates are deduplicated by diacritic-insensitive name plus region, retaining the greater source population. The explicit **`scripts/pakistan-major-cities.json`** manifest then selects 96 records, optional familiar display names and additional aliases. Source/original Arabic-script aliases are retained where available. The display is sorted alphabetically using English base-letter comparison and natural number ordering; population is neither displayed nor used as a claimed current ranking.
- Result: **96** cities/centres: **48 Punjab, 17 Sindh, 14 Khyber Pakhtunkhwa, 9 Balochistan, 4 Azad Jammu and Kashmir, 3 Gilgit-Baltistan and 1 Islamabad Capital Territory**. This editorial coverage can be revised without changing the profile API. Transliteration, aliases and source region assignments may be incomplete or outdated.
- Archive SHA-256: `0a28b90076b0d03d49f9605681bd6564a62986a87b74e75512e698d8752a2ab0`. The ZIP CRC was verified. The source ZIP stays in ignored `.local-tools`; it is not committed.
- Committed derivative: `src/catalogues/pakistan-cities.json`, **4,582 bytes**; Node gzip of this JSON is **1,857 bytes**, before bundler wrapping. The old 2.76 MB source catalogue is replaced rather than shipped alongside the selection. The app displays **GeoNames · CC BY 4.0** attribution with a source link while the selector is open. Source JSON measurements do not establish every deployment's transfer encoding.

The source licence applies to this derivative dataset. App source remains under its existing repository terms. No third-party API key or subscription is needed.

## Performance and interaction

The small catalogue remains a dynamic-import chunk requested only when the City dropdown opens. Successful loading is cached for the page session; failures are explicit and reopening retries. Search strings are normalised once while loading. An alphabetical reference index is sorted once per loaded catalogue; the latest normalised query's matches are reused. Empty-query browsing and every search use the same A–Z ordering.

The default search helper allows at most **100 option rows**, so all **96 curated entries** are directly available without a hidden result page or giant DOM. A concise match count stays visible. Future curation changes must update the manifest, count/coverage documentation and tests together; adding thousands of places back is not an automatic refresh behavior.

The list is in normal document flow within the settings panel, with its own bounded scroll area, so it cannot extend outside the modal and become clipped. The search keeps focus while choosing results. Arrows move between options; Home/End moves to the first/last match and Page Up/Page Down moves five matches at a time. Enter selects the active result. Leaving the complete picker cancels an unselected search. The first Escape closes the list and restores input focus, including when focus was on its toggle or source link; a subsequent Escape dismisses settings. Options expose their position and total match count to assistive technology. Controls retain visible focus indicators, touch targets and RTL layout. Loading never starts location access, geocoding, trip collection or a server profile write.

## Refresh and validation

To refresh intentionally, download a new public `PK.zip` to ignored local tools and run:

```powershell
python scripts/import-pakistan-cities.py .local-tools/pakistan-geonames.zip
```

The importer is offline: it reads that ZIP and the committed selection manifest, fails explicitly if a selected source name/region no longer exists, and prints count, size and archive checksum. Each manifest row contains the source name and region code, followed optionally by a display name and extra search aliases. Review the data diff and update this dated provenance/count before committing. Refreshing never restores the old full gazetteer implicitly. There is no automatic background place-data refresh.

`tests/pakistan-city-select.test.tsx` covers lazy loading, pointer/keyboard selection, draft preservation, explicit clear, aliases, province qualifiers, complete small alphabetical lists, keyboard traversal, retry, one-border CSS against the global styles and modal Escape behavior from the input, toggle and source link. `tests/pakistan-city-data.test.ts` checks major-city coverage, available Urdu/alternate spellings, region labels, uniqueness and the alphabetic **96**-record selection. Existing profile tests retain Save/Cancel, polling and UID isolation coverage. Current integrated checks and browser evidence are recorded in [implementation status](IMPLEMENTATION_STATUS.md).
