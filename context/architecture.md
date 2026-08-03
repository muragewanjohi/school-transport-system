# Architecture Context

## Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Cross-Platform Mobile** | Flutter + Dart | Powers both the Driver App (GPS telemetry/NFC scanning) and Parent App (real-time map tracking) using the Supabase Flutter SDK. |
| **Web & API Host** | Next.js + TypeScript | High-concurrency serverless web environment hosted on Vercel, managing administrative pages and API routes. |
| **Database Engine** | PostgreSQL + PostGIS | Multi-tenant persistent relational data storage hosted on Supabase. Enforces strict access boundaries via Postgres Row Level Security (RLS) and handles spatial geofencing via PostGIS. |
| **Real-Time Pipeline** | Supabase Realtime | Establishes low-latency, WebSocket-based real-time channels to broadcast GPS telemetry vectors directly from driver devices to parent map views. |
| **Comms Gateway** | Africa's Talking REST API | Handles programmatic distribution of transactional Safaricom and Airtel SMS notifications via Supabase Edge Functions. |

## System Boundaries

- `apps/driver_app` — Flutter mobile application. Connects to Supabase to stream GPS coordinates via Realtime Broadcast channels and scans physical NFC cards to verify student boarding.
- `apps/parent_app` — Flutter mobile application. Subscribes to Supabase Realtime channels to track active bus coordinates and view static route configurations.
- `apps/admin_dashboard` — Next.js administrative web console hosted on Vercel. Manages user provisioning, route layouts, NFC card bindings, and exposes secure API Route Handlers.
- `supabase/migrations/` — Relational database tables, spatial indexes, schema migrations, and SQL Row Level Security (RLS) policies defining data isolation rules.
- `supabase/functions/` — Deno Edge Functions hosted on Supabase (e.g., Africa's Talking SMS dispatcher trigger).

## Storage Model

- **PostgreSQL Relational DB**: Dedicated database instance on Supabase. Stores multi-tenant assets (tenant records, student registry, user accounts, assigned NFC card mappings, static polyline route coordinates). Holds vehicle inventories (`vehicles` table, including capacity, status, odometer, fuel level, service, and insurance timers) and service history logs (`maintenance_logs` table).
- **PostGIS Spatial Indexing**: Spatial tables managing student pickup coordinates, route geofence boundaries, and transient coordinate logs. Uses `GIST` indexes for fast geometric intersection calculations.

## Auth and Access Model

- **Row Level Security (RLS):** All database tables have RLS active. Every client request, API invocation, and WebSockets subscription carries a JWT containing the user's authenticated `tenant_id` (nullable for platform roles) and role context (`super_admin`, `school_admin`, `driver`, `parent`, `conductor`).
- **Unified Web Dashboard Access Control:**
  - **School Admins (`school_admin`):** Access is strictly scoped to their matching `tenant_id`. They can register students, assign routes, bind NFC cards, view metrics, manage vehicles/conductors, and log service checks. Within a tenant, sub-roles are expressed via `admin_role` (e.g. Super Admin, Dispatcher, Fleet Manager) — these are still tenant-bound and never have a null `tenant_id`.
  - **Platform Support (`profiles.role = super_admin`):** Platform operators are **not** members of any school. Their `tenant_id` is **null**. They have system-wide access to onboard schools (tenants), monitor cross-tenant metrics, and troubleshoot anomalies. Do not confuse platform `super_admin` with a school admin whose `admin_role` is `"Super Admin"`.
  - **Tenant Impersonation Mode:** Platform `super_admin` users can enter a specific school's dashboard context. During impersonation, support roles are restricted to read-only views on student identities, and all sensitive contact details are dynamically masked in the UI.
- **School (Tenant) Lifecycle:**
  - Schools are rows in `public.tenants`. Product flows only soft-delete (`deleted_at` / suspended status); hard deletes happen exclusively through the automated retention purge below.
  - **Retention & purge (platform-configurable via `platform_settings`):** `suspended_purge_days` (default 90) — schools suspended longer than this are auto soft-deleted; `deleted_purge_days` (default 30) — soft-deleted schools older than this are permanently purged (FK cascade removes campuses, students, routes, billing). A value of `0` disables that stage. `tenants.suspended_at` tracks the suspension clock (set/cleared on status transitions).
  - Purge executor: `GET /api/platform/purge`, scheduled daily at 02:00 UTC by Vercel Cron (`apps/admin_dashboard/vercel.json`), authorized via `CRON_SECRET` bearer or platform super admin session.
  - **Vercel domain release:** on soft delete (manual or automated) the school's `{slug}.onthebusapp.com` domain is removed from the Vercel project via API (best-effort; requires `VERCEL_TOKEN` + `VERCEL_PROJECT_ID`, optional `VERCEL_TEAM_ID`; a 404 is fine when only the wildcard domain is configured).
  - Onboarding creates the tenant, seeds billing + config, creates the **default campus**, and sends an **email invite** to the first school admin (no password set by the platform operator in the onboarding drawer).
  - **v1 product constraint:** exactly one active campus per tenant in the UI. The data model still uses a first-class `campuses` table (not lat/lng on `tenants`) so multi-campus can unlock without a schema rewrite.
  - **`tenants.domain` is the subdomain slug** (e.g. `school1`), not a free-form email domain. Full school URL: `https://{domain}.onthebusapp.com`.

## Hosting & Subdomain Tenancy (Vercel)

Root domain: **`onthebusapp.com`** (wildcard `*.onthebusapp.com` on Vercel).

| Host | Audience | Primary routes |
| :--- | :--- | :--- |
| `onthebusapp.com`, `www.onthebusapp.com` | Public marketing + platform operators | `/`, `/login` (platform), `/schools` |
| `{slug}.onthebusapp.com` | That school's admins | `/login`, `/dashboard`, fleet/students/routes/… |
| Reserved slugs (not tenants) | — | `www`, `platform`, `admin`, `api`, `app`, `static`, `cdn`, `mail`, `smtp`, `ftp` |
| Internal Demo School | `demo.onthebusapp.com` | Static sales sandbox (`domain = demo`, `is_demo = true`). Blocked for customer onboarding. |
| Per-lead demo store | `{school-slug}-demo.onthebusapp.com` | Provisioned on Confirm from a demo request. `is_demo = true`, `demo_expires_at`, linked `demo_request_id`. Slugs ending in `-demo` are blocked for real onboarding. |

Rules:

1. **Resolve tenant** from the Host header: strip `.onthebusapp.com` → lookup `tenants.domain = slug` where `deleted_at IS NULL` and `status = 'active'`.
2. **School login** only succeeds on that school's subdomain; after Auth, `profiles.tenant_id` must match the host tenant (else sign out + error).
3. **Platform `super_admin`** logs in on the apex (`onthebusapp.com`); accessing a school subdomain as platform may later support impersonation — v1 redirects platform users from school hosts back to apex `/schools`.
4. **Invites** always use `https://{slug}.onthebusapp.com/reset-password` (even when the platform console is run on localhost). Supabase Auth **Site URL** must be `https://onthebusapp.com` (not localhost), and the redirect allow-list must include `https://*.onthebusapp.com/**`. If `redirectTo` is missing from the allow-list, Auth silently falls back to Site URL.
5. **Local dev:** `localhost` / `*.localhost` treated as apex unless `x-tenant-slug` / `?tenant=` override is set for testing.
6. **Demo stores (`is_demo`):** Synthetic PII only; outbound SMS is dry-run only. Per-lead stores are named from the demo request, geo-shifted to the request city/area, and seeded with a slim roster (1 admin Auth user, 1 driver, 1 conductor, 3 guardians, 5 students with avatars). The request phone logs into Flutter parent + driver apps (role-scoped OTP; OTP not cleared on `is_demo`). Default `demo_expires_at` is 14 days (editable). Complete or expiry hard-deletes the tenant (cascade) and Auth admin user.
7. **Demo request operations:** `demo_requests.status` moves through `pending`, `confirmed`, `completed`, or `declined`. Platform admins manage requests at `/schools?tab=demos`. Emails via Resend: (1) submit — receipt + sales notify; (2) Confirm — provision store + email URL/admin password/phone+OTP/expiry; (3) Complete — thank-you after purge.

Middleware sets request headers `x-host-kind` (`apex` \| `tenant` \| `local`) and `x-tenant-slug` for server components and route handlers.
## Multi-Campus Model (Designed Now, Multi Unlock Later)

### Hierarchy

```
Platform (super_admin, tenant_id null)
  └── Tenant / School org (billing, brand, contract)
        └── Campus (physical site: name + PostGIS point)
              └── Operational data (routes, stops, students, trips, …)
```

- **Tenant** = commercial / legal school organization (billing, SMS sender branding, subscription).
- **Campus** = one physical school site under that org. Never treat a campus as its own tenant (that breaks shared billing and cross-campus admins).
- Isolation invariant unchanged: every operational row keeps `tenant_id` for RLS. `campus_id` is a **secondary scope inside the tenant**.

### Target tables (introduce `campuses` in Phase 1)

| Table | Purpose |
| :--- | :--- |
| `campuses` | `id`, `tenant_id`, `name`, `location` (PostGIS Point), `status`, `deleted_at`, timestamps. Unique active “default” campus per tenant in v1. |
| `admin_campus_access` | Junction: `profile_id` × `campus_id`. Which school admins may act on which campuses. |
| Operational tables | Add nullable-then-required `campus_id` on `routes`, `stops`, `students`, `vehicles`, `schedules`, `trips` (and related). Staff profiles may use the junction or a home-campus plus optional multi-assign later. |

**v1 behavior:** on school onboard, insert one campus; all operational rows point at it; UI hides campus pickers. **Multi unlock:** allow N campuses; show campus switcher / filters; enforce `admin_campus_access`.

### What stays tenant-scoped vs campus-scoped

| Tenant-scoped (org-wide) | Campus-scoped (site ops) |
| :--- | :--- |
| Billing / plan / invoice | Routes, stops, schedules, trips |
| Tenant config defaults (SMS templates can stay tenant-wide) | Students (primary campus) |
| School admin user directory | Live telemetry views filtered by campus fleet |
| Platform onboarding | Vehicles (home campus; optional later: shared pool flag) |

### Billing & multi-campus

**Contract lives on the tenant, not the campus.** `billing_status` remains `UNIQUE(tenant_id)` — one subscription, one invoice, one renewal, one pay/suspend switch for the whole school organization. Campuses are never separately invoiced.

**Price scales with active campus count.** Schools with more campuses pay more on that single invoice.

| Component | Rule |
| :--- | :--- |
| Campus flat fee | **Per active campus / month**, amount stored as `campus_monthly_fee_kes` (default **KES 10,000** for new schools) |
| Monthly plan total (platform fee) | `active_campus_count × campus_monthly_fee_kes` |
| Example (default rate) | 1 campus → KES 10,000/mo; 5 campuses → KES 50,000/mo |
| Who can edit the rate | **Platform `super_admin` only** — editable in the platform Schools / Billing console per tenant (and optionally a platform-wide default applied when onboarding a new school). School Bursars and tenant admins can **view** the rate and computed total; they cannot change `campus_monthly_fee_kes`. |
| Soft-deleted / suspended campuses | Excluded from `active_campus_count` and from the fee |
| SMS / usage | Remains a separate meter on the same invoice (e.g. KES 1 / SMS) unless a later plan bundles it |
| `price_desc` / displayed amount | Derived at read time from campus count × current fee (never treat a static string as the source of truth) |

**Showback:** Billing UI for tenant-wide roles (Bursar, tenant Super Admin, Operations Admin) shows org total (`N × 10,000` + SMS) and a per-campus line (“Campus fee × N”) plus optional usage breakdown by campus. Campus-limited admins do not manage plan or payment (default: hide `/billing` unless tenant-wide billing role).

**Entitlements / suspension:** Unpaid or suspended tenant locks **all** campuses together.

**Platform view:** One billing record per school org; show `active_campus_count`, computed monthly platform fee, and rolled-up usage.

**Schema note:** Keep the commercial row on `billing_status` (tenant). Column `campus_monthly_fee_kes INT NOT NULL DEFAULT 10000` is the editable rate. Platform APIs allow PATCH of this field for `super_admin` only; school roles are read-only on fee fields. Optional platform default table/config key `default_campus_monthly_fee_kes` seeds new tenants on onboard. Compute `platform_fee_kes = active_campus_count * campus_monthly_fee_kes`. Optional later: `billing_usage_snapshots` for historical showback — not required for Phase 1.

Drivers/conductors: assign to vehicles/routes that already imply a campus; optional explicit multi-campus staff access later if a driver runs routes for two sites.

### Permissions model

Three layers (AND together):

1. **Platform vs school:** `role = super_admin` (`tenant_id` null) vs `role = school_admin` (`tenant_id` required).
2. **Capability (`admin_role`):** what actions they may perform (Fleet Manager vs Roster Manager vs Bursar, etc.).
3. **Campus scope (`admin_campus_access`):** which campuses those actions apply to.

Rules:

- **Tenant Super Admin / Operations Admin (school):** either `campus_access_mode = 'all'` on the profile **or** an implicit “all campuses in tenant” when no junction rows exist and mode is all. Can manage campuses and assign other admins’ campus lists.
- **Campus-limited admins:** one or more rows in `admin_campus_access`. APIs filter `WHERE campus_id IN (allowed)`. Cross-campus create/update returns 403.
- **Bursar / billing roles:** typically tenant-wide (billing is not per campus in v1); campus junction optional / ignored for billing routes.
- **Platform `super_admin`:** all tenants; impersonation picks a tenant, then optionally a campus; PII still masked.

JWT / session claims (when multi unlocks): keep `tenant_id`; add `campus_ids` (array) or resolve campus allow-list server-side from `admin_campus_access` so tokens stay small. Active UI campus filter can be a header/`X-Campus-Id` for list endpoints, always validated against the allow-list.

### RLS sketch (multi unlock)

- Keep existing `tenant_id = jwt_tenant_id()` as the hard wall.
- Add campus predicate for school admins: `campus_id IN (SELECT campus_id FROM admin_campus_access WHERE profile_id = auth.uid())` **OR** profile has tenant-wide campus mode.
- Platform `super_admin` bypasses campus predicates (and uses impersonation + masking in the app layer).

### Product UX when multi unlocks

- Global **campus switcher** in the shell (“All campuses” only for tenant-wide admins).
- List pages default to active campus; “All” aggregates only if permitted.
- Route builder start/end school pin = that campus’s location.
- Onboarding a second campus: name + map pin; optional clone of config; no automatic copy of students/routes.

### Phase 1 implementation rule (avoid rewrite)

Do **not** store the sole campus coordinates only on `tenants`. Create `campuses`, insert the default campus on tenant create, and attach new operational rows to `campus_id`. Defer: multi-campus UI, `admin_campus_access` enforcement UI, and campus switcher — but keep column/table shapes ready.
- **Driver Token Scope:** Drivers are authorized exclusively to broadcast coordinate arrays to their active `route_id` channels and write check-ins for students assigned to their scheduled run.
- **Conductor Token Scope:** Conductors can read assigned routes and student checklist manifests, read active vehicle attributes inside their tenant, and check-in students.
- **Parent Resource Rules:** RLS policies restrict parents to reading telemetry and subscribing to realtime coordinates *only* for the specific `route_id` mapped to their own registered children.

## Student & Parent Data Protection Model

- **Telemetry Log Lifecycle (Short TTL):** High-resolution coordinate tracking logs are pruned automatically after 7 days via database cleanup routines. Long-term analytics store only aggregated route summaries (e.g. route completion durations, total boarding taps), eliminating persistent history of student movements.
- **Dynamic PII Masking:** Parent phone numbers and student names are masked in support dashboards and system-level error trackers (e.g. `J*** Doe`, `+254 712 *** 345`). Only authenticated school admins with direct administrative custody see raw identifiers.
- **Anonymized NFC Badge Tokens:** Physical NFC badges do not store names or student details. They store only an encrypted UUID token. The driver app verifies this UUID against the backend database; if a badge is lost, no personal data can be extracted from it.
- **Geofence Boundary Isolation:** The parent application renders the school bus position and the school location. It does not display the home address markers or pickup coordinates of other children on the map.

## Invariants

1. **No Mixed Tenant Ingestion:** Postgres RLS policies must refuse and discard any location log or boarding record that attempts to write a `tenant_id` mismatching the sender's active token.
2. **Foreground Blocking Prevention:** The Driver app runs GPS location polling and network transmissions inside background processes or isolate pools to prevent UI lag.
3. **Fail-Safe Messaging Overhead Controls:** Proximity checks use a tracking table (`sent_proximity_alerts`) to verify if an SMS alert was already transmitted for a given student during the current trip, ensuring exactly one SMS per pickup to control gateway billing.
4. **No Permanent PII Leaks in Logs:** Standard error-logging outputs and analytics hooks must sanitize user-identifiable strings (e.g., student names, exact home coordinates, parent phone numbers) before writing to flat-file or cloud logs.