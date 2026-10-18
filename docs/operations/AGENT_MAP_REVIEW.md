# Agent-prepared map proposals

Every agent map action requires an **administrator approval or rejection**. Collection, model interpretation and proposal preparation are separate steps. A private draft, preview, saved analysis or refreshed result has no routing effect.

Road restrictions and public-transport suspensions use distinct proposal types. A metro suspension does not imply that private-car roads are closed. [Bus-service review](AGENT_TRANSIT_REVIEW.md), [model operations](GEMINI_INTEGRATION.md), [current implementation/release status](../IMPLEMENTATION_STATUS.md).

## Administrator flow

1. Open **Pipelines** or **Review queue** and select a post. Its original evidence, Gemini analysis, tool log and map outcome open in an adjacent detail panel rather than beneath the list.
2. Compare the original text/images and bilingual interpretation. Each relevant event has its own private proposal. An older saved interpretation can prepare proposals without rerunning Gemini.
3. Select **Review on map**. For a road event, the editor receives supported title, reason, notes/source, PKT time fields and resolved drawing/geometry. For a service event, the separate reviewer confirms the imported line, direction/stop scope and schedule.
4. Resolve missing fields and check the actual road extent. Unknown start stays blank; unknown end remains unknown. An indefinite road closure needs explicit acknowledgement; disruption/uncertain access needs explicit confirmation of an actual restriction. Do not approve a landmark review pin as proof of a whole closed road.
5. **Approve and add to map** atomically records the decision and publishes the validated restriction. **Reject proposal** records rejection without a map change. Closing the editor leaves the proposal pending. Editing a preview never approves it.
6. An explicit reopening previews its matched incident and uses **Approve reopening**. Approval cancels that incident while retaining history. Future-dated, stale, cancelled, corrected or unmatched targets cannot be reopened through that proposal.

Verified community contributors may review eligible community reports but are denied these Gemini administration endpoints. Review queue includes both report sources without merging their authority rules. Current review counts cover up to 150 loaded posts; multiple unresolved events count as one post until the last decision. Archived/stale-source/fully decided proposals do not count as pending. [Admin workspace](../guides/ADMIN_WORKSPACE.md).

## Mapping boundaries

Gemini supplies names, not trusted coordinates. Mapping uses one supplied Pakistani city, named road and source endpoint/point references. There is no Islamabad city allowlist. Production resolves references within that city, then uses the bundled or bounded on-demand access-filtered OSM graph. Exact road names and connected endpoints remain required; similarly named roads in another city cannot be substituted.

A precise named point must resolve near the supported named road. When road mapping fails, a uniquely matching landmark in the stated city may provide a labelled **review pin**. It is not a surveyed obstruction, closed-road extent or invented straight corridor. City centroids, ambiguous cities, distant namesakes and unsupported roads are not substituted. Uncached lookup adds provider latency and can fail explicitly. [Road sources, budgets and privacy](../reference/ROAD_COVERAGE.md).

Unknown geography remains unplaced while retaining source text/reason for manual selection. Source-supported date/clock checks prefill directly. A saved model time on a known original publication date may prefill only as a labelled AI suggestion requiring confirmation. Unknown time basis/publication context or unsupported different-day estimates remain blank. Unknown expiry is never silently replaced with an hour from now. Fuel announcements stay unconfirmed; irrelevant notices do not become restrictions.

## Private persistence and atomic decisions

`AgentResult.proposals` stores per-event version/state, partial draft, mapping method, issues/tool steps, target incident/revision and decision actor/time. It lives in private result/source-version metadata in SQLite or Firestore. Incomplete proposals are not closure records and never enter public routing snapshots.

| Endpoint | Contract |
| --- | --- |
| `POST /api/agent/notices/:id/prepare` | `{revision}`; reuse current proposals/decisions or prepare from saved extraction. No model generation. |
| `POST /api/agent/notices/:id/refine` | `{revision}`; bounded eligible geographic retry from saved extraction. |
| `POST /api/agent/notices/:id/review` | `{noticeRevision,index,version,decision}`; approval additionally needs the appropriate complete road/transit draft and required confirmation fields, except reopening uses its stored target. |
| `GET /api/agent/status` | Safe execution/configuration/queue/allowance, processing/backoff and saved progress. |
| `POST /api/agent/run` | Strictly `{}`; deliberately run an eligible batch locally or dispatch the configured private worker. |
| `PATCH /api/agent/settings` | Explicit enabled/review settings; `autoPublish:true` is rejected. |

