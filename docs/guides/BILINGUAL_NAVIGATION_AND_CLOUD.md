# English/Urdu navigation and optional cloud speech

Manzil provides foreground driving guidance with English/Urdu interface and voice controls. Location precision, device voices and network availability remain explicit. Cloud synthesis is an optional backend integration; the device/basic Urdu paths do not require a Google speech key.

See [implementation status](../IMPLEMENTATION_STATUS.md) for actual release and verification evidence, [personal-data rules](../reference/PERSONAL_TRAVEL_DATA.md) for recording, and [architecture](../../ARCHITECTURE.md) for runtime boundaries.

## Interface and guidance

- Choose English/Urdu from the header or account appearance settings. Urdu sets document language and RTL layout. App-owned copy is translated; source/user text and supplied OSM labels remain verbatim.
- Find a route, select it and open **Navigate**. The panel keeps instruction/status, remaining time/distance and Start/Stop prominent. Voice settings, route steps and guidance details are collapsed.
- Voice language can differ from the UI. **Test voice** checks playback; **Repeat instruction** is available for current matched guidance.
- The onboarding tour runs after account creation or explicit Continue as guest, not every login. Replay remains available. A tour preview does not request location, start guidance or create restrictions.
- The map's **Live map** time is not a claim of live traffic. Plan ahead uses a separate selected time. Navigation and saved-journey alerts continue to validate closure traversal times.

My location recentres the raw location marker/accuracy area and preserves A/B/stops. Using current location in a place field is a separate deliberate action. No location request starts merely from loading the app or opening navigation preview.

## Location acquisition and accuracy

| Control | Behavior |
| --- | --- |
| One-shot lookup | `enableHighAccuracy:true`, `maximumAge:0`, bounded 15-second request; a coarse first fix can receive up to six seconds of watcher refinement. |
| Guidance/sample acceptance | Valid fixes within 15 seconds, no more than five seconds in the future and reported accuracy **60 m or better**. |
| Approximate result | Display raw position and reported uncertainty; no artificial road snap, automatic replan or trip sample. Accuracy drawing is capped at 100 km and never enters routing geometry. |
| Quiet guidance watcher | A single fresh request after ten seconds; at most one refresh in flight. |
| Expiry/permission | Expired location clears marker/precision and pauses guidance; denied permission stops the session. Transient failures can recover. |
| Cancellation | Stop, account/unmount, replacement action and hidden-page rules invalidate obsolete work. Older responses cannot overwrite a newer valid fix. |

A laptop may supply Wi-Fi/IP/OS positioning rather than satellite GPS. High-accuracy is a request, not a guarantee; the shaded radius is the provider's estimate rather than surveyed certainty. See the [Geolocation specification](https://www.w3.org/TR/geolocation/#enablehighaccuracy-member).

During navigation, My location uses the navigation-owned marker and is disabled until one exists. Pending one-shot map lookups are cancelled on entry; a maneuver preview only focuses the map and cannot impersonate the user's position.

## Routing continuity

The first fresh accepted fix replans from actual position. Off-route recovery needs at least three deviating fixes over four seconds; one noisy sample cannot trigger it. A session runs one request at a time, uses a twelve-second cooldown and bounded failure backoff. Stop/exit invalidates outstanding guidance and queued audio.

Replanning retains destination/unvisited stops. Repeated accurate fixes at the snapped stop plus corresponding route progress are required to mark a stop visited. Missing samples cannot establish a visit. Closure revision changes revalidate routing; a matched journey delayed over thirty seconds can be revalidated no more than once a minute. Access, turn and closure-time checks apply to new routes.

Ordinary background refresh retains the previous visible route until replacement is ready. A changed route context or unvalidated restriction snapshot can still disable guidance and show an explicit replan state. Camera/marker updates do not remount the map.

