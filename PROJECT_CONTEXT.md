# Manzil product context

**Approved current integration (18 October):** preserve feature PR #4 admin/fare/password recovery and documentation/licensing work alongside main fuel/cloud voices and shared labelled demos. Explicit, precisely resolved road and Metro closures publish automatically; unresolved scope remains in review. Unknown expiry is provisionally **two days**, ending earlier on matching reopening evidence. Metro notices update Local service availability. Reassess pending saved work without new model calls; preserve admin overrides. No bundled/offline Urdu voice pack. Run only relevant tests. See [current policy](docs/operations/SELECTIVE_AGENT_PUBLICATION.md) and implementation status for actual validation/deployment.

**Manzil (منزل)** means destination. The product helps commuters anticipate restrictions, choose clear routes and understand how closures affect local transport. Two developers coordinate feature development and deployment/integration through Git.

This is the durable product brief. [Implementation status](docs/IMPLEMENTATION_STATUS.md) states current behavior; [architecture](ARCHITECTURE.md) explains how it works. The [original inventory](docs/archive/planning/ISLAMABAD_COMMUTE_PROJECT_PLAN.md) and [full context record](docs/archive/context/PROJECT_CONTEXT_2026-10-18.md) preserve earlier requests, including superseded preferences. They are historical evidence rather than active instructions.

## User experience

1. Sign in, create an account or continue as a guest. Ordinary login does not replay onboarding; new accounts and explicit guest entry can receive a short replayable tour.
2. Keep controls simple and routes visible. Clear start/destination fields, distinct alternatives and street rerouting matter more than decorative 3D effects or explanatory paragraphs in every control.
3. New defaults: **dark app appearance, Classic driving map**, with **Minimal** independently used in Local. Respect saved preferences. Offer independent Minimal/Night maps and English/Urdu.
4. The live map shows current PKT time; **Plan ahead** handles a selected date/time. Evaluate restrictions at traversal time rather than colouring currently open roads as closed.
5. Active restrictions use vivid red geometry; upcoming events use yellow markers and on-demand previews. Red is reserved for road restrictions, not bus-line branding.
6. Preserve current routes while refreshing in the background; replace results when ready without disruptive greying.

## Feature inventory

| Domain | Product requirement and current direction |
| --- | --- |
| Driving | Search, A/B/stops, up to three distinct eligible alternatives, estimates, blocked-baseline comparison and ordinary street routing. Never invent alternatives. |
| Restrictions | **Road closure:** continuous selected road interval. **Blockade:** short cross-road barrier. Separate barriers remain separate reports so middle intersections can remain accessible. Times/unknown expiry, notes/source and multiple photos. |
| Contributors | Guests, ordinary members, verified contributors and administrators. Private ordinary submissions need review; verified/admin reports can be public. Reviewers inspect/correct reports; admins manage verification/admin claims. |
| Source intelligence | Supported public Champ Alerts X access/manual import, bilingual Gemini road/service interpretation, private proposals and administrator decisions before publication. |
| Local transport | Twin Cities routes/stops/transfers, focused selected options and reference fares. Road overlap means uncertain service; explicit reviewed notices suspend a stated line/section/time. Preserve source gaps and unknown schedules. |
| Navigation and alerts | Foreground GPS, English/Urdu voices, saved commutes and usual-route alerts. Device limitations remain honest without crowding ordinary guidance. |
| Account and vehicle | Profile/photo, major Pakistan city/area, car/motorcycle, petrol/diesel and km/litre, appearance/language, recovery and privacy. Admin workspace is operational rather than a personal commuter dashboard. |
| Consented travel | Navigation-owned capture, weekly/monthly summaries, distance and price-history charts, map history, export/delete and branded image sharing. Retain historical vehicle/rate/weather snapshots where supported. |
| External context | Shared hourly Islamabad weather for live/planned hours; dated PSO fuel references and cost estimates. City/provider/date coverage is explicit. |
| Operations | Users, Review queue, Closures, Pipelines and adjacent evidence/analysis panels. Actual state and bounded controls, not a simulated live dashboard. |

## Invariants

- GeoJSON uses `[longitude, latitude]`; scheduling uses Asia/Karachi and storage uses unambiguous instants.
- Road selection is not city-gated. Real topology/access and bounded source availability still apply. Pakistan driving, Twin Cities transit and Islamabad weather are separate coverage boundaries.
- Validate route access, geometry, restrictions and time. Pending reports/proposals never affect public routing.
- **Every agent map/service action requires administrator review**, including reopening. This supersedes earlier automatic-publication planning.
- Only opted-in users have travel recorded; collection is foreground/accuracy-gated. Activity does not start recording. Administrators cannot browse another user's private GPS/trip/vehicle data.
- Forecasts, reference fares, fuel costs, inferred road alignments and speed-based ETAs are estimates. Do not imply live traffic or live bus tracking.
- Public source access can be incomplete. Manual imports do not prove a complete X/WhatsApp feed.
- Source pushes, deployment, model/service activation and production roles are distinct authorized operations.

## Deferred directions

These preserve original intent; they are **not implementation claims**:

- Closed-app push and stronger mobile/background navigation; broader verified device voices.
- Licensed traffic and real-time operator feeds, wider national transit and current fare/timetable feeds.
- Additional trustworthy sources, including authorized WhatsApp ingestion if available, and source-completeness monitoring.
- Further user-owned Gemini reasoning beyond the bounded current integration; preserve review by default.
- Privacy-preserving candidate unmapped-road discovery from multiple opted-in trips plus independent validation. **Private traces never automatically become public roads.**
- CNG/high-octane/EV estimates once reliable price/unit data exists; broader weather and scaling when justified.

## Working agreement

Continue on `codex/feature-development`, preserve teammate changes, document actual checks and hand over reviewable commits. Main integration/deployment belongs to the release developer unless directed otherwise. Keep data/secrets/raw source archives out of Git. [Contributing](CONTRIBUTING.md), [agent instructions](AGENTS.md), [deployment](docs/operations/DEPLOYMENT.md).
