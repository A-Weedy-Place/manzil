# Daily fuel prices and bilingual navigation voices

**18 October integrated release deployed:** source `8702fb9` includes GitHub main `f07778c` plus preserved fuel/cloud-voice work. API `manzil-api-00015-7cr`, private worker `manzil-source-worker-00012-t2z`, Hosting pin `fh-208bbe9aa098303b`. Clear >=95%-confidence road and timed Metro restrictions publish only after evidence, geometry/service and time checks; uncertain events retain individual admin decisions. Ten labelled shared demo closures were imported (seven active, three upcoming), without personal User 123 data. The bundled/offline Urdu pack is excluded; cloud/device speech and nightly fuel remain. **1,099 standard + 27 Firebase emulator tests (1,126 total)**, cloud build and **34 live checks per origin** pass. Earlier review-only/local-only/basic-Urdu notes below are historical. [Current policy and operations](SELECTIVE_AGENT_PUBLICATION.md).

**Deployed 18 October 2026:** API `manzil-api-00013-sqx`, private worker `manzil-source-worker-00010-86j`, Firebase Hosting pin `fh-968013a274e235e9`. Immutable image: `sha256:eca4cefe2a090c8cbdd680fd05142ec414f1fbbd1f3fafa1afbccec442189867` (Cloud Build `21349d8f-8f37-4e63-b557-493d51e084f7`). Fuel job is enabled and its immediate test dispatch returned HTTP 200. That dispatch correctly reused the existing successful check for the same cycle; it did not reset the daily claim to force another fetch. The public cache has ten dated PSO entries and the next deadline is **19 October, 01:00 PKT**. The next actual timed overnight execution has not yet occurred.

## Daily fuel check

The production job `manzil-fuel-daily` targets the existing private worker's `/internal/tick` with `config/fuel-scheduler-body.json`. Its cron is **`0 1 * * *`**, timezone **`Asia/Karachi`**: one scheduled check at **01:00 PKT** each night, independent of the user's computer or an open browser. Scheduler delivery may be delayed; the application does not promise execution precisely on the second.

