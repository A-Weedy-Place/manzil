# Interface design decisions

Manzil is a task-first map workspace inspired by the clarity of Safar's flat map interface. Keep one persistent **2D MapLibre/OpenFreeMap** map, explicit journey fields, readable overlays and compact role-specific controls. Route switches and background refreshes must not rebuild the map unnecessarily.

## Layout and navigation

- Desktop gives the map most of the screen with a narrow navigation rail and working panel. Phones use bottom navigation and an expandable sheet.
- Ordinary users have Map, Plan ahead, Local, Closures, Saved, Activity and Profile as applicable; administrators get Users, Review queue, Closures, Pipelines, operational Map/Local and Account.
- Live map shows current PKT time/date; alternative time selection belongs in Plan ahead. Do not put a future date on the live map accidentally.
- Settings, post evidence and Gemini analysis open in consistent adjacent panels; small screens use scrollable dialogs. Provide X, Escape, outside dismissal and focus return where appropriate.
- Initial entry has a matte green background, brand mark and accessible account form. Decorative scenery is bounded and supports pause/reduced motion; the working map needs no continuous decoration or mandatory GPS.

## Visual language

| Element | Treatment |
| --- | --- |
| App default | Dark; saved Light/Dark/System respected |
| Driving map default | Classic; saved preferences respected |
| Local default | Independent pale Minimal map with prominent solid bus lines |
| Primary action | Teal, clear text, visible focus |
| Selected driving route | Thick saturated blue with casing |
| Active road restriction | Bright red road interval or short blockade stroke |
| Blocked comparison | Pale red exclusive geometry, labelled Blocked, never navigation-eligible |
| Future restriction | Yellow marker with temporary/pinned road preview |
| Bus services | Distinct non-red hues; grey means uncertainty/suspension, independently of faded selection context |
| History | Prominent green retained trace with start/end markers |
| Light panels | Neutral grey outer surfaces, pale-blue bordered inner cards |

Use shared semantic colours, small consistent Lucide icons and existing Urdu brand artwork. Pair state colour with text/symbols. Avoid competing calls to action, low-contrast cards, redundant technical copy and explanatory paragraphs where labels suffice.

## Interaction and accessibility

- Starting point and Destination need prominent labels, padded searchable fields, map selection and explicit Use current location. My location only recentres.
- Closure authoring has **Road closure** and **Blockade** choices, not the old Point/Draw/Area tool menu. Keep keyboard/coordinate and touch alternatives.
- Inputs retain drafts after errors; loading, source freshness and unavailable states are explicit. Show uncertainty where it changes a decision, rather than fabricate data.
- Background refreshes retain a previous display until a complete replacement arrives; navigation eligibility still requires fresh validation.
- Use clear focus, accessible names, adequate touch targets, RTL layouts, reduced motion and keyboard alternatives. Tables/labels expose chart values beyond hover or colour alone.
- Trip collection requires permission and explicit foreground guidance. Opening the app, planning, statistics or history never starts a separate GPS watcher.
- Source posts and Gemini analysis are evidence/proposals. Publication is a separate administrator decision; an analysis status must never look like a confirmed road closure.

Relevant implementation guides: [map workflows](../guides/MAP_EDITOR.md), [map styles](../guides/MAP_STYLES.md), [accounts](../guides/ACCOUNT_AND_PROFILE.md), [admin workspace](../guides/ADMIN_WORKSPACE.md) and [personal data](../reference/PERSONAL_TRAVEL_DATA.md).
