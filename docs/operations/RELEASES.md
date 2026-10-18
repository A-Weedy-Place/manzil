# Hosted releases and source publication

## Current integrated release - 18 October 2026

PR #4 is merged at 33b5af5; final frontend correction f4a1460 is deployed. API 00016-zll, worker 00013-2g6, Hosting a55c56530ffd0f97 and pin fh-5a3d9adde787598e. [Current release evidence](../IMPLEMENTATION_STATUS.md) records image digest, focused tests, live checks and limitations. The v0.1.0 tag below remains immutable and identifies its older source; it was not moved to this release.

A GitHub release records an exact source snapshot and links to the hosted app. It does not deploy a frontend/backend, synchronize branches or change repository visibility.

## v0.1.0 — Hosted MVP

| Item | Evidence |
| --- | --- |
| App | [manzil-app-v1.web.app](https://manzil-app-v1.web.app) |
| GitHub release | [v0.1.0](https://github.com/A-Weedy-Place/manzil/releases/tag/v0.1.0), marked as an MVP prerelease |
| Licence/notice source | [`0beb849`](https://github.com/A-Weedy-Place/manzil/commit/0beb849f3cedc0f05ce54f6a9ec4cec49072b4ad); supplemental assets accompany the older application tag |
| Application source | [`8702fb9d0b5262b5d40953d5ed0dfab464343567`](https://github.com/A-Weedy-Place/manzil/commit/8702fb9d0b5262b5d40953d5ed0dfab464343567) |
| Teammate's deployment record | [`2c893e2`](https://github.com/A-Weedy-Place/manzil/blob/2c893e2822bb3837f7dfeb48d88f47c594e26bf2/docs/IMPLEMENTATION_STATUS.md) |
| API / worker revisions | Recorded `manzil-api-00015-7cr` / `manzil-source-worker-00012-t2z` |
| Hosting version / API pin | Recorded `208bbe9aa098303b` / `fh-208bbe9aa098303b` |
| Current frontend check, 18 October 2026 | HTML serves `index-CsCJEhcH.js` and `index-Dm9a5i2i.css`, matching the record; Last-Modified 17:43 PKT |
| Public API check | `/api/health` returned 200, Firestore persistence and the road graph ready |

The frontend fingerprint and public health were checked read-only. Exact cloud revision/pin/settings details come from the teammate's committed deployment record; this task did not independently authenticate to Cloud Run/Firebase administration or change cloud resources. Hosting source/revisions can change after this observation.

### Version and policy distinction

The recorded release includes daily PSO fuel checks, English/Urdu Cloud speech and selective high-confidence agent publication. Those are the release line's recorded settings/behavior. The later integration extends selective automatic publication; consult current implementation status for its deployment boundary. Its full README feature list and later development work must not be represented as an identical deployed snapshot.

No model call, source collection, closure publication, deployment, role mutation or policy change is performed by documenting or tagging this release. Review the actual merged code, settings and owner-approved publication policy before another deployment.

### Licence supplements for an older tag

The deployed `8702fb9` snapshot predates the new `LICENSE` and `THIRD_PARTY_NOTICES.md`. Its automatic GitHub ZIP/tarball therefore does not contain those new files. The release supplies those two files as separate assets and identifies the licensing-document commit in its notes. Download/retain them alongside the source; downstream distributions must retain applicable notices.

The MIT grant covers Manzil's original application code/documentation, including the project-owned code in this deployed snapshot. It does not relicense third-party data, artwork, services or trademarks. See [licence](../../LICENSE) and [third-party notices](../../THIRD_PARTY_NOTICES.md). The unresolved Survey of Pakistan-derived outline and PakBus permission boundaries also apply to historical snapshots.

## Creating the next release

1. Integrate/review the intended source with the release developer. Preserve other developers' work and verify the combined checkout.
2. Follow [deployment](DEPLOYMENT.md), when separately authorized. Record the immutable application commit, image/revisions, Hosting version/API pin, configuration changes and actual verification.
3. Match the deployed frontend fingerprint and public health to that record. If the mapping is unknown, use an explicitly unverified/draft record rather than label a guessed commit as live.
4. Prepare release notes with the app link, exact source, implemented features, material limitations, licence/data scope and differences from unreleased branches. Include required notices in packaged distributions.
5. Check existing tags/releases and tracked automation. Create a new tag at the exact deployed commit; never move an existing release tag to another source silently. GitHub's release archive follows the tag, not the latest default branch.

Example for a new reviewed version; replace placeholders rather than repeating the historical release:

```sh
gh release list --repo A-Weedy-Place/manzil
gh release create VERSION --repo A-Weedy-Place/manzil \
  --target EXACT_DEPLOYED_COMMIT --title "Manzil VERSION" \
  --notes-file PATH_TO_REVIEWED_NOTES --prerelease
```

Use a stable release designation only when that reflects the intended support/quality level. Record what was actually checked; do not imply physical GPS validation, full X coverage, live bus tracking or current operator fares from fixture tests.

## Before changing repository visibility

The owner plans public distribution; this task prepares licensing/release metadata without changing visibility or merging `main`.

- Original software uses MIT. Preserve the [third-party terms](../../THIRD_PARTY_NOTICES.md), notably PakBus's noncommercial permission, ODbL/CC BY obligations and unresolved outline redistribution permission. Resolve the outline through permission or replacement before public redistribution; do not claim every bundled asset is MIT. Historical commits and the older release tag retain copies, so replacing only the latest file does not clear those copies. Coordinate any history/tag removal with the owner rather than rewriting shared history implicitly.
- A targeted audit found no matching secret-token/private-key patterns or tracked private runtime/database/source-archive paths across the 57 commits reachable during review. It examined 1,338 text blobs. This is bounded evidence, not proof that every possible secret or external record was inspected.
- Keep credentials, account exports, precise traces and raw source evidence ignored. Public Firebase project IDs/service URLs are identifiers, not model/admin credentials. Never publish local `.env` or ADC files.
- Read [security reporting](../../SECURITY.md). When the repository becomes public, the owner can enable GitHub private vulnerability reporting and review the repository's public contact/security settings.
- Check that the intended licence/README commit is integrated into the default branch: a feature-branch licence does not automatically appear on `main`. GitHub visibility and npm `private: true` are independent; retain the latter to prevent accidental npm publication.

References: [GitHub licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository), [GitHub releases and tags](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).