The worker allowlist includes `source,agent,fuel`. It still requires the existing Scheduler service identity/OIDC audience; the public API identity can invoke only the agent job. Fuel checks use the fixed public [PSO archive](https://psopk.com/fuel-prices/pol/archives), extracting dated petrol/HSD prices. There is **no Gemini request** for this collection. Champ post announcements remain unconfirmed agent evidence and do not silently replace PSO reference prices.

The durable claim resets at **01:00 PKT**, rather than midnight. Duplicate worker deliveries coalesce across instances; a check before 01:00 cannot consume the upcoming cycle. `nextCheckAt` reflects the same boundary, including normalization of saved older midnight deadlines. The scheduled check uses the existing current effective prices for the day; a daily check does not imply a new price is published daily. Stored trip-cost snapshots are not repriced.

Only one source attempt is made per cycle, including failures. Scheduler retries are disabled to avoid misleading no-op retry success after a consumed daily claim. On source failure, previous reference prices and their actual dates remain available with an error state; if no price exists, estimates stay unavailable. No social-media price, prediction or synthetic fallback is promoted to a verified reference. PSO reference prices exclude outlet freight.

### Operator commands

Run from the app repository after deploying the worker with fuel allowed:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/fuel-cloud.ps1 Configure
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/fuel-cloud.ps1 Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/fuel-cloud.ps1 Run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/fuel-cloud.ps1 Pause
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/fuel-cloud.ps1 Resume
```

`Configure` creates/updates the daily schedule; it is not an application deploy. `Run` requests immediate dispatch but does not bypass the durable cycle claim. Read `/api/fuel/prices` to verify actual collection status; Scheduler delivery success alone does not prove a successful source fetch.

When updating the existing worker on Windows, use `--flags-file=config/cloud-run-worker-fuel.flags.yaml` to merge its comma-containing job allowlist without shell escaping problems. Do not replace or export its model secret when enabling fuel.

## English and Urdu speech

The API uses the existing Google Cloud Text-to-Speech adapter, attached Cloud Run identity/ADC, structured navigation prompts and durable shared audio cache. No browser API key or downloaded service-account key is required. Runtime settings:

```text
TTS_ENABLED=true
PUBLIC_CLOUD_SPEECH=true
TTS_MONTHLY_CHARACTER_LIMIT=100000
TTS_ENGLISH_VOICE=en-GB-Wavenet-A
TTS_URDU_VOICE=ur-IN-Wavenet-A
```

The owner explicitly chose cloud voices for **guests and signed-in users**, with a shared monthly cap. The 100,000-character allowance covers both languages and all users; it resets per UTC month. Only newly synthesized prompts reserve allowance. Reservations are atomic across instances, failed synthesis remains counted conservatively, and cached audio is reused without another provider synthesis. On exhaustion/provider failure, navigation tries a matching installed device voice; absence of such a voice is reported honestly.

Google currently lists an **Urdu (India), `ur-IN` WaveNet voice**; do not label it a dedicated `ur-PK` voice. Our directions are written in Urdu, retain real road names, and cover turns, distances, arrival, rerouting and loss of GPS. The Text-to-Speech API must be enabled and the API identity must have `roles/serviceusage.serviceUsageConsumer`. Do not grant Owner/Editor or copy credentials into the frontend. Keep speech disabled by default in local/example environments; local cloud calls still require explicit `ALLOW_PAID_SERVICES=true`.

To test on the website, open a route's navigation preview, choose English or Urdu and press **Test voice**. This explicit interaction helps satisfy browser audio policies; it does not require starting GPS guidance or sharing a real location. Verify the audio and the `Google Cloud voice` status. Device-specific GPS, speakers and autoplay policies still require real-device testing.

The bounded operator check `node scripts/check-navigation-voice.mjs https://manzil-app-v1.web.app --save-samples` makes real guest requests for the two built-in test prompts, checks actual MP3 responses and identical cache repeats, and optionally saves generic audio under ignored `test-results/`. It consumes new synthesis allowance only if those prompts are not cached. The direct API verification returned 32,832-byte English and 39,360-byte Urdu MP3s, used 101 total application characters, and repeated both without another character reservation.

The deployed guest browser preview was also verified with actual Faisal Mosque → Centaurus route results and **Test voice** in both languages. It reported **Google Cloud voice**, without requesting GPS permission or creating a user account. The voice-language selector can be changed independently of the interface language.

## Cost decisions

- [Cloud Scheduler pricing](https://cloud.google.com/scheduler/pricing): three jobs per billing account per month are free; additional jobs are $0.10/job/month. This project had two existing jobs when inspected, so the daily fuel job is its third. Other projects on the billing account may consume the free allowance. Cloud Run/Firestore usage is separate.
- [Cloud Text-to-Speech pricing](https://cloud.google.com/text-to-speech/pricing): WaveNet currently lists four million characters/month free, then $4/million characters. Billing must be enabled; this monthly product allowance is separate from an expired trial. The app's 100,000-character cap is well below that allowance, assuming other billed usage has not consumed it. Budget alerts are not hard spending caps.
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing): the existing `gemini-3.1-flash-lite` model currently lists a Free tier and paid text/image input at $0.25/million tokens, output at $1.50/million. Example estimate: 600 monthly calls (20/day), each 3,000 input and 1,000 output tokens, would cost about **$1.35/month** on paid inference, excluding infrastructure. At the configured 20,000 input/4,096 output maximum, the same 600 calls would be about **$6.69**. These are workload calculations, not measured spend.
- Stay on the existing Free tier while it clears the actual queue. The live status inspected on 18 October showed three attempts that PKT day, against the app's 20-attempt daily cap. Upgrade only if observed provider quota failures/backlogs justify it. A paid plan does not fix ambiguous road evidence or inaccurate geometry. [Actual model quotas depend on the project/account](https://ai.google.dev/gemini-api/docs/rate-limits) and should be checked in AI Studio.

Gemini billing/project/key, model, request limits and review-only publication remain unchanged by this work. Enabling Text-to-Speech in the Cloud project does not change the separate Gemini API key's Free tier. No funds or paid fallback are added automatically.