Road approval requires `confirmRestriction:true` for uncertain disruption/access and `confirmUnknownEnd:true` for null expiry. Transit approval uses `transitDraft`/`confirmTransitScope` and its separate scope/time validation. Reopening uses the stored target; see [full API](../reference/API.md) for exact shapes.

Transactions recheck source revision/status, interpretation claim, proposal version/pending state, target revision and manual overrides before recording the decision and map revision. Concurrent/repeated approval yields one change. Stale edits/archive or an intervening correction need fresh review. Provenance uses known source timestamps; unknown publication is never relabelled as collection time.

Administrator edits/cancellation in **Closures** retain override precedence. A new source version can create a new private proposal but cannot silently rewrite the public map. Already decided proposals retain history. The full correction-history browser and explicit override-reset interface remain separate work.

## Progress and bounded retry

**Fetch latest posts** collects evidence only. **Run Gemini now** analyses at most two eligible waiting posts using the same queue/limits as scheduled work. A disabled button can indicate pause, missing configuration, empty queue, active batch, cooldown or exhausted allowance. Source and model schedules are independent when enabled; their existence/activation must be verified separately.

**Refresh results** and saved-state polling never invoke Gemini. Visible-page polling is roughly four seconds while processing and fifteen seconds while idle. Account/unmount/request guards prevent old results replacing newer decisions.

Tool logs record actual preparation steps, not hidden model reasoning: interpretation availability, road lookup, landmark fallback where attempted, incident matching, time checks and draft preparation. Older results may lack logs. Unique matching current agent incidents can become update/reopening proposals; ambiguous matches and manual overrides remain protected.

Eligible unresolved mapping needs a precise landmark or road plus two endpoints. **Retry map tools** has a fifteen-minute cooldown and a maximum of three attempts. An idle worker sweep considers only the latest thirty notices and handles at most one eligible saved notice per fifteen minutes. Fingerprint/version checks protect concurrent decisions, including failed retries. Vague locations remain for manual input.

## Production manual trigger configuration

The API's `AGENT_WORKER_URL` must be the exact private Cloud Run origin. The worker's `WORKER_MANUAL_SERVICE_ACCOUNT_EMAIL` must be the API runtime identity in the same project. Grant that identity `roles/run.invoker` on this worker only. The worker validates audience, verified workload email and `job=agent`; this identity cannot invoke source/fuel/commute jobs. The API receives no model key or Secret Manager access.

The supported long-request settings are API 180 seconds, private dispatch 140 seconds, worker 150 seconds and browser run 170 seconds. Hosting's documented [Cloud Run integration timeout](https://firebase.google.com/docs/hosting/cloud-run) can interrupt a long analysis rewrite, so the cloud build supports `VITE_AGENT_RUN_ORIGIN` as the exact **public authenticated API** origin. Only `/agent/run` uses it; runtime project/auth/storage is checked without a token before credentials are sent. Host/origin/CORS/role checks still apply. Other requests use Hosting pinning; deployments and rollback must keep the direct API compatible with the hosted client. Local/emulator runs remain same-origin.

An API without configured dispatch returns HTTP 409 for manual production analysis, while a separately configured scheduler can still work. Transport failures return a sanitized 503; refresh saved progress before retrying because a timed-out request does not prove the worker made no progress.

## Operator boundary and verification

Preparation uses existing saved extraction plus bounded map/provider reads, not another Gemini call. `scripts/prepare-agent-drafts.ts` is a fixed-project operator tool: preview at most ten eligible existing interpretations; `--apply` saves private proposals only. Inspect its target and obtain applicable authorization before use. Keep model keys worker-only and review mode enforced through deployment/rollback.

Tests cover source/claim/proposal/target races, duplicate decisions, stale mapping results, confirmation fields, manual overrides, private image access, service scope and UI editor behavior. Report actual executed suites and browser checks in implementation status. This document does not establish live worker settings, source completeness or production map publication.
