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

## In Progress

- Designing the background location service and telemetry streaming connector inside the Driver app.

## Next Up

- Write the background high-precision location tracking service in the Driver App to stream GPS telemetry to Supabase.
- Implement the NFC scanning driver checklist verification handler in the Driver App.
- Build the daylight-optimized, daylight-contrast Driver UI with oversized tap targets and Emergency SOS panic triggers.

## Open Questions

- *None.*

## Architecture Decisions

- **Workspaces Monorepo:** Consolidated driver/parent mobile folders, Next.js web folders, and Supabase migrations.
- **Pure Serverless Transition (Vercel + Supabase):** Swapped persistent servers for Next.js route handlers, Supabase Realtime Channels, and Deno edge workers.
- **PostGIS Trigger Evaluation:** Computing geofences dynamically at the database layer via SQL triggers. When new vehicle coordinates are written, PostGIS calculates boundary intersections directly on the metal, avoiding network overhead, and triggering Supabase Edge Functions for SMS dispatch.
- **Queue-Based Notification Engine:** Used an `alerts_queue` table combined with Supabase database webhooks to decouple spatial compute from external network API execution.

## Session Notes

- Completed the Fleet Management separation and Staff Management systems. Verified database migrations are created, developed robust and resilient API endpoints, updated navigation sidebar routing, and built the Drivers/Conductors lists and Fleet status/maintenance dashboards. Verified Next.js Turbopack build succeeds with zero compiler or typecheck errors. Ready to proceed back to background driver location services in Flutter.
