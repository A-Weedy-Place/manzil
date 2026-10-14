# Manzil workspace

Read PROJECT_CONTEXT.md and docs/IMPLEMENTATION_STATUS.md before changing scope. The original full feature inventory is in PROJECT_CONTEXT.md and ISLAMABAD_COMMUTE_PROJECT_PLAN.md.

The current task is a localhost build. Keep Google Cloud deployment and the user's Gemini reasoning agent as future integrations. Do not publish the private repository or deploy the app without the owner's instruction.

Keep docs/IMPLEMENTATION_STATUS.md and the relevant API/routing/source documentation current with actual tested behavior. Record material limitations rather than present fallback fixtures, synthetic events or partial source access as live verified data.

Use GeoJSON [longitude, latitude] coordinates throughout domain/API contracts. UI scheduling uses Asia/Karachi. Preserve route closure/time/access validation and explicit unavailable states. Run meaningful routing/API tests and the production type/build check before handoff.

Do not commit local databases, GPS traces, source archives, API keys, browser profiles or session credentials. A localhost single-user server is not a production authentication system.
