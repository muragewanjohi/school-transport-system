# Progress Tracker

## Current Phase

- **Phase 1: Project Workspace Setup & Database Schemas**

## Current Goal

- Bootstrapping monorepo workspaces and setting up core PostGIS multi-tenant database migration files.

## Completed

- Reviewed ecosystem features, invariants, boundaries, and overall scopes.
- Populated project development rules and boundary-splitting thresholds in [ai-workflow-rules.md](file:///c:/Dev/School-Transpot/context/ai-workflow-rules.md).
- Documented Next.js serverless API standards, Supabase RLS policies, and Flutter client guidelines in [code-standards.md](file:///c:/Dev/School-Transpot/context/code-standards.md).
- Formulated color theme tokens, font pairings, layout schemes, and button metrics in [ui-context.md](file:///c:/Dev/School-Transpot/context/ui-context.md).
- Created monorepo workspace file layout and folder structure (`apps/`, `supabase/`).
- Initialized root `package.json` for npm workspaces mapping.
- Created Supabase configuration parameters in `supabase/config.toml`.
- Developed initial SQL database migration schema (`20260613000000_init_schema.sql`) including PostGIS extensions, tables, alerts queues, spatial indices, automatic auth-sync profile triggers, spatial geofence checkers, and Row Level Security (RLS) policies.

## In Progress

- Verifying workspace configurations and preparing admin dashboard bootstrapping.

## Next Up

- Bootstrap the Next.js web application (`apps/admin_dashboard`) using the required create-app workflow conventions.
- Implement the layout panels, Tailwind/CSS variables integration, and index styles inside the admin workspace.
- Write the serverless database connection configurations and initial mock endpoints inside `apps/admin_dashboard/src/app/api/`.

## Open Questions

- *None.* Stack and security models are fully aligned.

## Architecture Decisions

- **Workspaces Monorepo:** Consolidated driver/parent mobile folders, Next.js web folders, and Supabase migrations.
- **Pure Serverless Transition (Vercel + Supabase):** Swapped persistent servers for Next.js route handlers, Supabase Realtime Channels, and Deno edge workers.
- **PostGIS Trigger Evaluation:** Computing geofences dynamically at the database layer via SQL triggers. When new vehicle coordinates are written, PostGIS calculates boundary intersections directly on the metal, avoiding network overhead, and triggering Supabase Edge Functions for SMS dispatch.
- **Queue-Based Notification Engine:** Used an `alerts_queue` table combined with Supabase database webhooks to decouple spatial compute from external network API execution.

## Session Notes

- Monorepo folder setup and initial database schema files are completed. Next step is bootstrapping the Next.js Admin Dashboard codebase.
