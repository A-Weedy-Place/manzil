# Champ Alerts: timely ingestion without a paid subscription

Research checked 14 October 2026, Asia/Karachi. This updates the source-access decision in [Manzil's architecture](MANZIL_ARCHITECTURE.md). The user does not want to buy a subscription; the initial plan should also support a zero-purchase route. No account, credit entitlement, live collector or notification bridge has been configured or tested end to end.

## 1 Read this first

1. **Recent Champ posts really were readable without login.** An ordinary browser opened the public X profile, showed recent posts from today and opened an individual alert. A simple HTTP research fetch returned 403. These are different access results, not evidence that public reading always requires login.
2. **The public timeline exposed only a limited preview in this test.** It showed an old pinned post and four recent posts; scrolling reached a “full profile” sign-in prompt. It did not establish access to all today's posts or reliable continuous collection.
3. **A structured hackathon option may cost nothing:** eligible X accounts can receive a one-time $20 API credit without buying credits. Section 3.1 gives the card/eligibility conditions. If access is established, test Activity API webhooks for prompt new-post delivery, with timeline catch-up.
4. **There are genuine unofficial WhatsApp Channel readers.** whatsapp-web.js and Baileys expose Channel/newsletter retrieval methods through a linked account. They are free source libraries, not supported Meta APIs, and have account/reliability risks. Section 9 gives the bounded experiment; Android notification forwarding is a separate fallback.
5. **The strongest ongoing zero-X-cost feed is publisher cooperation:** Champ sends original notices to our authenticated webhook or publishes them to an agreed Sheet/Telegram feed. No existing official Champ RSS/Telegram feed has been verified.
6. **Always retain paste/share/image import.** The downstream Gemini, review, scheduling, rerouting and commute-alert system is the same for every intake method.

**A verified alternative outside social platforms is APP's public RSS feed**, which contained an Islamabad Traffic Police advisory during this check. Use it as an initial automated source alongside deliberate Champ import; test a linked-account WhatsApp adapter separately. API credits are temporary and the other experimental connectors are unproven; none establishes every city event immediately.

## 2 What was actually observed

| Surface | Observation on 14 October | What it establishes |
| --- | --- | --- |
| [Public X profile](https://x.com/shaheryarhassan) in an ordinary browser without signing in | Pinned September 2023 post, then four recent posts labelled 5m, 59m and 1h. Current notices explicitly dated 14/10/26. Login/signup controls remained visible. | Public recent-post discovery worked in this browser session. It is not a 24-hour feed or unattended collector test. |
| Same profile through the research HTTP fetcher | 403 response | That fetch method failed. It does not invalidate the browser result. |
| Profile after scrolling | “See Shaheryar Hassan's full profile” and a sign-in link; no additional older notices in the observed preview | Today's complete history was not accessible through the tested preview. |
| [Individual M1 alert](https://x.com/shaheryarhassan/status/2110409886219784691) | Full text of an M1 accident/congestion notice, plus displayed publication time 9:38 PM, October 14, 2026. The text itself reports conditions at 9:20 PM. | Individual post reading worked. Publication time, reported observation time and collection time must be separate fields. A jam is not automatically a full closure. |
| [WhatsApp Channel](https://www.whatsapp.com/channel/0029Va8PLrl7j6gBLA3Y5m3J), ordinary server HTML | Description, publisher crosslinks and “View in WhatsApp”; no verified update list, update IDs or publication times | The public landing page is not an established message feed. This does not claim the consumer app cannot display updates. |
| [Facebook Page](https://www.facebook.com/ChampAlertsOnTheGo), ordinary server HTML | Page shell/title, no verified recent story list with publication times | A successful HTTP response alone does not establish a usable latest-post adapter. Rendered consumer access and Graph API permissions are separate questions. |

The examples above record access observations and source IDs, not a copied social archive. No login, CAPTCHA solution, proxy rotation, session extraction, channel join, notification permission or external contact was performed.

## 3 Compare the actual options

| Option | Paid subscription? | Timeliness and completeness | Decision for Manzil |
| --- | --- | --- | --- |
| X API using an eligible promotional balance | No subscription; conditional no-purchase incentive | Activity API public-account post webhooks, plus structured timeline catch-up; dependent on account access, rate limits and balance | Structured X candidate if the user accepts the card condition and credit appears. Source/downstream-use checks still apply. |
| Linked-account WhatsApp Channel client | No social API subscription; library is open source, hosting still consumes resources | Documented recent-message retrieval/live event machinery; actual Champ content/delivery untested | Two-hour whatsapp-web.js spike; inspect permitted use and account risk. Details in section 9. |
| APP RSS / official Police website | No API key or social subscription for the checked public pages | RSS is working/current; Police HTML is accessible. Publication coverage and delays remain source-dependent | Initial zero-purchase automatic adapter plus a second official-site adapter; section 10. |
| Public X page browser collector | No API bill; browser hosting still consumes resources | Recent preview worked once; full-day discovery failed at the preview boundary. Availability, order and markup can change. | Technically possible to read visible posts; not the selected dependable feed. X's terms require prior written consent for scraping. Only evaluate unattended collection if permitted; do not evade a login/access block. |
| Official embedded X profile timeline | No API-key requirement in the documented embedding workflow | Displays public posts; no documented machine-ingestion contract, completeness guarantee or refresh SLA | Optional source-view panel, not the ingestion engine. |
| Own Android notification relay | No paid social API; existing phone/connectivity/backend costs remain | Potentially prompt after a device notification, but text, identity, delivery, edits and history are not guaranteed | Time-box a real-payload experiment; adopt only with measured limitations and local filtering. |
| Publisher's original webhook/Sheet/Telegram feed | No X API dependency; own hosting/quotas apply | Can carry full text, original timestamps, stable IDs and corrections promptly | Preferred ongoing design if Champ agrees to provide it. Not an existing verified feed. |
| Deliberate share/paste/screenshot | No social API subscription | Requires a person; only submitted notices are covered | Mandatory low-effort fallback, labelled as manual intake. |

### 3.1 X credits: a useful temporary route

Official X documentation currently offers **$20 once** for saving the first eligible card on an account that has never paid. Eligible credit/debit cards qualify; prepaid cards do not. The same card cannot repeatedly earn this incentive across accounts. The offer is rolling out and may not yet be enabled for a particular account. Credits expire **three months** after grant.

The billing-page “add payment method” path explicitly does not require a purchase. The separate auto-recharge reward does require an actual card charge; it is excluded from our zero-purchase plan. We have not opened or changed the user's billing settings. [Official incentive and eligibility](https://docs.x.com/x-api/getting-started/free-credits)

X currently lists post reads at **$0.005 per returned post** and user reads at $0.010. Thus $20 funds about **4,000 post reads before other resources/reconciliation**. At an illustrative 100 new posts/day, 30 days would consume $15 in initial post reads. This is arithmetic, not a measured Champ posting rate or a complete monthly bill. Avoid importing 3,200 older posts for roughly $16 when the user's immediate need is current-day notices. [Official pricing](https://docs.x.com/x-api/getting-started/pricing)

Fetch only new items using a durable cursor, cache the author ID and allocate a reserve for corrections/reconciliation. Recheck the balance/rates in the actual console; enforce a local request/resource budget and stop before exhausting the permitted credit. Do not enable purchases/auto-recharge to keep the feed alive silently. [Timeline interface](https://docs.x.com/x-api/users/get-posts)

### 3.2 Prompt delivery: Activity API webhook, not continuous page refresh

X documents **public `post.create` and `post.delete` events filtered by user ID**, available with application authentication without requiring that public author to authorize our app. Protected posts are excluded. Self-serve subscription limits are documented, but entitlement on our actual project remains untested. An Activity API “subscription” here means registering an event filter, not buying a monthly plan. [Activity API](https://docs.x.com/x-api/activity/introduction)

Register the verified Champ author ID for new/deleted posts through X's webhook interface. A new-post event is currently $0.005; deletion events are not billed according to the specific event-pricing page. Allocate the same credit budget across webhook deliveries, timeline catch-up and other resources. [Event pricing](https://docs.x.com/x-api/activity/event-pricing)

```text
Champ publishes on X
  -> X Activity API post.create webhook
  -> Manzil validates signature, stores notice + pending extraction atomically
  -> acknowledge durable receipt
  -> dispatcher/Cloud Tasks -> Gemini -> validation/review -> event -> commute alert
```

Use a publicly reachable HTTPS callback with CRC challenge handling and raw-body HMAC signature verification; credentials remain server-side. X requires a response within ten seconds. Do not run Gemini inline before acknowledging: store durable receipt/job intent first, acknowledge, then have a retrying dispatcher enqueue work. A pending-work scan closes the crash window between database commit and Cloud Tasks creation. [Webhook contract](https://docs.x.com/x-api/webhooks/introduction)

Keep an incremental timeline check for bootstrap and gap recovery. If webhook access is unavailable but timeline access works, initially poll every **60–120 seconds** subject to actual rate/budget limits. Schedule one-minute ticks and skip as needed. Healthy polling delay includes the interval plus publication/API/network/processing time. Webhook push removes the polling wait but does not establish a measured seconds-level SLA. Verify payload completeness, retry/replay behavior, account access and actual latency before calling this live.

### 3.3 Why public visibility does not settle the collector design

There are two tasks: discover new post IDs on the profile, then obtain the complete content of those posts. A known URL solves only the second task. Our profile preview worked for a few recent posts; it cannot recover everything missed while a collector is offline or while a burst exceeds the visible preview. Pinned posts also break a naive assumption that the first displayed post is newest.

With permission, a bounded browser adapter could observe the public rendered page, use canonical post IDs for deduplication, inspect accessible details for truncation and record its actual coverage. It must stop/report a gap when access changes. Browser rendering is heavier than an API call, and successful reading on this machine does not prove identical access from a Cloud Run region. No such unattended adapter was built or endurance-tested here.

X's current Terms, effective October 9, 2026, require prior written consent for scraping/crawling. This is a platform-contract limitation distinct from whether a page happens to load. Publisher permission over original notices does not itself grant X's platform consent; a direct publisher feed avoids that collection dependency. [X Terms, section 4](https://x.com/en/tos)

The official [embedded timeline](https://help.x.com/en/using-x/embed-x-feed) is a display component. It does not document an export API for turning its rendered collection into our closure database. No working current Champ RSS, free mirror or third-party scraper feed was established. Search indexing is not a freshness/completeness contract for live road alerts.

## 4 Experimental Android bridge when no credit/card is available

```text
Consenting operator's own Android device
  -> official WhatsApp app receives enabled Champ Channel notifications
  -> NotificationListenerService
  -> strict local publisher filter, then local queue
  -> authenticated HTTPS intake on Manzil
  -> Gemini proposal -> validation/review -> event -> affected commute alerts
```

Android exposes notification callbacks through [NotificationListenerService](https://developer.android.com/reference/android/service/notification/NotificationListenerService). WhatsApp Channel alerts are muted by default and must be enabled by the operator. [WhatsApp notification settings](https://faq.whatsapp.com/6074154625973804/)

The operator explicitly grants notification access. The Android permission covers more than a particular publisher: preferably use a spare device without personal conversations; filter on the device **before storage or upload** and discard nonmatching notifications. An Android notification-channel ID is not necessarily the identity of a WhatsApp publisher channel. Do not use a loose substring-only filter if another sender could match it.

Read available title, text, expanded text and message-style fields; WhatsApp decides what it supplies. A generic “new update,” image-only alert, redacted content or truncated notice is insufficient for automatic closure publication. The listener does not grant arbitrary channel-history or image-download access. [Android notification fields](https://developer.android.com/reference/android/app/Notification) · [Android 15 notification protections](https://developer.android.com/about/versions/15/behavior-changes-all)

### A bounded feasibility spike

Before spending a day on a companion app, inspect a few deliberately authorized Champ notification payloads on the intended device:

1. Confirm that the actual channel is reliably distinguishable from other WhatsApp senders.
2. Compare expanded notification text with the original notice, including dates, direction and long messages.
3. Check consecutive notifications, grouped notifications, image/caption notices and notification replacements.
4. Check screen-off, reconnect, restart/reboot and revoked notification access.
5. Measure receipt-to-server and source-post-to-receipt delays separately when original publication time is available.
6. If identity or useful content is missing, reject this as an automatic event source and retain manual import. Do not invent missing facts.

Use a durable local queue and bounded retries, with a revocable device credential and TLS. A backend receipt is the acknowledgement; retry idempotently. Android [WorkManager](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work) can handle queued retry work but scheduling latency depends on device constraints and system optimization. No seconds-level delivery SLA follows from using it.

[ItsAzni/NotificationForwarder](https://github.com/ItsAzni/NotificationForwarder) is an MIT source reference with a configurable webhook, authentication, Room queue and WorkManager retry. Its existence establishes a reusable pattern, not audited filtering or suitability for Champ. Review/adapt source before any installation; no installation was performed.

### Identity, timestamps and corrections

- Store `intakeMode=android_notification`, device event ID, notification key/version, received time, extracted text hash and the available verified source identity.
- Notification time is not verified publication time. If original time cannot be established, preserve it as unknown. Relative “tomorrow” or end-time wording must enter review rather than silently use receipt time.
- Notification keys are not guaranteed source post IDs. Deduplicate device retries separately from possible cross-post duplicates; grouped summaries are not additional independent evidence.
- Removing/dismissing a notification is not a reopening or cancellation. A replacement is not automatically a source edit.
- Device heartbeat proves device connectivity only. It does not prove that all channel posts produced notifications.
- Treat missing/truncated/image-only notices as incomplete. Initially require review for notification-derived events until identity/content adequacy is demonstrated and publication policy is explicitly satisfied.

Permission to access the operator's device is not permission to republish all captured material. Establish allowed source processing/retention and attribution for this intake too. Use it to receive deliberately permitted notices, not to bypass platform controls.

## 5 Best ongoing feed: producer sends original notices

The author already composes the information somewhere. A parallel source they control avoids paying to retrieve it from X. This requires actual cooperation; it has not been requested or obtained.

| Producer path | Concrete integration | Limits |
| --- | --- | --- |
| Original notice -> our webhook | Publisher sends authenticated JSON containing stable ID/revision, original timestamp, text/media reference, direction/area if known and correction relationship | Requires publisher-side action/automation and an agreed content contract; no existing endpoint assumed. |
| Google Form/Sheet -> Apps Script -> webhook | Human form submit/edit triggers an installable script, then authenticated delivery; original timestamps and revisions are explicit columns | Script/API writes do not automatically fire ordinary edit triggers; publisher automation must explicitly invoke delivery or a scheduled reader. Quotas and trigger ownership apply. [Installable triggers](https://developers.google.com/apps-script/guides/triggers/installable) |
| Original notice -> Telegram bot/channel -> webhook | Publisher messages a bot or posts in a channel where it is a member; consume new/edited channel updates with a secret webhook header | No official current Champ Telegram channel verified. Bot updates pending at Telegram last no longer than 24 hours; this is not an archive. [Bot visibility](https://core.telegram.org/bots/faq) · [Update/webhook API](https://core.telegram.org/bots/api) |

A publisher's independent original feed should carry corrections, cancellations and “still active” updates as first-class revisions. Merely reposting the same uncertain notice is not independent confirmation. None of these options magically forwards arbitrary WhatsApp Channels automatically.

## 6 Immediate manual intake, same full product workflow

Provide an admin form with paste text, optional original URL/time, and screenshot/file upload. Show what is present/missing before Gemini extraction. An installed Android PWA can later register as a [Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target) so the operator can deliberately share notices into Manzil. If the source application shares only a URL, it has not supplied the full notice; request an explicit text/screenshot import where permitted.

This requires a human and should be labelled manual. It still demonstrates the product's difficult work: interpreting Urdu/Roman Urdu/English, resolving roads and schedules, reviewing ambiguous statements, generating valid detours and warning saved commuters.

## 7 Unified intake and freshness contract

All adapters normalize into the existing notice service, not directly into map closures:

```text
source identity + intake method + source item ID when available
original publication time when known + observation time when stated
received time + revision/correction relationship + evidence completeness
  -> durable notice -> queue -> Gemini proposal -> validation/review
  -> versioned event -> commute rechecks -> deduplicated alerts
```

Use Asia/Karachi for interpretation/display while storing timestamps unambiguously. Keep next-day/future notices announced today: “current-day collection” is not a reason to throw away tomorrow's planned closure. Preserve relevant still-active events from earlier days; absence of a new notice is not reopening evidence.

For an API/feed, paginate and checkpoint a bounded window before advancing the cursor as specified in the architecture. For notification/manual input, never fabricate the same completeness guarantee: expose `coverage=partial`, original timestamp availability and last received notice. Separate “collector healthy,” “latest source item received” and “all source items covered.”

Every connector should show intake mode, last successful check/receipt, latest original post time if known, known gaps and paused/error state. Reprocess corrections with notice/event revisions. An outage must not display “no closures” as though the city was checked and clear.

## 8 Execution decision before October 17

1. Implement APP RSS as the first no-account automatic source and keep deliberate Champ import working. Add the Police HTML adapter after its basic extraction test. Do not delay routing/Gemini work behind a WhatsApp experiment.
2. Time-box a linked-account whatsapp-web.js Channel spike to roughly two hours, using only a deliberately authorized account/source. Test bounded recent fetch, new delivery and reconnect recovery against the actual Champ channel before promoting it. Android notification capture is a separate fallback if appropriate, not a full companion-app workstream.
3. The X credit/API route remains optional if the user is comfortable with the card requirement and credit actually appears. No purchase or automatic billing setup is authorized by this document. Test new/deleted-post webhook and timeline catch-up, or 60–120-second polling if only timeline access works.
4. Keep browser-only collection a conditional research adapter rather than promise a full feed from the observed limited preview.
5. Seek a publisher-provided feed as the ongoing solution when the user chooses to contact Champ. No contact was made in this research.
6. Demonstrate only the intake actually implemented. If import is manual, say so; if device/API access works, show measured coverage/latency and its limitations.

This changes the budget priority from historical scraping to timely new notices. Historical backfill remains a later, separately permitted task. It does not change Leaflet, MapTiler, ORS, Gemini, scheduled events or the temporal rerouting architecture.

## 9 Direct WhatsApp Channel clients: a real unofficial option

The absence of an established official arbitrary-Channel API does **not** mean no programmatic client exists. The first pass focused too narrowly on official APIs and phone notifications. The following source-level capabilities are now verified; no account pairing or live Champ test has been performed.

| Library | Actual documented/source capability | Tradeoff |
| --- | --- | --- |
| [whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js), Apache-2.0 | Docs labelled 1.34.7 expose getChannels/getChannelByInviteCode/subscribeToChannel and Channel.fetchMessages. Returned Message objects carry ID, text/caption, media availability and creation time. Client source implements new-message callbacks. | Runs WhatsApp Web through Puppeteer/Chromium: convenient to inspect, but heavier on the collector host and dependent on Web internals. |
| [Baileys](https://github.com/WhiskeySockets/Baileys), MIT | Current source exposes newsletterMetadata, newsletterFetchMessages and subscribeNewsletterUpdates; the receive path handles newsletter messages. | Browser-free socket client, but raw fetch responses, event distinctions and reconnect/renewal behavior need more integration care. |

[Channel method documentation](https://docs.wwebjs.dev/Channel.html) · [Client methods/events](https://docs.wwebjs.dev/Client.html) · [Channel fetch implementation](https://docs.wwebjs.dev/structures_Channel.js.html) · [Client event implementation](https://docs.wwebjs.dev/Client.js.html) · [Baileys newsletter implementation](https://github.com/WhiskeySockets/Baileys/blob/master/src/Socket/newsletter.ts)

For the deadline, test **whatsapp-web.js first**. A team-controlled account is linked locally by its owner, the collector resolves only the verified Champ Channel, fetches a bounded recent window and watches matching new messages. Do not scan unrelated chats, contacts or other channel subscribers. This collector is operated once by the team; every Manzil user does not link their WhatsApp account.

```text
Champ WhatsApp Channel
  -> team's deliberately linked WhatsApp Web client
  -> allowlisted channel + message ID/version + original time + text/media
  -> durable intake and extraction outbox
  -> existing Gemini/review/event/commute workflow
```

Run the collector separately from the lightweight web frontend and request-driven worker. An existing development computer can host the prototype while powered on; it is not an always-on deployment. Browser/socket collectors need persistent connection and protected session storage, so the existing scale-to-zero HTTP worker is not automatically a suitable host. Hosted always-on compute has its own cost. Browser overhead is on the collector, not on commuters' phones.

### Pass/fail experiment

1. Owner explicitly authorizes linking the intended account; pairing/session credentials stay local or in protected deployment storage, never chat logs or Git. Library reuse does not establish permission over the source content or platform automation.
2. Resolve Champ from the already verified channel link and confirm its publisher identity. Retrieve at most a small recent window first, not an unlimited history crawl.
3. Compare returned message IDs, source timestamps, full text/captions and accessible media with the actual channel. Confirm what a non-admin follower can retrieve; do not assume publisher-admin privileges or a lifetime archive.
4. Observe live new updates, consecutive/burst updates, edits/deletions, restart and reconnect catch-up. Deduplicate by channel plus source message identity and version/hash. Test incomplete media separately.
5. Bound any recovery poll, track covered windows and publish a gap when recovery fails. Do not assume undocumented ordering/cursor behavior or that a connected socket means every message was received.
6. If payload fidelity or delivery fails, keep APP/Police intake and manual Champ import working. Do not spend the remaining hackathon building an unofficial messaging platform.

Baileys-specific trap: its inspected newsletter receive branch calls message upsert with type `append`; a generic consumer accepting only `notify` can silently discard Channel messages. Fetch currently returns a raw result rather than a guaranteed normalized Message array. Pin and verify a version containing the [May 2026 burst-delivery fix](https://github.com/WhiskeySockets/Baileys/pull/2482) and applicable [security fixes](https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg). [Receive source](https://github.com/WhiskeySockets/Baileys/blob/master/src/Socket/messages-recv.ts)

The maintainers explicitly identify these clients as unofficial and warn that accounts may be blocked. A read-only use case does not establish exemption from platform rules or eliminate this risk. Do not present this as a supported Meta integration or promise uninterrupted operation. [whatsapp-web.js disclaimer](https://github.com/wwebjs/whatsapp-web.js)

A separate reason notification forwarding is incomplete: WhatsApp says followers are **not notified when a Channel update is edited**, and editing an original does not update copies already forwarded. Therefore the Android bridge needs separate source reconciliation or explicit manual review; waiting for another notification is insufficient. [WhatsApp editing behavior](https://faq.whatsapp.com/1549633222110625)

## 10 Other publishers: real free inputs outside social APIs

| Source | Verified status on October 14 | How to use it |
| --- | --- | --- |
| [Associated Press of Pakistan RSS](https://www.app.com.pk/feed/) | Actual HTTP 200, XML RSS, ten items, build time 17:35:34 UTC. Included a current Islamabad Traffic Police rain/slow-traffic advisory published 17:32:18 UTC. | First automated zero-account input. Poll every 1–2 minutes, persist GUID/link/publication time and fetch only new relevant articles. This is a news publisher reporting authorities, not an exhaustive operational city feed. |
| [Islamabad Police news](https://www.islamabadpolice.gov.pk/all-news.php), [ITP division](https://www.islamabadpolice.gov.pk/division.php?slug=islamabad-traffic-police) | Public dated news/article links and current homepage releases verified. No advertised RSS/public JSON API established. | Bounded HTML listing/detail adapter. Filter unrelated administrative/crime material; handle article/PDF formats. Measure publication lag and permitted reuse rather than assuming every closure appears. |
| [NHMP travel advisory](https://beta.nhmp.gov.pk/ta/Public/ViewTravel.aspx) | Indexed table shows sector, direction/lanes, road status and October 12–13 update times, including M1/M2 North/N5/N75. Direct attempts returned 503. | Candidate for highways approaching Islamabad. Direct live availability is unresolved; cached/indexed rows cannot be labelled current live conditions. |

The current [APP advisory](https://www.app.com.pk/national/heavy-rain-in-islamabad-itp-warns-of-slow-traffic-urges-motorists-to-drive-carefully/) demonstrates a real fresh item, but slow traffic/rain is not a complete closure. A historical [May 9, 2026 APP report](https://www.app.com.pk/national/itp-issues-diversion-plan-for-marka-e-haq-htv-entry-banned/) announced next-day restrictions and road boundaries; it demonstrates the scheduled-notice format, not a currently active event.

APP's general RSS contains only the latest ten items in the observed response, across many subjects. A short polling interval reduces but cannot eliminate gaps; record a suspected gap after an outage/window turnover. Test category/history recovery before claiming completeness. RSS availability does not grant unrestricted copying/training rights: retain source links, use only necessary permitted evidence, and avoid publishing a copied news archive.

An article repeating an ITP announcement and Champ repeating that announcement may share one upstream source. Link the evidence but do not count those copies as independent confirmations. Road closures, lane restrictions, weather warnings and reopenings remain distinct event types.
