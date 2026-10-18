# Local development and production configuration

> **Historical record — retained 18 October 2026.** This may contain superseded requirements, UI, activation state or release evidence. It is not a current instruction/runbook. Use the [documentation index](../../README.md) and [current status](../../IMPLEMENTATION_STATUS.md).

**Current deployment, 18 October:** API `manzil-api-00011-76r`, worker `manzil-source-worker-00008-cfp`, Hosting `fh-2c9b2b4410f6124c`; 498 standard/emulator cases and 27 live checks per origin pass. Review-only mode, same schedules/allowance. Public API timeout 180 seconds; only manual analysis uses the direct authenticated API origin to avoid Hosting's sixty-second timeout. [Release evidence](IMPLEMENTATION_LOG_THROUGH_2026-10-18.md#observable-pipeline-and-bounded-agent-improvements-deployed---18-october).

**18 October pipeline update:** Control centre opens on Pipeline. Review queue and Awaiting review combine current Gemini post reviews with pending community reports; multiple events count as one post until its last decision. Run Gemini now invokes the private worker through the authenticated public API, with the same claims, five-minute schedules and daily limits. Live saved-state progress and per-proposal tool logs make the stages observable. The agent matches unique current incidents and retries eligible failed mapping from saved extraction, at most three attempts with fifteen-minute cooldown; every map action still requires admin approval. [Current workflow](../../operations/AGENT_MAP_REVIEW.md), [release evidence](../../IMPLEMENTATION_STATUS.md). Older scheduling-only and automatic-publication entries are historical.

**Current map-agent scope (17 October):** every agent closure/reopening requires administrator approval. Private prepared proposals, source/version checks and map preview precede the atomic decision; no draft affects routing. The deployed settings are review-only. Older release details below are historical; see [review workflow](../../operations/AGENT_MAP_REVIEW.md) and current implementation status.

**17 October Gemini release:** server-only Developer API integration is deployed using the confirmed Free tier project key from Secret Manager, accessible to the private worker only. Its allowlist is `source,agent` with separate five-minute jobs; the public API has private-image read permission for admins and no model key. Effective shared model settings enable validated publication with 20 attempts per PKT day and conservative reservation controls. Local defaults stay off/review-only; ignored `.env.gemini.local` loads without overriding existing values. [Settings, limitations, deployment and pause](../../operations/GEMINI_INTEGRATION.md). Older source-only statements below are historical.

