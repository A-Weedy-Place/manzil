# Gemini interpretation and operations

Gemini converts retained public-source evidence into structured interpretations and **private proposals**. Every road or transit map change requires an administrator's approval. This page documents the implemented boundary and operator procedure; [implementation status](../IMPLEMENTATION_STATUS.md) records release/activation evidence.

`public HTML → durable notice/images → private interpretation → private proposal → administrator review → atomic map change`

## Application contract

The administrator opens **Pipelines**, selects a post and compares original evidence, Gemini analysis and map outcome in the adjacent detail panel. **Review queue** combines pending community reports with current agent post reviews. Preparing or reopening a saved review does not itself call Gemini or affect routing. [Review workflow and concurrency](AGENT_MAP_REVIEW.md), [bus-service proposals](AGENT_TRANSIT_REVIEW.md).

The configured model is `gemini-3.1-flash-lite` through the Gemini Developer API. It reads English, Urdu/Roman Urdu and up to two retained JPEG/PNG/WebP source images totalling at most 3 MB. Video thumbnails are labelled; full videos, user-report photos, GPS traces, profiles and authentication records are not sent. Image reads validate the app's private archived object, recorded hash/length and expiry. The worker never fetches a model-supplied URL or executes source instructions.

The strict JSON schema extracts traffic/service events, explicit reopenings, irrelevant notices and dated petrol/diesel announcements, retaining quotes, uncertainty and bilingual summaries. Missing-person notices are irrelevant to road routing. Fuel announcements remain unconfirmed and never rewrite PSO-backed estimates. Congestion, a checkpoint, VIP movement or a metro suspension alone does not establish a private-car road closure.

