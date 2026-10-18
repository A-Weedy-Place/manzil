# Source ingestion

The implemented source is the signed-out public [Champ Alerts profile on X](https://x.com/shaheryarhassan). Collection is best effort and always reports **partial coverage**. It does not require a paid API, browser executable, login session or cookies, and it does not bypass access controls. A failed or empty preview never proves that roads are clear.

[Implementation status](../IMPLEMENTATION_STATUS.md) records release and activation evidence. [Source operations](DEPLOYMENT.md) describes deployment; [Gemini operations](GEMINI_INTEGRATION.md) describes the separate consumer.

## Collection and normalization

| Stage | Implemented behavior |
| --- | --- |
| Public fetch | Fixed HTTPS profile and at most four recent canonical detail pages; no arbitrary URL fetching, browser scripts or alternate-source fallback. |
| Parser | parse5; classic tweet/time markup and supported server-rendered text/formatter data. Formatter JSON is parsed as data, never executed. |
| Bounds | At most 2 MB per response, 35 top-level articles, 35-second collection deadline and 15-second request deadlines. |
| Access failure | Redirects, 401/403/429 and unsupported responses stop or limit work, retaining diagnostics and existing records. No challenge solving or impersonated browser identity. |
| Eligibility | Normally preceding 24 hours. Older known-publication posts up to seven days need an explicit date/future hint. Date hints identify candidates, not active closures. |
| Timestamps | Original `publishedAt`, displayed/edit `sourceTimestamp` and retrieval time stay distinct. An edit-only timestamp never becomes original publication. |
| Deduplication | Canonical source ID plus normalized content hash; changed evidence gets a revision/history and supersedes stale pending work. An established publication time survives later edit-only observations. |
| Provenance | Fixed author/canonical links, bounded text/media references, content state and observed diagnostics. Foreign authors, quoted articles, conflicting times and unsupported media URLs are rejected. |

Profile-only ambiguous dates are not queued as established publication. Old pinned posts do not displace the bounded recent-detail checks. Eligible edit-only evidence can be stored with original publication unknown for explicit later review.

The public preview may miss bursts, older edits/deletions, truncation and events while offline. The highest observed ID is an observation, not a complete cursor. Last success requires accepted eligible evidence. Run summaries are bounded to 100; notice/source versions remain durable.

## Cadence and runtime

The shared contract is **five minutes** (`shared/source.ts`). The persisted next check follows clock slots; delayed dispatch does not continually slide the cadence. A 180-second durable lease and in-process coalescing protect overlapping checks.

| Mode | Execution |
| --- | --- |
| Standalone | A loopback API timer checks due work every 30 seconds and once after startup; actual fetches obey enabled state and the five-minute persisted deadline. |
| Emulator | The local authenticated worker/runner invokes due work. The provided launcher initially disables source collection; manual imports remain available. |
| Production | A separately authenticated private Cloud Run worker receives external Scheduler ticks. The production API starts no source polling timer. |

`X_SCRAPER_ENABLED` supplies the initial setting for a new store; persisted settings control later checks. Profile and interval are fixed: `X_PROFILE_URL` and `X_POLL_MINUTES` do not retarget or accelerate this collector. A configured worker/job is not proof that the deployed schedule is currently enabled; verify authorized operational state separately.

## Evidence images

The collector first normalizes text and public media references. When a media archiver is configured, a separate bounded step downloads supported images from the exact accepted public `pbs.twimg.com` media/thumbnail paths and stores them privately. Image availability does not rewrite notice revision/status.

The archive accepts bounded raster evidence, records MIME/length/SHA-256 and expiry, and retries failed writes with cooldown. Cloud evidence uses an immutable private object path and seven-day expiry metadata; bucket lifecycle deletion is separately configured and asynchronous. Video thumbnails remain labelled as thumbnails, not full videos.

Gemini may interpret up to two validated retained images through the private worker. Neither an image nor its interpretation independently establishes location, capture time or an active restriction. [Image boundaries and model limits](GEMINI_INTEGRATION.md), [private bucket operations](DEPLOYMENT.md).

## Manual intake and review

An administrator can use the manual-notice form or `POST /api/notices` with text, optional evidence URL and original publication time. The URL is stored as evidence, not fetched. Reusing a URL updates that notice's revision when submitted content changes; without one, identical text/timestamp deduplicates by hash.

`GET /api/agent/outbox` exposes the current pending queue to authorized administrators. `PATCH /api/notices/:id` marks a notice `reviewed`, `dismissed` or `pending_agent`. The model consumer implements durable claims, limits and structured results separately; this outbox endpoint itself is not a lease/claim API.

Collection alone never creates a map restriction. Interpretation prepares private road or transit-service proposals; clear events publish automatically after source/map/time checks; unresolved changes require administrator decisions. Source/proposal/target revision checks protect both paths. `reviewed` means the notice was processed, not independently confirmed by a human. See [review workflow](AGENT_MAP_REVIEW.md).

## Local tools

```powershell
# Public access diagnostics; no application database writes:
npm.cmd run source:probe
# Explicitly collect into the configured non-production store:
npm.cmd run source:check
# Optional probe-only local image download:
npm.cmd run source:probe -- --download-images
```

These commands access the external source and should be run deliberately, not as routine unit tests. `source:check` rejects production mode; cloud collection uses the authenticated worker.

Plain `source:probe` reports IDs, known/unknown publication times, timestamp kind, text/media counts and status, without full post bodies or application writes. Exit code 2 means blocked/error or no eligible posts, not a complete empty feed. `source:check` deliberately writes normal notice intake and reports status/counts.

The optional image flag writes a unique ignored `data/source-probes/` directory plus a manifest linking files to source IDs/URLs, MIME/length and hashes. Up to eight distinct images, 5 MB each, 15-second request and 45-second batch deadlines apply. MIME/signature checks accept JPEG/PNG/WebP/GIF without certifying image content; redirects, credentials, SVG and non-images are rejected. Denial/rate limiting stops further downloads. Failed/skipped images are explicit. `applicationDataWritten:false` does not mean this optional mode writes no local files.

Standalone SQLite is trusted single-user storage. Firebase modes enforce administrator source/notice access and private personal scopes. Keep databases, downloaded source archives, environment secrets and browser/session data out of Git/container uploads. Installing Chromium or changing unused browser executable variables cannot repair denied HTTPS or changed markup.

## Development and verification

Key implementation files are `server/source.ts`, `source-html.ts`, `source-media.ts`, `source-archive.ts`, `shared/source.ts` and both repository adapters. Tests in `tests/source*.test.ts` exercise parsing, timestamps, candidate bounds, failures, deduplication, image guards, leases and storage. Review/worker tests verify authorization separately.

Use deterministic injected fixtures in ordinary tests. Report any real source probe with its date and observed scope; a successful small preview is not proof of complete continuous delivery. Recorded release observations belong in implementation status/history, rather than becoming permanent claims about current X access.
