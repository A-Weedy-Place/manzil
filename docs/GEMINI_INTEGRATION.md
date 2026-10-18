# Gemini source interpretation

**18 October fuel/voice release:** the separate PSO collector now runs nightly at 01:00 PKT without Gemini. Google Cloud English/Urdu navigation voices are enabled for guests and signed-in users with their own shared character cap. This does **not** change the Gemini API key's Free tier, model, 20-attempt/day limit, worker-only secret, five-minute schedule or mandatory map approval. No model call or paid upgrade was required. [Current configuration and workload cost examples](FUEL_AND_VOICE.md).

**Merged release deployed, 18 October:** application commit `1f196c3` combines GitHub feature merge `49762d0` with the deployed Gemini checkpoint `9b16416`. Live API `manzil-api-00012-g9q`, private worker `manzil-source-worker-00009-6bf`, Hosting pin `fh-84ad6494196d6945`. New UI/profile/transit/weather features and mandatory Gemini admin review are retained. **809 standard + 24 Auth/Firestore emulator tests (833 total)**, production build, three local browser flows, two hosted entry checks and **34 live checks per origin** pass. Weather is fresh; the live bundled transit network has 37 routes/1,210 stops and returned three journey options. Model limits/schedules and worker-only secret remain unchanged. GitHub main contains both histories; original checkout is synchronized and prior local edits are retained in a named backup stash. Earlier localhost-only, uncommitted and deployment-pending entries below are historical.

**Current deployment, 18 October:** API `manzil-api-00011-76r`, worker `manzil-source-worker-00008-cfp`, Hosting `fh-2c9b2b4410f6124c`; 498 standard/emulator cases and 27 live checks per origin pass. Review-only mode, same schedules/allowance. Public API timeout 180 seconds; only manual analysis uses the direct authenticated API origin to avoid Hosting's sixty-second timeout. [Release evidence](IMPLEMENTATION_STATUS.md#observable-pipeline-and-bounded-agent-improvements-deployed---18-october).

**18 October pipeline update:** Control centre opens on Pipeline. Review queue and Awaiting review combine current Gemini post reviews with pending community reports; multiple events count as one post until its last decision. Run Gemini now invokes the private worker through the authenticated public API, with the same claims, five-minute schedules and daily limits. Live saved-state progress and per-proposal tool logs make the stages observable. The agent matches unique current incidents and retries eligible failed mapping from saved extraction, at most three attempts with fifteen-minute cooldown; every map action still requires admin approval. [Current workflow](AGENT_MAP_REVIEW.md), [release evidence](IMPLEMENTATION_STATUS.md). Older scheduling-only and automatic-publication entries are historical.

**Latest review release, 18 October:** API `manzil-api-00010-mfs`, worker `manzil-source-worker-00007-4mq`, Hosting `fh-657d3b00874068d1`. Five saved interpretations have private review drafts (three mapped landmarks); no new model calls or closures from preparation. Agent publication now always requires administrator approval. Earlier deployment and auto-publication entries are historical. [Current release evidence](IMPLEMENTATION_STATUS.md), [review workflow](AGENT_MAP_REVIEW.md).

**Current scope (18 October):** agent map actions require administrator approval or rejection. Prepared drafts prefill the map editor, including resolved geometry and evidenced or labelled AI-proposed times; existing extractions can be prepared without another model call. The live setting was switched to review mode before this work. [Review workflow and API](AGENT_MAP_REVIEW.md). The initial deployment paragraph below is historical.

17 October 2026: **deployed** at https://manzil-app-v1.web.app, API `manzil-api-00007-kv4`, worker `manzil-source-worker-00004-h5p`, Hosting `fh-1892cd5e1863e326`. **433 standard + 17 real Auth/Firestore emulator tests (450 total)**, production/cloud builds and **24 live checks per origin** pass. The initial key returned prepaid-credit HTTP 402; the owner replaced it and confirmed **Free tier**. A real local text/image probe and four cloud generation attempts succeeded, including private archived-image use. Disruption reports stayed in review; no live map closure was invented. Source and agent schedules are enabled every five minutes, with validated publication enabled after the first review batch. [Release evidence](IMPLEMENTATION_STATUS.md#gemini-deployed-with-real-cloud-interpretation---17-october). Do not add funds or switch to Vertex AI automatically.

## Workflow and actual limits

The simplified admin UI groups **Original post → Gemini analysis → Map outcome** inside each post, defaults to **All posts**, and distinguishes saved work from finished results. See the [demo walkthrough and state meanings](PIPELINE_DEMO.md). Refresh results is read-only; Fetch latest posts collects evidence only.

`public HTML -> durable notice/images -> private Gemini extraction -> private map proposal -> admin approval/rejection -> atomic map change`