Deterministic mapping uses the supplied Pakistani city and named references, then a bundled or bounded on-demand OSM graph. There is no Islamabad city allowlist. Exact names, connectivity and source evidence are still required; a unique landmark may provide a labelled review pin, not an invented closed-road extent. Unknown geography/times require administrator input. Reopening can target only a matching, current incident; manual corrections/overrides and revisions remain authoritative. See [mapping boundaries](AGENT_MAP_REVIEW.md#mapping-boundaries).

## Queue and limits

| Control | Implemented value / behavior |
| --- | --- |
| Default activation | Disabled without explicit configuration; review-only behavior is enforced even if legacy settings request publication. |
| PKT daily allowance | Default 20 generation attempts and a $1 conservative reservation allowance; $0.02 reserved before each claim, including failures. At the default attempt count, reservations can reach $0.40/day. |
| Input/output | Complete-request token count checked before generation: at most 20,000 input tokens and 4,096 output tokens; low image resolution and minimal reasoning. |
| Model deadline | Combined count/generation deadline 40 seconds; bounded response/error bodies. |
| Batch | At most two eligible notices; no new work starts after 65 seconds. |
| Work claim | Durable three-minute per-source-revision lease; shared daily allowance and revision checks. |
| Failed interpretation | Increasing cooldown, at most three attempts per revision; quota/authentication/billing errors stop the batch and trigger a fifteen-minute global backoff. |
| Mapping retry | Saved interpretation only, maximum three mapping attempts and fifteen-minute cooldown; no new generation. |
| Publication | Every proposal needs administrator approval; `PATCH /api/agent/settings` rejects `autoPublish:true`. |

These are application limits, not provider billing measurements or a global cloud spending cap. Free quota depends on the key's account/project/model. A successful `countTokens` call alone does not prove generation entitlement. Confirm applicable [pricing](https://ai.google.dev/gemini-api/docs/pricing), [billing](https://ai.google.dev/gemini-api/docs/billing/) and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) before authorized activation. Cloud Run, Scheduler, Firestore, storage, builds and Secret Manager are separate usage. There is no automatic Vertex/paid-provider fallback.

## Local development

Keep `GEMINI_API_KEY` only in ignored `.env.gemini.local`, never in Git, chat or a `VITE_` variable. Bootstrap loads that file for local/emulator mode without overriding existing environment variables. Set activation explicitly in the launching environment; an existing `GEMINI_ENABLED=false` takes precedence.

Ordinary unit tests inject the model and need no key. For an authorized real end-to-end test, enable Gemini, start the emulator stack, sign in as its administrator and import a clearly labelled advisory with its original publication time. **Pipelines → Run Gemini now** deliberately invokes up to two eligible notices. Emulator storage is local, but a real key still makes external model calls. The emulator launcher does not automatically schedule Gemini.

```powershell
npm.cmd run agent:probe
```

This explicit probe fetches a usable public notice/optional image and makes one real model attempt without writing application database records. It reports interpretation/usage, not a live verified road closure. Do not use it as a routine documentation/build check or repeat it while quota/billing is unresolved.

## API and private-worker boundary

| Service | Configuration / authority |
| --- | --- |
| Public API | Firebase administrator authorization; optional exact `AGENT_WORKER_URL`; no Gemini key or Secret Manager access. |
| Private worker | Model key supplied from Secret Manager, allowed `agent` job, exact OIDC audience and permitted workload identities. |
| Scheduler | Its own invoker identity; source and model are independent five-minute schedules when enabled. |
| Manual API dispatch | API runtime service identity is accepted for **agent only** through `WORKER_MANUAL_SERVICE_ACCOUNT_EMAIL`; no user token or key is forwarded. |
| Browser | `VITE_AGENT_RUN_ORIGIN` may point only to the public authenticated API, never the private worker. Other requests remain on Hosting's API rewrite. |

The long-running manual-analysis path is documented in [agent review](AGENT_MAP_REVIEW.md#production-manual-trigger-configuration). Scheduled and manual work use the same queue, leases and allowance. Refreshing results is read-only; Fetch collects evidence only.

## Authorized deployment procedure

Use [deployment guidance](DEPLOYMENT.md), [source operations](DEPLOYMENT.md) and the target project's actual resource inventory. The checked-in `config/cloud-run-agent.manzil-app-v1.yaml` and helper scripts are project-specific examples, not portable defaults or proof of the live configuration. Do not overwrite another project's identifiers, identities or bucket settings blindly.

1. Run the standard suite, real Auth/Firestore suite, production client/server builds and configured cloud build. Inspect upload context for private files. Do not upload SQLite, sample accounts/GPS, source archives or private environment files.
2. Create/choose a Secret Manager secret and numeric version for the authorized key. `scripts/upload-gemini-secret.mjs` imports the locally saved key without placing bytes in command arguments/logs; inspect its fixed project/secret before use. Grant secret access only to the private worker runtime identity.
3. Build an immutable backend image and deploy the worker with the exact project, audience, allowed jobs/identities, private media bucket and explicit model limits. Keep review-only settings. Retain conservative instance/concurrency/request limits.
4. Deploy the compatible API image without the model secret. Give its identity only the required private image-read permission and agent-worker invoker access. Verify health, host/origin checks, guest denial and administrator review before repinning Hosting.
5. If authorized, configure a separate authenticated model Scheduler job. The provided body is `config/agent-scheduler-body.json`; the documented pilot used a two-minute offset (`2-59/5 * * * *`, Asia/Karachi) from source collection. Confirm exact worker URL/audience, identity and retry policy.
6. Inspect genuine interpretations, proposal state and allowance. Only explicit administrator approval may publish; never seed fake live blockades to demonstrate success. Record actual resource revisions and observations in implementation status.

Source and model schedules can be paused independently. During rollback, pause model dispatch/claims, restore a compatible API/worker/Hosting pairing and retain evidence. Code rollback does not undo published restrictions; review/cancel incorrect incidents explicitly. Daily fuel/commute schedules and cloud speech are separate integrations, not consequences of enabling Gemini.

## Operator helpers

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/agent-cloud.ps1 Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/agent-cloud.ps1 Status -IncludeResults
# Writes persisted settings; use only when authorized:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/agent-cloud.ps1 EnableReview
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/agent-cloud.ps1 Disable
```

The helper defaults to `manzil-app-v1` and accepts `-ProjectId`. It obtains the operator token in memory, uses an update-time precondition for settings and never prints the key/token. `-IncludeResults` reads up to 100 notice/result summaries and reports pagination rather than claiming a complete history. Disabling settings does not itself pause Cloud Scheduler; pause/resume the selected job separately.

`scripts/prepare-agent-drafts.ts` is a fixed-project operator backfill: no arguments preview up to ten eligible saved interpretations; `--apply` saves their private proposals with revision checks. It makes no Gemini call or closure write. It can perform bounded place/road lookups and cloud reads, so it is not an offline documentation check.

## Verification

Relevant tests cover strict model parsing, input/output bounds, quota/leases, stale completion, private images, dispatch identity, source/proposal revisions, manual overrides, transit service review and actual UI review behavior. See `tests/gemini.test.ts`, `tests/agent*.test.*`, `tests/pipeline.test.ts` and the separate Firebase integration suite. Report executed results in implementation status; this guide does not certify a current cloud configuration or a live-source outcome.
