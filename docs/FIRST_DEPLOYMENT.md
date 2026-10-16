# First deployment: manzil-app-v1

Deployment target agreed during setup on 17 October 2026: Firebase Hosting plus Cloud Run and the default Firestore Standard database in Singapore (`asia-southeast1`). The private source repository stays private. Existing SQLite data, GPS traces and local account fixtures are not migrated or uploaded.

## Verified prerequisites

- Google Cloud project `manzil-app-v1` / project number `488497279747` is ACTIVE and billing is enabled. The owner reported creating a billing budget alert; alerts are not a hard spending cap.
- Firestore `(default)` is `STANDARD`, `FIRESTORE_NATIVE`, location `asia-southeast1`.
- Firebase email/password authentication is enabled. Authorized domains include `manzil-app-v1.web.app` and `manzil-app-v1.firebaseapp.com`.
- Google Cloud CLI and repository-local Firebase CLI are signed in. Use `gcloud.cmd` and `.\node_modules\.bin\firebase.cmd` from PowerShell.
- Ignored `.env.cloud.local` contains the registered web app configuration. Its key was not printed. `npm.cmd run build:cloud` passes.
- 158 standard cases and all seven real Auth/Firestore emulator integration cases have passed on Node 24.22.0 (165 total). Default tests skip emulator cases; use `npm.cmd run test:firebase` to run them.

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
gcloud.cmd run deploy manzil-api --source=. --project=manzil-app-v1 --region=asia-southeast1 --service-account=manzil-api@manzil-app-v1.iam.gserviceaccount.com --build-service-account=projects/manzil-app-v1/serviceAccounts/488497279747-compute@developer.gserviceaccount.com --env-vars-file=config/cloud-run.manzil-app-v1.yaml --cpu=1 --memory=1Gi --concurrency=8 --min=0 --max=1 --min-instances=0 --max-instances=1 --cpu-throttling --no-cpu-boost --timeout=60 --port=8080 --allow-unauthenticated --labels=app=manzil,stage=prototype --quiet
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

The script makes 11 checks using public example coordinates, including rejected unauthenticated writes. It does not create accounts, closures or personal records. Hosting must be republished after an API revision update so its pin moves to the newly tested revision. Merely changing the Cloud Run latest revision does not update an existing Hosting pin.

## Account and feature boundaries

Production never seeds the known development passwords. Register an account on the actual site. The operator can then assign an admin claim to the intended existing UID using `npm.cmd run auth:admin -- USER_UID` with explicitly selected production configuration and operator credentials. Never run that command against an unverified UID, and never give ordinary users an admin claim. Sign out/in after changing claims.

Guests can plan/navigation-preview; saved journeys/activity/history require sign-in. Shared closure/demo/source writes require an admin. The full admin correction dashboard, durable cancellation overrides, guest demo sandbox and Gemini notice interpretation are still separate implementation work. Only the core application is being deployed here; this initial release alone does not satisfy the stated AI integration requirement.

No private worker or Scheduler job is deployed initially. Background source polling and scheduled commute checks do not run automatically in the API service; no claim of background notifications is made. Cloud TTS remains disabled; matching device voices can be used when available. Enable paid providers/jobs only after their model/voice validation, quotas and usage controls are decided.

## Updating and recovery

For future releases, use the same explicit project/region, build a cloud frontend, deploy the API, verify it, then deploy Hosting so its pin matches the tested API revision. Do not upload the standalone preview `dist` as the cloud website.

Record the working Cloud Run revision and Firebase Hosting release before updating. If a release fails, roll Hosting back through its release history and direct Cloud Run traffic to the previous healthy revision as appropriate; keep their pinned pairing consistent. Do not delete Firestore or disable project billing as a routine rollback. Review build/image storage and configured maximum instances after releases; cleanup policies and automated deployment are not yet configured.

See [implementation status](IMPLEMENTATION_STATUS.md) for the actual deployment outcome and live verification boundaries, and [environment setup](ENVIRONMENTS.md) for local/emulator workflows.
