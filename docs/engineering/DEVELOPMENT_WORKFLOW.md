# Development and release handoff

Feature development, Git integration and hosted releases are separate steps. Keep both developers' work reviewable and preserve local/private data. The active product inventory and tested state are in [project context](../../PROJECT_CONTEXT.md) and [implementation status](../IMPLEMENTATION_STATUS.md).

## Branch workflow

1. Inspect the current branch, worktree changes and attached worktrees before editing. Preserve unrelated local work.
2. Fetch the remote and inspect incoming commits. Integrate updates only within the requested scope; resolve conflicts without dropping either developer's features.
3. Implement and test locally, update the relevant docs, then commit/push the agreed private feature branch. `codex/feature-development` is the existing feature handoff branch; new agent branches normally use `codex/` names.
4. Leave main integration and deployment to the release developer unless the owner authorizes them explicitly. A branch push does not itself merge source or configure services.

If a push is rejected because the remote advanced, fetch and reconcile it. Do not force-push over another developer's work. Never commit databases, GPS, raw source archives, browser profiles, session credentials, reset codes or environment secrets.

## Implementation requirements

- Preserve standalone and Auth/Firestore emulator development modes. Standalone SQLite has one trusted local identity; emulators establish actual role/UID checks.
- Use GeoJSON **[longitude, latitude]** throughout domain/API contracts; scheduling uses **Asia/Karachi**.
- Retain road access, selected-time closure validation, explicit unavailable results and revision/atomic-write guards.
- Community review and private agent review are separate. Verified contributors may review community reports; **every Gemini road/service mutation requires administrator approval**.
- Keep source/model/proposal/publication states distinct. Unknown times/geometry/fares/service status are not synthetic live data.
- Do not activate source/model/cloud/paid services, alter production roles or migrate local data as an incidental feature step.

[Local development](LOCAL_DEVELOPMENT.md), [environment configuration](../operations/CONFIGURATION.md), [API](../reference/API.md), [agent review](../operations/AGENT_MAP_REVIEW.md).

## Verification by change

| Change | Required evidence |
| --- | --- |
| Application behavior | Meaningful affected routing/API/UI tests plus production type/build check |
| Authentication/storage/permissions | Relevant standard tests and isolated Auth/Firestore emulator integration checks |
| UI/layout | Actual browser flow and applicable phone/RTL/accessibility checks; no substituted screenshots as behavioral proof |
| Provider/source/data import | Bounded provenance, unavailable states, deterministic import/validation tests and explicit network checks only when authorized |
| Documentation only | Current-code/config review, documentation links/checker and `git diff --check` |

Record what actually ran and any unverified boundary. Synthetic fixtures do not prove hardware GPS, mailbox delivery, operator bus service, live traffic or cloud model outcomes. Do not rerun external collection/model jobs merely to create a passing status.

## Handoff record

| Item | Include |
| --- | --- |
| Source | Branch and exact commit(s) |
| Behavior | What changed and how to exercise it |
| Verification | Executed tests/builds/browser flows, results and missing checks |
| Setup | Dependency/environment/rules/indexes/data requirements, or explicitly none |
| Boundaries | Remaining limitations, flags, inactive integrations and release work |

The release developer can inspect a feature branch before merging:

```sh
git fetch origin
git log --oneline origin/main..origin/codex/feature-development
git diff origin/main...origin/codex/feature-development
```

Preserve the release checkout's local changes and verify the combined source after integration. Pulling main does not include unmerged feature commits. A successful feature-branch build is not a verification of a later combined/deployed revision.

## Hosted releases

Follow [deployment](../operations/DEPLOYMENT.md) and [configuration](../operations/CONFIGURATION.md). The tracked setup documents manual Firebase Hosting/Cloud Run deployment; check for externally configured triggers before assuming a push has no release effect. Do not deploy without owner authorization.

Record exact source, API/worker revisions and Hosting release in the deployment evidence. Hosting uses `pinTag:true`: republish Hosting after a backend update so its API pin targets the intended tested revision. Use the cloud build configuration and deploy changed rules/indexes when applicable. Private worker identity, Secret Manager access and source/model schedules must retain their reviewed boundaries. Existing source/Gemini integrations are implemented; cloud speech and daily fuel/commute production scheduling remain separately configured features rather than implied services.

Local SQLite/GPS/sample data is never an implicit migration input. Release verification must not create customer data, approve a real blockade or call the model unless those actions are separately intended and authorized.
