# Seven month-long localhost test closures

This is an explicit local QA fixture, not a traffic feed or a report of real road closures. The separate seed command creates **seven synthetic published restrictions**, starting when the command runs and ending **32 days later**. It is never called by the app launcher or production startup.

**Actual localhost execution on 18 October 2026 succeeded: seven closures were created for 32 days.** This result is for the guarded `demo-manzil` emulators; no live deployment or production seed was performed. Current exact schedules and integrated/browser checks are recorded in [implementation status](IMPLEMENTATION_STATUS.md).

| Fixture suffix | Section |
| --- | --- |
| `faisal-avenue` | Faisal Avenue |
| `nazimuddin-road` | Sir Khwaja Nazimuddin Road |
| `margalla-road` | Margalla Avenue |
| `rohtas-road-streets` | Rohtas Road |
| `tipu-sultan-streets` | Tipu Sultan Road |
| `sumbal-road-streets` | Sumbal Road |
| `26-number` | Illustrative section near the public 26 Number place |

Each ID starts **`local-test-month-v1-`**. Titles begin **Test ·** and descriptions explicitly identify synthetic testing. Six sections reuse the existing demo catalogue's public OSM geometry. Where the catalogue has a point, the seed projects only onto the corresponding named road within 80 metres and chooses a short interior segment; it fails rather than inventing a distant road match. These are closure footprints, not navigation itineraries or claims that the roads are actually closed.

**26 Number is different:** the public geocoded place is [OSM node 5318062321](https://www.openstreetmap.org/node/5318062321), outside the bundled Islamabad road graph. Its short drawing is explicitly illustrative and is not verified road alignment. It must not snap kilometres away to an unrelated local road. The normal polygon/time checks still apply to any online route candidate crossing that area; this does not give the online provider support for arbitrary polygon-avoiding rerouting.

## Run against the existing local emulators

With Auth **9099** and Firestore **8080** already running:

```powershell
$env:MANZIL_MODE = 'emulator'
$env:FIREBASE_PROJECT_ID = 'demo-manzil'
$env:GOOGLE_CLOUD_PROJECT = 'demo-manzil'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
.\.local-tools\node-v24.22.0-win-x64\node.exe --import tsx scripts/seed-local-test-closures.ts
```

The guard rejects production/standalone mode, a different project, cloud runtime indicators, missing hosts and non-loopback/alternate ports before initializing Firebase. No fallback cloud credentials or emulator host values are supplied by the script. It uses the real Firestore repository to read catalogue geometry, then creates the seven deterministic closure documents, shared marker and event revision in one atomic transaction. Output lists IDs and counts, not GPS traces or credentials.

The shared **`demoScenario:local-test-month:v1`** marker makes this one-shot. Repeating the command does not extend schedules, recreate deleted fixtures, undo cancellations or overwrite edits. An existing deterministic-ID document is preserved even without the marker. Other closures, users, profiles, photos, consent and fuel/source data are untouched. Expired fixtures stay expired; deliberate renewal should use normal authorized editing rather than silently resetting the marker.

## Map display and routing boundaries

The usual bright-red road coating is clipped to real graph edges inside the affected polygon. A valid line drawing wholly outside the graph's coverage can instead appear as its own red centerline, only while published and active. It is returned with **`unverifiedDrawing: true`** in the road-display feature properties. Every segment must be contained by the closure polygon, and no local matched-road display may already exist. This is an explicit drawing fallback, not nationwide road matching. Point/polygon-only drawings, uncontained lines and in-coverage areas with no matched road do not receive an invented road line.

The fallback changes display only. It adds no graph edges, road-access permissions, routing shortcuts or timing exceptions. Closure activation remains start-inclusive and end-exclusive. The planner continues to validate every candidate against the stored polygon, access rules and traversal time.

`tests/local-test-closures.test.ts` covers guarded hosts/projects, 32-day schedules, all seven painted IDs, real local-road footprints, the outside-graph limitation, atomic metadata/revision writes, idempotence, preserved edits/deletions and excluded inactive/uncontained/in-coverage fallbacks. Cache and existing closure/demo routing regressions remain separate. Actual seed dates, resulting IDs/counts and browser evidence belong in [implementation status](IMPLEMENTATION_STATUS.md).
