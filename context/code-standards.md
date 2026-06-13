# Code Standards

## General

- **Single Responsibility:** Keep components, functions, hooks, and SQL triggers focused on one task.
- **Root Cause Resolution:** Do not wrap bugs in quick-fix conditionals or silent try-catch blocks. Address root logic or state discrepancies directly.
- **Fail Loudly and Handle Gracefully:** Propagate exceptions to system boundaries where they are caught, logged, and mapped to user-friendly messages rather than failing silently.

## TypeScript (Web, APIs, Edge Functions)

- **Strict Compilation:** Enable strict mode rules (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`) across all Next.js and Deno codebases.
- **Type Safety:** Explicitly forbid the use of the `any` type. Use narrow unions, unknown types with type guards, or strict interface declarations.
- **Boundary Validation:** Validate and sanitize all external inputs (HTTP request bodies, query strings, headers, incoming payloads) at API boundaries using validation libraries like `zod`.

## Next.js (Admin Dashboard & Serverless API Routes)

- **React Server Components (RSC):** Default to RSCs for data fetching and layout structure. Use client components (`"use client"`) only when browser interactivity is necessary (e.g., state, hooks, event listeners).
- **Route Handlers:** Next.js Route Handlers (`src/app/api/...`) must act as clean API routes. Verify JWTs, validate inputs via `zod`, and keep execution times below Vercel's 10-second serverless execution threshold.
- **Responsive Web Views:** Ensure all dashboard grids, layout sidebars, and maps adjust gracefully down to tablet viewports.

## Supabase & Database (RLS, PostGIS, Migrations)

- **Enable RLS:** Every table created must have Row Level Security (RLS) enabled. No client app may query a table directly without satisfying an active policy.
- **Tenant Contextual Policies:** Enforce B2B multi-tenant boundaries inside SQL policies by extracting the custom `tenant_id` claim from `auth.jwt()`:
  ```sql
  CREATE POLICY tenant_isolation_policy ON students
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
  ```
- **PostGIS Calculations:** Use indexed spatial functions (e.g. `ST_DWithin`, `ST_Contains`) on geometries. All geometry columns must have a spatial `GIST` index.
- **Migrations:** All database modifications must be written as declarative, incremental SQL migrations inside `supabase/migrations/`. Manual database changes via the dashboard UI are prohibited in staging/production.

## Supabase Edge Functions (Deno)

- **Deno Conventions:** Edge functions must be written in TypeScript, using explicit import maps for dependencies.
- **Secrets Management:** Sensitive keys (e.g. Africa's Talking API key, Sender ID) must be accessed via `Deno.env.get()`. Hardcoding credentials is prohibited.
- **Lightweight Logic:** Edge functions should perform a single transactional action (e.g. sending a single SMS, checking a cache, or processing a trigger webhook).

## Flutter & Dart (Driver and Parent Apps)

- **Supabase Integration:** Access databases, auth, and realtime channels exclusively using the `supabase_flutter` package.
- **State Management:** Use `flutter_riverpod` or `flutter_bloc` to handle local and global application states. Never mutate state directly in UI widgets.
- **Realtime Broadcasts:** Use `RealtimeChannel` to broadcast (Driver App) and listen (Parent App) to live GPS coordinate feeds.
- **Hardware Fail-Safes:** Wrap all NFC/RFID hardware scans and location polling operations in system permission checks. Ensure the application gracefully degrades if the user denies GPS/NFC access.

## Styling

- **Tokens Only:** All colors, spacing, borders, and transitions must reference variables defined in the CSS custom properties context (web) or the unified ThemeData class (Flutter). Hardcoded hex colors and layout margins are prohibited.
- **Responsive Layout Scales:** Use flexbox, grid layouts, and media queries (web) or LayoutBuilder/MediaQuery (Flutter) to scale layout dimensions dynamically.

## File Organization

- `apps/driver_app/` — Flutter mobile application for bus drivers (tracking & NFC boarding).
- `apps/parent_app/` — Flutter mobile application for parents (real-time tracking map & alerts).
- `apps/admin_dashboard/` — Next.js web dashboard (includes Next.js API routes in `src/app/api/`).
- `supabase/migrations/` — SQL schema migrations and RLS policies.
- `supabase/functions/` — Deno Edge Functions (SMS alerts, webhooks).
