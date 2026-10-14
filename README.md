# Manzil منزل

Manzil is an Islamabad closure-aware commute planner proposed for the Google Cloud AI Builder Cup 2026. It turns local traffic notices into reviewed road segments and closure schedules, then evaluates their effect on planned journeys and generates useful detours or departure-time recommendations.

The current repository contains research, the implementation plan, and branding assets. **Application code has not been built yet.**

The current implementation decision is the [final architecture](MANZIL_ARCHITECTURE.md): a simple 2D Leaflet app with MapTiler raster tiles, hosted ORS, and a Google Cloud/Gemini event and commute backend.

## Project documents

- [Final architecture and implementation sequence](MANZIL_ARCHITECTURE.md): start here for the selected stack, Champ-source access plan, agent/manual closures, scheduled rerouting, personal trip analytics and learned-road roadmap.
- [Developer brief and implementation plan](ISLAMABAD_COMMUTE_PROJECT_PLAN.md): start with the quick summary; later sections contain detailed feasibility research, routing comparisons, source-code findings, architecture, and the two-person build plan.
- [Safar map findings](ISLAMABAD_COMMUTE_PROJECT_PLAN.md#19-safar-mapping-reference): verified Leaflet/CARTO Voyager web stack, its relevance to Manzil, and current basemap service conditions.
- [Mapping projects and similar-product comparison](MAPPING_PROJECT_COMPARISON.md): application and tool licenses, actual stacks, closest precedents, 3D alternatives, and recommendations for Manzil.
- [Google integration and first-month cost plan](MAPPING_PROJECT_COMPARISON.md#11-google-integrations-and-first-month-cost-plan): prioritized use cases, free quotas versus credits, optional additions, and a small pilot budget.
- [Hackathon research](AI_BUILDER_CUP_RESEARCH.md): event requirements, judging, related winners, and scope guidance.
- [Logo prompt and usage notes](assets/brand/README.md).

## Proposed first version

1. Accept an authorized local traffic notice and extract its proposed road event with Gemini.
2. Review the affected segment, direction, dates, and source evidence.
3. Evaluate the event against a saved commute's estimated traversal time.
4. Generate and validate a closure-avoiding detour, then compare permitted earlier/later departures.
5. Show a source-linked explanation and deliver advance notifications on a tested browser.

The selected deadline stack is React/TypeScript/Vite, Leaflet with MapTiler Dataviz Light raster tiles, hosted openrouteservice, Gemini on Google Cloud, Cloud Run, Firestore, Firebase Auth/FCM, Scheduler and Tasks. Provider/source access and actual Islamabad routing remain subject to the documented acceptance tests. Earlier mapping comparisons are research references rather than competing implementation decisions.

## Branding

The project and team name is **Manzil (منزل)**, meaning destination. The primary logo is a transparent PNG generated on 14 October 2026.

![Manzil Urdu calligraphy logo](assets/brand/manzil-logo-v1.png)

## Milestone

Two developers aim to finish the usable prototype by **17 October 2026**, with the core working earlier to allow UI polish and submission preparation. See the developer plan for scope, priorities, and acceptance checks.

## Credentials and dependencies

Keep API keys and local environment files out of Git. Future setup examples should use placeholders in an .env.example file. Routing/map libraries, hosted services, map data, and generated route results have separate license and attribution requirements documented in the plan.
