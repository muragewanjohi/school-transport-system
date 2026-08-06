# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Spec-first workflow (read this before changing behavior)

This repo is built spec-first against the files in [context/](context/). Before making an architectural or core-behavior change, update the relevant spec file first, then implement:

- [context/project-overview.md](context/project-overview.md) — product goals, user flows, scope.
- [context/architecture.md](context/architecture.md) — stack, tenancy/subdomain rules, auth/RLS model, storage model, invariants. **Source of truth for multi-tenant behavior.**
- [context/code-standards.md](context/code-standards.md) — per-stack conventions (TS, Next.js, Supabase/RLS, Edge Functions, Flutter).
- [context/ui-context.md](context/ui-context.md) — design tokens/colors per surface (marketing vs admin console vs mobile apps). Never hardcode colors — use the CSS variables / ThemeData listed there.
- [context/bdd.md](context/bdd.md) — Given/When/Then for the module currently in progress. **Overwrite, don't append**, when starting a new module.
- [context/progress-tracker.md](context/progress-tracker.md) — milestones, Definition of Done (testing gate), Open Questions.

Rules that apply repo-wide:
- Don't invent product behavior absent from `context/`. If a requirement is ambiguous, log it under Open Questions in `progress-tracker.md` rather than guessing.
- Work one feature unit / API route at a time; split work that mixes mobile background logic with UI, or telemetry ingestion with CRUD admin operations.
- Do not hand-edit `package-lock.json` or already-applied SQL migrations under `supabase/migrations/`.
- A unit isn't "Completed" on compile/build success alone — it needs the testing gate in `progress-tracker.md` satisfied (see Testing below).

## Repo layout (npm workspaces monorepo)

