# Progress Tracker

## Current Phase

- **Phase 2: Next.js Admin Dashboard Bootstrapping**

## Current Goal

- Configure the Next.js admin app workspace, integrate CSS design tokens, and build the interactive UI simulator panel.

## Definition of Done (testing gate)

A feature unit, API route, Edge Function, or Flutter screen **must not** be moved to **Completed** until the checklist below is satisfied. Compile/build success alone is not enough.

### 1. Behavior-Driven Development (BDD) — all stacks

**Working file:** [bdd.md](bdd.md) — the single source of active BDD scenarios for the module currently in progress.

| Rule | Detail |
| :--- | :--- |
| **Write here first** | Before or while implementing, author Given / When / Then scenarios in [bdd.md](bdd.md). |
| **Overwrite per module** | Starting a **new** module or feature **replaces the entire** [bdd.md](bdd.md) file (do not append prior modules). Prior behavior is preserved in tests and Completed notes. |
| **Minimum** | At least one happy-path scenario and one failure/edge scenario. |
| **Automate** | Map each scenario to a test (Node: Vitest/Jest + optional Cucumber/Gherkin; Flutter: `bdd_widget_test` / Gherkin or clearly named `testWidgets` that mirror the scenario title). Update the Automation map table in [bdd.md](bdd.md). |
| **Complete** | Only after scenarios pass; cite [bdd.md](bdd.md) scenario titles (and test paths) in the **Completed** bullet. |

| Step | Expectation |
| :--- | :--- |
| **Discover** | Capture the user/system behavior in plain language (role, goal, outcome). |
| **Specify** | Overwrite [bdd.md](bdd.md) with Module metadata + Gherkin scenarios for this unit only. |
| **Automate** | Map each scenario to a test; fill the Automation map in [bdd.md](bdd.md). |
| **Verify** | All scenarios for this module pass locally (and in CI when present). Set Status → `passing`. |
| **Document** | Reference scenario titles / test paths in the **Completed** bullet; next module overwrites [bdd.md](bdd.md) again. |

### 2. Node.js / Next.js / Deno (`apps/admin_dashboard`, `supabase/functions`)

Follow [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodejs-testing-best-practices) (Goldberg / Yoni). Apply at least:

| Practice | Application here |
| :--- | :--- |
| **Include 3 parts in names** | `describe`/`it` names state unit under test, condition, and expected result (e.g. `POST /api/demo-requests › valid payload › returns 200 and persists lead`). |
| **Structure tests by AAA / GWT** | Arrange–Act–Assert (or Given–When–Then) clearly separated; one logical assert focus per test. |
| **Test the public API / behavior** | Prefer route-handler and service-level tests over brittle internal implementation details. |
| **Avoid global state leakage** | Isolate env, DB, and mocks per test; reset Supabase mocks / fetch stubs in `beforeEach`/`afterEach`. |
| **Use realistic, but not production, data** | Fixtures with synthetic PII only; never real parent phones or student names from production. |
| **Mock external I/O at boundaries** | Resend, Africa's Talking, Vercel Domains, Google Geocoding — mock HTTP; do not call live third parties in unit/integration tests. |
| **Test error paths** | 4xx validation, 401/403 auth, 5xx upstream failures, and timeout/abort where relevant. |
| **Prefer black-box integration for APIs** | Hit Route Handlers with `Request` objects (or a thin test helper); assert status, JSON body, and side effects via mocked clients. |
| **Keep tests deterministic & fast** | No arbitrary `sleep`; fake timers for expiry/TTL; aim for suite runtime that stays within the 10-minute verification budget for the unit. |
| **Cover security-sensitive paths** | RLS/tenant mismatch, demo vs paid tenant SMS kill-switch, platform-only routes. |

**Commands (when configured):** e.g. `npm test` / `npm run test:unit` in `apps/admin_dashboard`; Edge Function tests colocated or under `supabase/functions/**/test`. Fail CI if coverage of the changed module’s critical paths is missing.

### 3. Flutter (`apps/driver_app`, `apps/parent_app`)

Use official Flutter testing layers and BDD-aligned naming:

| Layer | Tooling / practice |
| :--- | :--- |
| **Unit** | Pure Dart tests for mappers, validators, Riverpod/Bloc notifiers (mock repositories). |
| **Widget** | `testWidgets` + `WidgetTester` for screens/forms; pump with controlled providers; assert text, disabled states, error banners. |
| **Golden (optional)** | For stable visual chrome (login, checklist) where regressions are costly. |
| **Integration** | `integration_test` for critical flows (login → console, OTP → home) on a device/emulator when the module claims end-to-end Done. |
| **Async / platform** | Fake `MethodChannel`s for NFC/location; never require real GPS/NFC hardware to mark a unit complete. |
| **Network** | Mock Supabase / HTTP clients; assert loading → success/error UI. |

**Commands:** `flutter test` (unit/widget); `flutter test integration_test` when claiming E2E Done. Analyze with `flutter analyze` clean before complete.

### 4. Completion checklist (paste into Completed notes)

Before moving an item to **Completed**, confirm:

1. BDD scenarios written to [bdd.md](bdd.md) (happy + failure), Status `passing`, and automated where feasible.
2. Stack-appropriate tests added/updated and **passing**.
3. Lint/analyze + compile/build clean for the touched app(s).
4. No architecture invariant regressions (tenant isolation, PII in logs, demo SMS dry-run).
5. Manual smoke only as a supplement — not a substitute — for the automated gate above.

## Completed

