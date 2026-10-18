# English/Urdu journeys and Cloud speech

**18 October fuel/voice release deployed:** API `manzil-api-00013-sqx`, private worker `manzil-source-worker-00010-86j`, Hosting pin `fh-968013a274e235e9`. Nightly PSO fuel checks run at **01:00 Asia/Karachi** through `manzil-fuel-daily`. English/Urdu Google Cloud WaveNet voices support guests and signed-in users under a shared **100,000-character UTC-month cap**, with durable caching and device fallback. **811 standard + 24 Firebase emulator tests (835 total)**, production build, 31 direct API/34 hosted smoke checks and real bilingual guest MP3/cache checks pass. The Scheduler test returned HTTP 200 and correctly reused today's previously successful fuel check. Gemini Free tier/model/limits and mandatory admin approval remain unchanged; commute scheduling stays inactive. Earlier disabled-service statements below describe historical releases. [Operations and costs](FUEL_AND_VOICE.md).

**17 October:** the core is [deployed](https://manzil-app-v1.web.app) with Firebase Auth/Firestore in Singapore; [local/emulator development](ENVIRONMENTS.md) remains available. Cloud speech is implemented but **disabled** in the first release; no paid synthesis/model call occurred. Durable caching/character accounting are ready for later provider activation. Cloud synthesis requires sign-in by default; public cloud speech needs explicit usage/abuse controls. Matching device voices remain available where supported. See [release procedure](FIRST_DEPLOYMENT.md) and [tested limits](IMPLEMENTATION_STATUS.md).

Implemented locally on 15 October 2026. The agreed sequence is in [FEATURE_PLAN_2026-10-15.md](FEATURE_PLAN_2026-10-15.md).

Follow-up: [localhost dummy normal/admin sign-ins and target-aware tour positioning](DEV_ACCOUNTS_AND_TOUR.md) are now implemented. The [admin interface proposal](ADMIN_INTERFACE_PROPOSAL.md) awaits owner approval.

## Everyday use

- Use **اردو / English** in the header or Language in Profile. The choice persists on this device. Urdu sets document language and RTL layout. Coordinates, map geometry and turn directions retain their geographic meaning. App-owned copy is translated; original notices, user text and OSM names remain verbatim. Basemap labels follow supplied map data rather than claiming complete Urdu place-name coverage.
- Guest navigation is **Map, Closures, Saved and Profile**; **Activity** appears after sign-in. Saved journeys, trip recording/history, personal alerts and personal settings require sign-in. The clock says Now rather than implying live traffic.
- **Try street detour** is directly below the planner heading, and **Demo closures** is directly available in the planner and Closures view. Route results expose **Block a point on this route** without opening Help. The map's **Add restriction** plus button stays visible. **Help & demos** retains Replay tour and closure/source shortcuts; Profile also offers source tools.
- **17 October tour refresh:** the spotlight guide highlights separate starting-point/destination/stops, Plan ahead, a bullet map key, route/navigation controls, language, styles/layers and the Closures/Saved/Profile workspaces. Previous/Next/Skip/Finish/Escape and a focus-contained dialog remain supported. It starts automatically only after successful account creation (after optional trip-data choice) or explicit Continue as guest. Ordinary login and resumed guest reload do not reopen it. Everyone can replay from Help or Profile. Read-only workspace previews preserve the original journey/map time and restore the previous workspace on close; the guide never creates a closure, requests location or starts navigation.
- Firebase SDK sign-in/registration/reset are wired in emulator mode and the hosted release; real-user registration/login and reset-email delivery remain to verify with the owner. Standalone SQLite retains dummy UI identities and disabled signup/reset. Google sign-in remains removed. Firebase modes verify identity/scope private records; shared closure/source changes require admin. Existing standalone data remains intact and shared only in trusted-local mode.

## Foreground GPS and speech

Find routes, choose a driving route and select Navigate. Choose Voice language, try Test voice, then enable Voice guidance. Spoken language can differ from the interface. Repeat instruction is available while guidance is matched/current. Navigation does not save GPS history.

The first fresh GPS fix replans from the actual position. Subsequent fixes use route continuity and accuracy-aware thresholds. Automatic off-route recovery needs at least three deviating fixes over four seconds. A noisy sample alone cannot trigger it. One request runs per session; subsequent attempts use a 12-second cooldown with failure backoff capped at 60 seconds. Stopping/exiting invalidates outstanding guidance and queued audio. Failed routes never become actionable options.

Replanning preserves destination and unvisited stops. A stop needs repeated accurate fixes at its snapped road position and corresponding route progress. Missing samples cannot prove a visit. Closure revisions trigger replanning. A matched journey delayed by over 30 seconds can be revalidated no more frequently than once a minute. Every new route uses the existing closure-traversal time, access and turn checks.

GPS and closure markers update in place. Identical polls retain state/closure references and waypoint callbacks are stable. During a planner snapshot replacement, old geometry is neutral grey with Updating labels and cannot be selected for navigation. Camera position is preserved. Vite ignores database/cache writes.

### Practical limits

This is approximate foreground-only guidance over the bounded OSM graph. Geometry-derived maneuvers can be imperfect; there is no heading/lane-aware map matching, live traffic or roundabout-exit metadata. Parallel roads/flyovers remain ambiguous. Stops with insufficient evidence remain unvisited. Guidance stops when the page is hidden; background/locked-screen navigation is not promised. Outdoor GPS and actual-device audio/pronunciation checks remain required.

## Enable Google Cloud speech

Cloud synthesis defaults to **disabled**. In the intended Manzil project, enable billing and `texttospeech.googleapis.com`. The expired welcome trial is not renewed by this change. Applicable monthly free usage still requires active billing and includes other relevant usage on the billing account.

Initialize Google's CLI, then run locally with your project ID:

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

The identity needs appropriate project access and Service Usage Consumer permission for the quota project. See [Google authentication instructions](https://docs.cloud.google.com/text-to-speech/docs/authentication) and [client quickstart](https://docs.cloud.google.com/text-to-speech/docs/create-audio-text-client-libraries). Never commit or send credential JSON to the browser.

Set an ignored `.env` and restart the API:

```dotenv
TTS_ENABLED=true
TTS_ENGLISH_VOICE=en-GB-Wavenet-A
TTS_URDU_VOICE=ur-IN-Wavenet-A
TTS_MONTHLY_CHARACTER_LIMIT=100000
```

Urdu voices are catalogued as `ur-IN`; test pronunciation with Pakistani road names. Availability/pricing can change: [voice catalogue](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types), [pricing](https://cloud.google.com/text-to-speech/pricing). No paid synthesis request was made during implementation.

The official Node client uses Application Default Credentials. The API accepts only structured navigation/test prompts, not arbitrary text/SSML. Exact text/voice/encoding key a SQLite audio cache (256 entries). Requests are deduplicated and at most two syntheses run concurrently. UTC-month character reservations are durable and happen before provider calls; failures count conservatively. This limit is neither Google's billing measurement nor a zero-bill guarantee.

The browser caches recent audio, prefetches a next prompt while voice is enabled, cancels obsolete playback and backs off on Cloud failure. It falls back only to an actually available voice for the selected language and reports unavailable if none exists. Device voices can themselves be remote; Urdu is never silently spoken in an English voice. Test voice helps check browser audio policy.

## Eventual Google Cloud deployment

Use an attached Cloud Run service identity for ADC, without an exported service-account key. Keep synthesis behind the backend. Production host/origin validation, Firebase token verification and personal-record ownership are now implemented through the environment foundation; they still require actual project configuration, IAM and live verification before public deployment. Existing local state is not migrated automatically.

Ephemeral Cloud Run SQLite is not durable shared accounting or a global spending cap. Multiple instances need hosted audio storage, atomic global usage reservations, client abuse limits, provider quotas and monitoring. Budget notifications alone do not cap spending. No deployment, billing settings or Cloud resources were changed.

## Verification boundary

Tests exercise structured bilingual prompts, cache/deduplication/budgets/errors, calendar rollover, GPS deviation/backoff, stop preservation, actual React wrong-turn and closure-revision flows, disabled account forms, Urdu/tour behavior, late-audio cancellation and stable map props through polls/time/language changes. JSDOM substitutes for browser APIs; these are not WebGL/physical GPS/OS permission tests. No browser session was available for new visual inspection. Live Google synthesis and real Firebase sign-in remain unverified/unconnected respectively.
