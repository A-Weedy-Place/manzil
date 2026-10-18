# Deploying Manzil

This is the operating guide for deploying this repository to **your own Firebase / Google Cloud project** or releasing an approved change to an existing installation. Reading it or pushing a Git branch does not deploy anything.

The recorded installation is [manzil-app-v1.web.app](https://manzil-app-v1.web.app), in `asia-southeast1`. Its last recorded release and the newer repository work are distinguished in [implementation status](../IMPLEMENTATION_STATUS.md). Do not assume that the current Git branch is already live. Earlier command transcripts and revision identifiers are historical evidence in the [original deployment record](../archive/releases/FIRST_DEPLOYMENT.md).

## Deployment shape

| Resource | Purpose | Required for basic app? |
| --- | --- | --- |
| Firebase Hosting | Cloud-built frontend; `/api/**` rewrite pinned to a Cloud Run revision | Yes |
| Cloud Run `manzil-api` | Public planning API; Firebase authorization on protected operations | Yes |
| Firebase Authentication | Email/password users, server-verified roles and account recovery | Yes |
| Firestore `(default)` | Shared closures/notices; private data scoped by UID | Yes |
| Cloud Build + Artifact Registry | Build and store the Node 24 backend image | Yes for the source deployment below |
| Private Cloud Run worker | Authenticated source collection and Gemini jobs | Optional |
| Cloud Scheduler | Separate authenticated worker dispatch schedules | Optional |
| Private Cloud Storage bucket | Short-lived public-source images, accessible only through authorized services | Optional source/media pipeline |
| Secret Manager | Gemini API key mounted on the private worker | Optional Gemini pipeline |

The same backend image has separate `api` and `worker` roles. A worker is not a second public API. Local SQLite databases, GPS traces, emulator accounts and source archives are **never migrated implicitly**.

## 1. Prepare a project and workstation

1. Install **Node 24.12+**, npm and the Google Cloud CLI. Java **21+** is needed to run the Auth/Firestore integration tests. Docker Desktop is optional: Cloud Build uses the repository's `Dockerfile` remotely.
2. Create or select a Firebase-enabled Google Cloud project, attach billing, register a Firebase web app and create a **Firestore Native / Standard default database**. Choose its location deliberately; this repository's Hosting rewrite currently targets Singapore, `asia-southeast1`.
3. In Firebase Authentication, enable **Email/Password**, set a password policy and authorize the intended Hosting/custom domains. Do not create production accounts with development fixture passwords.
4. Sign in as the intended operator. These commands select CLI context; subsequent sections make real cloud changes.

```powershell
$manzilProject = "YOUR_FIREBASE_PROJECT_ID"
$manzilRegion = "asia-southeast1"
gcloud.cmd auth login
gcloud.cmd config set project $manzilProject
gcloud.cmd config set run/region $manzilRegion
npm.cmd ci
.\node_modules\.bin\firebase.cmd login
```

Use `npm` / `gcloud` instead of the `.cmd` names on other operating systems. All paths below are relative to the repository root.

Enable the required APIs in the selected project:

```powershell
gcloud.cmd services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com firestore.googleapis.com identitytoolkit.googleapis.com firebasehosting.googleapis.com --project=$manzilProject
```

For optional pipelines, additionally enable `cloudscheduler.googleapis.com`, `storage.googleapis.com` and `secretmanager.googleapis.com`. Enabling an API alone does not create its pipeline or schedule.

### Service identities and access

Create separate dedicated API, worker and Scheduler service accounts as needed. Give the deployer permission to deploy/build and act as the selected runtime accounts; do not put a service-account key in the repository or image. Source builds require an explicitly selected build identity with `roles/run.builder`. Google documents the current [source-deployment permissions](https://cloud.google.com/run/docs/deploying-source-code#required_roles).

| Identity | Access needed |
| --- | --- |
| API runtime | `roles/datastore.user`; Firebase Auth user read access for token/account checks. The Users directory's role-management feature also needs `firebaseauth.users.update`, through a narrow custom role containing only that permission. The recorded installation binds `projects/manzil-app-v1/roles/manzilAuthClaimsUpdater` to `manzil-api@manzil-app-v1.iam.gserviceaccount.com`; existing Viewer access supplies reads. A viewer-only grant cannot update claims. |
| Worker runtime | `roles/datastore.user`; source bucket object create/view when media is enabled; access to its one Gemini secret when Gemini is enabled |
| Scheduler identity | `roles/run.invoker` on the **private worker service only** |
| API runtime, optional manual analysis | `roles/run.invoker` on that worker only; worker permits this identity for `agent` jobs only |
| Build identity | `roles/run.builder`, plus the deployment permissions required by the selected build flow |
| Operator for first admin | Appropriate Firebase Auth administration through ADC or an approved impersonated identity |

Use a narrower custom IAM role where appropriate. IAM gives server access to Firebase; Express still enforces current claims, moderator roles and per-user ownership. Administrators do not receive other users' GPS histories through the API.

## 2. Configure and validate the release

Copy [the frontend template](../../config/frontend.env.example) to ignored `.env.cloud.local`. Fill it with the **public Firebase web configuration** for your project. A `VITE_*` value is compiled into the browser; it must never contain a model key, service-account JSON, OAuth credential or other secret.

Create an API environment YAML from [the runtime template](../../config/production.env.example) or adapt [the existing API YAML](../../config/cloud-run.manzil-app-v1.yaml). The latter is specific to the recorded project: replace every project, bucket, hostname and account reference before use elsewhere. Keep your per-project file outside tracked source until deliberately reviewed for publication.

Required API values:

```yaml
NODE_ENV: "production"
MANZIL_MODE: "production"
MANZIL_SERVICE_ROLE: "api"
HOST: "0.0.0.0"
FIREBASE_PROJECT_ID: "YOUR_FIREBASE_PROJECT_ID"
ALLOWED_HOSTS: "YOUR_CONFIRMED_API_HOST,YOUR_PROJECT.web.app,YOUR_PROJECT.firebaseapp.com"
ALLOWED_ORIGINS: "https://YOUR_PROJECT.web.app,https://YOUR_PROJECT.firebaseapp.com"
X_SCRAPER_ENABLED: "false"
TTS_ENABLED: "false"
PUBLIC_CLOUD_SPEECH: "false"
```

For a new Cloud Run service, initially allow its deterministic project-number hostname, then read the deployed service's canonical hostname and update the allowlist. Set `FIREBASE_HOSTING_SERVICE_HOST` to the confirmed **hash-based `*.a.run.app` service hostname**, also present verbatim in `ALLOWED_HOSTS`, before using Hosting `pinTag`. This allows only Firebase `fh-*` tags belonging to that service; never replace it with a wildcard.

Choose suitable `OSRM_BASE_URL` and `PHOTON_BASE_URL` providers. The configured public demo endpoints are for bounded prototype use, with external usage policies and no availability guarantee. OSM editor lookups and OpenFreeMap tiles also require external access. See [routing limits](../reference/ROUTING.md) and [configuration](CONFIGURATION.md).

```powershell
npm.cmd run config:check
npm.cmd test
npm.cmd run test:firebase
npm.cmd run build:cloud
gcloud.cmd meta list-files-for-upload
```

The configuration check validates the **current process environment**, not the contents of an arbitrary YAML file. `build:cloud` requires configured Firebase browser values, type-checks the app, creates `dist/` and builds `build/server/index.js`. A normal `build` is a standalone preview, not a configured hosted release.

Inspect the upload list: `.env*`, local databases, `data/`, `.local-tools/`, GPS records, credentials and browser/session state must be excluded. Preserve `.dockerignore` and `.gcloudignore`; the image must include the attributed `assets/routing/` and bundled `assets/transit/` data.

## 3. Deploy and verify the public API

Replace the three placeholder variables with deliberately selected resources. The command builds/uploads source and updates a public service; it can incur charges.

```powershell
$manzilApiIdentity = "YOUR_API_SERVICE_ACCOUNT@${manzilProject}.iam.gserviceaccount.com"
$manzilBuildIdentity = "projects/$manzilProject/serviceAccounts/YOUR_BUILD_ACCOUNT_EMAIL"
$manzilApiEnvFile = "PATH_TO_YOUR_API_ENV.yaml"
gcloud.cmd run deploy manzil-api --source=. --project=$manzilProject --region=$manzilRegion --service-account=$manzilApiIdentity --build-service-account=$manzilBuildIdentity --env-vars-file=$manzilApiEnvFile --cpu=1 --memory=1Gi --concurrency=8 --min=0 --max=1 --min-instances=0 --max-instances=1 --cpu-throttling --no-cpu-boost --timeout=180 --port=8080 --allow-unauthenticated
gcloud.cmd run services describe manzil-api --project=$manzilProject --region=$manzilRegion --format="value(status.url)"
```

Record the API URL, revision and immutable image digest. Update the confirmed hostname settings described above and redeploy if needed. Keep resource limits explicit; minimum zero permits cold starts, and maximum one instance is not a billing cap.

Run the read-only smoke script against the **actual API origin**:

```powershell
node scripts/smoke-cloud.mjs https://YOUR_API_ORIGIN $manzilProject
```

It verifies Firestore production mode, graph readiness, public planning, data isolation and rejected unauthenticated writes. Add `--national` to test public national routing/search and `--transit-weather` for bundled transit/weather checks. It intentionally expects source collection and cloud speech to be disabled unless matching optional flags are supplied. It does not create accounts, approve closures or call Gemini.

## 4. Publish database rules and Hosting

Before publishing, set `firebase.json`'s API rewrite to your **service ID and supported region**. Keep `/api/**` above the SPA rewrite and `pinTag: true`. Use the same Firebase project as the frontend and API.

```powershell
.\node_modules\.bin\firebase.cmd deploy --only firestore:rules,firestore:indexes --project $manzilProject --non-interactive
.\node_modules\.bin\firebase.cmd deploy --only hosting --project $manzilProject --non-interactive
node scripts/smoke-cloud.mjs "https://${manzilProject}.web.app" $manzilProject --national --transit-weather
```

Firestore rules intentionally deny direct browser database access; the frontend uses the authorized API. Wait for required indexes to become ready. Hosting serves `dist/`, uses revalidation for HTML and immutable caching for hashed assets. A currently open tab can still need a refresh after release.

**Republish Hosting after each backend release** so its pinned API revision moves to the tested release. Updating Cloud Run's latest revision alone does not move an existing Hosting pin. Hosting rewrites have a sixty-second request limit; the API's 180-second timeout does not override it. [Firebase's Cloud Run integration guide](https://firebase.google.com/docs/hosting/cloud-run) explains the rewrite/pinning contract.

For longer administrator analysis, set browser `VITE_AGENT_RUN_ORIGIN` to the public authenticated API origin and rebuild Hosting. Configure its exact CORS origin and the private dispatch boundary below. Never point the browser at the private worker.

## 5. Bootstrap administration and password recovery

Register the intended real administrator normally and independently verify their Firebase UID. From a separate operator shell, select `MANZIL_MODE=production`, `FIREBASE_PROJECT_ID`, exact allowed hosts/origins and valid Admin SDK Application Default Credentials. Clear all emulator hosts and local database settings. Then deliberately run:

```powershell
npm.cmd run auth:admin -- VERIFIED_EXISTING_FIREBASE_UID
```

This changes a real account's custom claim. It is never a startup/deployment step and never creates a production fixture account. Sign out/in to refresh the claim, then verify Users and moderation with the intended administrator. Cloud CLI login and Admin SDK ADC are separate credentials.

For an operator using user ADC rather than approved impersonation, `gcloud.cmd auth application-default login` initializes that separate local credential. Complete it only with the intended operator account; never copy its credential file into the repository or container.

For the branded reset page, after the frontend is released, set Firebase Console → Authentication → Templates → **Customize action URL** to `https://YOUR_DOMAIN/account/action`. It applies to all email templates; verification/recovery modes retain a safe hosted fallback. Keep `VITE_FIREBASE_AUTH_DOMAIN` as the Firebase auth domain. Verify a fresh reset email, confirmation, sign-in and reused-link rejection with a **dedicated test account**. See [password recovery](../guides/AUTH_PASSWORD_RESET.md) and the [official action-handler guide](https://firebase.google.com/docs/auth/custom-email-handler). Changing code does not change old email links or the Console setting automatically.

## 6. Optional source and Gemini pipelines

Deploy these only when source access, model tier, usage allowance and operator approval are agreed. Basic maps and manual moderation do not need them.

### Private storage and worker

1. Create a private bucket in the chosen region with uniform access and public-access prevention. Apply [the seven-day `source-media/` lifecycle](../../config/source-media-lifecycle.json) only to this evidence bucket; choose soft-delete retention deliberately. Lifecycle deletion is asynchronous.
2. Grant the worker bucket-scoped object create/view access and the API bucket-scoped `roles/storage.objectViewer` for authenticated evidence previews. Neither users nor `allUsers` receive bucket access.
3. Adapt the [combined worker configuration](../../config/cloud-run-agent.manzil-app-v1.yaml), replacing all project-specific references. For source only, use [the source-only configuration](../../config/cloud-run-source.manzil-app-v1.yaml). Set an explicit `WORKER_ALLOWED_JOBS` allowlist; never accidentally downgrade an existing combined worker to source-only settings.
4. Use the **same tested immutable backend image** as the API with `MANZIL_SERVICE_ROLE=worker`; deploy `manzil-source-worker` with `--no-allow-unauthenticated`, 1 CPU/1 GiB, concurrency one, min zero/max one, request-based CPU and a 150-second timeout. Set `WORKER_AUDIENCE` to its exact canonical base URL and `WORKER_SERVICE_ACCOUNT_EMAIL` to the Scheduler identity. Confirm its final URL/host allowlist before dispatch.
5. For Gemini, create a secret such as `manzil-gemini-api-key` in **your** project, securely upload the chosen key and grant only the worker `roles/secretmanager.secretAccessor` on that secret. Inject `GEMINI_API_KEY` using `--set-secrets=GEMINI_API_KEY=manzil-gemini-api-key:NUMERIC_VERSION`. Keep `GEMINI_MODEL=gemini-3.1-flash-lite`, chosen daily allowances and `GEMINI_AUTO_PUBLISH=true` for the owner-approved selective policy. Clear closures publish after validation; use false for a deliberate review-only installation.

Example private-worker deployment, after filling its environment YAML and selecting an immutable image:

```powershell
$manzilWorkerIdentity = "YOUR_WORKER_ACCOUNT@${manzilProject}.iam.gserviceaccount.com"
$manzilWorkerEnvFile = "PATH_TO_YOUR_WORKER_ENV.yaml"
$manzilImage = "REGISTRY/PATH/IMAGE@sha256:YOUR_TESTED_DIGEST"
gcloud.cmd run deploy manzil-source-worker --image=$manzilImage --project=$manzilProject --region=$manzilRegion --service-account=$manzilWorkerIdentity --env-vars-file=$manzilWorkerEnvFile --cpu=1 --memory=1Gi --concurrency=1 --min=0 --max=1 --min-instances=0 --max-instances=1 --cpu-throttling --no-cpu-boost --timeout=150 --port=8080 --no-allow-unauthenticated
gcloud.cmd run services describe manzil-source-worker --project=$manzilProject --region=$manzilRegion --format="value(status.url)"
```

Add the numeric-version `--set-secrets` flag only for an intentionally enabled Gemini worker. A new service can initially use its deterministic project-number URL in its host/audience settings; after creation, replace those with its returned canonical URL and redeploy **before** dispatch or manual-analysis integration. For an existing service, retain the previously confirmed canonical URL and private IAM.

The repository's `scripts/upload-gemini-secret.mjs` is hardcoded to the recorded `manzil-app-v1` project. **Do not run it unchanged for your own deployment.** Use Secret Manager's authenticated Console or `gcloud secrets versions add ... --project=YOUR_PROJECT --data-file=SECURE_PRIVATE_FILE`; never put key bytes in command arguments, logs, `VITE_*`, tracked files or the API service. Gemini activation needs a working key and persisted enabled settings, not only an environment flag.

For manual **Run Gemini now**, set API `AGENT_WORKER_URL` to that exact private canonical Cloud Run origin, set worker `WORKER_MANUAL_SERVICE_ACCOUNT_EMAIL` to the API runtime account and grant that account `roles/run.invoker` on the worker only. The API authenticates the administrator; its workload identity then invokes only the `agent` job. The browser never gets the worker credential or model key.

### Scheduler and activation

Grant the chosen Scheduler identity `roles/run.invoker` on the private worker. Configure HTTP POST targets at `WORKER_URL/internal/tick`, `Content-Type: application/json`, Google OIDC using that identity, and OIDC audience **WORKER_URL without the path**. Preserve the Cloud Scheduler service agent's required role; see [HTTP target authentication](https://cloud.google.com/scheduler/docs/http-target-auth).

| Job | JSON body | Recorded schedule, Asia/Karachi | Activation |
| --- | --- | --- | --- |
| Source collection | [source body](../../config/source-scheduler-body.json) | `*/5 * * * *` | Persisted source enabled flag + worker allowlist + enabled Scheduler |
| Gemini analysis | [agent body](../../config/agent-scheduler-body.json) | `2-59/5 * * * *` | Valid worker-only key + model/persisted settings + worker allowlist + enabled Scheduler |
| Fuel refresh | `{"job":"fuel"}` | No active recorded cloud schedule | Separate operator decision |
| Commute/retention sweep | `{"job":"commutes"}` | No active recorded cloud schedule | Separate operator decision; batches of at most 20 users |

Use zero automatic retries and a 180-second attempt deadline for the recorded source/model setup. A safe first setup uses an annual cron (`0 0 1 1 *`), pauses it immediately, then changes to the intended cron **while paused**. Validate worker denial, IAM and one deliberate run before enabling recurring delivery. A paused Scheduler job cannot be manually dispatched with `jobs run`; use the annual schedule temporarily for an explicitly controlled manual check, then pause it again. Scheduling is not exactly-once delivery or proof of complete source coverage.

For example, create the source schedule conservatively, then leave it paused:

```powershell
$manzilWorkerUrl = "https://YOUR_CANONICAL_WORKER_HOST.a.run.app"
$manzilSchedulerIdentity = "YOUR_SCHEDULER_ACCOUNT@${manzilProject}.iam.gserviceaccount.com"
gcloud.cmd run services add-iam-policy-binding manzil-source-worker --project=$manzilProject --region=$manzilRegion --member="serviceAccount:$manzilSchedulerIdentity" --role=roles/run.invoker
gcloud.cmd scheduler jobs create http manzil-champ-source-5min --project=$manzilProject --location=$manzilRegion --schedule="0 0 1 1 *" --time-zone=Asia/Karachi --uri="$manzilWorkerUrl/internal/tick" --http-method=POST --headers="Content-Type=application/json" --message-body-from-file=config/source-scheduler-body.json --oidc-service-account-email=$manzilSchedulerIdentity --oidc-token-audience=$manzilWorkerUrl --attempt-deadline=180s --max-retry-attempts=0
gcloud.cmd scheduler jobs pause manzil-champ-source-5min --project=$manzilProject --location=$manzilRegion
gcloud.cmd scheduler jobs update http manzil-champ-source-5min --project=$manzilProject --location=$manzilRegion --schedule="*/5 * * * *"
```

Create the Gemini job separately with name `manzil-gemini-5min`, its own body file and the table's offset cron, following the same paused setup. Do not create a model schedule for a source-only worker. When deliberately ready, use `gcloud.cmd scheduler jobs resume JOB_NAME --project=$manzilProject --location=$manzilRegion`; use `pause` again to stop future dispatch.

The project-aware operator helpers support status and deliberate activation:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/source-cloud.ps1 Status -ProjectId $manzilProject
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/agent-cloud.ps1 Status -ProjectId $manzilProject
```

Use source `Enable` or agent `EnableValidated` (or deliberately `EnableReview`) only after the preceding checks. To pause, disable both the relevant persisted setting and its Scheduler job. An already-running request can finish. Review [source operations](DEPLOYMENT.md), [Gemini operations](GEMINI_INTEGRATION.md) and [map review](AGENT_MAP_REVIEW.md) before changing an existing installation.

Weather is different: `/api/weather` refreshes the shared Islamabad forecast cache when due, at most hourly per API process, and production waits for persistence before responding. **There is no weather worker job or Scheduler requirement.** Cloud speech is also separate and remains disabled unless explicitly provisioned and budgeted.

After deliberate activation, use matching read-only smoke flags on both API and Hosting:

```powershell
node scripts/smoke-cloud.mjs "https://${manzilProject}.web.app" $manzilProject --national --transit-weather --collection-enabled --gemini
```

Check actual saved source success/coverage, image access, scheduled delivery, model usage/proposals, private-worker denial and admin review. Do not create fake public road closures to prove a pipeline works.

## Updating, recovery and costs

For an existing combined installation, retain its secrets, IAM, bucket and schedule settings. Build one reviewed image; deploy/verify the private worker, deploy/verify the API, then publish the matching cloud-built Hosting bundle. Do not replace combined-worker configuration with the older source-only template.

Record the commit, immutable image digest, worker/API revisions, Hosting pin, database/index changes, active schedules and smoke/browser evidence. Store credentials and private user data elsewhere. For rollback, restore a known compatible Hosting/API pairing and worker revision; do not delete Firestore, migrate SQLite or disable project billing as a routine rollback.

Cloud Run, builds/images, Firestore, Scheduler, storage, secrets, logs, network transfer, optional Gemini and optional speech have separate usage charges and changing eligibility/limits. Free tiers or credits are not a guarantee that a deployment is free. Budget alerts notify; they do not stop charges. Keep quotas, retention, resource limits and recurring jobs explicit and review current provider pricing before activation.

These instructions are based on the repository configuration and official platform guides; they are not a claim that this documentation cleanup created or revalidated any cloud resource.
