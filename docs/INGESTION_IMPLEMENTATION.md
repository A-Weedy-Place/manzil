# Source ingestion implementation

The implemented source is the signed-out public profile **[Champ Alerts on X](https://x.com/shaheryarhassan)**. This is a best-effort, zero-paid-API browser collector. **It cannot promise all posts or continuous real-time coverage.** X may show a login wall, error, rate limit, unsupported-browser page, or incomplete history to an ordinary visitor. The app displays that state. A failed check never means there are no closures.

## What runs

1. The local API starts independently of collection. If the persisted next-check deadline is overdue, one check starts in the background. Otherwise it waits until due.
2. Every 30 seconds the server checks whether the persisted 15-minute source deadline is due. It does not collect every 30 seconds. A database lease prevents simultaneous collector instances, including `npm run source:check`, from opening multiple source browsers. Missed intervals while the computer is off are not reconstructible from this feed.
3. Playwright uses an installed Chrome, Edge, or Chromium executable with a **new signed-out context**. It does not read your existing browser profile, WhatsApp session, cookies, or account. No browser download happens automatically. Set `BROWSER_EXECUTABLE_PATH` if automatic detection cannot find one (`MANZIL_BROWSER_EXECUTABLE` is also accepted).
4. It inspects at most three public profile viewport passes, each limited to 35 visible article nodes, and at most three canonical visible post links for fuller text. Browser navigation and the run have bounded timeouts, approximately 45 seconds total. It never clicks login or challenge controls, uses a proxy or stealth tool, or attempts an access-control bypass.
5. Only canonical status URLs by `shaheryarhassan`, visible text or media references, and a real publication timestamp are accepted. Media-only posts keep their original empty text and are marked `contentState: media_only`; visibly shortened text is marked `possibly_truncated`. Reposts from another author and timestamps missing from the page are skipped. Referenced public media URLs may be saved, but images/videos are neither downloaded nor OCR-processed. Permalink expansion prioritizes eligible recent posts rather than old pinned posts.
6. Raw posts within the previous 24 hours are retained. A visible post up to seven days old can also enter review when its text contains an explicit date/day hint such as “tomorrow” or a written date, so a future closure announcement is not discarded solely for being posted yesterday. These hints are deliberately permissive; **they do not establish that the date is future or that a road is closed**. The future agent must resolve the original publication time, event time, place, ambiguity, edits, and cancellation.
7. Accepted evidence is saved as a `SourceNotice` with original publication time, retrieval time, canonical ID/URL, visible text, media references, a content hash, and revision. Missing publication times are never replaced with the retrieval time. Same ID and same hash do nothing; changed visible content creates another version and supersedes the previous pending job.
8. The notice revision and `pending_agent` outbox job commit in one SQLite transaction. No Gemini request, extraction, closure publication, messaging, or GPS interpretation occurs here. Your agent can consume the queue later.

The source status is always `coverage: partial`, including checks that collect posts. `lastSuccessAt` means at least one timestamped public post was visible during a check, rather than a claim that the entire timeline was captured or that a new post existed. A durable coverage record stores observed count, highest visible status ID, date-window skips, and change count. This is observation metadata, not a complete timeline cursor. A maximum of 100 source-run summaries are retained; post versions and pending evidence persist in SQLite until explicitly managed.

The scheduler only runs while the local backend process and machine are running. Blocking or network failure is recorded and retried on the normal 15-minute schedule. It does not retry rapidly, log in, switch to an unofficial mirror, or fall back to scraping private messages. Turning the source off stops future automatic checks; a deliberately requested manual check still works. If disabled during an active check, that already-started check may finish and save its publicly visible evidence.

## Manual fallback and agent handoff

Use the app's manual-notice form or `POST /api/notices` to paste a public advisory with an optional source link and original timestamp. The server stores the URL as evidence and does not fetch arbitrary URLs. Reusing a URL updates that notice's revision when the submitted content changes. Without a URL, an identical text/timestamp pair deduplicates by content hash.

The same durable queue is available at `GET /api/agent/outbox`. After handling a notice, use `PATCH /api/notices/:id` with `reviewed` or `dismissed`; use `pending_agent` to reopen it. Only the newest revision remains pending. For the first agent integration, use one worker and recheck notice revision immediately before publishing. This endpoint does not yet implement worker claims, leases, exactly-once execution, extraction output schemas, or automatic rollback of closures created from earlier notice revisions.

Before any extracted closure can affect routes, the future integration should validate a structured result, resolve time in Islamabad, map a bounded road segment, handle uncertainty and conflicts, and explicitly create a draft or a reviewed published closure through the API. Keep original notice provenance. A prompt alone is insufficient to guarantee those checks. The current manual closure editor and saved-journey logic work when automatic source collection is unavailable.

## Local operation

- Start the full app with `npm run dev`; the API stores `data/manzil.sqlite` plus its WAL/SHM files. `MANZIL_DATA_DIR` or `MANZIL_DB_PATH` can change the location.
- Run one explicit collection with `npm run source:check`. It prints status/counts, never complete raw post bodies or personal phone data. A nonzero exit means the source was blocked or failed; the database and manual workflow remain usable.
- `X_SCRAPER_ENABLED=false` sets the initial state for a new database; the UI's source setting is persisted afterward. The implemented profile and 15-minute interval are fixed; changing `X_PROFILE_URL` or `X_POLL_MINUTES` does not retarget or accelerate collection.
- Do not commit the database or `.env`. This unauthenticated app is intended only for one trusted local user. There is no production identity, multi-user data separation, hosted scheduler, push delivery, or consent-management service yet.

If the installed browser cannot start, you can optionally install the official Playwright browser inside the workspace using PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.playwright'
npx playwright-core install chromium
```

The collector detects `.playwright/chromium-*` before standard system browsers. This downloads a browser only when explicitly requested; it never copies a personal browser profile. Keep `.playwright/` ignored in Git. A successful browser launch does not guarantee that X will make posts available to a signed-out visitor.

## Honest limitations to demonstrate

The public DOM can change without notice; text can be truncated, older or fast-arriving posts missed, and a publication can disappear between checks. Date hints are not semantic extraction. Images and video may contain essential route information that this version cannot read. A 15-minute polling interval adds detection latency even when access works. There is no assurance of recovering events while offline. Show source freshness and an explicit coverage warning in the demo, keep a manual import path, and never label a stale or unobserved feed as fully live.
