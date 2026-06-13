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

## In Progress

- Reviewing interactive mock flows and staging git commits.

## Next Up

- Write the Supabase database connector helper client (`src/lib/supabaseClient.ts`) within the dashboard package.
- Setup environment parameter configurations (`.env.local`) mapping database ingress targets.
- Create API endpoints for route telemetry fetch operations (`/api/routes` and `/api/telemetry`).

## Open Questions

- *None.*

## Architecture Decisions

- **Workspaces Monorepo:** Consolidated driver/parent mobile folders, Next.js web folders, and Supabase migrations.
- **Pure Serverless Transition (Vercel + Supabase):** Swapped persistent servers for Next.js route handlers, Supabase Realtime Channels, and Deno edge workers.
- **PostGIS Trigger Evaluation:** Computing geofences dynamically at the database layer via SQL triggers. When new vehicle coordinates are written, PostGIS calculates boundary intersections directly on the metal, avoiding network overhead, and triggering Supabase Edge Functions for SMS dispatch.
- **Queue-Based Notification Engine:** Used an `alerts_queue` table combined with Supabase database webhooks to decouple spatial compute from external network API execution.

## Session Notes

- Dashboard workspace is bootstrapped, themed, and compiled successfully. Moving next to configuring Supabase client integration helpers.
