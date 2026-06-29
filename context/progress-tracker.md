# Progress Tracker

## Current Phase

- **Phase 2: Next.js Admin Dashboard Bootstrapping**

## Current Goal

- Configure the Next.js admin app workspace, integrate CSS design tokens, and build the interactive UI simulator panel.

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

## In Progress

- Designing the parent real-time map tracking view inside the Parent mobile application.

## Next Up

- Bootstrapping the Parent mobile application (`apps/parent_app`) Flutter workspace.
- Implement the live coordinate channel listener to receive vehicle coordinates in the Parent App.
- Add route-boundary geofence calculations and proximity notification logs in the Parent App.

## Open Questions

- *None.*

## Architecture Decisions

- **Workspaces Monorepo:** Consolidated driver/parent mobile folders, Next.js web folders, and Supabase migrations.
- **Pure Serverless Transition (Vercel + Supabase):** Swapped persistent servers for Next.js route handlers, Supabase Realtime Channels, and Deno edge workers.
- **PostGIS Trigger Evaluation:** Computing geofences dynamically at the database layer via SQL triggers. When new vehicle coordinates are written, PostGIS calculates boundary intersections directly on the metal, avoiding network overhead, and triggering Supabase Edge Functions for SMS dispatch.
- **Queue-Based Notification Engine:** Used an `alerts_queue` table combined with Supabase database webhooks to decouple spatial compute from external network API execution.

## Session Notes

- Implemented full Supabase Email & Password authentication for the Next.js admin app. Created DB triggers and seeded tenant defaults to sync logins automatically into profiles. Added routing guards, intercepting fetch auth headers, sidebar profile widgets, and high-fidelity login/register UI panels. Verified the Next.js dashboard builds successfully with zero TypeScript compilation or bundler errors.
