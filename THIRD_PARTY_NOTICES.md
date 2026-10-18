# Licensing and third-party notices

Manzil's original application source code and documentation are licensed under the [MIT License](LICENSE), copyright 2026 Manzil contributors. This includes original code-native illustrations and project-authored navigation phrases, to the extent the contributors hold the relevant rights.

**Third-party dependencies, datasets, map-derived material and source evidence retain their own licences and terms. They are not relicensed under MIT.** A public repository does not remove a source's noncommercial, attribution or share-alike requirements. No trademark or endorsement rights are granted by the software licence.

## Data and map-derived material

| Material | Location / integration | Applicable source and scope |
| --- | --- | --- |
| OpenStreetMap roads and geometry | `assets/routing/`, OSM-derived parts of `assets/transit/`, `public/manzil-route-preview.svg` | © OpenStreetMap contributors. Underlying databases/derivatives retain [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); preserve attribution and applicable database/produced-work obligations. [OSM copyright](https://www.openstreetmap.org/copyright). |
| PakBus transit records | Imported portions of `assets/transit/islamabad.json.gz` and related source metadata | Publisher permits noncommercial educational/app use; revenue/profit use requires permission. This is custom permission, not MIT or unrestricted open-data licensing. Review [PakBus data terms](https://pakbus.app/data) before redistribution or commercial use. |
| Mixed transit network | `assets/transit/islamabad.json.gz`, `supplement.json`, `road-alignment.json.gz` and official-review metadata | Preserve per-source provenance. OSM-derived geometry, PakBus records and official factual comparisons have different rights; neither MIT nor one blanket ODbL label supersedes the other sources' terms. [Source/reuse notes](docs/data-sources/TRANSIT_SOURCES.md). |
| CDA/PMA source references | `assets/transit/cda-verification.json`, `pma-verification.json`, `official-review.json`; reference-only stop names | Public factual comparisons are retained with source references. No blanket open redistribution licence for the original official material was identified. Raw official PDFs/responses are not bundled. See [CDA evidence](docs/data-sources/CDA_TRANSIT_VERIFICATION.md) and [PMA evidence](docs/data-sources/PMA_TRANSIT_VERIFICATION.md). |
| GeoNames city selection | `src/catalogues/pakistan-cities.json` | GeoNames, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Manzil selects/normalizes a smaller city list; preserve source credit and indicate those changes. [GeoNames terms](https://www.geonames.org/export/), [derivation notes](docs/data-sources/PAKISTAN_CITIES.md). |
| Weather readings | Runtime Open-Meteo data and eligible trip-share snapshots | [CC BY 4.0](https://open-meteo.com/en/licence), with provider credit and indication of rounding/simplified icons. API access is separately subject to [service terms](https://open-meteo.com/en/terms); MIT does not grant commercial use of the provider's free endpoint. |
| Basemap tiles/styles | Runtime OpenFreeMap/OpenMapTiles/OSM services | Retain the displayed provider/data attribution and their respective licences. [OpenFreeMap](https://openfreemap.org/), [OpenMapTiles attribution](https://openmaptiles.org/docs/website/attribution/), [OSM](https://www.openstreetmap.org/copyright). No Google Maps or Mapbox service entitlement is granted. |
| Champ Alerts/X text and images; PSO price pages | Runtime evidence/reference collection, not original project content | These sources are not relicensed by Manzil. Their content rights and access/reuse terms remain applicable. Raw source images, sessions and archives are excluded from Git. Public source access does not establish unrestricted republication rights. |

The transit snapshot is therefore **not an unrestricted MIT dataset**. Commercial redistributors need a compatible source/permission arrangement, in addition to any software licence.

## Unresolved map-outline permission

`src/components/entryCountryOutline.ts` contains a traced/generalized outline derived from the **Survey of Pakistan Political Map (2020)**. Its source/hash and derivation are recorded in that file and the [entry artwork guide](docs/guides/ENTRY_SCREEN.md); the referenced [source PDF](https://wuajk.edu.pk/uploads/2021/political_map_pakistan.pdf) does not establish an open redistribution/relicensing grant.

**This outline geometry is excluded from the MIT grant.** Obtain suitable permission or replace it with a clearly reusable source before public redistribution or claiming that all bundled artwork is openly licensed. Attribution alone is not permission. This unresolved item also applies to older release snapshots containing the same geometry.

## Project artwork, fonts and generated audio

- The generated Manzil logo copies in `assets/brand/manzil-logo-v1.png` and `public/manzil-logo.png` are made available with the project under MIT to the extent the contributors hold rights in them. Generation provenance is in the [brand README](assets/brand/README.md). Use must not imply that a fork is the official Manzil service or endorsed by its contributors; no trademark permission is granted here.
- Original doodle code and road-network illustration code follow MIT, except the third-party map outline and map-derived material identified above. Visual inspiration does not mean WhatsApp/Meta artwork is included or licensed by this project.
- DM Sans is loaded through Google Fonts. Its upstream [SIL Open Font License 1.1](https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt) remains applicable if you redistribute the font. Font files are not bundled in this source tree.
- The basic Urdu WAV files and their project-authored phrases are available under MIT to the extent the contributors hold rights in them. They were synthesized using eSpeak NG; its engine/dictionary are not bundled. Retain the [generator/provenance notes](docs/guides/BILINGUAL_NAVIGATION_AND_CLOUD.md#excluded-offline-pack). Do not describe tool licensing as a licence for the whole application or third-party voices.

## Software dependencies

Dependencies remain under their upstream licences; installation includes their own licence/copyright files. Preserve those notices when distributing packages or compiled bundles. This table covers direct runtime dependencies, not every transitive dependency or deployment binary.

| Licence | Direct dependencies |
| --- | --- |
| MIT | React, React DOM, Express, Zod, parse5 and Turf modules |
| Apache-2.0 | Firebase JS/Admin, Google Auth, Google Cloud Storage/Text-to-Speech and Playwright Core |
| BSD-3-Clause | MapLibre GL JS, including its retained historical Mapbox notices |
| BSD-2-Clause | dotenv |
| ISC / retained origin notices | Lucide; preserve its Feather-origin MIT notices too |

See [package.json](package.json), [package-lock.json](package-lock.json) and the installed upstream licence files for the exact versions and notices. Hosted API terms, quotas, charges and credentials are separate from source-code licensing.

## Releases and publication

New licence/notice files do not rewrite historical Git snapshots. When a release targets an older deployed commit without these files, its release notes and supplemental licence assets must explain the code grant and retained exclusions. Review [release/publication guidance](docs/operations/RELEASES.md) before changing repository visibility or distributing a source/binary package.
