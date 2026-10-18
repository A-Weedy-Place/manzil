# Manzil v0.1.0 — Hosted MVP

**Use the app:** [manzil-app-v1.web.app](https://manzil-app-v1.web.app)

This MVP prerelease identifies the application source recorded for the hosted deployment on **18 October 2026**. It is a source/release marker; creating this release does not redeploy the app.

- **Application commit:** `8702fb9d0b5262b5d40953d5ed0dfab464343567`.
- **Deployment evidence:** [record at `2c893e2`](https://github.com/A-Weedy-Place/manzil/blob/2c893e2822bb3837f7dfeb48d88f47c594e26bf2/docs/IMPLEMENTATION_STATUS.md).
- **Platform:** Firebase Hosting, Firebase Authentication, Firestore and Google Cloud Run in `asia-southeast1`, with a separate private source/Gemini worker, Cloud Scheduler, private source-image storage and Secret Manager.
- **Public check:** the hosted frontend's `index-CsCJEhcH.js` fingerprint matches the deployment record; `/api/health` returned 200 with Firestore and the road graph ready. Cloud revisions/settings are taken from the teammate's record, not newly authenticated cloud inspection.

## Included experience

- 2D mapping, place search, closure-aware driving alternatives, stops and Plan ahead.
- Road restrictions, contributor moderation, profiles, saved journeys and consented trip history/statistics.
- Twin Cities local transport with stops, transfer options and closure/service-status handling.
- English/Urdu interface and recorded cloud speech configuration, hourly Islamabad weather and dated fuel-cost estimates.
- Champ Alerts evidence collection and Gemini processing with the release line's recorded selective high-confidence publication policy and administrator correction/review controls.

The hosted release enables daily PSO checks, cloud speech and selective validated agent publication according to its deployment record. The newer feature checkout's mandatory-approval policy and README are not a promise that these two versions have identical behavior. Read the exact tagged source for this release.

## Licence and data scope

Original Manzil code/documentation are offered under MIT; third-party material retains separate rights. Download and retain the supplemental **LICENSE** and **THIRD_PARTY_NOTICES.md** release assets. The tagged deployment predates those files, so GitHub's automatic source ZIP/tarball does not embed them.

PakBus permission is noncommercial, OSM/GeoNames retain their respective licences, and the Survey of Pakistan-derived login outline requires permission review or replacement before public redistribution. This is not an unrestricted MIT dataset/artwork release. The attached notices identify source/provenance and the unresolved item.

## MVP limits

Road-speed ETAs and reference fares/fuel costs are estimates; live traffic and live bus tracking are not provided. Source scraping is partial, route/forecast coverage is bounded, and browser GPS/voices vary. Use the app's explicit unavailable/uncertainty states. The hosted service can be updated independently after this release marker.
