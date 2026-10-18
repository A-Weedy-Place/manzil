# Five-minute source collection pilot

> **Historical record — retained 18 October 2026.** This may contain superseded requirements, UI, activation state or release evidence. It is not a current instruction/runbook. Use the [documentation index](../../README.md) and [current status](../../IMPLEMENTATION_STATUS.md).

**Merged release deployed, 18 October:** application commit `1f196c3` combines GitHub feature merge `49762d0` with the deployed Gemini checkpoint `9b16416`. Live API `manzil-api-00012-g9q`, private worker `manzil-source-worker-00009-6bf`, Hosting pin `fh-84ad6494196d6945`. New UI/profile/transit/weather features and mandatory Gemini admin review are retained. **809 standard + 24 Auth/Firestore emulator tests (833 total)**, production build, three local browser flows, two hosted entry checks and **34 live checks per origin** pass. Weather is fresh; the live bundled transit network has 37 routes/1,210 stops and returned three journey options. Model limits/schedules and worker-only secret remain unchanged. GitHub main contains both histories; original checkout is synchronized and prior local edits are retained in a named backup stash. Earlier localhost-only, uncommitted and deployment-pending entries below are historical.

**Current deployment, 18 October:** API `manzil-api-00011-76r`, worker `manzil-source-worker-00008-cfp`, Hosting `fh-2c9b2b4410f6124c`; 498 standard/emulator cases and 27 live checks per origin pass. Review-only mode, same schedules/allowance. Public API timeout 180 seconds; only manual analysis uses the direct authenticated API origin to avoid Hosting's sixty-second timeout. [Release evidence](IMPLEMENTATION_LOG_THROUGH_2026-10-18.md#observable-pipeline-and-bounded-agent-improvements-deployed---18-october).

**Latest review release, 18 October:** API `manzil-api-00010-mfs`, worker `manzil-source-worker-00007-4mq`, Hosting `fh-657d3b00874068d1`. Five saved interpretations have private review drafts (three mapped landmarks); no new model calls or closures from preparation. Agent publication now always requires administrator approval. Earlier deployment and auto-publication entries are historical. [Current release evidence](../../IMPLEMENTATION_STATUS.md), [review workflow](../../operations/AGENT_MAP_REVIEW.md).

**Current agent map review (18 October):** the combined worker prepares private per-event map drafts. Review on map prefills their details and resolved geometry; administrator approval/rejection controls every routing change. Existing saved interpretations can be prepared without another model request. See [review workflow](../../operations/AGENT_MAP_REVIEW.md) and current release evidence. Earlier publication-mode descriptions are historical.

**17 October evening update:** the source worker is now `manzil-source-worker-00004-h5p`, shared with the deployed Gemini consumer; API `manzil-api-00007-kv4`, Hosting `fh-1892cd5e1863e326`. The existing five-minute collection job continues; a separate five-minute model job uses bounded durable claims and the confirmed Free tier key. [Current Gemini operations and pause](../../operations/GEMINI_INTEGRATION.md). Source storage/pause instructions below still apply; source-only revision/allowlist/no-model claims describe the earlier pilot. Do not use the old source-only config to upgrade the combined worker unless deliberately rolling back model work.

Project: `manzil-app-v1`; region: `asia-southeast1`. The owner authorized collection deployment before Gemini integration on 17 October 2026. This collects raw public evidence; it does not infer or publish map closures. Deployment outcome/revisions are recorded in [implementation status](../../IMPLEMENTATION_STATUS.md).

## Resources and boundaries

- Private Cloud Run service: `manzil-source-worker`, same backend image as the API, `MANZIL_SERVICE_ROLE=worker`, now `WORKER_ALLOWED_JOBS=source,agent`. No public IAM invoker. Source and agent have separate schedules; it rejects API requests and fuel/commute jobs.
- Runtime service account: `manzil-source-worker@manzil-app-v1.iam.gserviceaccount.com`, Firestore access plus object create/view on its private media bucket.
- Scheduler identity: `manzil-source-scheduler@manzil-app-v1.iam.gserviceaccount.com`, `roles/run.invoker` on this worker only. The worker also verifies the exact service-account email and OIDC audience.
- Worker URL/audience: `https://manzil-source-worker-ld6lwscfya-as.a.run.app` (the canonical `status.url`); POST `/internal/tick`, JSON `{"job":"source"}`. The deterministic project-number URL is also allowed as a host, but Scheduler uses the canonical URL consistently for its target, OIDC audience and application verification. This is an authenticated backend, not a public webpage.
- Scheduler job: `manzil-champ-source-5min`, cron `*/5 * * * *`, timezone `Asia/Karachi`. One scheduler job, 288 nominal executions per day. Delivery is not exactly once or guaranteed precisely on the minute.
- Worker limits: minimum zero/maximum one instance at both service/revision levels, 1 CPU/1 GiB, concurrency one, request-based CPU, no CPU boost, 150-second request timeout. Source's durable lease is 180 seconds. Production has no in-process polling timer.
- Private Standard bucket: `gs://manzil-app-v1-source-media`, Singapore, uniform access/public access prevention, seven-day lifecycle deletion for `source-media/` objects, soft delete disabled for this disposable evidence bucket. Lifecycle deletion is asynchronous, not an exact seven-day timestamp. Do not apply these settings to unrelated app/build buckets.

## What is stored

Firestore `manzil/v1/notices` stores canonical post identity, original text, publication/edit evidence, content hashes, revision history and `pending_agent` status. Unchanged evidence does not create a new revision or reopen a reviewed/dismissed notice. Images are separate evidence: changing download state does not alter notice status/revision.

