# Manzil development and deployment handoff

Agreed with the owner on 17 October 2026.

## At a glance

1. **Feature branch:** `codex/feature-development`, starting from `main` commit `34e9e4a`.
2. **Owner and assistant:** implement requested features and fixes, test locally, update documentation and push commits to this branch.
3. **Other developer:** handle deployment issues, integrate agreed changes into `main` and release to https://manzil-app-v1.web.app.
4. **Next work:** the owner will supply the next specific feature. The full product inventory stays in [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) and [the original plan](../ISLAMABAD_COMMUTE_PROJECT_PLAN.md).

## Feature work

- Fetch GitHub before starting a change. Merge relevant incoming `origin/main` updates into this branch, resolving conflicts while preserving both developers' changes.
- Keep local standalone and Firebase-emulator workflows available. Preserve verified authentication, UID isolation, closure/time/access validation and explicit unavailable routes.
- Implement the owner's requested scope and verify it locally before handing it over. Existing features listed in project context are not automatically new tasks for this branch.
- Run meaningful routing/API tests for affected behavior and the production type/build check for application changes. Include emulator integration checks for authentication/storage changes. Documentation-only commits use documentation review and `git diff --check`.
- Update [implementation status](IMPLEMENTATION_STATUS.md) and relevant API/routing/source documentation with actual results and limitations.
- Commit and push to `codex/feature-development`. Leave `main` integration and deployment to the other developer unless the owner directs otherwise. Preserve local databases, traces, keys, source archives and browser credentials outside Git.

If a push is rejected because the remote branch advanced, fetch and reconcile those commits before pushing again; do not overwrite the other developer's work with a force push.

## What accompanies a handoff

For each completed feature, record:

| Item | Information for the other developer |
| --- | --- |
| Source | Branch and exact commit(s) |
| Behavior | What changed and how to exercise it |
| Verification | Tests/builds actually run, their results and any missing verification |
| Setup | Dependency, environment, Firestore rules/indexes or data-migration requirements; explicitly say when none are required |
| Boundaries | Known limitations, feature flags and future work |

The developer can fetch the branch and review its changes against `main` without reimplementing the features:

```sh
git fetch origin
git log --oneline origin/main..origin/codex/feature-development
git diff origin/main...origin/codex/feature-development
```

They should preserve their own local changes, integrate the agreed branch commits and verify the combined checkout before release. Pulling `main` alone does not include feature-branch commits until those commits have been merged.

## Releases remain a separate step

The repository currently documents manual deployment and has no tracked GitHub Actions deployment workflow. A push stores source in GitHub; it does not by itself publish a new website under this documented setup. Any externally configured trigger must be checked separately before relying on that assumption.

The deployment developer follows [FIRST_DEPLOYMENT.md](FIRST_DEPLOYMENT.md) and records the exact source commit, Cloud Run revision and Hosting release. Hosting uses `pinTag: true`: after a backend update, republish Hosting so its API pin points to the tested revision. Frontend builds must use the cloud configuration; deploy changed database rules/indexes when applicable.

This branch setup performs no deployment, cloud configuration change, data migration or paid-service activation. Gemini reasoning remains a later integration owned by the user. All existing product features and future directions remain documented in project context.
