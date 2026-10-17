# Pakistan profile city selector

Personal information now has a searchable city dropdown. It searches locally, accepts English spellings and available Arabic-script aliases, shows province/territory labels and works with keyboard or touch. Selecting a result changes the profile draft; **Save profile** persists it. A search that is not selected does not overwrite the current city. Cancel discards the draft. An older saved city string remains intact even if the catalogue does not contain it, and **Clear city** explicitly removes the optional value.

The source is a broad populated-place gazetteer, **not a guaranteed complete official list of every legally designated Pakistani city**. Cities, towns and villages are included so smaller hometowns remain selectable. This city is a coarse profile label, not a geocoded position, a routing restriction or a request to collect GPS. Duplicate place names are qualified by province/territory in the dropdown; the existing profile API still saves the city name as a string. A legacy name-only value marks at most the highest-ranked matching record as selected. An explicitly chosen regional row stays selected within the open edit draft; the region is not separately persisted or inferred as a verified user location.

## Data and licence

- Author/source: **GeoNames**, [Pakistan country download](https://download.geonames.org/export/dump/PK.zip), downloaded 17 October 2026. Upstream `Last-Modified` was 17 October 2026 at 02:01:11 UTC.
- Licence: [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). GeoNames grants commercial reuse with attribution and supplies the data without an accuracy/completeness warranty. See the [official download readme](https://download.geonames.org/export/dump/readme.txt) and [terms](https://www.geonames.org/export/index.html).
- Region names follow [GeoNames administrative codes](https://download.geonames.org/export/dump/admin1CodesASCII.txt), with readable app labels. Source country/region assignments are used for profile selection; the picker makes no boundary or sovereignty determination.
- Changes: filtered country `PK`, feature class `P`, current populated-place codes `PPL`, `PPLA`, `PPLA2`, `PPLA3`, `PPLA4`, `PPLA5`, `PPLC`, `PPLG`, `PPLL`, `PPLF`. Abandoned, historical and city-section records are excluded. Empty/over-80-character names are excluded to match the profile contract. Names are ASCII/transliterated display names with original/available Arabic-script aliases retained for search; aliases have a 1,400-character per-record cap. Records are deduplicated by diacritic-insensitive name plus region, retaining the greater source population, then ranked by source population and name. Population is used only to order suggestions; it is not shown or presented as an authoritative current count.
- Result: **117,579** unique populated-place name/region combinations. Covers Balochistan, Khyber Pakhtunkhwa, Punjab, Sindh, Islamabad Capital Territory, Gilgit-Baltistan and Azad Jammu and Kashmir; one record has no specified region and is labelled Pakistan. Transliteration, aliases and region assignments may be incomplete or outdated.
- Archive SHA-256: `0a28b90076b0d03d49f9605681bd6564a62986a87b74e75512e698d8752a2ab0`. The ZIP CRC was verified. The source ZIP stays in ignored `.local-tools`; it is not committed.
- Committed derivative: `src/catalogues/pakistan-cities.json`, **2,759,236 bytes**; Python gzip of the JSON was **536,428 bytes**. The app displays **GeoNames · CC BY 4.0** attribution with a source link while the selector is open. These are source JSON sizes, not a claim about every deployment's transfer encoding.

The source licence applies to this derivative dataset. App source remains under its existing repository terms. No third-party API key or subscription is needed.

## Performance and interaction

The catalogue is a dynamic-import chunk requested only when the City dropdown opens, keeping the initial map path independent of this data. Successful data/index loading is cached for the page session; failures are explicit and reopening retries. Search strings are normalised once while loading; queries scan the existing index without re-normalising every place. Only **60** results are rendered, with a prompt to narrow broad queries. Prefix matches rank before other matches.

The list is in normal document flow within the settings panel, with its own bounded scroll area, so it cannot extend outside the modal and become clipped. The search keeps focus; arrows/Home/End move the active option, Enter selects, Tab cancels an unselected search, and the first Escape closes the list before another Escape dismisses settings. Buttons retain visible focus indicators and touch targets. Loading never starts location access, geocoding, trip collection or a server profile write.

## Refresh and validation

To refresh intentionally, download a new public `PK.zip` to ignored local tools and run:

```powershell
python scripts/import-pakistan-cities.py .local-tools/pakistan-geonames.zip
```

The importer is offline: it reads that ZIP and prints count, size and archive checksum. Review the data diff and update this dated provenance/count before committing. There is no automatic background place-data refresh.

`tests/pakistan-city-select.test.tsx` covers lazy loading, pointer/keyboard selection, draft preservation, explicit clear, aliases, province qualifiers, result cap, retry and modal Escape behavior. `tests/pakistan-city-data.test.ts` checks real major-city coverage/aliases/region labels and valid optional-city API sizes. Existing profile tests retain Save/Cancel, polling and UID isolation coverage.