Navigation is approximate foreground guidance, not heading/lane-aware map matching or live traffic. Parallel roads/flyovers and geometry-derived maneuvers can be ambiguous. Guidance stops on a hidden page; locked-screen/background navigation is not promised. With consent, eligible navigation samples may enter personal trip history; simply viewing a route does not grant consent.

## Voice selection and fallback

1. If explicitly enabled/configured, try the authorized cloud provider after a bounded cached status check.
2. Otherwise select a supported device voice for the requested language. Identifiable female voice names are preferred; Web Speech has no standard gender field, so this cannot be guaranteed. A bounded `voiceschanged` wait supports late catalogues.
3. If Urdu is absent/fails, play the application's **Basic Urdu voice** pack. English without a usable provider/device voice stays unavailable rather than being spoken in another language.

Playback, language/session/account changes cancel obsolete requests and prevent delayed responses starting audio. Device voices may themselves use remote services; no microphone is used. Browser playback policy still applies.

### Basic Urdu pack

The app has 25 synthetic `ur+f3` WAV clips, 1,794,604 bytes in total, loaded on demand and cached in memory. No speech engine ships to the browser, and this fallback sends no route name, location or account data to an external provider. It is a mechanical formant voice rather than a natural human recording.

It covers basic turns, arrival, test, updates, location loss and exact ahead distances **50/75/100/125/150/175/200/225 m**. Unsupported numbers and road names are omitted from this audio rather than replaced with false values; complete details stay on screen. Device/cloud voices can speak the full prompt. On-demand fetch is not a promise of complete offline audio availability.

[Provenance, clip hashes, reproduction and licensing](../../public/audio/navigation/README.md).

## Optional Google Cloud synthesis

Cloud speech defaults to disabled. Activating its API, billing or IAM is a separate authorized operation, not a normal feature-test step. Verify current [voice availability](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types) and [pricing](https://cloud.google.com/text-to-speech/pricing); do not assume free usage prevents billing.

The Node client uses Application Default Credentials: locally an authorized ADC identity, in Cloud Run an attached service account. Never put credential JSON or provider secrets in a browser bundle.

```dotenv
TTS_ENABLED=true
TTS_ENGLISH_VOICE=en-GB-Wavenet-A
TTS_URDU_VOICE=ur-IN-Wavenet-A
TTS_MONTHLY_CHARACTER_LIMIT=100000
```

Emulator cloud speech additionally requires explicit `ALLOW_PAID_SERVICES=true`. Production speech requires sign-in by default; `PUBLIC_CLOUD_SPEECH` is an explicit policy choice requiring abuse controls.

The API accepts only structured navigation/test prompts, not arbitrary text or SSML. Text/voice/encoding key a bounded repository-backed audio cache (256 entries); SQLite serves standalone and Firestore serves emulator/production. Identical in-process requests coalesce, with at most two syntheses in flight per service instance. UTC-month character reservations are durable and happen before provider calls; failures remain counted conservatively.

These controls are application safeguards, not Google's billing measurement, a provider quota or a complete global abuse/spending cap. Configure monitoring/quotas and actual service permissions before public activation. Existing SQLite, GPS or sample-account data is never migrated implicitly.

The client caches recent cloud audio, cancels obsolete playback and backs off after provider failure. It falls back by requested language as described above; Urdu is never silently spoken using an English voice.

## Verification boundary

Relevant tests cover structured prompts, provider cache/usage/error limits, device selection, late voice catalogues/audio cancellation, basic-asset integrity, GPS freshness/deviation/recovery races, stop preservation, closure changes and account/consent isolation. See `tests/speech*.test.ts`, `tests/offline-speech-assets.test.ts`, `tests/location*.test.ts`, `tests/navigation*.test.*` and the travel-data suites.

JSDOM/synthetic fixes verify application behavior, not physical GPS precision, moving-device recovery or human pronunciation. Actual browser/device listening and outdoor location checks remain necessary for those claims. A documentation update does not verify current cloud speech activation or make a synthesis request.