- `apps/admin_dashboard/` — Next.js (App Router) web console + serverless API routes. The only JS/TS package with its own build/test tooling.
- `apps/driver_app/` — Flutter app for drivers (GPS streaming, NFC boarding scans).
- `apps/parent_app/` — Flutter app for parents (live map, child status).
- `supabase/migrations/` — incremental, declarative SQL (schema, RLS policies, PostGIS/GIST indexes). Filenames are timestamp-prefixed and applied in order; never edit one that has already run.
- `supabase/functions/` — Deno Edge Functions: `calculate-eta`, `send-push`, `send-sms` (Africa's Talking SMS gateway).
- `scripts/sync-assets.js` — copies shared brand PNGs (bus/school icons) from repo root into each app's asset folder; runs automatically before dashboard dev/build via `sync-assets`.

## Commands

All from repo root unless noted.

```bash
npm install                    # install all workspaces
npm run dev:dashboard          # sync-assets, then `next dev` for apps/admin_dashboard
npm run build:dashboard        # sync-assets, then `next build` for apps/admin_dashboard
supabase start                 # local Supabase stack (requires Docker + Supabase CLI)
```

Inside `apps/admin_dashboard/` directly:

```bash
npm run dev                    # next dev (no asset sync)
npm run build                  # next build
npm run lint                   # eslint
npm test                       # vitest run (single run)
npm run test:watch             # vitest watch mode
npx vitest run src/lib/tenantHost.test.ts        # single test file
npx vitest run -t "some test name"               # single test by name
npm run seed:play-review       # seeds the permanent Play Store review tenant (needs .env.local)
```

Test files live beside the code they test (`src/**/*.test.ts`, e.g. [src/lib/tenantHost.test.ts](apps/admin_dashboard/src/lib/tenantHost.test.ts), [src/lib/demoProvision.test.ts](apps/admin_dashboard/src/lib/demoProvision.test.ts)) — vitest picks them up via that glob, node environment, `@` alias to `src/`.

Flutter apps (`apps/driver_app/`, `apps/parent_app/`), each run from its own directory:

```bash
flutter pub get
flutter analyze
flutter test
flutter test test/some_test.dart   # single test file
flutter run
```

## Architecture

### Multi-tenant subdomain routing (admin_dashboard)

Tenancy is resolved per-request from the `Host` header, not from auth alone — see [src/middleware.ts](apps/admin_dashboard/src/middleware.ts) and [src/lib/tenantHost.ts](apps/admin_dashboard/src/lib/tenantHost.ts):

- Root domain `onthebusapp.com` (+ `www`) is the **public/platform apex** — marketing site, `/login` for platform `super_admin`, `/schools`.
- `{slug}.onthebusapp.com` is that **school's console** (`/login`, `/dashboard`, fleet/students/routes/…). School login only succeeds on the matching subdomain.
- Middleware sets `x-host-kind` (`apex` \| `tenant` \| `local`) and `x-tenant-slug` headers consumed by server components/route handlers, and redirects tenant-host `/` → `/login`, tenant-host `/schools*` → apex, and apex school-console paths → `/login`.
- `localhost`/`*.localhost` is treated as apex unless a `x-tenant-slug` / `?tenant=` override is passed for local testing of tenant flows.
- Full rules, reserved slugs, demo-store subdomain conventions, and invite-URL requirements are in [context/architecture.md](context/architecture.md) under "Hosting & Subdomain Tenancy" — read it before touching routing/auth.

### Auth & authorization model

Three roles carried in the JWT / session: platform `super_admin` (`tenant_id` is **null**, cross-tenant), `school_admin` (tenant-bound; sub-permissions via `admin_role` — Fleet Manager, Bursar, etc. — always still tenant-scoped), and mobile-only `driver`/`parent`/`conductor` roles. Don't confuse platform `role = super_admin` with a school admin whose `admin_role` happens to be "Super Admin".

- Web admin sessions use Supabase Auth (`@supabase/supabase-js`); [src/lib/supabaseClient.ts](apps/admin_dashboard/src/lib/supabaseClient.ts) is the anon-key browser/RSC client, [src/lib/supabaseAdmin.ts](apps/admin_dashboard/src/lib/supabaseAdmin.ts) exposes the service-role client — **only call it after verifying the caller is a platform `super_admin`**, never expose the service key to the client.
- Driver app sessions are a separate lightweight HMAC-signed token scheme (not Supabase Auth) — see [src/lib/driverSession.ts](apps/admin_dashboard/src/lib/driverSession.ts) (`drv.<payload>.<sig>`, secret from `DRIVER_SESSION_SECRET`).
- Every table has Row Level Security enforcing `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid` — this is the hard multi-tenant wall; there is no app-level tenant filtering to rely on instead. A `campus_id` on operational tables (`routes`, `stops`, `students`, `vehicles`, `schedules`, `trips`) is a secondary, tenant-nested scope (multi-campus UI is not yet unlocked — v1 has exactly one active campus per tenant).

### Data flow / real-time

- Driver app streams GPS via Supabase Realtime broadcast channels scoped to its active `route_id`; parent app subscribes read-only to the channel(s) for its own children's routes.
- Proximity SMS alerts are deduplicated per trip via a `sent_proximity_alerts` tracking table before calling the `send-sms` Edge Function (Africa's Talking).
- High-resolution telemetry has a 7-day TTL and is pruned automatically; only aggregated route summaries persist long-term.
- NFC badges store only an encrypted UUID (no PII on the physical card); the driver app resolves it against the backend on scan.

### admin_dashboard internals

- API routes live under `src/app/api/<domain>/` (e.g. `telemetry`, `trips`, `students`, `billing`, `platform`, `demo-requests`) as Next.js Route Handlers — validate inputs with `zod`, verify JWTs, keep under Vercel's 10s execution limit.
- `src/lib/` holds cross-route logic: tenant host parsing, driver session signing, demo/play-review provisioning ([demoProvision.ts](apps/admin_dashboard/src/lib/demoProvision.ts), [playReviewProvision.ts](apps/admin_dashboard/src/lib/playReviewProvision.ts)), geo utilities, Google polyline encode/decode, Vercel domain management for tenant subdomains.
- `scripts/seed-play-review-school.ts` seeds the permanent Play Store review tenant (slug `play-review`, fixed driver/parent phone numbers, non-expiring OTP `123456`) — documented in [context/ui-context.md](context/ui-context.md).
- `bundle-migrations.js` concatenates `supabase/migrations/*.sql` into `supabase_schema_bundle.sql` at the repo root (auto-prefixes `CREATE POLICY` with `DROP POLICY IF EXISTS`) — a generated reference bundle, not a migration source of truth.

### Styling

Vanilla CSS only (no Tailwind) for the dashboard; all colors/spacing/radii come from CSS custom properties documented in [context/ui-context.md](context/ui-context.md) — note the **marketing landing** tokens (`--lp-*`, light) are scoped under `.landing-page` and are separate from the **admin console** tokens (`--bg-*`, `--accent-*`, dark), don't mix them. Flutter apps use a shared `ThemeData`/Material 3 base with brand tokens per app (driver = high-contrast daylight, parent = friendly light/dark auto).

## Testing gate

A module isn't done until it satisfies `progress-tracker.md`'s Definition of Done: `bdd.md` overwritten with this module's Given/When/Then, automated tests passing for the changed stack, and no invariant from `context/architecture.md` violated (no cross-tenant data mixing, no PII leakage in logs). For Node/Next.js/Deno code this means behavior-focused test names, AAA/GWT structure, mocked third-party I/O (Resend, SMS, Maps, Vercel), and covered auth/validation error paths — see [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodejs-testing-best-practices). For Flutter, unit-test pure Dart/state notifiers, widget-test UI, fake NFC/location channels, and mock Supabase/HTTP.
