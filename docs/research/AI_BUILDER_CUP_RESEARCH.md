# Google Cloud AI Builder Cup 2026 Research and Project Scope

> **Dated research.** Provider terms, prices, event details and proposed features reflect the original investigation. Use the [current architecture](../../ARCHITECTURE.md) and [status](../IMPLEMENTATION_STATUS.md) for implementation claims; recheck external facts before decisions.

The current implementation decision is recorded in [MANZIL_ARCHITECTURE.md](../archive/planning/MANZIL_ARCHITECTURE.md): simple 2D Leaflet/MapTiler/ORS with Google Cloud Gemini/event services. Earlier technology comparisons remain research context.

Verified on 14 October 2026. The participant confirmed that this is the event they registered for. Their project and team are **Manzil (منزل)**, an Islamabad closure-aware commute planner using Champ Alerts notices, Gemini, and a web map. Rerouting is a required core feature. The team has two developers and wants to finish by 17 October, preferably earlier for UI polish. Available working hours and billing/credits remain unconfirmed. The detailed developer brief is [Manzil Project Plan](../archive/planning/ISLAMABAD_COMMUTE_PROJECT_PLAN.md); it currently recommends a hosted ORS/OSM mapping stack with independent temporal validation, and documents Google via routing as an alternative.

The target is a focused, deployed AI prototype that completes a useful workflow, backed by a clear demonstration and evidence that it works. With submission listed for 18 October, build depth in the core workflow and reserve time for the submission package. The scope recommendations below are planning judgments, not extra competition rules.

## Event and timeline

