# Manzil interface decisions

The founder prefers Safar's simple, fast 2D interface. After the 15 October screenshot review, use one persistent flat MapLibre/OpenFreeMap vector map, a clear trip/editor panel, five primary navigation items and minimal map controls. No 3D, marketing landing page, continuous animation or mandatory location permission. See [the redesign guide](REDESIGN_2026-10-15.md).

Applied UI/UX Pro Max's minimalism, contrast, keyboard focus, explicit labels, touch targets and reduced-motion guidance. Its generated marketing funnel/enterprise gateway page patterns did not fit this utility and were discarded. This is a task-first map workspace.

- Neutral surfaces, teal actions, thick blue routes and bright red closures. Light/dark/system themes use shared semantic colour variables.
- Small consistent Lucide SVG icons. Existing Urdu calligraphy artwork is the brand asset.
- Visible form labels; errors retain input. Text/symbols accompany state colors.
- Desktop map dominates the workspace; mobile controls use an expandable sheet and bottom navigation. Journey fields collapse after planning to give route cards priority.
- Drawing has button/coordinate alternatives; route endpoints have searchable text choices.
- Product messages explain route coverage, estimates, pending agent work and source freshness where those facts affect decisions.
- No GPS recording until an explicit start action and consent. No source excerpt is treated as an automatic closure without the later agent/review service.