The model is `gemini-3.1-flash-lite` through the Gemini Developer API. It reads English, Urdu/Roman Urdu and up to two retained JPEG/PNG/WebP source images, totaling at most 3 MB. Video thumbnails are labelled as such; no full videos, user-report photos, GPS traces, profiles or authentication records are sent. Images are read from this app's private archived objects and checked against recorded length/hash/expiry. No model-supplied URLs are fetched. Source instructions are untrusted input; the model receives no shell or unrestricted database tools.

The strict JSON schema extracts traffic events, explicit reopenings, irrelevant/missing-person notices and dated petrol/diesel announcements, with original quotes, uncertainty and bilingual summaries. Missing-person notices are dismissed as irrelevant, retaining source history. Fuel announcements appear in the admin results **unconfirmed**; they do not rewrite PSO-backed fuel estimates. Daily production PSO scheduling is still separate work. A checkpoint, VIP movement, traffic jam or Metro suspension alone does not establish a private-car road closure.

Every map action requires an administrator decision. Preparation resolves exact imported Islamabad roads independently of publication checks, with a uniquely named Pakistan landmark as an explicitly limited review-pin fallback. It fills title, notes, reason, source, supported times and geometry where established. Unknown/ambiguous geography or timing is left for the administrator rather than guessed. See [mapping limits](AGENT_MAP_REVIEW.md#mapping-boundaries).

Reopening proposals preview a matched existing agent incident and require explicit administrator approval before cancellation. Future, stale, corrected or unmatched targets are rejected. Expiry removes a bounded closure's routing effect without deleting history. Admin edits/cancellation retain override precedence; absence from the small feed never proves reopening. Extended correction-history browsing and explicit override-reset remain separate work.

## Queue and cost controls

- Defaults: disabled, review mode, **20 generation attempts per PKT date**, a **$1 conservative reservation allowance**, and $0.02 reserved before each attempt. At default 20 attempts, reservations can reach $0.40/day. This is an application allowance, not actual spend or a provider billing cap. Failed claims reserve allowance too, rather than risking overspend on ambiguous failures.
- The client counts complete request tokens before generation; over 20,000 input tokens is rejected. Output is capped at 4,096 tokens, images use low resolution and reasoning is minimal. Each model attempt has a 40-second combined deadline and bounded response/error bodies.
- At most two notices per tick; no new work starts after 65 seconds. Durable three-minute per-revision claims prevent cross-instance duplication. Result, notice status, closures and global routing revision commit atomically. Superseded/expired results cannot change routes. Result history is retained under version keys.
- Quota/authentication/billing errors stop the batch and impose a fifteen-minute global backoff. Failures remain pending, with increasing cooldown and at most three attempts per revision. There is no Vertex/paid-provider fallback. Exhausted revisions need operator investigation; the UI does not provide an automatic retry/reset bypass. New revisions have their own claims but share the day's allowance.
- Free quota is account/project/model dependent. Confirm the key's project is marked Free tier in [AI Studio](https://aistudio.google.com/api-keys), then verify a full request. A tiny `countTokens` request succeeding does not establish generation entitlement. This deployment's paid Google Cloud project and the API key's Free tier project may be different. Never assume that placing a key in Cloud Run changes its provider tier.

Official [model prices](https://ai.google.dev/gemini-api/docs/pricing), [billing](https://ai.google.dev/gemini-api/docs/billing/) and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) remain authoritative. Cloud Run, Scheduler, Firestore, image storage, builds and Secret Manager are separate Google Cloud usage; budget alerts do not stop billing. The application cannot enforce a global cloud spending cap.

## Local use

Keep `GEMINI_API_KEY=...` only in ignored `.env.gemini.local`. Never paste it into chat, commit it or use a `VITE_` prefix. Local/emulator bootstrap loads this file without overriding existing environment variables. Put explicit activation flags in `.env` or the launching process; an existing `GEMINI_ENABLED=false` takes precedence over values in the private file.

```powershell
npm.cmd run agent:probe
```

This deliberately makes one real model attempt on a fresh public notice and optional image, prints the interpretation/usage, and writes **no app database data**. It does not bootstrap Firestore, enable collection or change map closures. Do not call it repeatedly while billing/quota is unresolved.

For a local end-to-end run, explicitly set `GEMINI_ENABLED=true`; start `npm.cmd run dev:firebase` and sign in as the seeded local admin. Import a labelled test notice with its real publication time or deliberately collect public evidence, then use **Control centre → Pipeline → Run Gemini now**. Review mode is the default. The emulator runner does not automatically schedule Gemini; the admin action is deliberate. Emulator storage is local, but the real key makes external model calls. Without a key/enabling flag, ordinary dev and tests remain usable and make no model calls.

Pipeline shows attempted allowance, pending work, last processing time, errors, bilingual results, uncertainty, original-source links, authenticated archived images and manual map-review actions. Pause affects future batches; an already running batch may finish. A `reviewed` notice means processing completed, **not independent human confirmation**; read the separate result state (`applied`, `review`, `dismissed`, `failed`).

## Deployment sequence once the key probe works

This is the repeatable release procedure; consult implementation status for actual release evidence. Keep the existing five-minute collection job running. Do not upload local SQLite, image folders, account fixtures or `.env` files.

1. Run standard tests, `npm.cmd run test:firebase`, `npm.cmd run build:cloud`; inspect `gcloud.cmd meta list-files-for-upload` for private files. Validate the real model probe before activating any cloud model job.
2. Enable Secret Manager and create one secret. Import the saved key over stdin with the helper; it never places key bytes in arguments/logs. Do not grant the public API access to the key.

```powershell
gcloud.cmd services enable secretmanager.googleapis.com --project=manzil-app-v1
gcloud.cmd secrets create manzil-gemini-api-key --replication-policy=automatic --project=manzil-app-v1
node scripts/upload-gemini-secret.mjs
gcloud.cmd secrets add-iam-policy-binding manzil-gemini-api-key --project=manzil-app-v1 --member=serviceAccount:manzil-source-worker@manzil-app-v1.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
```

3. Build/deploy the existing private worker using `config/cloud-run-agent.manzil-app-v1.yaml` instead of the source-only file, plus `--set-secrets=GEMINI_API_KEY=manzil-gemini-api-key:VERSION_NUMBER` using the newly created numeric version. Keep the existing source runtime/scheduler accounts, canonical audience, private IAM, min zero/max one at both service and revision levels, 1 CPU/1 GiB, concurrency one, request CPU/no boost and 150-second timeout. Record the immutable image digest. Initial config is **review mode**.
4. Reuse that immutable image for the public API with its existing config/limits and `SOURCE_MEDIA_READ_BUCKET=manzil-app-v1-source-media`. Grant its confirmed runtime service account `roles/storage.objectViewer` on this bucket only for admin image previews. Do not attach the Gemini secret to the API. Verify direct API health, guest/admin authorization and source image permissions; deploy Hosting to repin the tested API. Firebase browser configuration remains public build configuration, not a Gemini credential.
5. Create a **separate** Scheduler job `manzil-gemini-5min`, target the same canonical worker `/internal/tick`, body file `config/agent-scheduler-body.json`, cron **`2-59/5 * * * *`**, timezone Asia/Karachi, exact same OIDC account/audience, attempt deadline180s and retry attempts0. The two-minute offset separates typical model runs from source runs; durable claims still enforce overlap safety. Use the existing source guide's create/verify-IAM procedure. There is no Cloud Tasks or new always-on server requirement.
6. Inspect scheduled interpretations and proposals/usage. Keep persisted `autoPublish:false`; the service now enforces review-only behavior, and the API rejects requests to enable automatic publication. Demonstrate with genuine source evidence; use clearly labelled local/emulator fixtures for closure/reopening approvals if the live feed lacks a suitable notice. Never seed fake live blockades.
7. Record actual revisions, immutable image, Scheduler delivery, model usage and observed limits in `IMPLEMENTATION_STATUS.md`. No 24-hour wait is required, but a short smoke check is not evidence of completeness/endurance. Fuel and commute schedules remain separate until explicitly configured.

Pause model work with **Pause Gemini** and pause only `manzil-gemini-5min`; collection can continue independently. During rollback, first pause that job, restore the last healthy API/Hosting/worker image pairing, and retain evidence. Rolling back code does not undo previously published closures; review/cancel incorrect incidents explicitly. Source-only config remains `config/cloud-run-source.manzil-app-v1.yaml`.

Operator controls (Google Cloud login required; OAuth stays in process memory and no key contents are printed):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/agent-cloud.ps1 Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/agent-cloud.ps1 Status -IncludeResults
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/agent-cloud.ps1 EnableReview
```

Pause both model dispatch and future claims without pausing source collection:

```powershell
gcloud.cmd scheduler jobs pause manzil-gemini-5min --project=manzil-app-v1 --location=asia-southeast1 --quiet
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/agent-cloud.ps1 Disable
```

The helper uses a Firestore update-time precondition so it does not silently overwrite concurrent settings. Resume the chosen model setting and the Scheduler job explicitly. Smoke with `node scripts/smoke-cloud.mjs ORIGIN manzil-app-v1 --national --collection-enabled --gemini` for seven extra guest authorization checks (26 total). It does not invoke Gemini or create records.

The worker YAML keeps `GEMINI_AUTO_PUBLISH=false`. Runtime preparation is review-only even with a legacy true value; the persisted setting is also false. The operator helper no longer enables automatic publication. `-IncludeResults` reads up to 100 result/proposal summaries with an explicit pagination flag; keys and OAuth are never printed.