Hack2skill independently operates the competition, with Google Cloud sponsorship. It invites JAPAC builders to address local problems with potential for wider adoption. [Official overview](https://aibuildercup.com/)

| Milestone | Current published date |
| --- | --- |
| Registration closed | 11 October 2026 |
| Team formation closes | 14 October 2026 |
| Prototype submission | 18 October 2026 |
| Evaluation | 19 October to 6 November 2026 |
| Finalists announced | 7 November 2026 |
| In-person finale in Singapore | 4 December 2026 |

The public pages do not state a submission hour or timezone and also use the phrase “before October 18.” Use 17 October as our internal submission target; check the registered dashboard for the actual cutoff rather than assuming midnight in Pakistan. [Official timeline](https://aibuildercup.com/)

## Eligibility and mandatory submission

Teams require 2–4 members; solo registration does not permit solo participation. Members must be 21+, JAPAC-based professionals, entrepreneurs, or startup participants. Cross-country teams within the region are allowed. Each person belongs to one team, and each team submits one solution under one theme. [Official FAQ](https://aibuildercup.com/Faqs.html)

The terms exclude both full-time and part-time students and require physical presence and legal residence in JAPAC. Pakistan is not individually named in the public eligibility text; the registered dashboard or organizer can clarify a country-specific question if one arises. [Official terms](https://docs.google.com/document/d/e/2PACX-1vRm7ChZ6Ij9fG7uFDkxzUMpwgVeBmnQ6cMDnAIEEX84AiLBOOQ9cYbl3S5OzFBbcVb8TF55s-eVpiXb/pub)

The FAQ requires four artifacts:

1. A working deployed prototype URL.
2. A public GitHub repository.
3. A demonstration video strictly under three minutes.
4. A deck explaining the solution.

A working prototype completing its workflow end to end is sufficient. Fresh projects built during the hackathon are required; previously developed projects are excluded. [Official FAQ](https://aibuildercup.com/Faqs.html)

Convert the deck to PDF. Use English for code, documentation, and presentations. The AI requirement permits Google models such as Gemini/Gemma or the listed agentic platforms; deploy through Cloud Run or Firebase to meet the narrowest wording. The Google Cloud stack must be central to the solution. [Challenges and requirements](https://aibuildercup.com/themes.html)

## Themes and scoring

The six current themes are BFSI; Retail & Commerce; Manufacturing; Media, Content & Digital Experiences; Future of Work & Enterprise Productivity; and Sustainability & Social Impact. They allow financial, commercial, industrial, content, workplace, and societal problems. [Official themes](https://aibuildercup.com/themes.html)

| Criterion | Weight | Our planning interpretation |
| --- | --- | --- |
| Technical Merit and Gen AI Implementation | 40% | Make the AI contribution essential, working, and explainable. |
| Problem Alignment and Impact | 25% | Identify a specific user and show a useful improvement. |
| Innovation and Creativity | 25% | Explain the meaningful difference from existing approaches. |
| User Experience and Solution Design | 10% | Make the main workflow coherent and easy to complete. |

The weights are official; the planning interpretations are ours. The same rubric applies to every theme. [Official FAQ](https://aibuildercup.com/Faqs.html)

For our project, a good differentiation statement should describe a capability or workflow advantage. For example, turning domain evidence into a checked recommendation and usable output is a clearer claim than saying an app has AI chat. We will evaluate the actual idea before choosing the architecture.

## Related winning projects

The current Cup's finale is still ahead. These are winners from adjacent Google Cloud/Hack2skill competitions, not winners of this exact Cup. Their rules and timelines should not be imported into our entry.

| Project | Competition and award | Demonstrated problem |
| --- | --- | --- |
| Padayon Ko | AI for Impact APAC 2024, overall winner | Scholarship discovery and application support for Filipino students. |
| Savour | AI for Impact APAC 2024, first runner-up | Help households use ingredients and reduce food waste. |
| Ayu App | AI for Impact APAC 2024, Best Usage of Google GenAI Tools | Organize fragmented medical records for easier access. |
| Case Crafter, Team Noodles | AI for Impact APAC 2024, Best User Experience | Reduce therapist administration through case notes and progress tracking. |

[Organizer's 2024 award announcement](https://blog.hack2skill.com/teams-that-emerged-victorious-ai-for-impact-hackathon)

| Project | Competition and award | Demonstrated problem |
| --- | --- | --- |
| ArtisanGully, Team Oopsie Operators | Gen AI Exchange India 2025, artisan marketplace category winner | Turn photos or voice notes into listings, styled images, and video advertisements for artisans. |
| Legal SahAI, Team Crewmate | Gen AI Exchange India 2025, legal-document category winner | Explain legal documents using retrieval-grounded analysis and a form assistant. |

[Organizer's 2025 award announcement](https://blog.hack2skill.com/gen-ai-exchange-hackathon-finale)

Recent Academy APAC Cohort 2 examples add useful context:

- **TaskPilot AI:** its builders describe a winning developer productivity project that combines scattered work signals into priorities and decision support. Their technical account names Vertex AI/Gemini, Cloud Storage, BigQuery, and NVIDIA tooling. These are participant-reported details. [Builder's project account and award transcript](https://www.linkedin.com/posts/muskannnnguptaaa_meetthebuilders-genaiacademyapac-googlecloud-activity-7492633558088355842-1LHk)
- **Digital Omamori:** the creator reports first runner-up for bilingual disaster preparedness for families and foreign residents in Japan. She describes refinement against official open data and real community signs, with judges asking about architecture and offline usefulness. [Creator's award account](https://www.linkedin.com/posts/meredithcheungmmc_googlecloud-genaiacademyapac-genai-activity-7492783285195083776-tsm9)

Savour is a particularly useful scope example. Its creator describes a broader five-stage product vision but a prototype centered on three capabilities: ingredient recognition, freshness assessment, and recipe selection. The technical account describes Gemini image analysis, Google embeddings, hybrid search, deterministic filters, and a further AI relevance check. [Creator's technical account](https://medium.com/@i.nakanishi/savour-building-ai-solutions-for-a-zero-food-waste-future-432ad37e84cc) · [Prototype demo](https://vimeo.com/1039376755)

Ayu's creator similarly describes three core functions: record scanning, accessible extraction, and searchable text/voice conversation, using Gemini and Google Cloud storage. These accounts explain implementation; they do not independently establish accuracy, security, or medical validity. [Creator's architecture account](https://medium.com/@vrindar73/why-we-started-building-an-ocr-tool-in-2024-c417a87afdf3)

Our inference from these examples is to choose a recognizable user, a concrete difficulty, and a useful workflow where AI performs meaningful work. Award descriptions do not reveal private judging scores or prove why each project won. A large feature count is not established as an advantage.

## Scope guardrails for our project

| Scope | What it looks like | Response during development |
| --- | --- | --- |
| Too little | Screens with canned AI output; a core action that cannot finish; no deployed app; unclear benefit or differentiation. | Complete the core workflow before adding presentation polish. |
| Appropriate | One primary user, one meaningful job, one main AI capability, usable output, a stable deployed demo, and a few realistic checks. | Improve evidence, reliability, and clarity around this workflow. |
| Too much for the remaining time | Several products or audiences; many integrations; new model training without a demonstrated need; elaborate account, billing, or administration systems. | Move features to the roadmap unless the core demonstration needs them. |

For every proposed feature, ask whether it is mandatory, necessary to complete the user's job, or likely to improve one of the four scoring criteria enough to justify its time. Otherwise, defer it. Useful polish includes readable results, correction paths, loading states, and understandable errors.

Model output should be live in the central demonstration. Sample or synthetic inputs can make a demo reproducible, but label them and show the real processing step. Present unavailable integrations honestly. We will choose data and integrations after hearing the idea.

Plan a small set of meaningful checks: normal inputs, an ambiguous input, and a failure or unsupported case. Record a relevant result such as task completion, extraction quality, grounded answer quality, processing time, or manual effort. Describe the sample and baseline; do not turn a few demo cases into claims of general accuracy or adoption.

Scalability can be explained through an architecture, plausible costs, data access, and identified constraints. Building every future feature or conducting a large load test is not our default use of the remaining days.

## Provisional plan through submission

Adapt this once the idea, team, and available hours are known.

| Day | Main outcome |
| --- | --- |
| 14 October | Confirm team and eligibility; choose one problem/theme; define the core workflow and differentiation; establish deployment. |
| 15 October | Complete a live path from input through AI processing to a useful result. |
| 16 October | Check representative cases, improve unreliable output, and simplify the user experience. |
| 17 October | Freeze features; finish README, PDF deck, and video; verify every public link and submit. |
| 18 October | Buffer only, subject to the organizer's actual cutoff. |

Allocate time to the submission package from the beginning. A provisional seven-slide deck could cover the user/problem, current alternative, solution workflow, Google AI/cloud architecture, differentiation, measured prototype evidence, and adoption/scaling roadmap. Seven slides is our suggestion, not an organizer limit.

A 170-second video could spend 20 seconds on the problem, 90 on the live workflow, 25 on evidence, 20 on architecture/differentiation, and 15 on limitations and next steps. Rehearse the main input in advance and check that the shared video opens without sign-in.

## Published conflicts and material terms

- The themes page still contains a different lower category list and social-impact-only wording. Use the six current themes as the planning basis and check the actual submission form if it differs. [Themes page](https://aibuildercup.com/themes.html)
- The FAQ/homepage permit team formation until 14 October, while the terms say additions/replacements are only allowed during registration through 11 October and then prohibit changes after 14 October. The terms assert precedence over inconsistent promotional material. If roster action is still needed, the dashboard and organizer must resolve this contradiction. [FAQ](https://aibuildercup.com/Faqs.html) · [Terms](https://docs.google.com/document/d/e/2PACX-1vRm7ChZ6Ij9fG7uFDkxzUMpwgVeBmnQ6cMDnAIEEX84AiLBOOQ9cYbl3S5OzFBbcVb8TF55s-eVpiXb/pub)
- The terms include a six-month right of first refusal for exclusive licensing/acquisition of submitted materials, with a 30-day response period, plus promotional rights. This matters if the entry is also a planned commercial product. Use permitted data and assets and keep secrets out of the public repository. [Terms](https://docs.google.com/document/d/e/2PACX-1vRm7ChZ6Ij9fG7uFDkxzUMpwgVeBmnQ6cMDnAIEEX84AiLBOOQ9cYbl3S5OzFBbcVb8TF55s-eVpiXb/pub)

The prize structure is $10,000/$7,000/$5,000 for the top three, plus four $2,000 special awards: Google AI tools, impact, social choice, and UI/UX. [Official rewards](https://aibuildercup.com/rewards.html)

Only two team members may attend the Singapore finale. Flights, accommodation, and event-day meals are sponsored; visas are participants' responsibility. [Official FAQ](https://aibuildercup.com/Faqs.html)

Organizer announcements advertise credits and expert mentorship, but do not establish a credit amount or redemption entitlement for this participant. Check the registered dashboard. [Organizer announcement](https://www.linkedin.com/posts/hack2skill_aibuildercup2026-buildersassemble-googlecloud-activity-7505169924772827136-WjJg)

## Context for future project decisions

The user wants active scope guidance because time is limited. Use the detailed project plan to preserve their proposed features and the recommended prototype/roadmap split. Establish available hours, team responsibilities, accessible data, and current progress before implementation, then evaluate additions against the four weighted criteria and the 17 October target.

During work, flag both scope expansion that threatens completion and shortcuts that undermine live functionality or credible evidence. Keep the project centered on a deployed, useful core workflow and a complete submission by our internal target. Recheck organizer requirements before submitting because rules may change.
