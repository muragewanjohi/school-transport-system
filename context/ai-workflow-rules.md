# AI Workflow Rules

## Approach

Build this project incrementally using a spec-driven, test-driven workflow. Context files (`*.md` in the `context/` directory) define what to build, how to build it, and the current state of progress. Always implement against these specifications—do not infer, guess, or invent features from scratch. For any changes affecting core boundaries, update the specifications first before altering production code.

## Scoping Rules

- Work on one isolated feature unit or route at a time.
- Prefer small, compile-safe, and verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries (e.g., driver app hardware ingestion and parent app map views) in a single implementation step.

## When to Split Work

Split an implementation step if it combines:

- **Mobile Background Logic and UI:** Separate the Flutter background geolocation service or NFC reader configuration from their respective UI manifestations.
- **Multiple API Boundaries:** Keep the telemetry data ingestion APIs separate from CRUD operations on the student/school registry.
- **Complex Geofencing logic and Notification Delivery:** Separate PostGIS spatial database query calculations from the Africa's Talking API message dispatch pipeline.

If a change cannot be verified end-to-end (e.g. through unit tests or dry runs) in under 10 minutes, the scope is too broad—split the task immediately.

## Handling Missing Requirements

- Do not invent product behavior that is not documented in the context files.
- If a requirement is ambiguous or missing, do not guess; document the query in the `Open Questions` section of [progress-tracker.md](file:///c:/Dev/School-Transpot/context/progress-tracker.md) and resolve it with the user before continuing.

## Protected Files

Do not modify the following unless explicitly instructed:

- Native Gradle / Podfile / Info.plist / AndroidManifest.xml configuration files unless specifically setting up permissions for NFC/Location.
- Node.js auto-generated files (e.g., `package-lock.json` manually without `npm install`).
- Auto-generated database migration scripts manually after they have run.

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries in [architecture.md](file:///c:/Dev/School-Transpot/context/architecture.md).
- Storage schema changes or model updates in [architecture.md](file:///c:/Dev/School-Transpot/context/architecture.md).
- Code standards or API conventions in [code-standards.md](file:///c:/Dev/School-Transpot/context/code-standards.md).
- Progress milestones in [progress-tracker.md](file:///c:/Dev/School-Transpot/context/progress-tracker.md).

## Before Moving to the Next Unit

1. The current unit passes linting and compilation checks without warnings.
2. The code is verified end-to-end via automated or manual testing.
3. No invariants defined in [architecture.md](file:///c:/Dev/School-Transpot/context/architecture.md) have been violated (e.g., no mixed-tenant ingestion, no PII leakage).
4. [progress-tracker.md](file:///c:/Dev/School-Transpot/context/progress-tracker.md) is updated to reflect the completed state.
