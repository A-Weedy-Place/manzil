# Administrator workspace

Local feature-branch follow-up, 18 October 2026. This describes the code in this branch, not a deployment claim.

## Main sections

1. **Users** lists up to 50 Firebase Auth accounts per page, with search over loaded accounts and a Load more action. Administrators can verify/unverify contributors and confirm administrator grants/removals. Current server authority, disabled-account restrictions, self-demotion protection and unrelated custom claims are preserved.
2. **Review queue** combines private community submissions and posts awaiting an agent decision. The header bell opens this queue and its badge includes both kinds of review. Editing a pending community report keeps it pending; approval is a separate explicit action.
3. **Closures** is the existing map editor and report list, including schedule filtering, photos, corrections and cancellation. Verified contributors may also edit/cancel another person's pending or approved published road report. Rejected private records do not become generally accessible. The original reporter is retained, and current geometry/access/time/revision validation still applies.
4. **Pipelines** has separate collapsible cards for Champ Alerts collection, Gemini, hourly Islamabad weather and dated PSO fuel references. One **All posts** list opens each original post, saved analysis and outcome beside the list. Opening cards, refreshing saved results and reviewing a post do not run Gemini. Fetch, Run Gemini and pause/resume remain distinct explicit operations with their existing limits.
5. **Map** and **Local** remain available for operational inspection. **Account** retains identity, appearance/language, policies and sign-out. Administrators do not get commuter Plan ahead, Saved, Activity, vehicle, trip-data consent, statistics, trip history or journey-alert settings. Map route inspection does not offer personal navigation/saving controls.

The right-hand review panel supports close, outside click and Escape, with focus restored to the opening control. Small screens use the existing responsive settings-sheet behavior. A dismissed/replaced post ignores late preparation, rejection, refinement and evidence responses. Opening a prepared proposal first revalidates/prepares the saved result without another model call, so legacy service-as-road drafts can safely upgrade.

## Directory privacy

The administrative directory returns Auth directory fields and a minimal Firestore profile projection: display name, city and whether personal trip-data collection is allowed. It does **not** expose another user's GPS, trips, vehicle, neighbourhood or private profile image. A missing profile means collection has not been enabled; a failed metadata read displays **Unknown**. Listing accounts does not create their profiles. Standalone SQLite shares one local workspace and cannot establish account-specific consent, so sharing status is unknown there.

Role changes still require current Firebase Auth account authority on every request. The per-process role-write serialization is not a distributed last-administrator transaction. The directory is paginated rather than a claim to show every account in a single response.

## Bus-service reports and fares

Reviewed agent service notices use the same public Local suspension store as manual notices; they do not create car-road closures. Unknown line/scope/time details require administrator input. Approved active notices grey the affected direction/segment, while intersecting road restrictions mean **uncertain** service. Verified community reviewers do not gain permission to approve private agent proposals. See [agent service review](AGENT_TRANSIT_REVIEW.md).

Local journey options include per-boarding reference fare estimates and source/date details. Unknown or incomplete prices remain explicit, and there is no live ticket-price or fare-scraping pipeline. See [fare provenance and limitations](TRANSIT_FARES.md).

## Password recovery and release handoff

The branded `/account/action` password-reset handler is implemented and can be tested using an isolated emulator account. Making newly emailed production links use it requires the teammate's authorized frontend release and Firebase template action-URL configuration. Existing emails keep their original links. See [release steps and reset behavior](AUTH_PASSWORD_RESET.md).

No source/model activation, production roles, deployment, main merge or live service suspension is part of this feature change. The local backend's actual stored pipeline state is displayed; no status is inferred from the presence of a UI card. Consolidated executed checks and browser evidence are recorded in [implementation status](IMPLEMENTATION_STATUS.md).

At handoff, `origin/main` advanced independently to `f07778c`. This work remains on the private feature branch; no merge into that newer main or release is included. The release developer should integrate the branch deliberately and rerun release checks.