- Reviewed ecosystem features, invariants, boundaries, and overall scopes.
- Populated project development rules and boundary-splitting thresholds in [ai-workflow-rules.md](file:///c:/Dev/School-Transpot/context/ai-workflow-rules.md).
- Documented Next.js serverless API standards, Supabase RLS policies, and Flutter client guidelines in [code-standards.md](file:///c:/Dev/School-Transpot/context/code-standards.md).
- Formulated color theme tokens, font pairings, layout schemes, and button metrics in [ui-context.md](file:///c:/Dev/School-Transpot/context/ui-context.md).
- Created monorepo workspace file layout and folder structure (`apps/`, `supabase/`).
- Initialized root `package.json` for npm workspaces mapping.
- Created Supabase configuration parameters in `supabase/config.toml`.
- Developed initial SQL database migration schema (`20260613000000_init_schema.sql`) including PostGIS extensions, tables, alerts queues, spatial indices, automatic auth-sync profile triggers, spatial geofence checkers, and Row Level Security (RLS) policies.
- Bootstrapped Next.js framework in [apps/admin_dashboard](file:///c:/Dev/School-Transpot/apps/admin_dashboard).
- Removed Tailwind config to enforce Vanilla CSS modules per design instructions.
- Configured [globals.css](file:///c:/Dev/School-Transpot/apps/admin_dashboard/src/app/globals.css) with HSL custom properties, dark-mode glassmorphic layouts, and sidebar grids.
- Loaded Outfit (Sans) and JetBrains Mono fonts in [layout.tsx](file:///c:/Dev/School-Transpot/apps/admin_dashboard/src/app/layout.tsx).
- Created interactive dashboard console simulation in [page.tsx](file:///c:/Dev/School-Transpot/apps/admin_dashboard/src/app/page.tsx) to dynamically test telemetry pings and NFC taps.
- Declared Next.js serverless health endpoint in [route.ts](file:///c:/Dev/School-Transpot/apps/admin_dashboard/src/app/api/health/route.ts).
- Verified Next.js Turbopack build succeeds with zero TypeScript errors.
- Created environment variables template file `apps/admin_dashboard/.env.example`.
- Created Supabase client connector client helper `apps/admin_dashboard/src/lib/supabaseClient.ts` with custom JWT scoping support.
- Built serverless API Route Handlers for transit routes `/api/routes` and live coordinates telemetry `/api/telemetry` with Zod schema verification and simulation fallbacks.
- Installed `mapbox-gl` and `@types/mapbox-gl` packages, and integrated an interactive Dark-themed map into the dashboard UI page with custom animated HTML DOM bus markers.
- Added Supabase Realtime channel WebSocket subscription listeners inside the dashboard UI page to receive and project database coordinate streams dynamically.
- Verified that the workspace project compiles and builds successfully with zero compiler, lint, or type check errors.
- Created and deployed the Supabase Deno Edge Function `send-sms` for Africa's Talking SMS API gateway notification integration.
- Created the database webhook trigger migration script `20260616120000_add_webhook_trigger.sql` utilizing async `pg_net` HTTP posts.
- Bootstrapped the Driver mobile application (`apps/driver_app`) Flutter workspace and configured required telemetry/NFC dependencies and hardware permissions for Android and iOS.
- Wrote database schema extensions (`20260617100000_fleet_management.sql`) for capacity, fuel level, odometer, maintenance log schema, and conductor role check constraints.
- Decoupled Fleet Management and Staff Management, creating separate page routes for drivers (`/staff/drivers`) and conductors (`/staff/conductors`) with bus slot allocation.
- Refactored the dashboard sidebar navigation with a collapsible Staff Management menu featuring path-aware link highlighting.
- Built a premium dark-mode Fleet Management console showing physical inventory telemetry (capacity, fuel gauges, compliance alerts, and maintenance log checks) alongside a state simulator.
- Verified that the admin dashboard compiles and builds successfully with zero TypeScript, bundler, or syntax errors.
- Created database migration script `20260617110000_staff_status_and_id.sql` to add `status` check constraints and `national_id` columns to `public.profiles`.
- Enhanced the Driver and Conductor APIs (`/api/drivers` and `/api/conductors`) to support, validate (via Zod), and return `status` and `national_id`, with resilient database insert error catches that fall back to mock saves to ensure sandbox interactivity.
- Updated `/staff/drivers/page.tsx` and `/staff/conductors/page.tsx` to render availability status badges, display National ID numbers, enforce validation rules inside drawer forms, and sync profile status toggles to `localStorage` sandbox state.
- Replaced the simple static status badge on the driver and conductor roster cards with an iOS-style custom glassmorphic ON/OFF switch toggle to allow changing status on-the-fly directly on the card.
- Automated Next.js compilation build verification checks to guarantee zero TypeScript or syntax errors.
- Verified visual layouts, switch toggle transitions, validation feedback, and state synchronizations successfully through automated browser tests.
- Developed database migration scripts `20260617120000_student_dropoff_and_guardians.sql` and `20260617130000_student_status.sql` to support custom parent contacts and attendance states in Supabase.
- Configured resilient serverless route endpoints `/api/students` and `/api/students/[id]` to process multi-guardian JSONB arrays, handle Zod schemas for Present/Absent status, and resolve geographic Point geometries.
- Built the Student Manifests Registry dashboard (`/students`) in a structured list table format with dynamic real-time query searching by student name, route, stop coordinates, guardian name/phone, or NFC card hash.
- Designed inline iOS-style custom glassmorphic switch toggles within table rows for instantaneous optimistic attendance status updates.
- Added a Client-side CSV spreadsheet onboarding template parser allowing bulk registration of students with custom route/stop matching and parent contact parsing.
- Integrated browser `confirm()` confirmation popups on all deletion events (vehicles, drivers, conductors, and students) across the entire admin command center.
- Verified Next.js Turbopack build succeeds with zero compiler, lint, or type check errors.
- Developed database migration `20260625000000_add_admin_role_to_profiles.sql` to support sub-roles (Super Admin, Dispatcher, Fleet Manager, Roster Manager) via `admin_role` column and check constraint.
- Built API endpoints `/api/users` and `/api/users/[id]` to query, create, update, and delete administrator accounts with zod validations and database fallbacks.
- Constructed the Admin Management registry dashboard (`/users`) featuring role filtering, metrics, and slide-out onboarding drawers, along with a role-based permission matrix.
- Verified that the dashboard builds successfully with zero compiler, lint, or type check errors.
- Developed database migration `20260625010000_add_otp_to_profiles.sql` to store login OTP codes, and added an `is_emergency` flag to the `live_coordinates` table.
- Upgraded the driver registration API and frontend page to generate, store, and display sandbox OTP codes, while dispatching SMS via Africa's Talking.
- Created `/api/auth/driver-login` to authenticate drivers and resolve session details (tenant, vehicle, and active route).
- Developed a daylight-optimized, high-contrast Flutter Login Screen with oversized input fields.
- Implemented an interactive manual Student Checklist boarding manifest in the Driver Console supporting optimistic state updates.
- Integrated a long-press Emergency SOS panic button that signals distress logs to background coordinates streaming.
- Verified that both Next.js and Flutter compilation and analysis checks pass with zero errors.
- Created database migration to seed default school tenant and updated the new user DB sync trigger to automatically fall back to defaults when user metadata is absent.
- Implemented React Context AuthProvider handling session verification, role-based access control, route protection, and transparent access token injection for all outgoing `/api/*` fetch calls.
- Integrated Sidebar footer to render active administrator profile details and bound the "Sign Out" button to the auth sign-out function.
- Designed premium dark-mode login form featuring forgot password recovery links and a dedicated reset password page, with sandbox bypass fallback mode.
- Integrated user registration directly into the Admin Management onboarding drawer, using a client-side non-persisting client to register users in Supabase Auth without disrupting active sessions.
- Resolved Row Level Security (RLS) query visibility mismatch by patching the JWT claims helper functions to extract `role` and `tenant_id` from request `user_metadata` instead of standard database roles.
- Fixed the Billing page reload UX by keeping the sidebar layout visible during page load and fetching operations.
- Implemented real-time dynamic tenant billing metrics by aggregating counts across student, route, driver, and notification logs in the backend API router.
- Designed and built the System Configurations Console (schema migrations, GET/POST router, and multi-tabbed React configuration board) with role-based editing locks.
- Refactored the Fleet Management console: removed fuel level and odometer attributes from Zod schemas, API endpoints, UI display cards, and onboarding forms, and disabled local sandbox localStorage caching in favor of direct database fetching.
- Verified Next.js dashboard compiles and builds successfully with zero compilation or typecheck errors.
- Updated the driver-login backend API and Flutter driver application to support both Driver and Conductor roles, including role-specific profile header UI styling.
- Implemented login restriction checks rejecting driver/conductor accounts whose status is set to 'Unavailable' with a 403 Forbidden response.
- Resolved conductor-to-vehicle bindings inside the backend login handler by checking conductor slot allocations.
- Fixed `CannotPostForegroundServiceNotificationException` runtime crash on Android 13+ devices by requesting `POST_NOTIFICATIONS` permission natively in `MainActivity.kt` and declaring it in the manifest.
- Created database stored procedure `verify_driver_login` utilizing `SECURITY DEFINER` to securely bypass RLS, and updated the Next.js `/api/auth/driver-login` endpoint to call this RPC function, resolving authentication query visibility failures.
- Dropped the `profiles_id_fkey` foreign key constraint to permit staff accounts (using random UUIDs) to be created directly in `public.profiles` without requiring `auth.users` records.
- Removed local browser `localStorage` caching logic across the entire Admin Dashboard (Drivers, Conductors, Users, Students, Routes, Stops, and Schedules), connecting all loads, saves, edits, and deletions directly to the PostgreSQL database via API routes.
- Created PUT and DELETE API endpoints for driver/conductor detail routes (`/api/drivers/[id]` and `/api/conductors/[id]`).
- Refactored the bulk CSV student importer to write imported rows directly to the database via API requests.
- Verified successfully that both the Next.js admin dashboard and Flutter driver application compile and build with zero errors.
- Integrated Mapbox Traffic & Directions Matrix API: configured asynchronous `eta_calculation_queue` table and triggers, created `calculate-eta` Edge Function to query Mapbox driving-traffic Matrix API with Haversine fallback, updated the configurations dashboard UI to document `{duration_mins}` and `{eta_time}` custom templates, styled dashboard maps with `traffic-night-v2` styles, and modified Flutter driver app maps to stream `traffic-day-v2` raster tiles.
- Redesigned the public marketing landing (`/`) for **On The Bus**: light conversion-focused layout with hero device mocks, features, how-it-works, stakeholders, KPIs, testimonials, pricing, and CTA; CSS scoped under `.landing-page`.
- Updated `/` landing to match the Stitch **OnTheBus Landing Page** Green Edition screen (project `14780419113259071345`), including local hero/media assets under `public/stitch/`.
- Implemented Phase 1 Schools console: migration `20260730180000_schools_campuses_billing.sql` (soft-delete tenants, `campuses`, `campus_monthly_fee_kes`, `admin_campus_access`, platform settings), `/api/tenants` + `/api/tenants/[id]`, `/schools` UI with email invite onboarding, sidebar link for `role = super_admin`, billing fee rollup by campus count.
- Applied `schools_campuses_billing` migration to the linked Supabase project via MCP; seeded default campus for Safaricom Track School; promoted `muragedev@gmail.com` to platform `super_admin` (`tenant_id` null + auth metadata).
- Applied security advisor hardening: removed sandbox `Allow public *` RLS policies, locked SECURITY DEFINER search_path/execute grants, tightened avatars storage policies; login/reorder RPCs now service-role only via Next.js API routes. Remaining PostGIS/`spatial_ref_sys` advisories are unactionable false positives.
- Secured driver ops: signed `drv.*` session tokens from `/api/auth/driver-login`, `/api/driver/telemetry` + auth-gated fleet/students/stops/trips/config APIs via service role; Flutter driver app sends Bearer token (re-login required).
- Tenant retention lifecycle (2026-08-01): migration `20260801000000_tenant_lifecycle.sql` (`tenants.suspended_at`, `suspended_purge_days` / `deleted_purge_days` settings, applied via MCP); `/api/platform/purge` run daily by Vercel Cron; soft delete now releases the school subdomain from Vercel (`src/lib/vercelDomains.ts`); retention editable in `/schools?tab=settings`.
- Request Demo + Demo School (2026-08-03): `/request-demo` lead form + `POST /api/demo-requests`; static internal `demo` tenant; SMS kill-switch; landing CTAs rewired off mailto. Resend emails: receipt on submit, confirm, complete.
- Demo request operations (2026-08-03): platform pending-request badge and `/schools?tab=demos` workflow (`pending` → `confirmed` / `completed` / `declined`).
- Per-school demo stores (2026-08-03): Confirm provisions `{slug}-demo.onthebusapp.com` with geo-shifted slim roster (1 driver, 1 conductor, 3 guardians, 5 students + avatars); request phone for Flutter parent/driver OTP; school name from request; 14-day `demo_expires_at`; Complete/expiry hard-purge + Auth cleanup.
- BDD gate bootstrap (2026-08-03): Vitest in `apps/admin_dashboard`; per-school demo store scenarios in [bdd.md](bdd.md) Status `passing` (`npm test` — slug/phone/onboarding guards; 11 tests).
- Interactive journey preview (2026-08-03): landing-page steps now reveal branded stage imagery and concise guidance on hover/focus, with a touch-friendly mobile accordion and reduced-motion support. BDD scenarios in [bdd.md](bdd.md) Status `passing`; desktop hover, keyboard semantics, and 390 px mobile tap verified; `npm test` (11 passing) and `npm run build` pass.
- Play Store prep (2026-08-03): Parent Android `applicationId`/`namespace` corrected to `com.schooltrack.parent_app` (was duplicated `...parent_app.parent_app`); launcher display names set to **OnTheBus Driver** / **OnTheBus Parent** (Android + iOS); release signing wired in both `android/app/build.gradle.kts` files via gitignored `android/key.properties` (+ `key.properties.example`).
- Public legal pages (2026-08-05): landing footer Legal links to `/privacy`, `/terms`, `/delete-account`; Play-aligned privacy/terms copy; delete-account is school-first with `support@onthebus.app` escalation.
- Public company pages (2026-08-07): footer Company links to `/about`, `/careers`, `/contact` (auth-free); About feature imagery; Careers coming-soon interest form + Contact form email `info@onthebus.app` via `/api/public-contact`.
- Play Review School seed (2026-08-05): `npm run seed:play-review` provisions permanent `play-review` tenant (`is_demo`, no expiry) with Driver `+254700000001` / Parent `+254700000002` / OTP `123456`; credentials written to gitignored `.play-review-credentials.local`.
- Driver light theme + Play Review day window (2026-08-05): Driver app switched to light OnTheBus UI; Play Review schedules at 08:00/10:00/12:00/14:00/17:00; fixed `on_trip_status_update` to use `vehicles.license_plate`.
- Driver map + stop-gated boarding (2026-08-05): Home/Trip map uses Google Maps SDK + Directions (via `/api/maps/directions`); live bus marker seeded from foreground GPS; boarding/drop-off filtered to the current stop geofence (client + driver API PUT enforcement).
- Unified Google Maps (2026-08-05): Driver + Parent use `google_maps_flutter`; Admin already on Maps JS; shared Directions/Places proxies at `/api/maps/directions` and `/api/maps/places`.
- Driver navigation + direction labels (2026-08-05): Trip Navigate is in-app nav mode on the embedded map (camera follow + next-leg emphasize); Stops-tab may still deep-link. Attendance primary CTA labeled **Pickup Students** / **DropOff Students** from schedule `direction`; stop boarding uses a 70–80% drawer with Complete Stop (unchecked → Absent).
- Driver Trip screen UX (2026-08-14): AppBar titled with trip name + long-press SOS; collapsible progress (`N / M picked|dropped`); collapsible next-stop card; map height 450 with pinch-zoom (`EagerGestureRecognizer`) and half-size stop markers; Navigate opens Google Maps via `StopNavigationService`. BDD in [bdd.md](bdd.md) Status `passing` — `test/trip_ui_logic_test.dart`, `test/trip_progress_card_test.dart`, `test/trip_stop_action_card_test.dart`.
- Admin Add/Edit Route full page (2026-08-14): Add Route → `/routes/new`, Edit → `/routes/[id]/edit` with school name, Google Maps search, click/drag pin for coordinates. POST/PUT school start+end. BDD in [bdd.md](bdd.md) Status `passing` — `src/app/api/routes/route.test.ts`, `src/app/api/routes/[id]/route.test.ts`.
- Admin Add/Edit Route Stop full page (2026-08-14): Add/Edit Stop → `/routes/stops/new` and `/routes/stops/[id]/edit` with Google Maps search and click/drag pin (replaces the old stop drawer). BDD in [bdd.md](bdd.md) Status `passing` — `src/app/api/stops/route.test.ts`, `src/app/api/stops/[id]/route.test.ts`.
- Driver two-step OTP login (2026-08-10): redesigned Driver/Conductor authentication as separate phone and six-digit verification screens; added resend countdown, support path, real `/api/auth/driver-request-otp` SMS flow, and permanent Play Review OTP handling. Flutter analysis and dashboard production compilation pass; OTP test files were subsequently removed at the user’s request after repository secret-scanning alerts.
- Demo authentication OTP SMS (2026-08-10): demo-school drivers/conductors now receive login OTPs through Africa’s Talking; operational trip/proximity SMS remains dry-run. Unknown phones remain blocked, with Azima sandbox delivery verified manually.
- Dynamic demo OTP hardening (2026-08-10): per-lead demo drivers/conductors now receive a fresh random six-digit OTP with a 15-minute expiry; successful verification consumes the code and the API no longer returns it. The permanent Play Review account remains `123456`. Demo access emails/UI now instruct users to request a fresh code. Dashboard production build passes; automated OTP tests were removed per user request.
- Demo confirm access email (2026-08-10): Confirm emails the lead’s work email with store URL / admin password / Flutter phone and instructions to request a fresh OTP via shared `demoRequestEmails` + `resendEmail`; confirmed stores can **Resend access email** (resets admin password). Requires `RESEND_API_KEY` and a **verified** `DEMO_REQUESTS_FROM_EMAIL` domain on Resend (sandbox `resend.dev` can only mail the Resend account owner — not arbitrary leads). Same vars must be set on Vercel.
- Automatic trip delay detection & live ETA (2026-08-10): repaired `check_geofence_triggers`; added `stops.dwell_seconds`, `trip_delay_state`, `trip_stop_etas` (Realtime), `evaluate_trip_delay()` (5 min threshold / +10 min escalate, push always + SMS when enabled); parent map/dashboard replace hardcoded ETAs with live values + delay badge. BDD in [bdd.md](bdd.md) Status `passing` — SQL scenarios verified on linked Supabase (on-time / first delay / no re-notify / escalation / demo SMS dry-run); Flutter `test/eta_utils_test.dart` + `test/eta_display_test.dart` (11 passing). Migrations applied via MCP (`fix_geofence_trigger`, `delay_detection`).
- Parent session + live ETA API (2026-08-10): signed `par.*` token from `/api/auth/parent-login`; `GET /api/parent/etas?student_id=` (Bearer, ownership-checked, service role); parent app stores token and polls every 20s on map/dashboard. BDD in [bdd.md](bdd.md) Status `passing` — Vitest `parentSession.test.ts` + `parent/etas/route.test.ts` (8 passing); Flutter ETA display tests (11 passing). Set `PARENT_SESSION_SECRET` on Vercel (falls back to `DRIVER_SESSION_SECRET` / service role locally).
- Pre-departure delay cron (2026-08-10): `GET /api/trips/predeparture-check` every 5 min via Vercel Cron; marks today's never-started `scheduled` trips as `status_override=Delayed` after departure + 10 min grace (honors `custom_departure_time`); notifications via existing `on_trip_status_update`. BDD Status `passing` — Vitest `predepartureCheck.test.ts` + `predeparture-check/route.test.ts` (9 passing). Requires `CRON_SECRET` on Vercel (Hobby plans may not allow `*/5` crons — Pro or hourly schedule if needed).
- Parent Supabase Auth JWT (2026-08-10): parent-login ensures `auth.users` with `id = profiles.id` + `app_metadata`/`user_metadata` `{role:parent, tenant_id}`; returns `supabase_*` tokens; Flutter `setSession` / `signOut`; jwt helpers prefer `app_metadata`; parent SELECT on `stops`. Migration `parent_auth_jwt_rls` applied. BDD Status `passing` — Vitest `parentAuthSession.test.ts` (2) + existing parent session tests. Keep `par.*` ETA poll as fallback; Realtime used when Auth session present.
- School-facing security brief (2026-08-10): [architecture-security.md](architecture-security.md) for IT/procurement answers (tenant isolation, roles, RLS, NFC, parent map privacy, demo SMS dry-run, hosting posture).
- Admin console contrast (2026-08-14): form inputs use inset `--input-bg` (same as `--bg-base`) with `--text-primary` ink like dashboard Trip Summary rows; Today's Trips dropped hardcoded white-on-grey. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/themeTokens.test.ts`, `src/lib/tripStatusUi.test.ts`.
- Admin WCAG roster contrast (2026-08-14): driver/conductor/administrator cards and other navy leftover tiles use `--bg-surface` with WCAG AA body/muted tokens (`--text-muted` `#475569`, `--accent-fill` `#047857`). BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/wcagContrast.test.ts`, `src/lib/themeTokens.test.ts`.
- Create stop success redirect (2026-08-14): after a stop is created or updated, the operator is sent to Stops & Stages (`/routes/stops`) with a success banner so they do not resubmit the same sequence. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/stopEditorNavigation.test.ts`.
- Route start and end location (2026-08-14): Add/Edit Route replaces school location name with Start location and End location. Default is From school (map hidden); multiple schools require a dropdown; Choose location reveals the map and uses the pin. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/routeEndpointSelection.test.ts`, `src/app/api/campuses/route.test.ts`.
- Attach existing stops to a route (2026-08-14): Route planner **Add existing** copies selected stages from other routes onto the current route, placed before the end stop. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/attachStopsToRoute.test.ts`, `src/app/api/stops/attach/route.test.ts`.
- Tenant-scoped school data (2026-08-14): Admin operational APIs (list + detail/mutate) filter by the school subdomain + caller tenant (no `tenants.limit(1)`, no unfiltered service-role lists). Platform operators on a school host see only that school. Driver/parent APIs use session `tenant_id`. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/tenantScope.test.ts`, `src/lib/tenantApiCoverage.test.ts`.
- Dashboard live fleet map (2026-08-14): Live Fleet Map plots last-known GPS from `/api/telemetry` keyed by real `vehicle_id` (poll + Realtime), not hardcoded demo buses. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/fleetMapTelemetry.test.ts`.
- Student same/different stages (2026-08-14): Transit Settings radios for pickup same as drop-off (one stage) vs different (two dropdowns). BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/studentStopAssignment.test.ts`.
- Empty staff roster (2026-08-14): Drivers, conductors, and administrators APIs return `[]` when none are registered — static demo names (John Kamau, Jane Wanjiku, Sarah Jenkins, …) are removed. BDD in [bdd.md](bdd.md) Status `passing` — `src/app/api/staffEmptyList.test.ts`.
- Driver bus assignment (2026-08-14): Register Driver includes Allocated bus; card allocation writes `vehicles.active_driver_id` via the driver API and only toasts success after a confirmed save. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/assignDriverVehicle.test.ts`, `src/app/api/drivers/route.test.ts`.
- Add Trip required-field messages (2026-08-14): Save Trip without required fields shows “Please fill in: …” (e.g. target grade classes) instead of “Failed to save schedule”. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/scheduleFormValidation.test.ts`, `src/app/api/schedules/route.test.ts`.
- Trip type pick up or drop off (2026-08-14): Add/Edit Trip requires selecting Pick up (home to school) or Drop off (school to home). The trips table Trip type column uses those labels. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/scheduleFormValidation.test.ts`.
- Driver stop visit outcomes (2026-08-14): Arriving at a stop auto-opens the boarding drawer. Complete Stop records dwell and marks completed. Leaving without complete/pickup marks visited + admin alert. Skip Stop marks not visited + admin alert. BDD in [bdd.md](bdd.md) Status `passing` — Flutter `test/stop_visit_logic_test.dart`, `test/trip_stop_action_card_test.dart`; Vitest `src/lib/stopVisitOutcome.test.ts`, `src/app/api/driver/stop-visits/route.test.ts`.
- Vehicle compliance dates (2026-08-14): Last/next service and insurance expiry are optional (date pickers default to 2000-01-01, stored as null). Notify checkbox enables 1-month / 2-week / 1-day due alerts. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/vehicleCompliance.test.ts`. Migration `vehicle_compliance_notify`.
- Student registry trip filter (2026-08-14): Manifests Registry lists Route (editable, filterable) instead of pickup/drop-off stops; Trips stay as pick-up/drop-off dropdowns with a trip filter. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/studentRegistryFilter.test.ts`, `src/lib/studentStopAssignment.test.ts`.
- Parent iOS App Store prep (2026-08-16): Public name **OnTheBus** (Android label + iOS `CFBundleDisplayName`/`CFBundleName`); iOS bundle ID aligned to `com.schooltrack.parent_app`; iPhone-only; camera/photo usage strings + `ITSAppUsesNonExemptEncryption`; dashboard **Delete my account** → `https://onthebusapp.com/delete-account`; Flutter `ios/Podfile`; root [codemagic.yaml](../codemagic.yaml) builds IPA to TestFlight. BDD in [bdd.md](bdd.md) Status `passing` — `apps/parent_app/test/store_identity_test.dart`, `apps/parent_app/test/delete_account_link_test.dart`.
- Student guardian source (2026-08-16): Parents & Guardians on Add/Edit Student defaults to **Existing parent** with a name-filterable dropdown; **Add new parent** hides it. Duplicate guardian phones are blocked in the form and `POST`/`PUT /api/students`. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/studentGuardians.test.ts`, `src/app/api/students/route.test.ts`.
- Edit Student Profile save (2026-08-17): Profile updates persist `pickup_location` (no non-existent lat/lng columns; DB errors no longer return fake success). Pickup and drop-off sits on a full-width row under Transit Route Assignment; stage dropdowns are searchable. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/studentRecord.test.ts`, `src/lib/studentStopAssignment.test.ts`, `src/app/api/students/[id]/route.test.ts`.
- School Campus nav (2026-08-17): School Campus is a top-level school console item (not a Routes submenu). Add/Edit uses the Transit Route Planner school icon. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/schoolCampusNav.test.ts`.
- Billing current plan (2026-08-17): Current plan card matches `/pricing` (name, monthly price, students/buses/locations caps vs live counts). Upgrade plan sits below the card. SMS Volume Trends removed. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/pricingPlans.test.ts`, `src/app/api/billing/route.test.ts`.
- Demo request to go live (2026-08-17): Per-lead demo consoles show a demo-account banner with `demo_expires_at`. **Request to go live** sets `demo_requests.status` to `ready_to_onboard` and emails `info@onthebusapp.com`. Demo tenants are not flipped to paid. Migration `demo_ready_to_onboard` applied. BDD in [bdd.md](bdd.md) Status `passing` — `src/lib/demoGoLive.test.ts`, `src/app/api/demo/go-live/route.test.ts`.

## iOS Parent publish runbook (Windows)

Repo is ready. These steps are browser-only (Apple / Google / Codemagic). You cannot build an IPA on this PC.

### A. Apple Developer + App Store Connect

1. Enroll at [developer.apple.com/programs](https://developer.apple.com/programs/) ($99/year). Wait until status is Active.
2. Identifiers → App IDs → Register **explicit** `com.schooltrack.parent_app` (no extra capabilities for v1).
3. Users and Access → Integrations → App Store Connect API → create a key with **App Manager**. Download the `.p8` once. Note Key ID + Issuer ID.
4. Apps → + → name **OnTheBus**, bundle ID `com.schooltrack.parent_app`, SKU `onthebus-parent`, English.
5. Listing: privacy `https://onthebusapp.com/privacy`, support `https://onthebusapp.com`, category Navigation or Education (**not** Kids), include Kenya.
6. App Review Information: phone `+254700000002`, OTP `123456` (`play-review` sandbox). Contact email you monitor.
7. If Play listing still says “OnTheBus Parent”, change the Play Console store title to **OnTheBus** (launcher name updates with the next Android build).

### B. Google Maps iOS key

1. Google Cloud → Credentials → API key restricted to **Maps SDK for iOS**.
2. iOS apps restriction: bundle ID `com.schooltrack.parent_app`.
3. Store the key only as Codemagic secret `MAPS_API_KEY` (and local gitignored `apps/parent_app/ios/Flutter/Secrets.xcconfig`). Never commit it.

### C. Codemagic → TestFlight → review

1. [codemagic.io](https://codemagic.io) → add this GitHub repo → enable [codemagic.yaml](../codemagic.yaml).
2. Integrations: Apple Developer Portal (signing) + App Store Connect API key named **onthebus**.
3. Set secret `MAPS_API_KEY`. After the App Store app exists, optionally set `APP_STORE_APPLE_ID` (numeric).
4. Run workflow **OnTheBus iOS TestFlight**. IPA uploads to TestFlight (not App Store review).
5. Install TestFlight on a physical iPhone; smoke login + map + avatar + Delete my account. Capture 6.7" screenshots (iPhone-only binary; no iPad shots).
6. App Store Connect → select the TestFlight build → Submit for Review.

## In Progress

- Phase 1 admin Schools (tenants) console: migration, `/api/tenants`, `/schools` UI, platform invite flow.
- Designing the parent real-time map tracking view inside the Parent mobile application.

## Next Up

- Founder manual readiness before school visits: run [pre-school-readiness.md](pre-school-readiness.md) (env gates, sales/demo, onboard, admin CRUD, operational day, security, Go/No-Go).
- Finish iOS Parent publish: Apple enrollment + App Store Connect app, Maps SDK for iOS key, Codemagic first TestFlight, screenshots, submit with `play-review` credentials (see **iOS Parent publish runbook** above).
- Add `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL` to `.env.local` and Vercel (required for school invite emails).
- Supabase Auth URL config (hosted): Site URL = `https://onthebusapp.com`; Redirect URLs include `https://*.onthebusapp.com/**`. Invite `redirectTo` must never be localhost — fixed via `getTenantInviteRedirectUrl`.
- Sign out/in as `muragedev@gmail.com` and verify `/schools`.
- Phase 3: Tenant impersonation + PII masking for platform support.
- Persist campus location usage in route builder (replace local-only School Locations state).
- Attendance logs and alerts history consoles.
- Bootstrapping the Parent mobile application (`apps/parent_app`) Flutter workspace.
- Optional: Calendly/Cal.com embed on `/request-demo`; canned GPS replay loop for demo trips.
- Ensure `RESEND_API_KEY` + verified-domain `DEMO_REQUESTS_FROM_EMAIL` (not `resend.dev`) on Vercel and `.env.local` so demo confirm/complete emails reach requesters.

## Open Questions

- **Pricing-tier entitlements vs campus-flat-fee invoice:** School `/billing` now *displays* the public Starter / School / Growth / Enterprise caps against live usage. The invoice engine still charges `active_campus_count × campus_monthly_fee_kes` plus SMS. Wire paid-tenant entitlements to those marketing caps only after deciding whether invoice amounts should follow the same tiers.

## Architecture Decisions

- **Google Maps across clients:** Admin uses Maps JavaScript API + Directions/Places. Driver and Parent use `google_maps_flutter` with native `MAPS_API_KEY`. Road polylines for mobile come from `POST /api/maps/directions` (server key → Google Directions). Parent relocate search uses `GET /api/maps/places`.
- **Stop-gated boarding:** Drivers may board a student only inside that student’s `pickup_stop` geofence and drop off only inside `dropoff_stop` geofence (radius = `stops.geofence_radius_meters`, default 50 m). Enforced in Driver UI and on driver attendance `PUT /api/students/[id]`.
- **Driver stop navigation (Trip):** Navigate opens Google Maps turn-by-turn to the next stop (`google.navigation:` on Android, Maps directions URL fallback). The embedded map stays a live overview (pinch-zoom, fit route / follow bus). In-app nav mode is not used from the Trip action card. Stops-tab per-stop Navigate uses the same deep-link service.
- **Driver stop visit outcomes:** Arriving at the next stop geofence auto-opens the boarding drawer. **Complete Stop** → `completed` + dwell seconds. Leaving without Complete/Skip and without any student action → `visited` + admin alert. **Skip Stop** → `skipped` (not visited) + admin alert. Persisted in `trip_stop_visits`; dashboard Recent Alerts reads `GET /api/alerts`. No student PII in alerts.
- **Workspaces Monorepo:** Consolidated driver/parent mobile folders, Next.js web folders, and Supabase migrations.
- **Pure Serverless Transition (Vercel + Supabase):** Swapped persistent servers for Next.js route handlers, Supabase Realtime Channels, and Deno edge workers.
- **PostGIS Trigger Evaluation:** Computing geofences dynamically at the database layer via SQL triggers. When new vehicle coordinates are written, PostGIS calculates boundary intersections directly on the metal, avoiding network overhead, and triggering Supabase Edge Functions for SMS dispatch.
- **Automatic Delay Detection:** On each telemetry insert (throttled 30s/trip), `evaluate_trip_delay()` compares predicted stop arrivals (geometric leg progress + `stops.dwell_seconds`) against the schedule baseline and notifies affected parents at ≥5 min delay with +10 min escalation bands. Live ETAs persist in `trip_stop_etas`.
- **Parent signed session + ETA API:** Parent OTP login issues `par.*` HMAC tokens for Next.js ETA API and a Supabase Auth session (`auth.users.id = profiles.id`, claims in `app_metadata`) for Realtime RLS on telemetry/ETAs/stops.
- **Parent iOS identity:** Store/home-screen name **OnTheBus**; bundle ID `com.schooltrack.parent_app` (same as Android). IPA via Codemagic macOS builders; v1 is iPhone-only. Account deletion is in-app via the public `/delete-account` page.
- **Unique guardian phones per student:** A student cannot have two guardian rows with the same phone (normalized digits). Operators pick an existing parent or add a new one; they cannot attach the same number twice.

- **Pre-departure cron:** Vercel Cron hits `/api/trips/predeparture-check` every 5 minutes; overdue never-started trips get `status_override=Delayed` once, reusing trip-status notifications.
- **Queue-Based Notification Engine:** Used an `alerts_queue` table combined with Supabase database webhooks to decouple spatial compute from external network API execution.
- **Platform vs Tenant Admin:** `profiles.role = super_admin` is platform-only with `tenant_id = null`. School operators use `role = school_admin` with a required `tenant_id`; their `admin_role` (including `"Super Admin"`) is tenant-scoped only.
- **Soft-Delete Tenants:** Schools are suspended/soft-deleted (`deleted_at`), never hard-deleted through the product UI. Automated retention purge (Vercel Cron → `/api/platform/purge`) soft-deletes schools suspended beyond `suspended_purge_days` and permanently purges soft-deleted schools beyond `deleted_purge_days` (both platform-configurable; 0 disables).
- **School Admin Invite:** First school admin is provisioned via email invite; platform operators do not set the invitee password in the onboarding drawer.
- **Subdomain Tenancy (Vercel):** School consoles live at `{slug}.onthebusapp.com`; `tenants.domain` stores the slug. Apex `onthebusapp.com` is marketing + platform `/schools`. Invites redirect to the school subdomain.- **Campus Permissions (deferred enforce):** Capability via `admin_role`; site scope via `admin_campus_access` (or tenant-wide mode). Billing stays tenant-scoped.
- **Multi-Campus Billing:** One invoice per tenant. Platform fee = `active_campus_count × campus_monthly_fee_kes` (default KES 10,000). **Platform `super_admin` can edit the per-campus flat fee** per school (and a default for new onboardings); school roles view-only. SMS remains a separate usage line. Unpaid tenant suspends all campuses.
- **Testing gate before Complete:** A module is not Done until BDD scenarios in [bdd.md](bdd.md) (happy + failure) are specified, the file Status is `passing`, and tests are automated where feasible; Node/Next/Deno tests follow [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodejs-testing-best-practices); Flutter uses unit/widget/integration layers per Flutter testing guidance. Each new module **overwrites** [bdd.md](bdd.md). See **Definition of Done (testing gate)** above.
- **Request Demo + per-school demo stores:** Apex `/request-demo` captures leads into `demo_requests`. Confirm provisions a dedicated `is_demo` tenant at `{school-slug}-demo.onthebusapp.com` (school name + geo from request; slim roster with avatars; request phone for Flutter parent/driver). School **Request to go live** sets `ready_to_onboard` and emails `info@onthebusapp.com`; paid school is a new tenant (never flip `is_demo` in place). Complete or `demo_expires_at` hard-deletes the store. Static `demo` tenant remains an internal sales sandbox. Slugs ending in `-demo` (and reserved `demo` / `play-review`) are blocked for real onboarding. SMS hard-disabled for demo tenants.

## Session Notes

- Implemented full Supabase Email & Password authentication for the Next.js admin app. Created DB triggers and seeded tenant defaults to sync logins automatically into profiles. Added routing guards, intercepting fetch auth headers, sidebar profile widgets, and high-fidelity login/register UI panels. Verified the Next.js dashboard builds successfully with zero TypeScript compilation or bundler errors.