Shared Firestore metadata uses existing hashed keys under `manzil/v1/meta`. `sourceStatus` records enabled state, next deadline, latest success and the partial-coverage message. `sourceLastRun` retains the latest bounded request diagnostics and saved/cached/failed/skipped image counts. `sourceRuns` retains the existing bounded history (100 summaries).

Each image URL has a `sourceMedia:<SHA-256-of-URL>` metadata record with source IDs, photo/video-thumbnail kind, private bucket/object reference, byte count, MIME type, content hash and seven-day availability deadline. Failures retain a safe failure category and fifteen-minute retry cooldown. At most eight distinct new images per collection, four references per accepted post and 5 MB per image are attempted. Downloads use a 45-second phase deadline and 15-second requests; uploads disable automatic retries and use ten-second request timeouts. Known available images are reused. Collection itself makes no model call and downloads no full video. The separate deployed agent can interpret retained raster evidence, and authenticated admins can inspect images through the backend; the bucket remains private.

Only public source evidence is collected. Local source archives, SQLite/GPS data, `.env` files, keys and browser/session credentials are excluded from cloud uploads. Do not upload existing `data/source-probes/` as a migration.

## Operator status and pause

From PowerShell in this repository, with the intended operator's Google Cloud login:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/source-cloud.ps1 Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/source-cloud.ps1 Status -IncludeNotices
gcloud.cmd scheduler jobs describe manzil-champ-source-5min --project=manzil-app-v1 --location=asia-southeast1
```

The status helper reads only source status/diagnostics. Optional `-IncludeNotices` adds up to 100 notice summaries (IDs/revisions/status/times/character and media counts), not raw text; a pagination indicator discloses a truncated listing. OAuth stays in process memory and is not printed or saved. Changing settings uses a Firestore update-time precondition to avoid silently overwriting a concurrent worker update.

Pause both dispatch and source intake:

```powershell
gcloud.cmd scheduler jobs pause manzil-champ-source-5min --project=manzil-app-v1 --location=asia-southeast1 --quiet
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/source-cloud.ps1 Disable
```

Resume after checking source access and usage:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/source-cloud.ps1 Enable
gcloud.cmd scheduler jobs resume manzil-champ-source-5min --project=manzil-app-v1 --location=asia-southeast1 --quiet
```

An enabled schedule continues until paused; this is not an automatic 24-hour shutdown. Review it after the first day. The admin Pipeline pause/resume uses the same persisted source enabled flag; an already-running collection can finish, but future worker calls skip disabled collection. An environment flag alone does not override a persisted choice.

Inspect images using the authenticated Google Cloud Storage console or download a specific object with `gcloud storage cp`; the bucket is not public. Operators need their own appropriate Google Cloud permissions. The deployed Gemini worker reads these private objects using its service identity; authenticated admin previews use the API identity. Do not put image bytes in Firestore.

## Release and validation sequence

1. Run standard tests, Auth/Firestore emulator integration tests and `npm.cmd run build:cloud`. Inspect `gcloud meta list-files-for-upload` before upload.
2. Build/deploy the private worker with `config/cloud-run-source.manzil-app-v1.yaml` and the existing Dockerfile. Attach the runtime account and explicit limits above. Record its immutable image digest and revision.
3. Grant the scheduler identity `roles/run.invoker` on this service. Create the Scheduler HTTP target with its OIDC audience set to the worker base URL (without `/internal/tick`), content type `application/json`, and body from `config/source-scheduler-body.json`.
4. Start with scheduling paused. An initial annual schedule `0 0 1 1 *` avoids a five-minute dispatch race during setup; pause it immediately, then set `*/5 * * * *` while still paused. Keep automatic retry attempts at zero: the next five-minute tick is the retry opportunity. Access denial/rate limits do not trigger a burst of retries.
5. Enable persisted source settings deliberately. Scheduler rejects manual dispatch of a paused job (`Job.state must be ENABLED for RunJob`). For an isolated manual test, temporarily set the annual cron above, resume that annual job, invoke `gcloud scheduler jobs run manzil-champ-source-5min ...`, then pause it again and restore the five-minute cron while paused. Verify actual accepted notices, saved image objects and metadata, plus denial of unauthenticated worker access. If cloud access fails, retain evidence and leave scheduling paused while diagnosing it.
6. Deploy the same tested image to the API using its existing service account/configuration/limits. This updates the manual collector implementation too. Publish the cloud-built Hosting bundle so its pin and five-minute admin label match the new API. Do not change Firestore rules or migrate private data.
7. Run normal public API/Hosting smoke checks. After source activation, append `--collection-enabled` to `scripts/smoke-cloud.mjs`; this checks the enabled flag and five-minute metadata while retaining guest-data isolation checks.
8. Resume scheduling only after cloud collection works. Verify a genuinely scheduled run separately from the manual test, including deduplication and cached image reuse. Review missed content/failures and billing over a full day before Gemini integration.

## Limits and costs

Local success does not guarantee X access from Google Cloud or uninterrupted collection. The preview can miss bursts, deletions, older edits and media. Absence/failure is not an all-clear road signal; even a relevant-looking image does not prove location, capture time or an active blockade. Only known original timestamps are publication evidence.

Cloud Scheduler's first three jobs per billing account are free; otherwise one job costs $0.10 per month, not per execution ([pricing](https://cloud.google.com/scheduler/pricing)). Worker compute, Firestore, private object storage, logs, builds and transfers have their own usage charges. Existing billing alerts are notifications, not spending caps; instance/image/retry limits bound work but not total monthly cost. No Gemini or cloud speech usage is activated by this pilot. Scheduler HTTP success confirms dispatch/handler completion, not complete source coverage; inspect source `lastSuccessAt`, `state` and diagnostics even when Scheduler reports success.
