# Local development and production configuration

Implemented 16 October 2026. This adds one codebase with explicit runtime modes, real Firebase adapters and production build files. **Nothing has been deployed, no cloud project/billing configuration has been changed, and Gemini extraction remains future work.** The next step is a separate deployment plan using the owner's actual project and budget.

## Modes

| | Standalone local | Firebase emulator development | Production configuration |
| --- | --- | --- | --- |
| Command | `npm.cmd run dev` | `npm.cmd run dev:firebase` | Build with `npm.cmd run build:cloud`; deploy later |
| `MANZIL_MODE` | `local` (default) | `emulator` (set by launcher) | `production` |
| Data | Existing local SQLite | Local Firestore Emulator | Hosted Firestore, using the same adapter |
| Accounts | Original dummy UI identities; one shared database | Real Auth Emulator users/tokens and separate user records | Firebase Authentication, verified server-side |
| Shared changes | Existing trusted localhost tools | Verified admin claim required | Verified admin claim required |
| Personal records | Shared standalone development data | Per Firebase UID | Per Firebase UID |
| Scheduling | Local source/commute timers | Local API + worker and emulator-only scheduled runner | Separate private worker, invoked externally |
| Paid calls | Speech disabled unless configured | Launcher disables speech/source collection | Speech disabled until deliberately enabled/configured |

Closure/time validation, OSM graph routing, demo geometry, commute checks, inference and speech prompt construction are shared. The API awaits the repository interface; SQLite and Firestore are infrastructure adapters. No localhost database is copied into Firestore or silently assigned to a new user.

## Environment requirements

- **Node 24.12.0 or newer**: required by the current Firebase SDK dependency set. The inspected machine has 24.11.1; upgrade that patch before regular use. `npm.cmd run config:check` reports the selected mode and returns nonzero on an unsupported Node version. It prints no credentials and creates no resources.
- **Java 21+** for the Firestore Emulator. Java 25 is installed on the inspected machine.
- Dependencies are in `package-lock.json`; use `npm.cmd ci` on a new checkout. The Firebase CLI is a project development dependency, not a required global install.
- Google Cloud CLI is **not on PATH** on the inspected machine. It is needed later for deployment/ADC setup, not for emulator development.
- Docker Desktop is installed but its Linux engine is not running. It is optional for local development; container verification requires starting it, or a later Cloud Build run.

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

## Production preparation (no deployment yet)

1. Register a Firebase web app in the intended real project and enable email/password authentication. Choose the Firestore location deliberately before creation.
2. Copy `config/frontend.env.example` to ignored `.env.cloud.local` and fill in the **public web configuration**. Never put an Admin service-account JSON/key or model secret in `VITE_*` fields.
3. Run `npm.cmd run build:cloud`. It type-checks, builds the configured frontend and compiles the backend into `build/server/index.js`. Missing Firebase configuration or emulator settings make a cloud build fail. Plain `npm.cmd run build` remains a standalone preview build, not a configured Firebase release.
4. Use `config/production.env.example` as the runtime template. Set the real project, exact HTTPS origins and API/Hosting hostnames. The server uses ADC/its attached service identity; no credential is baked into the image. `NODE_ENV=production` or Cloud Run's `K_SERVICE` cannot select local/emulator mode. Emulator hosts/local database settings are rejected, and startup waits for usable Firestore before listening.
5. `Dockerfile` builds a Node 24 backend image, includes the attributed read-only road graph, prunes development dependencies and runs as a non-root user. `.dockerignore` uses an allowlist; `.gcloudignore` excludes local databases, env files, emulator data and sessions. The runtime must supply actual configuration. The image does not include Chromium; source collection remains disabled until a separate browser-worker packaging/access decision.
6. `firebase.json` serves `dist`, caches hashed assets and forwards `/api/**` to `manzil-api` in **us-central1**, pinned to the backend revision. This service/region is a proposed default, not an existing deployment; align it with the agreed region before deployment. Deploying the frontend also needs the production Firestore rules/indexes and appropriate service permissions.

No deployment command/script is invoked here. A successful configured build does not verify a cloud project's billing, IAM, database location, external quotas or deployment readiness.

## Worker and roles

Deploy the same image separately with `MANZIL_SERVICE_ROLE=worker` only after agreeing on the deployment plan. It exposes `POST /internal/tick` with `{ "job": "source" }` or `{ "job": "commutes" }`; the public API service does not expose worker operations, and the worker does not expose personal API routes. Production requires Google-signed OIDC tokens matching `WORKER_AUDIENCE` and `WORKER_SERVICE_ACCOUNT_EMAIL`, plus private Cloud Run IAM. Commute runs check at most 20 users and persist a pagination cursor for the next invocation. Schedule source checks and user checks at the agreed frequency; no cloud timers or Scheduler resources are automatically created.

For an existing Firebase user, the operator-only `npm.cmd run auth:admin -- USER_UID` sets a custom admin claim using explicitly selected emulator/production configuration and existing Admin credentials. It is not called during startup or deployment; production users are never seeded with dummy credentials. Sign out/in to refresh a changed role.

`PUBLIC_CLOUD_SPEECH=false` is the default: cloud synthesis requires sign-in, while guest guidance can use an available matching device voice. If guest cloud voice is required, explicitly enable public speech only after deciding its usage limits and abuse controls. `TTS_ENABLED=false` remains the default. Gemini extraction/provider activation is not implemented by this infrastructure change and still belongs to the next integration plan.

## Verification

```powershell
npm.cmd test
npm.cmd run test:firebase
npm.cmd run build
npm.cmd run build:server
```

The normal suite skips integration cases without emulator hosts; `test:firebase` launches an isolated **demo-manzil-test** project on test ports 9199/8180/4410/4510 with websocket 9151. It exercises real Auth/Firestore token verification, role enforcement, concurrent account isolation, private record access, closure revision conflicts, large GPS chunks, notice deduplication and cross-instance speech accounting/cache. Compiled API/worker smoke checks also validate graph packaging and role separation. Tests use synthetic notices/audio/GPS only, never paid synthesis or private local records.

Live Cloud Run/Firebase deployment, real Cloud ADC/IAM, email delivery, browser Firebase persistence, real-device GPS/Urdu pronunciation and successful X collection remain separate verification tasks. Docker image execution cannot be claimed while Docker Desktop is stopped. The implementation-status document records exact final test/build results and dependency-audit limitations.

Current verification: **155 standard + seven emulator cases pass (162 total)**, standalone/cloud frontend builds and compiled backend pass, and the full emulator development launcher passed its alternate-port smoke run. The cloud frontend build used placeholder public identifiers only. Tests/builds ran on installed Node 24.11.1 despite dependency engine warnings; use the required updated Node version for the release. Production dependency audit is clean; the Firebase CLI's development tree still has seven advisories (four moderate, three high). No paid provider request occurred.
