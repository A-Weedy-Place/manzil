# First deployment: manzil-app-v1

**18 October integrated release deployed:** source `8702fb9` includes GitHub main `f07778c` plus preserved fuel/cloud-voice work. API `manzil-api-00015-7cr`, private worker `manzil-source-worker-00012-t2z`, Hosting pin `fh-208bbe9aa098303b`. Clear >=95%-confidence road and timed Metro restrictions publish only after evidence, geometry/service and time checks; uncertain events retain individual admin decisions. Ten labelled shared demo closures were imported (seven active, three upcoming), without personal User 123 data. The bundled/offline Urdu pack is excluded; cloud/device speech and nightly fuel remain. **1,099 standard + 27 Firebase emulator tests (1,126 total)**, cloud build and **34 live checks per origin** pass. Earlier review-only/local-only/basic-Urdu notes below are historical. [Current policy and operations](SELECTIVE_AGENT_PUBLICATION.md).

**18 October fuel/voice release:** API `manzil-api-00013-sqx`, worker `manzil-source-worker-00010-86j`, Hosting `fh-968013a274e235e9`. Nightly PSO checks run at 01:00 PKT; guest/signed-in English and Urdu WaveNet voices share a 100,000-character monthly cap. 835 standard/emulator cases, production build, live API/Hosting routing checks and real bilingual MP3/cache verification pass. Gemini billing/model/limits and admin review remain unchanged. [Current operations and costs](FUEL_AND_VOICE.md). Older inactive-service entries below are historical.

**Merged release deployed, 18 October:** application commit `1f196c3` combines GitHub feature merge `49762d0` with the deployed Gemini checkpoint `9b16416`. Live API `manzil-api-00012-g9q`, private worker `manzil-source-worker-00009-6bf`, Hosting pin `fh-84ad6494196d6945`. New UI/profile/transit/weather features and mandatory Gemini admin review are retained. **809 standard + 24 Auth/Firestore emulator tests (833 total)**, production build, three local browser flows, two hosted entry checks and **34 live checks per origin** pass. Weather is fresh; the live bundled transit network has 37 routes/1,210 stops and returned three journey options. Model limits/schedules and worker-only secret remain unchanged. GitHub main contains both histories; original checkout is synchronized and prior local edits are retained in a named backup stash. Earlier localhost-only, uncommitted and deployment-pending entries below are historical.

**18 October release integration (validation complete; deployment pending):** GitHub main `49762d0` merged feature development through `da13602` but did not include the locally deployed Gemini/pipeline work. Isolated checkout `D:/Manzil/release-integration-20261018`, branch `integration/deployed-feature-release`, preserves that work as checkpoint `9b16416` and combines both histories. Incoming transit/weather/profile/entry UI and travel/privacy behavior are retained alongside private Gemini proposals, unified review counts, admin approval, manual worker dispatch and safe account error codes. Original checkout is preserved. **809 standard + 24 real Auth/Firestore emulator cases (833 total)**, production build and three actual-browser desktop/phone/Urdu entry-to-admin-map-prefill checks pass. Updated one stale transit colour expectation and made production weather refresh/persistence finish before responding. Existing test ports were occupied; the isolated emulator run used 8280/9299 and related alternate ports. Temporary root config was removed. No production test account, GPS migration, blockade approval or model call was performed.

**18 October stale-tab follow-up:** owner screenshots showed the previous three-tab admin layout and community-only zero review count. Live Hosting HTML/assets were verified as the newer four-tab unified-review build `index-Fm3dogw_.js`. The screenshots therefore show an older loaded frontend; the precise browser cache/open-tab cause cannot be determined remotely. Added explicit `no-cache,max-age=0,must-revalidate` for `/` and `/index.html` in firebase.json; hashed assets keep immutable caching. This updates page-load behavior only and never forces an open page to reload. Existing stale tabs need one hard refresh (Ctrl+Shift+R). Hosting-only fix deployed and verified: both entry URLs return the revalidation policy, the current bundle matches, and direct analysis CORS/runtime checks pass. API/worker, approval policy, data and model schedules unchanged.

**Current deployment, 18 October:** API `manzil-api-00011-76r`, worker `manzil-source-worker-00008-cfp`, Hosting `fh-2c9b2b4410f6124c`; 498 standard/emulator cases and 27 live checks per origin pass. Review-only mode, same schedules/allowance. Public API timeout 180 seconds; only manual analysis uses the direct authenticated API origin to avoid Hosting's sixty-second timeout. [Release evidence](IMPLEMENTATION_STATUS.md#observable-pipeline-and-bounded-agent-improvements-deployed---18-october).

