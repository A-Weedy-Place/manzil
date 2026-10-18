# Reviewed source reports about bus service

Current publication policy: [automatic road and Metro lifecycle](SELECTIVE_AGENT_PUBLICATION.md). Clear validated events publish automatically; the manual workflow below applies to unresolved events. Unknown source end receives a labelled 48-hour provisional expiry, ended earlier by matching reopening evidence. Metro publication updates Local lines.

This feature-branch follow-up adds a distinct bus-service proposal to the saved Champ Alerts/Gemini review workflow. It does not activate collection, run Gemini, deploy a release or assert that any fixture is a real suspension.

1. A source report about a suspended bus/metro service creates a private **bus service** proposal, without closing car roads.
2. Open the post analysis and **Review bus service**. Check the original evidence; select the actual line and either its entire service or an ordered stop section. Confirm direction and PKT dates.
3. For an unresolved service, an administrator must confirm its scope and approve. A validated automatic decision or that approval makes the existing Local service-notice model grey the affected direction and exclude the affected ride interval from journey planning. A rejection retains its private decision history.

A road restriction intersecting a bus route still produces **uncertainty**, not a claim that the operator suspended service. Selection/focus greys remain a separate visual state. No bus diversion or live vehicle feed is invented.

## Extraction and conservative matching

The existing traffic event can contain optional `service: {route,from,to,scope}`; `scope` is `route`, `segment` or `unknown`. Values are literal source names, not model-generated coordinates, route IDs or stop IDs. Road events use null/absent service. Suspension uses `action: disruption`; explicit resumption can use `reopening`.

Known line names/codes must be unique in the bundled public dataset, appear in the actual quote, and have evidenced Twin Cities location context. Supported aliases cover the named Red, Blue, Green, Orange and airport lines. **EV10 is not guessed to mean EV05110**, and generic “metro closed” does not select every line. Unsupported cities, namesakes, multiple matches and unrecognized codes remain unresolved for manual administrator selection. Aliases are bounded application mapping, not independent operator verification.

Partial sections resolve only when their exact stop names form one unique ordered pair on a known direction. Ambiguous/missing endpoints remain blank. Unknown scope stays unselected in the editor, rather than silently expanding to the whole line. An administrator can explicitly choose another known scope after reading the evidence. Existing source gaps and unavailable/restricted patterns remain unchanged.

Missing publication or unsupported event times remain blank. Same-publication-day model time suggestions retain their review warnings. Automatic suspension uses a supported start and source end or labelled two-day provisional expiry. Manual review asks for a confirmed window. An already ended suspension is rejected on approval. A service resumption needs a unique unchanged current agent notice and an evidenced review time within that notice's window; vague/future resumptions cannot cancel arbitrary notices.

Older saved interpretations can be prepared without another Gemini call. Pending legacy service-as-road proposals are converted on preparation with a new version; approved/rejected history is retained. Approval of a remaining legacy service-as-road proposal is blocked until re-prepared. Existing road proposals continue to use the road geometry and access checks.

## API contract and publication

`POST /api/agent/notices/:id/review` remains **administrator-only**. A transit approval sends:

```json
{
  "noticeRevision": 1,
  "index": 0,
  "version": "<current proposal UUID>",
  "decision": "approve",
  "confirmTransitScope": true,
  "transitDraft": {
    "routeId": "<known public route ID>",
    "title": "Source-reported suspension",
    "description": "Reviewed source details",
    "startsAt": "2026-11-01T17:00:00+05:00",
    "endsAt": "2026-11-01T19:00:00+05:00",
    "status": "published"
  }
}
```

Optional `directionId`, `fromStopId` and `toStopId` use the existing service-notice contract. Section endpoints must both be present, known and ordered on one applicable pattern. Client author/provenance/record IDs are rejected by the strict schema. A service proposal cannot submit a road `draft`; a road proposal cannot submit `transitDraft`. Rejection needs neither draft. Resumption uses the stored target scope/window rather than accepting a replacement line from the client.

`AgentProposal.kind: transit` identifies a partial `transitDraft`, `transitScope`, known `transitCandidates`, target/version/review fields and any unresolved issues. Ordinary road proposals retain the legacy shape. The result records `transitDisruptionIds` separately from `closureIds`; the decision can return `transitDisruption`. Neither a pending proposal nor its source extraction enters public Local availability.

SQLite and Firestore commit the source/proposal decision, version history and shared `transit:disruptions` metadata/revision together. Competing approvals yield one published notice; repeated/stale/archived source decisions fail. Target revisions and newer evidence are checked; manual edits/cancellation set a persistent agent override. Verified contributors/admins can edit current service notices using the normal revision-checked endpoint, without gaining access to private Gemini proposals. Public driving-event revision and car geometry are unchanged by a bus notice. Local checks the independent service revision before retaining a plan.

## Verification and remaining limits

The dedicated synthetic backend suite covers service classification, road/station distinction, conservative line matching, exact partial-stop matching, missing times, source revisions, admin/confirmation/route/stop/window validation, rejection, duplicate approval, grey line status, manual correction and pending legacy conversion. Dedicated component tests cover original evidence, explicit unknown scope, ordered stops, network failures, submit deduplication, StrictMode/late response isolation, account/unmount safety, Urdu labels and separate preview.

An isolated real Auth/Firestore emulator case exercises two concurrent administrator API approvals, ordinary-user denial, exactly one service revision/decision and no car-road record. This is local test evidence; see the consolidated [implementation status](../IMPLEMENTATION_STATUS.md) for the actual latest execution result, build checks and browser observations. No production suspension or model generation was performed for these tests.

Matching is limited to the committed public Twin Cities lines and at most the existing three extracted events per post. General nationwide service-alert identifiers, bulk multi-line selection, operator feeds and automatic confirmation are outside this MVP. Fares, walking access, calendars, unresolved road sections and transit data age retain their existing limitations.
