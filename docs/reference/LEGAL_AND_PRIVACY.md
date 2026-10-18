# Profile: terms and privacy information

Implemented for the private localhost feature branch on **18 October 2026**, Asia/Karachi. These pages describe the current prototype. They do not add an acceptance gate, change collection permission, activate an external service, create an account-deletion workflow or release the app.

## What visitors can read

Open **Profile → Terms & Conditions** or **Profile → Privacy Policy**. Both are available to guests and signed-in users. Each opens the existing adjacent settings panel, with compact document-switching buttons, a dated introduction, numbered sections and public provider/source links. The complete documents are supplied in English and Urdu; Urdu content has semantic `lang="ur"` and `dir="rtl"`. Policy text uses the existing theme tokens and scrollable mobile settings layout.

The shared modal retains its X, Escape, outside-click and repeated-setting dismissal, keyboard focus trap and restoration. Clicking inside the page, reading a section or switching documents does not dismiss it. Following an external link is an explicit action in a new tab with `rel="noreferrer"`. Merely opening the documents does not fetch private records, request GPS/notifications, write preferences or change personal-data consent.

## Content and implementation

`src/components/LegalPolicy.tsx` holds the original, versioned English/Urdu content. `ProfileSettingsDialog.tsx` defines the two new section titles and `ProfilePanel.tsx` exposes the rows and renders the same shared dialog for guests and accounts. `src/legal-policy.css` contains scoped typography, navigation and responsive styling. Short shared labels are translated in `src/lib/urdu.ts`; the long documents remain together in the legal component so the two versions can be reviewed side by side.

The terms cover research-prototype scope, safe use, incomplete/stale community reports and estimates, fixed versus schematic transit geometry, user contributions/photos, moderation, voluntary history/export, source reuse and service availability. A verified contributor badge denotes permissions rather than incident truth. Public-source licence statements are limited to the reviewed sources; they do not grant an unrelated licence to the private application.

The privacy page distinguishes Firebase-connected account storage, local emulators and the standalone shared SQLite developer workspace. It covers identity/profile/vehicle/preferences, explicit location requests, foreground navigation plus optional history, usual-route learning, saved commutes, notifications, report publication/moderation, actual external request flows, retention and the existing per-trip/saved-commute deletion controls. It explains that report cancellation is a status change, sign-out is not server deletion, public reports/other records do not inherit the trip-retention limit and this build has no self-service account deletion or delete-everything button.

No legal entity, jurisdiction, support email, legal-compliance certification, absolute security promise or assertion about data sale/model training is invented. Questions beyond in-app controls are directed to the project team through the channel where the prototype was shared; the absence of a configured dedicated support/account-deletion address is explicit. Before a wider release, the owner must supply any actual operational contact and review the text against that release's providers, policies and practices. This is an implementation handoff limitation, not a new approval gate for the authorized localhost work.

## Evidence checked against the application

| Topic | Current behaviour and evidence |
| --- | --- |
| Account and browser state | `src/lib/auth.ts` uses Firebase email/password auth with browser-session persistence in connected modes and explicitly simulated identities in standalone development. `server/config.ts`, `server/app.ts` and the storage adapters distinguish cloud, emulator and local scopes. `src/lib/language.ts` stores language in browser local storage; `src/lib/api.ts` stores guest appearance locally. Language is not described as a Firestore profile field. |
| Foreground GPS | `src/components/NavigationPanel.tsx` owns navigation location; `src/lib/useTravelCapture.ts` receives fixes, requires signed-in collection permission and visible foreground state, and discards an unsaved fragment when hidden or permission/account changes. One-time map/input location actions do not independently create trip history. |
| Consent and learning | `docs/reference/PERSONAL_TRAVEL_DATA.md`, profile controls and API/storage guards distinguish collection, learning and browser notifications. The initial Allow enables history and inference; inference can be disabled separately; withdrawal does not silently erase prior records. |
| Public reports | `server/community.ts` and closure/service routes expose published reports with contributor name/role, and restrict pending reports to authorized readers. Photo content can become public with a road report. Closure DELETE saves `status:'cancelled'`; it is not physical content erasure. |
| Retention and deletion | `server/app.ts` invokes `retainTrips`; repository adapters remove raw GPS after 30 days from trip end and summaries after 90 days when retention executes. Individual trip deletion also removes its stored snapshots. `TripHistory` and `CommutePanel` provide their existing deletion controls. No account-deletion endpoint or UI was added. |
| Maps, fonts and search | `src/lib/mapStyle.ts` fetches OpenFreeMap styles/resources. `src/styles.css` imports Google Fonts. `server/routing/places.ts` can send entered search text to configured Photon, default `photon.komoot.io`. Browser requests disclose requested map areas and ordinary request metadata; localhost does not imply offline-only operation. |
| Online routing | `server/routing/world.ts` sends chosen origin/destination/stops to the configured OSRM service, default `router.project-osrm.org`; a rerouting origin can come from current GPS. The adapter does not upload stored trace arrays. |
| Weather/fuel/voice | `server/weather.ts` refreshes fixed Islamabad weather rather than a person's position; `server/fuel.ts` fetches public PSO references. `server/speech.ts` calls Google Cloud TTS only when separately configured; `src/lib/speech.ts` otherwise attempts an available device/browser voice. Reading a policy activates neither cloud speech nor Gemini. |
| Photos and sharing | `src/lib/images.ts` validates, resizes and re-encodes selected photos; visible contents remain potentially identifying. `TripShareDialog`/`tripShareImage` create a local PNG, request basemap tiles, and require an explicit download/device-share action; exports can expose a journey and cannot be retracted by deleting the original trip. |

## Public policy and source references

These original application descriptions are based primarily on the code and repository documentation above. The following provider/source pages were opened on **18 October 2026** to verify public destinations and the relevant limited licence/privacy context; their text is not copied into Manzil's terms:

- [Firebase privacy information](https://firebase.google.com/support/privacy)
- [Google Privacy Policy](https://policies.google.com/privacy)
- [OpenFreeMap Privacy Policy](https://openfreemap.org/privacy/)
- [Komoot Privacy Policy](https://www.komoot.com/privacy)
- [OSRM service usage references](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy) — links onward to current demo-server usage information; no availability guarantee is inferred.
- [Open-Meteo terms and privacy](https://open-meteo.com/en/terms)
- [PakBus data permission](https://pakbus.app/data)
- [OpenStreetMap copyright/licence](https://www.openstreetmap.org/copyright)
- [CDA transit references](https://lists.cda.gov.pk/cdaTransitMap)

Provider policies, deployment logs, backups and device copies may have separate retention behaviour. The 30/90-day application rule is deliberately not presented as a universal deletion guarantee.

## Verification

**36 focused cases pass** across `tests/legal-policy.test.tsx` and the existing `tests/profile-dismissal.test.tsx`. Coverage includes guest access without sign-in/API/GPS/consent writes; both documents and the retention/deletion/weather explanations; document switching; inside/outside, X, Escape and repeated-row behaviour; focus restoration and keyboard wrapping; public HTTPS/new-tab links; complete Urdu document switching and semantic RTL content. Extending the section registry also subjects both policies to the existing shared-dialog dismissal matrix.

Production type/build checks and actual desktop/mobile browser evidence are recorded in `IMPLEMENTATION_STATUS.md` after integrated verification. No dependency, environment variable, database migration, Firebase rule/index change or cloud deployment is required by these read-only pages.