Implemented 16 October 2026; the core was deployed on 17 October to **[manzil-app-v1.web.app](https://manzil-app-v1.web.app)** in project `manzil-app-v1`, region `asia-southeast1`. One codebase supports standalone SQLite, local Auth/Firestore emulators and hosted Firebase/Cloud Run. Billing and deployment APIs are enabled, with dedicated runtime/build permissions. The later source-only worker/Scheduler pilot now collects every five minutes into Firestore and private image storage. Gemini, cloud speech and fuel/commute schedules remain inactive. See [source operations](SOURCE_DEPLOYMENT.md), [release procedure](FIRST_DEPLOYMENT.md) and [verification status](../../IMPLEMENTATION_STATUS.md).

## Modes

| | Standalone local | Firebase emulator development | Production configuration |
| --- | --- | --- | --- |
| Command | `npm.cmd run dev` | `npm.cmd run dev:firebase` | `npm.cmd run build:cloud`, then the [release procedure](FIRST_DEPLOYMENT.md) |
| `MANZIL_MODE` | `local` (default) | `emulator` (set by launcher) | `production` |
| Data | Existing local SQLite | Local Firestore Emulator | Hosted Firestore, using the same adapter |
| Accounts | Original dummy UI identities; one shared database | Real Auth Emulator users/tokens and separate user records | Firebase Authentication, verified server-side |
| Shared changes | Existing trusted localhost tools | Verified admin claim required | Verified admin claim required |
| Personal records | Shared standalone development data | Per Firebase UID | Per Firebase UID |
| Scheduling | Local source/commute timers | Local API + worker and emulator-only scheduled runner | Separate private worker, invoked externally |
| Paid calls | Speech disabled unless configured | Launcher disables speech/source collection | Speech disabled until deliberately enabled/configured |

Closure/time validation, OSM graph routing, demo geometry, commute checks, inference and speech prompt construction are shared. The API awaits the repository interface; SQLite and Firestore are infrastructure adapters. No localhost database is copied into Firestore or silently assigned to a new user.

## Environment requirements

**17 October workstation distinction:** the incoming branch was verified on another Windows environment with Node 22/Java 17 on PATH and portable Node 24/Android Studio Java 21.0.8 selected by `npm.cmd run dev:local`. This machine instead has installed **Node 24.22.0 / npm 11.19.1 and Java 25.0.1**, so ordinary `dev:firebase` and test commands work directly. Keep the helper for machines that need it: it optionally selects ignored `.local-tools/` runtimes or installed Android Studio Java, changes only the child-process environment, and downloads nothing. Portable tools are not shipped or committed. `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/with-local-runtime.ps1 run config:check` can run another npm script with that selection; its execution policy applies only to that process.

- **Node 24.12.0 or newer**: required by the current Firebase SDK dependency set. On 16 October, this machine was rechecked with **Node 24.22.0 / npm 11.19.1**; `npm.cmd run config:check` passes with `nodeSupported: true`. The earlier Node upgrade prerequisite is complete. The checker reports the selected mode and returns nonzero on an unsupported Node version. It prints no credentials and creates no resources.
- **Java 21+** for the Firestore Emulator. Java 25 is installed on the inspected machine.
- Dependencies are in `package-lock.json`; use `npm.cmd ci` on a new checkout. The Firebase CLI is a project development dependency, not a required global install.
- Google Cloud CLI is installed/on PATH and signed in; Firebase CLI is also signed in. CLI login is distinct from Application Default Credentials for running privileged Admin SDK scripts locally. Local/emulator development needs neither cloud login nor ADC.
- Docker Desktop is optional for local development. The first container was built remotely with Cloud Build and verified running on Cloud Run; no local Docker image execution is claimed.

### Upgrading Node on Windows

This machine uses the direct Windows installation at `C:\Program Files\nodejs`, without an identified Node version manager. Stop development servers, download the latest **Node 24 LTS Windows Installer (.msi)** for the machine's architecture from the [official download page](https://nodejs.org/en/download), and run it with the default settings to upgrade the existing installation. Close and reopen VS Code and all terminals afterward.

From `D:\Manzil\manzil` in a new PowerShell terminal:

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run config:check
```

Use `npm.cmd` if PowerShell blocks `npm.ps1`; changing the execution policy is unnecessary. `.nvmrc` selects the Node 24 major for developers who already use a version manager; it does not upgrade a direct Windows installation. Run `npm.cmd ci` after upgrading to restore the locked dependencies. The recorded installed version is an environment observation, not a claim about the latest available release.

## Recommended everyday workflow

Stop the existing standalone `npm run dev` terminal before switching modes, because the default API/web ports are shared. From the repository root:

```powershell
npm.cmd run dev:firebase
```

This starts Auth (9099), Firestore (8080), emulator UI (4000), API (3001), Vite (5173) and a local worker (3002). It uses the deliberately non-existent **demo-manzil** cloud project, requires both emulator endpoints to be loopback, seeds the accounts below and invokes the protected worker locally once a minute. No Firebase login, service-account key, billing account or Google Cloud project is needed. The first run downloads emulator components and needs internet. The map tiles still need internet.

| Role | Email | Test password |
| --- | --- | --- |
| User | `user@manzil.test` | `ManzilUser123!` |
| Admin | `admin@manzil.test` | `ManzilAdmin123!` |

These are emulator-only test credentials, also available in the development account picker. Firebase sign-in, registration and password-reset actions use the SDK; emulator reset links appear in local emulator tooling rather than sending real email. Google sign-in remains absent. Emulators start with fresh data by default; the original SQLite database remains unchanged and persistent in standalone mode. Never export real private records to a tracked directory.

For a parallel local smoke run, the launcher accepts `MANZIL_DEV_API_PORT`, `MANZIL_DEV_WEB_PORT` and `MANZIL_DEV_WORKER_PORT`. It automatically sets the Vite API proxy to match. These do not change production configuration.

Guests can still browse/plan/navigate and change device appearance preferences without a Firebase account. Guest appearance changes stay in browser storage. Saved commutes, history, alerts and personal settings require identity. The tutorial still opens each guest visit and after sign-out; Activity appears after sign-in. Signing out/switching users clears private traces and account-derived route state, and late requests cannot overwrite the next session.

The restored Closures/demo/edit controls remain visible. In emulator/production modes, mutating the **shared** closure dataset requires the seeded/admin identity. This foundation does not yet implement a separate guest demo sandbox or the proposed admin dashboard/audit/anti-republication workflow. Standalone mode retains its original unrestricted trusted-local tools.

## Persistence and authorization

- Firestore public closures/notices/queue state/speech accounting live under `manzil/v1`. Private commutes, trips, alerts, profile and check metadata live under `users/{uid}`. Original notice revisions are retained; only the latest notice revision/status is pending.
- The server verifies Firebase ID tokens (including revocation), derives admin access from verified custom claims, and scopes each asynchronous request to its own repository. Caller-supplied roles/owner IDs are not trusted. Admin shared-data privileges do not grant another user's trip access.
- `firestore.rules` denies all browser SDK/database access. The frontend uses the Express API; the Admin SDK's access requires appropriate service IAM and server authorization. Deploy these rules and the declared indexes before accepting public traffic.
- Published closure geometry and its global revision are read coherently. Routing snapshots reuse cached geometry only after checking the durable revision. The authoritative routing query is not truncated by the editor's 2,000-record display bound.
- Large GPS traces are JSON-encoded in bounded point chunks, avoiding Firestore's nested-array and document-size restrictions. State polls return summaries, not raw traces. Retention drains matching pages: raw points after 30 days, summaries after 90 days. Chunked writes also strip expired raw points to prevent stale edits restoring them.
- Speech uses atomic UTC-month reservations and a shared durable bounded cache. Multiple instances cannot independently spend the same character allowance. Cache/audio storage and database reads still have provider costs; this is an application allowance, not a billing guarantee.

Existing records remain in SQLite until a separately reviewed migration assigns ownership. No automatic GPS/notice/database upload happens when modes change.

## Production configuration and deployment

**17 October progress:** project/billing, default Standard Firestore in Singapore, email/password authentication, authorized domains and acceptance of the saved web key have been verified. Runtime identity `manzil-api@manzil-app-v1.iam.gserviceaccount.com` has Firestore user and Firebase Auth viewer permissions; the build identity has Cloud Run Builder. Cloud Run service `manzil-api` and Hosting are deployed; database rules/indexes are released and the retention index is READY. The cloud-built SDK consumes ignored `.env.cloud.local`; no key was printed. `config/cloud-run.manzil-app-v1.yaml` contains non-secret runtime settings, and `firebase.json` pins API rewrites to the Singapore service. This supersedes the earlier Mumbai suggestion and US template default.

The latest application (`0fd5592`) is live on revision `manzil-api-00005-zg5`, Hosting tag `fh-4dbbea488086e281`; `34e9e4a` / revision `manzil-api-00004-7t4` is the previous release. The runtime YAML explicitly sets the public `OSRM_BASE_URL` / `PHOTON_BASE_URL` prototype endpoints, retaining cache/rate/queue limits and 0–1 Cloud Run instances. No worker or paid provider activation accompanies this release. Twenty-seven live checks pass through each API origin, including Lahore routing/search, normalized permissions, default-off consent and road-section selection; browser QA confirms login-first guest entry, Plan ahead and English/Urdu phone layout. Fuel data remains unavailable until an authenticated admin check; no scheduled worker was added. See [current evidence](IMPLEMENTATION_LOG_THROUGH_2026-10-18.md#feature-release-deployed--17-october).

Hosting pinning uses `fh-*` tagged service hostnames. Set `FIREBASE_HOSTING_SERVICE_HOST` to the confirmed hash-based service hostname and include that hostname verbatim in `ALLOWED_HOSTS`. The server accepts Firebase tags only for that explicitly selected Cloud Run service, preserving origin and token/admin checks. A missing value caused the initial Hosting proxy 403; the deployed fix and three regression tests cover it. Do not replace the allowlist with a wildcard.

For another machine, install the [Google Cloud CLI for Windows](https://cloud.google.com/sdk/docs/install-sdk#windows), then restart the terminal/VS Code to pick up PATH. From a new PowerShell terminal, run the following yourself and complete the browser sign-ins with the account owning the project. These select local CLI defaults and log in; they do not deploy the app:

```powershell
gcloud.cmd init
gcloud.cmd config set project manzil-app-v1
gcloud.cmd config set run/region asia-southeast1
cd D:\Manzil\manzil
.\node_modules\.bin\firebase.cmd login
```

The Firebase CLI is already installed in the repository. Never share login codes or credential files. The owner completed these logins for the first deployment. Use the [deployment guide](FIRST_DEPLOYMENT.md) for release commands and the read-only smoke script.

1. Register a Firebase web app in the intended real project and enable email/password authentication. Choose the Firestore location deliberately before creation.
2. Copy `config/frontend.env.example` to ignored `.env.cloud.local` and fill in the **public web configuration**. Never put an Admin service-account JSON/key or model secret in `VITE_*` fields.
3. Run `npm.cmd run build:cloud`. It type-checks, builds the configured frontend and compiles the backend into `build/server/index.js`. Missing Firebase configuration or emulator settings make a cloud build fail. Plain `npm.cmd run build` remains a standalone preview build, not a configured Firebase release.
4. Use `config/production.env.example` as the runtime template. Set the real project, exact HTTPS origins and API/Hosting hostnames. The server uses ADC/its attached service identity; no credential is baked into the image. `NODE_ENV=production` or Cloud Run's `K_SERVICE` cannot select local/emulator mode. Emulator hosts/local database settings are rejected, and startup waits for usable Firestore before listening.
5. `Dockerfile` builds a Node 24 backend image, includes the attributed read-only road graph, prunes development dependencies and runs as a non-root user. `.dockerignore` uses an allowlist; `.gcloudignore` excludes local databases, env files, emulator data and sessions. The runtime must supply actual configuration. The image does not include Chromium; source collection remains disabled until a separate browser-worker packaging/access decision.
6. `firebase.json` serves `dist`, caches hashed assets and forwards `/api/**` to the deployed `manzil-api` in **asia-southeast1 (Singapore)**, pinned to the backend revision. This matches the owner's Firestore location. Production rules/indexes and runtime permissions were deployed before the website's live checks.

Configuration/build checks do not deploy by themselves. The release commands in the deployment guide create/update actual cloud resources and can incur charges. The current API uses request-based billing, 0–1 instances, 1 vCPU, 1 GiB, concurrency 8 and a 180-second Cloud Run request timeout (Hosting rewrites remain sixty seconds); instance settings and budget alerts are not monetary caps.

## Worker and roles

National online planning can make a 20-user saved-journey batch substantially slower than local graph checks. The current worker has no durable per-journey continuation or bounded wall-clock batch budget, so large national workloads can exceed a deployed HTTP timeout. Verify provider capacity and add resumable bounded jobs before enabling larger hosted schedules. Local mutation-triggered rechecks coalesce a trailing sweep so saved/updated journeys arriving during a previous check are included; continuous edits can extend that wait. Periodic timer calls do not request extra trailing sweeps.

Deploy the same image separately with `MANZIL_SERVICE_ROLE=worker` only after agreeing on the deployment plan. It exposes `POST /internal/tick` with `{ "job": "source" }` or `{ "job": "commutes" }`; the public API service does not expose worker operations, and the worker does not expose personal API routes. Production requires Google-signed OIDC tokens matching `WORKER_AUDIENCE` and `WORKER_SERVICE_ACCOUNT_EMAIL`, plus private Cloud Run IAM. Commute runs check at most 20 users and persist a pagination cursor for the next invocation. Schedule source checks and user checks at the agreed frequency; no cloud timers or Scheduler resources are automatically created.

For an existing Firebase user, the operator-only `npm.cmd run auth:admin -- USER_UID` sets a custom admin claim using explicitly selected emulator/production configuration and existing Admin credentials. It is not called during startup or deployment; production users are never seeded with dummy credentials. Sign out/in to refresh a changed role.

`TTS_ENABLED=false` and `PUBLIC_CLOUD_SPEECH=false` remain safe local/example defaults. The current production configuration deliberately sets both to `true`, following the owner's choice to support guests and signed-in users, with one shared **100,000-character UTC-month cap**, durable cache and device fallback. Cloud Run's attached API identity consumes Text-to-Speech; no key enters the frontend. Local paid speech still requires explicit `ALLOW_PAID_SERVICES=true`. Gemini is separately deployed; its Free tier key and model limits are unchanged. [Fuel/voice configuration and operations](../../FUEL_AND_VOICE.md).

## Verification

**17 October feature release:** fresh **345 standard + fifteen emulator cases pass (360 across 45 files)** on Node 24.22.0 / Java 25.0.1, and the cloud frontend/backend build passes. Both Hosting-host and normalized authorization regressions remain. The release passes 27 live checks per origin and browser national-route/Plan ahead/English/Urdu phone QA. Authenticated production/admin/GPS/audio flows were not exercised. See [release verification](IMPLEMENTATION_LOG_THROUGH_2026-10-18.md#feature-release-deployed--17-october).

```powershell
npm.cmd test
npm.cmd run test:firebase
npm.cmd run build
npm.cmd run build:server
```

The normal suite skips integration cases without emulator hosts; `test:firebase` launches an isolated **demo-manzil-test** project on test ports 9199/8180/4410/4510 with websocket 9151. It exercises real Auth/Firestore token verification, role enforcement, concurrent account isolation, private record access, closure revision conflicts, large GPS chunks, notice deduplication and cross-instance speech accounting/cache. Compiled API/worker smoke checks also validate graph packaging and role separation. Tests use synthetic notices/audio/GPS only, never paid synthesis or private local records.

Cloud Build/container startup, attached-identity Firestore access and the live Hosting/API connection are verified. Email delivery, real-user login/session persistence, real-device GPS/Urdu pronunciation and successful X collection remain separate verification tasks. No local Docker Desktop execution is claimed. The implementation-status document records current test counts, browser evidence and dependency-audit limitations.

Recorded foundation verification: **155 standard + seven emulator cases pass (162 total)**, standalone/cloud frontend builds and compiled backend pass, and the full emulator development launcher passed its alternate-port smoke run. The cloud frontend build used placeholder public identifiers only. That original verification ran on Node 24.11.1 despite dependency engine warnings. On Node **24.22.0**, the configuration check, **155 standard tests** and standalone TypeScript/Vite build have now been rerun successfully; the seven emulator cases were skipped in this follow-up. The earlier emulator/cloud/launcher/audit results were not rerun. See [implementation status](../../IMPLEMENTATION_STATUS.md) for the verification scope. The previous production dependency audit was clean; the Firebase CLI's development tree had seven advisories (four moderate, three high). No paid provider request occurred.
