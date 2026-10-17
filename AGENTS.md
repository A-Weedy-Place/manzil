# Manzil workspace

Read PROJECT_CONTEXT.md and docs/IMPLEMENTATION_STATUS.md before changing scope. The original full feature inventory is in PROJECT_CONTEXT.md and ISLAMABAD_COMMUTE_PROJECT_PLAN.md.

The core app is deployed to Firebase Hosting/Cloud Run in project manzil-app-v1, region asia-southeast1; standalone and emulator development remain available. Current community/profile/admin changes are localhost feature-branch work until separately released by the deployment developer. Read docs/FIRST_DEPLOYMENT.md before changing the live deployment. Keep the private repository private and never migrate local SQLite/GPS data implicitly. Gemini integration, cloud speech activation, private scheduling and the extended agent correction/audit/override workflow remain separate work; do not present them as active services. The community moderation and user-verification workspace is implemented locally; see current status before treating older admin proposals as current scope.

Keep docs/IMPLEMENTATION_STATUS.md and the relevant API/routing/source documentation current with actual tested behavior. Record material limitations rather than present fallback fixtures, synthetic events or partial source access as live verified data.

Use GeoJSON [longitude, latitude] coordinates throughout domain/API contracts. UI scheduling uses Asia/Karachi. Preserve route closure/time/access validation and explicit unavailable states. Run meaningful routing/API tests and the production type/build check before handoff.

Do not commit local databases, GPS traces, source archives, API keys, browser profiles or session credentials. A localhost single-user server is not a production authentication system.