**18 October pipeline update:** Control centre opens on Pipeline. Review queue and Awaiting review combine current Gemini post reviews with pending community reports; multiple events count as one post until its last decision. Run Gemini now invokes the private worker through the authenticated public API, with the same claims, five-minute schedules and daily limits. Live saved-state progress and per-proposal tool logs make the stages observable. The agent matches unique current incidents and retries eligible failed mapping from saved extraction, at most three attempts with fifteen-minute cooldown; every map action still requires admin approval. [Current workflow](AGENT_MAP_REVIEW.md), [release evidence](IMPLEMENTATION_STATUS.md). Older scheduling-only and automatic-publication entries are historical.

**Latest review release, 18 October:** API `manzil-api-00010-mfs`, worker `manzil-source-worker-00007-4mq`, Hosting `fh-657d3b00874068d1`. Five saved interpretations have private review drafts (three mapped landmarks); no new model calls or closures from preparation. Agent publication now always requires administrator approval. Earlier deployment and auto-publication entries are historical. [Current release evidence](IMPLEMENTATION_STATUS.md), [review workflow](AGENT_MAP_REVIEW.md).

**Current map-agent scope (17 October):** every agent closure/reopening requires administrator approval. Private prepared proposals, source/version checks and map preview precede the atomic decision; no draft affects routing. The deployed settings are review-only. Older release details below are historical; see [review workflow](AGENT_MAP_REVIEW.md) and current implementation status.

**Latest release, 17 October evening:** Gemini is deployed at API `manzil-api-00007-kv4`, worker `manzil-source-worker-00004-h5p`, Hosting pin `fh-1892cd5e1863e326`. One immutable tested backend image serves both roles; only the private worker receives the confirmed Free tier key via Secret Manager. Separate authenticated five-minute source/model jobs are active. 450 standard/emulator cases, production build and 24 checks per origin pass. [Repeatable model release/pause procedure](GEMINI_INTEGRATION.md), [actual release evidence](IMPLEMENTATION_STATUS.md). Earlier deployment phases below remain historical.

Deployment target agreed during setup on 17 October 2026: Firebase Hosting plus Cloud Run and the default Firestore Standard database in Singapore (`asia-southeast1`). The private source repository stays private. Existing SQLite data, GPS traces and local account fixtures are not migrated or uploaded.

**Later source-pilot release (current):** API **`manzil-api-00006-cpm`**, Hosting pin **`fh-99a30503e5ad5589`**, private worker **`manzil-source-worker-00003-g8s`** and enabled Scheduler **`manzil-champ-source-5min`** collect every five minutes. Four notices and one private image were saved from Google Cloud; scheduled repeats verified deduplication/image reuse. **401 standard/emulator cases**, cloud build and **19 live checks per origin** pass. Gemini, automatic map publication, cloud speech and fuel/commute scheduling remain inactive. This release is the local uncommitted working tree based on `0fd5592`, identified by image digest in [current evidence](IMPLEMENTATION_STATUS.md#five-minute-source-pilot-deployed---17-october); `0fd5592` alone is the previous feature release below. See [source deployment/status/pause](SOURCE_DEPLOYMENT.md). The old feature pairing below is retained for rollback.

**Latest release:** source **`0fd5592`** (feature merge `8191693` plus reconciled local deployment changes), API revision **`manzil-api-00005-zg5`**, Hosting pin **`fh-4dbbea488086e281`**. Fresh 360 tests and the cloud build pass. Direct API and Hosting each pass 27 live checks; guest browser Lahore routing, Plan ahead and English/Urdu phone checks pass. Previous healthy rollback pairing: **`manzil-api-00004-7t4`** / **`fh-2f5b84f588973b7c`** (source `34e9e4a`). No rules/index/schema change or private-data migration was required. [Current verification](IMPLEMENTATION_STATUS.md#feature-release-deployed--17-october).

## Verified prerequisites

- Google Cloud project `manzil-app-v1` / project number `488497279747` is ACTIVE and billing is enabled. The owner reported creating a billing budget alert; alerts are not a hard spending cap.
- Firestore `(default)` is `STANDARD`, `FIRESTORE_NATIVE`, location `asia-southeast1`.
- Firebase email/password authentication is enabled. Authorized domains include `manzil-app-v1.web.app` and `manzil-app-v1.firebaseapp.com`.
- Google Cloud CLI and repository-local Firebase CLI are signed in. Use `gcloud.cmd` and `.\node_modules\.bin\firebase.cmd` from PowerShell.
- Ignored `.env.cloud.local` contains the registered web app configuration. Its key was not printed. `npm.cmd run build:cloud` passes.
- The current release passed 345 standard cases and fifteen real Auth/Firestore emulator cases on Node 24.22.0 (360 total). The first release's 165-case result is historical. Default tests skip emulator cases; use `npm.cmd run test:firebase` to run them.

## One-time cloud setup

The assistant enabled `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com` and `iam.googleapis.com`. Firestore, Identity Toolkit and Firebase Hosting APIs were already enabled.

Dedicated runtime identity: `manzil-api@manzil-app-v1.iam.gserviceaccount.com`, granted `roles/datastore.user` and `roles/firebaseauth.viewer`. The API enforces personal ownership and verified admin claims; Firestore IAM is server access, not browser authorization. The runtime identity has no model/speech grant in this first release.

Source builds use `488497279747-compute@developer.gserviceaccount.com`, granted `roles/run.builder` for Cloud Build. The signed-in owner deploys; do not put user credentials or service-account JSON in the image.

## Release procedure

From `D:\Manzil\manzil` in PowerShell:

```powershell
npm.cmd test
npm.cmd run build:cloud
```

Run the emulator integration suite when authentication/storage or deployment packaging changes. Before the first upload, `gcloud.cmd meta list-files-for-upload` was checked: local env files, databases, GPS folders, `.git` and credential folders were excluded. `.gcloudignore` controls source upload; `.dockerignore` limits Docker build inputs. Recheck the manifest after adding build inputs or local data paths.

The backend uses the existing Dockerfile; Cloud Build builds it remotely. Local Docker Desktop is not required. This command creates build/image storage and may incur usage charges:

```powershell
gcloud.cmd run deploy manzil-api --source=. --project=manzil-app-v1 --region=asia-southeast1 --service-account=manzil-api@manzil-app-v1.iam.gserviceaccount.com --build-service-account=projects/manzil-app-v1/serviceAccounts/488497279747-compute@developer.gserviceaccount.com --env-vars-file=config/cloud-run.manzil-app-v1.yaml --cpu=1 --memory=1Gi --concurrency=8 --min=0 --max=1 --min-instances=0 --max-instances=1 --cpu-throttling --no-cpu-boost --timeout=180 --port=8080 --allow-unauthenticated --labels=app=manzil,stage=prototype --quiet
```

`config/cloud-run.manzil-app-v1.yaml` contains non-secret runtime settings. It disables cloud speech and source collection, selects production Firestore, and allows explicit website/service hosts and HTTPS origins. `FIREBASE_HOSTING_SERVICE_HOST` selects the confirmed hash-based service hostname, also listed in `ALLOWED_HOSTS`; only `fh-*` Firebase tags on that one service are accepted. This is necessary for `pinTag` rewrites and avoids a general hostname wildcard. Confirm the actual Cloud Run URI when moving to another service/project. This is a public API for guest planning; personal and shared-write endpoints enforce Firebase authentication/admin authorization inside the API. A maximum instance setting limits scaling, not total spending; cold starts are expected with minimum zero.

Verify `/api/health`, `/api/runtime`, guest state/real-road planning and denial of unauthenticated personal/shared-write requests before publishing Hosting. A health response must show `storage: firestore` and `graphReady: true`; the runtime endpoint must show production and the expected project. Use synthetic public road coordinates only for smoke requests.

```powershell
node scripts/smoke-cloud.mjs https://manzil-api-488497279747.asia-southeast1.run.app manzil-app-v1
```

Deploy database rules/indexes, then Hosting using the explicit project:

```powershell
.\node_modules\.bin\firebase.cmd deploy --only firestore:rules,firestore:indexes --project manzil-app-v1 --non-interactive
.\node_modules\.bin\firebase.cmd deploy --only hosting --project manzil-app-v1 --non-interactive
```

Hosting serves the cloud-built `dist` and forwards `/api/**` to `manzil-api` in `asia-southeast1`, pinned to the backend revision. Verify the website and API through `https://manzil-app-v1.web.app` after publication. Hosting is a static deployment plus the API rewrite; no separate Firebase App Hosting backend is required.

```powershell
node scripts/smoke-cloud.mjs https://manzil-app-v1.web.app manzil-app-v1
```

The script makes 16 checks using public example coordinates, including case/trailing-slash authorization and rejected unauthenticated writes. It does not create accounts, closures or personal records. Append `--national` for three more checks: Lahore place search, a real Lahore road route, and rejection of a foreign endpoint. Those optional checks contact the configured public providers using public example coordinates; repeat requests reuse the backend caches. Hosting must be republished after an API revision update so its pin moves to the newly tested revision. Merely changing the Cloud Run latest revision does not update an existing Hosting pin.

```powershell
node scripts/smoke-cloud.mjs https://manzil-app-v1.web.app manzil-app-v1 --national
```

## Pakistan-wide prototype providers

The merged release keeps the bundled Islamabad graph and uses explicitly configured `OSRM_BASE_URL=https://router.project-osrm.org` and `PHOTON_BASE_URL=https://photon.komoot.io` elsewhere in Pakistan. These public endpoints are for light prototype use: the [OSRM policy](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) limits reasonable non-commercial use to one request per second; [Photon guidance](https://github.com/komoot/photon#demo-server) permits reasonable usage with no availability guarantee. The clients cache/deduplicate, bound queues and limit request starts; Cloud Run retains maximum one instance. Select suitable hosted/self-hosted capacity before scaling or commercial use. Do not activate scheduled national batches as part of this release.

Queries and endpoint/stop coordinates go to the configured search/routing providers; raw GPS traces and account credentials do not. The app still validates closures/timing on returned route candidates and may explicitly return no safe route. OSRM cannot take arbitrary closure polygons, nationwide red road coating is not implemented, and toll/checkpost prices or waits are not supplied. See [routing limits](ROUTING.md).

## Account and feature boundaries

Production never seeds the known development passwords. Register an account on the actual site. The operator can then assign an admin claim to the intended existing UID using `npm.cmd run auth:admin -- USER_UID` with explicitly selected production configuration and operator credentials. Never run that command against an unverified UID, and never give ordinary users an admin claim. Sign out/in after changing claims.

Guests can plan/navigation-preview; saved journeys/activity/history require sign-in. Regular users submit private pending reports; verified contributors/admins can publish and review. Admins manage contributor verification, shared closures, demos and source controls. The community moderation dashboard is deployed. Extended agent correction audit/anti-republication overrides, a guest demo sandbox and Gemini notice interpretation remain separate work. This release alone does not satisfy the stated AI integration requirement.

No private worker or Scheduler job is deployed initially. Background source polling and scheduled commute checks do not run automatically in the API service; no claim of background notifications is made. Cloud TTS remains disabled; matching device voices can be used when available. Enable paid providers/jobs only after their model/voice validation, quotas and usage controls are decided.

Fuel features are deployed, but the production price cache was verified as unavailable with zero records. An authenticated admin can use Pipeline to request the bounded PSO daily check. Automatic daily refresh needs the separately deployed private worker/Scheduler; this release did not activate it. The initial unavailable state is explicit and no guessed prices are supplied.

The release used the existing runtime IAM, unchanged dependency lockfile, Firestore rules/indexes and environment configuration. Fifteen integration cases verify new role/profile/fuel storage behavior locally. Additional deployment-only guest checks (eight beyond the 19-check national smoke) verified null membership, default-off consent, published-only state, admin/fuel/statistics denial and a real 1,075.7 m Park Road section; they created no records. Live signed-in/admin workflows still require the intended real account.

## Updating and recovery

For future releases, use the same explicit project/region, build a cloud frontend, deploy the API, verify it, then deploy Hosting so its pin matches the tested API revision. Do not upload the standalone preview `dist` as the cloud website.

Record the working Cloud Run revision and Firebase Hosting release before updating. If a release fails, roll Hosting back through its release history and direct Cloud Run traffic to the previous healthy revision as appropriate; keep their pinned pairing consistent. Do not delete Firestore or disable project billing as a routine rollback. Review build/image storage and configured maximum instances after releases; cleanup policies and automated deployment are not yet configured.

See [implementation status](IMPLEMENTATION_STATUS.md) for the actual deployment outcome and live verification boundaries, and [environment setup](ENVIRONMENTS.md) for local/emulator workflows.
