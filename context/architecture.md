# Architecture Context

## Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Cross-Platform Mobile** | Flutter + Dart | Powers both the Driver App (GPS telemetry/NFC scanning) and Parent App (real-time map tracking) using the Supabase Flutter SDK. |
| **Web & API Host** | Next.js + TypeScript | High-concurrency serverless web environment hosted on Vercel, managing administrative pages and API routes. |
| **Database Engine** | PostgreSQL + PostGIS | Multi-tenant persistent relational data storage hosted on Supabase. Enforces strict access boundaries via Postgres Row Level Security (RLS) and handles spatial geofencing via PostGIS. |
| **Real-Time Pipeline** | Supabase Realtime | Establishes low-latency, WebSocket-based real-time channels to broadcast GPS telemetry vectors directly from driver devices to parent map views. |
| **Comms Gateway** | Africa's Talking REST API (live) | Transactional Safaricom/Airtel SMS. Login OTPs go out from Next.js; operational alerts go out from the `send-sms` Edge Function. Production uses the live AT app (username ≠ `sandbox`, host `api.africastalking.com`). |

## System Boundaries

- `apps/driver_app` — Flutter mobile application. Connects to Supabase to stream GPS coordinates via Realtime Broadcast channels and scans physical NFC cards to verify student boarding.
- `apps/parent_app` — Flutter mobile application. Subscribes to Supabase Realtime channels to track active bus coordinates and view static route configurations. Public store/home-screen name is **OnTheBus**. Android `applicationId` is `com.schooltrack.parent_app`. iOS bundle ID is `com.schooltrack.parentApp` (Firebase/Apple allow letters, numbers, dots, and hyphens — not underscores; same camelCase pattern as driver `com.schooltrack.driverApp`). iOS IPA is built on Codemagic (not Windows). v1 ships iPhone-only.
- `apps/admin_dashboard` — Next.js administrative web console hosted on Vercel. Manages user provisioning, route layouts, NFC card bindings, and exposes secure API Route Handlers.
- `supabase/migrations/` — Relational database tables, spatial indexes, schema migrations, and SQL Row Level Security (RLS) policies defining data isolation rules.
- `supabase/functions/` — Deno Edge Functions hosted on Supabase (e.g., Africa's Talking SMS dispatcher trigger).

## Africa's Talking SMS (live vs sandbox)

Production **must not** use the AT sandbox app. Username `sandbox` and host `api.sandbox.africastalking.com` are local/Preview only.

| Channel | Path | Live when |
| :--- | :--- | :--- |
| Driver / conductor login OTP | `POST /api/auth/driver-request-otp` | Production + live username + `OTP_SMS_DRY_RUN` not `true` |
| Parent login OTP | `POST /api/auth/parent-request-otp` | Same |
| Operational alerts (proximity, delay, boarding, trip start, absent) | Edge Function `send-sms` on `alerts_queue` | Tenant is **not** `is_demo` **and** `sms_notifications_enabled` |

**Kill-switches / dry-run:** `AFRICASTALKING_USERNAME=sandbox`, `OTP_SMS_DRY_RUN=true`, `NODE_ENV` not production, or Vercel Preview/Development. `OTP_SMS_DRY_RUN=false` forces a live send when the username is not `sandbox` (local smoke only). Dry-run responses may include `sandbox_otp` for Flutter; production live sends never echo the code.

**Demo vs Play Review:** Demo tenants receive **login OTP SMS** through the live gateway so the request phone can sign in. Operational trip/proximity SMS on demo remains dry-run inside `send-sms`. Play Review (`domain = play-review`) keeps OTP `123456` and never sends SMS.

**Secrets:** Same live trio on Vercel (`AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY`, optional `AFRICASTALKING_SENDER_ID`) and as Supabase Edge Function secrets. Mix-and-match sandbox key + live username fails auth. Omit `from` until the Sender ID is operator-approved.

## Storage Model

- **PostgreSQL Relational DB**: Dedicated database instance on Supabase. Stores multi-tenant assets (tenant records, student registry, user accounts, assigned NFC card mappings, static polyline route coordinates). Holds vehicle inventories (`vehicles` table, including capacity, status, odometer, fuel level, optional last/next service and insurance dates, and `notify_compliance_alerts`) and service history logs (`maintenance_logs` table). Year-2000 date-picker defaults are stored as null. When notify is on, the fleet console alerts at 1 month, 2 weeks, and 1 day before next service or insurance expiry.
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
| `onthebusapp.com`, `www.onthebusapp.com` | Public marketing + platform operators | `/`, `/about`, `/careers`, `/contact`, `/privacy`, `/terms`, `/delete-account`, `/login` (platform), `/schools` |
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
6. **Demo stores (`is_demo`):** Synthetic PII only. Operational trip/proximity SMS remains dry-run, but login OTP SMS is delivered to the registered demo phone through the configured SMS gateway so reviewers can complete authentication. Per-lead stores are named from the demo request, geo-shifted to the request city/area, and seeded with a slim roster (1 admin Auth user, 1 driver, 1 conductor, 3 guardians, 5 students + avatars). The request phone logs into Flutter parent + driver apps using a fresh six-digit OTP that expires after 15 minutes. The permanent `play-review` tenant is the sole exception and keeps OTP `123456` for store reviewers. Default `demo_expires_at` is 14 days (editable). Complete or expiry hard-deletes the tenant (cascade) and Auth admin user.
7. **Demo request operations:** `demo_requests.status` moves through `pending`, `confirmed`, `ready_to_onboard`, `completed`, or `declined`. Platform admins manage requests at `/schools?tab=demos`. Emails via Resend: (1) submit — receipt + sales notify; (2) Confirm — provision store + email URL/admin password/phone+OTP/expiry; (3) school **Request to go live** — status `ready_to_onboard` + notify `info@onthebusapp.com`; (4) Complete — thank-you after purge.
8. **Demo is not paid (no in-place convert):** Never flip `tenants.is_demo` to false on an existing demo store. A paid school is a **new** tenant on a real slug (no `-demo` suffix) via platform onboard + invite. Static `demo` and `play-review` cannot request go-live. School admins on a per-lead demo see a persistent banner (demo account + `demo_expires_at`) and a **Request to go live** CTA (`POST /api/demo/go-live`). That CTA does not create the paid tenant; it marks the linked `demo_requests` row `ready_to_onboard` and emails `info@onthebusapp.com`. Platform then onboards the paid school separately and later Completes/purges the demo store. Do not copy synthetic students or phones onto the paid tenant.

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
- **Operational tenant wall:** School console APIs resolve `tenant_id` from the signed-in profile **and** the school subdomain (`x-tenant-slug` / Host) via `requireOperationalTenant`. They never use `tenants.limit(1)`. Platform `super_admin` on `{slug}.onthebusapp.com` is scoped to that slug only. A school admin on another school's host is denied. Empty tenant lists return `[]`, not mock data from another school or static demo staff. Covered routes: students, routes, stops (including attach/reorder), schedules, fleet + maintenance, drivers, conductors, school admins, parents, campuses, trips, billing, config, telemetry, uploads, alerts. Driver/parent mobile APIs scope by session `tenant_id` (not Host). Platform-only routes (`/api/tenants`, demo-requests, platform purge/settings) stay cross-tenant for `super_admin`. Cron `trips/predeparture-check` remains all-tenant by design. Driver stop outcomes persist via `POST /api/driver/stop-visits`.

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

**Showback:** Billing UI for tenant-wide roles (Bursar, tenant Super Admin, Operations Admin) shows org total (`N × 10,000` + SMS) and a per-campus line (“Campus fee × N”) plus optional usage breakdown by campus. The **Current plan** card on school `/billing` presents the public `/pricing` tier that covers live students, buses, and locations (Starter / School / Growth / Enterprise) with actuals against those caps. Campus-limited admins do not manage plan or payment (default: hide `/billing` unless tenant-wide billing role).

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

## Parent Mobile Session & Live ETA API

Parent OTP login (`POST /api/auth/parent-login`) returns:

1. **HMAC API token** `par.<payload>.<sig>` (`PARENT_SESSION_SECRET`) for Next.js routes such as `GET /api/parent/children`, `GET /api/parent/live`, `GET /api/parent/etas`, `GET`/`PATCH`/`DELETE /api/parent/notifications`, and `POST`/`DELETE /api/parent/fcm-tokens`. `GET /api/parent/children` is the parent app’s primary child roster (service role, scoped to `parent_id = parent.sub` and tenant, plus guardian-phone matches when `parent_id` is still null). Direct Supabase `SELECT` on `students` is a fallback only — parent RLS is `parent_id = auth.uid()`, so a missing Flutter Auth session must not wipe the roster. `GET /api/parent/live` returns in-progress trip + bus GPS for a child; when active, `trip` includes `driver` and optional `conductor` contact objects (`name`, `phone`, `avatar_url`) from trip crew profiles. When idle (`trip_active: false`) it also returns `next_trip` (today’s next scheduled departure, vehicle, est. duration) or null. Parent-facing `transit_status` is never “On the Bus” unless the trip is in progress and the child is boarded. If that route is unavailable the Flutter map falls back to Supabase Auth (`trips` + `live_coordinates` for the child’s route).
2. **Supabase Auth session** (`supabase_access_token` / `supabase_refresh_token`) from `ensureParentAuthSession`: creates/updates `auth.users` with **`id = profiles.id`**, synthetic email `parent+{id}@users.onthebusapp.internal`, and `app_metadata` + `user_metadata` `{ role: parent, tenant_id }`. Flutter calls `auth.setSession(refresh_token)` so Realtime RLS sees `auth.uid()` and `jwt_role() = parent`.

Live notifications:

- Primary resilient path: poll `GET /api/parent/notifications` with Bearer `par.*` (service role, scoped to `user_id = parent.sub` and `tenant_id`). `PATCH` marks rows read. `DELETE` clears (hard-deletes) the parent's own inbox rows — Clear All in the app uses this, not mark-read. If that route is unavailable, the app falls back to direct Supabase under `user_id = auth.uid()` (SELECT / UPDATE / DELETE policies). The Parent app inbox renders these rows (no synthetic placeholders).
- When a Supabase Auth session is present, the app also subscribes to Realtime INSERTs on `notifications` (`supabase_realtime` publication; RLS `user_id = auth.uid()`). Foreground local banners are a supplement only — they do not replace FCM.
- After login the app requests notification permission, obtains an FCM token, and `POST /api/parent/fcm-tokens` upserts `user_fcm_tokens`. Logout `DELETE`s that token. `send-push` (on `notifications` INSERT via `trigger_push_webhook` → `net.http_post`) delivers lock-screen push when `FIREBASE_SERVICE_ACCOUNT` is set and tokens exist. Missing tokens skip push; the in-app row still exists. Push must work with the app backgrounded or killed (FCM `notification` + Android high-priority channel `parent_trip_alerts`).
- **Trip start:** when a trip moves `scheduled` → `in_progress` and `tenant_configs.notify_on_trip_start` is true, parents on that route get an immediate `notifications` row (`notification_type = 'trip_start'`) and thus FCM. This is independent of campus-exit timing. SMS for the same event is queued only when `sms_notifications_enabled` is also on.
- Parent Android Firebase app is `com.schooltrack.parent_app` (`1:465945931477:android:5a06937b146c6c6b5cbc5c`) in project `school-transport-system-f606a`. Parent iOS Firebase app is `com.schooltrack.parentApp` (`1:465945931477:ios:98205baf8a938a245cbc5c`). Do not reuse the driver Android/iOS app IDs. iOS lock-screen also needs an APNs key in that Firebase project.
- SMS remains a separate optional channel (`sms_notifications_enabled`); demo/play-review stay SMS dry-run.

Live ETA:

- Primary resilient path: poll `GET /api/parent/etas?student_id=` with Bearer `par.*` (service role, ownership-checked) while a trip is in progress.
- When a Supabase Auth session is present and `trip_active`, the map also streams `trip_stop_etas` / `live_coordinates` under parent RLS. When idle, Map shows a schedule card (no Google Map) using `next_trip` from `/api/parent/live`.
- Parents may `SELECT` stops on their children's routes (`Parents can read stops on child's route`).
- Parents may `SELECT` schedules on their children's routes (`Parents can read schedules on child's route`) for Profile pickup/drop-off trip details.
- Parent avatar uploads use the `avatars` bucket with object paths `{auth.uid()}/…` (storage RLS). Student and primary-parent photos update `students.avatar_url` / `profiles.avatar_url`. Secondary guardian photos update `avatar_url` inside that child's `students.guardians` JSONB (there is no `guardians` table).
- JWT helpers prefer `app_metadata` then `user_metadata` for `role` / `tenant_id`.

## Delay Detection & Live ETA

Automatic detection of trips running behind schedule, evaluated in the database on telemetry ingestion (no cron, no extra services).

### Schedule baseline

- Every stop has a **travel leg** (`stops.duration_from_prev_seconds`, `distance_from_prev_meters`) and a **dwell budget** (`stops.dwell_seconds`, default 120s) for boarding time at that stop.
- Scheduled arrival at stop *k* = trip departure + Σ(leg durations 1..k) + Σ(dwell budgets 1..k−1). Departure comes from `schedules.departure_time` (or `trips.custom_departure_time` when an admin announced a manual delay), interpreted in `Africa/Nairobi`.

### Evaluation (trigger `on_live_coordinate_delay_check` → `evaluate_trip_delay()`)

1. Runs `AFTER INSERT` on `live_coordinates`, throttled to at most one evaluation per trip per 30 seconds (`trip_delay_state.last_evaluated_at`). The active trip is resolved by `vehicle_id + route_id + trip_date + status = 'in_progress'`.
2. Route progress = highest stop sequence in `stop_arrivals_log` for the route today. Remaining time on the current leg is estimated geometrically: `leg_duration × clamp(distance(bus, next_stop) / leg_distance, 0..1.5)`.
3. Predicted arrival for every remaining stop = predicted next-stop arrival + subsequent legs + intermediate dwell budgets; rows are upserted into **`trip_stop_etas`** (`UNIQUE (trip_id, stop_id)`, in the `supabase_realtime` publication) which mobile clients stream for live ETA display. The table holds only trip/stop IDs and timestamps — no PII.
4. **Delay** = predicted − scheduled arrival at the next stop (lateness beyond the planned dwell budget; dwelling 10 min at a 5-min-budget stop accrues 5 min of delay, and distributed lateness accumulates identically).

### Notification policy

- Notify affected parents when predicted delay ≥ **5 minutes**; re-notify only when the delay grows **≥ 10 minutes beyond the last notified value** (state in `trip_delay_state.last_notified_delay_seconds`). Dedup is per **trip**, independent of the per-day `sent_proximity_alerts` proximity dedup.
- Affected parents = parents whose child's direction-relevant stop (pickup for `HOME_TO_SCHOOL`, dropoff for `SCHOOL_TO_HOME`) is **still ahead** of the bus. Stops already served are not notified.
- Delivery reuses the existing pipeline: `notifications` insert (`notification_type = 'delay'`) → `send-push`; plus `alerts_queue` insert (`message_type = 'delay'`, templated via `tenant_configs.sms_template_delay` with `{parent_name} {student_name} {stop_name} {delay_mins} {new_eta} {vehicle_plate}`) when `sms_notifications_enabled` — demo-tenant SMS dry-run applies unchanged.
- Both telemetry triggers (`check_geofence_triggers`, `evaluate_trip_delay`) swallow their own errors with a `WARNING` so auxiliary processing can never fail GPS ingestion (invariant below).

### Pre-departure delays (never started)

Trips that never start transmitting are caught by Vercel Cron → `GET /api/trips/predeparture-check` every 5 minutes (`CRON_SECRET` bearer, same as platform purge). For today's `status = scheduled` rows with `started_at` null, if `now ≥ expected_departure + grace` (default 10 minutes, `PREDEPARTURE_GRACE_MINUTES`) the job sets `status_override = 'Delayed'` and a fixed description. Expected departure = `custom_departure_time` or `schedules.departure_time` in `Africa/Nairobi`. Dedup: skip when `status_override` already matches `/delay/i`. Parent notifications reuse `on_trip_status_update` (demo SMS dry-run unchanged).

### Out of scope (v1)

- Traffic-aware delay math (Google Distance Matrix); v1 uses stored leg durations + geometric progress.

## Drop-off campus boarding

For `schedules.direction = SCHOOL_TO_HOME` (drop-off, school to home), students gather at campus and must be accounted for **before** the trip leaves:

1. While the daily trip is `scheduled`, the driver processes the full `trip_manifests` roster at campus with a **SwitchListTile** per student (on = boarded, off = absent; pending starts off). Start Trip does **not** auto-mark remaining Pending as boarded. **Mark remaining absent** writes leftover Pending → Absent via the same per-manifest PUT as the switch (not a trip-row PATCH).
2. `PUT /api/trips` with `status: in_progress` returns **409** if any manifest is still `pending`. An empty roster may start. `HOME_TO_SCHOOL` (pickup) may still start with pending manifests and boards at pickup stops after GPS is live.
3. Campus roll-call is **not** stop-geofence gated and does not require live telemetry. Writes go to `trip_manifests` (`boarded` / `absent`), not driver `PUT /api/students/:id` (that path maps Absent → `dropped_off` and requires a stop geofence).
4. Parent “has boarded” notifications still fire from `on_manifest_attendance_update` when attendance becomes `boarded` (including on a still-`scheduled` trip). Parent **absent** notifications also fire from that trigger when attendance becomes `absent`, gated by school `/config`:
   - **Stop absent** (`notify_on_absent_stop`, default on): trip is `in_progress`. Default copy: `Bus {vehicle_plate} has left stage {stop_name} and {student_name} was marked absent at {time}.` `{stop_name}` is the child’s pickup stop on `HOME_TO_SCHOOL` or drop-off stop on `SCHOOL_TO_HOME`.
   - **Campus absent** (`notify_on_absent_campus`, default on): trip is still `scheduled` and direction is `SCHOOL_TO_HOME` (Absent toggle or Mark remaining absent). Default copy: `Bus {vehicle_plate}: {student_name} was marked absent before the trip left school at {time}.`
   - In-app / push uses those templates. SMS is queued only when `sms_notifications_enabled` is also on (demo dry-run unchanged). `no_show` does not notify.
5. After start, existing **Driver Stop Visit Outcomes** apply at **home** stops. School terminal stops do not open a pick/drop drawer (see **School terminal stops**).

## School terminal stops

Routes are sequenced; campus is typically the first and/or last pin.

- **Drop-off (`SCHOOL_TO_HOME`):** the first sequenced stop is school origin. The driver already boarded at campus before Start Trip. Entering that geofence must **not** auto-open Pickup/DropOff Students. An empty stop roster also skips the drawer (pickup leaving campus as stop 1).
- **Pickup (`HOME_TO_SCHOOL`):** the last sequenced stop is school destination. Entering that geofence (no min-dwell wait) once per trip:
  1. Remaining `trip_manifests` `boarded` → `dropped_off` (`dropped_off_at` set). Parent drop-off notifications fire from `on_manifest_attendance_update`. Still-`pending` → `absent` (stop-absent parent notify if `notify_on_absent_stop`).
  2. `trip_stop_visits` outcome `completed` for that stop.
  3. Trip `status = completed`, `completed_at = now()`, `duration_seconds = completed_at - started_at`.
- Writes go through `POST /api/driver/school-arrival` `{ trip_id, stop_id }` (driver HMAC → service role). 409 unless the trip is `in_progress`, direction is `HOME_TO_SCHOOL`, and `stop_id` is the last sequenced stop. Idempotent if the trip is already `completed`.
- Ordinary **Hold to end** mid-route does **not** dump remaining boarded students as dropped at school. Hold to end **at the school fence** on pickup may use the same school-arrival endpoint.
- Home first stops on pickup still auto-open the boarding drawer.

## Driver Stop Visit Outcomes

While a trip is `in_progress`, each route stop is resolved once into **`trip_stop_visits`** (`UNIQUE (trip_id, stop_id)`). Rows store `arrived_at`, `departed_at`, and `dwell_seconds` (how long the bus stayed inside the stop geofence). No student names, phones, or exact coordinates.

Driver UI has three phases for the next unresolved stop: **approaching** (outside the stage geofence), **arrived** (inside `stops.geofence_radius_meters`, default 50 m), **left** (outside radius + 15 m hysteresis).

School config `tenant_configs.min_stop_dwell_seconds` (default **90**, allowed **60–180**) is the minimum time after `arrived_at` before **Skip Stop** is enabled and before a zero-tick leave may resolve as **visited**.

| Outcome | How it is set | Map marker | Admin alert | Remaining Pending at stop |
| :--- | :--- | :--- | :--- | :--- |
| `completed` | Driver taps **Complete Stop**, or leaves after at least one student was picked/dropped at that stop | Completed (green) | No | → Absent |
| `visited` | Bus arrived, min dwell elapsed, then left without Complete/Skip and without any student action | Visited (amber) | Yes | → Absent |
| `skipped` | Driver taps **Skip Stop** after min dwell | Not visited (red) | Yes | → Absent |

Rules:

1. Entering the next unresolved **home** stop geofence auto-opens the pickup/drop-off drawer (~70–80% height). School terminal stops and empty stop rosters skip the drawer (see **School terminal stops**). The driver may dismiss it; it does not auto-reopen for the same arrival. The trip control drawer copy switches from **Approaching {stage}** to **You’re at {stage}** with a dwell timer toward min wait.
2. **Complete Stop** marks remaining Pending students at that stop Absent, writes `completed`, records dwell, and advances the next stop. Min dwell is not required.
3. **Skip Stop** is locked until `now - arrived_at ≥ min_stop_dwell_seconds`. Then it writes `skipped`, marks remaining Pending Absent, records dwell if the bus had arrived (else 0), and advances the next stop.
4. Leaving the geofence (radius + 15 m hysteresis):
   - If at least one student was actioned: implicit `completed` immediately (min dwell does not apply); remaining Pending → Absent.
   - If zero ticks and dwell **&lt; min**: do **not** write `visited` and do **not** advance the next stop. Clock keeps running from `arrived_at`. When min dwell elapses with the stop still unresolved and zero ticks → auto `visited` + Pending → Absent + admin alert (even if the bus is already down the road).
   - If zero ticks and dwell **≥ min**: immediate `visited` + Pending → Absent + admin alert.
5. Alerts are tenant-scoped ops rows (`trip_stop_visits.alerted`) plus `notifications` for that school’s `school_admin` profiles. Messages use stop name, route name, and vehicle plate only — no student PII. Demo SMS dry-run is unchanged (these alerts are dashboard/in-app, not parent SMS). Parents do **not** get a separate skip/visited/left ping; remaining Pending → Absent may notify parents if `notify_on_absent_stop` is on.
6. Writes go through `POST /api/driver/stop-visits` (driver HMAC session → service role). School console reads `GET /api/alerts`. RLS: `tenant_id = jwt_tenant_id()`. Completed outcomes are not overwritten by a later visited/skipped event.

### Parent trip alerts

**Trip start (config):** When the driver starts the trip (`scheduled` → `in_progress`) and `notify_on_trip_start` is on, every parent of a student on that route gets an immediate in-app/push `trip_start` notification (templated via `sms_template_trip_start`). This must not wait for campus-exit GPS.

**Operational approach messages (exactly two per child per trip)** are deduped via `sent_proximity_alerts`. **In-app / push (`notifications`) always fires** for each of the two events. **SMS (`alerts_queue`) is optional** and is queued only when `tenant_configs.sms_notifications_enabled` is true. Demo tenants stay SMS dry-run even if that toggle is on.

1. **Campus exit** — GPS leaves the active campus pin (campus `location` + **150 m** radius), or trip start if the bus is already outside campus. Each parent of a student on the trip gets that child’s ETA to pickup (`HOME_TO_SCHOOL`) or drop-off (`SCHOOL_TO_HOME`) from stored leg durations / `trip_stop_etas`.
2. **Stage approach** — bus within `tenant_configs.geofence_radius_meters` (default **500 m**) of that student’s pickup or drop-off stop for this run. Once per student per trip.

Boarding/drop-off confirmation when the driver ticks a student remains attendance (in-app always; SMS if enabled), not an approach alert. Absent confirmation is a separate configurable attendance event (`notify_on_absent_stop` / `notify_on_absent_campus`). There is no “arrived at pin” parent ping.

## Student & Parent Data Protection Model

School-facing summary of controls (suitable for IT / procurement review): **[architecture-security.md](architecture-security.md)**.

- **Telemetry Log Lifecycle (Short TTL):** High-resolution coordinate tracking logs are pruned automatically after 7 days via database cleanup routines. Long-term analytics store only aggregated route summaries (e.g. route completion durations, total boarding taps), eliminating persistent history of student movements.
- **Dynamic PII Masking:** Parent phone numbers and student names are masked in support dashboards and system-level error trackers (e.g. `J*** Doe`, `+254 712 *** 345`). Only authenticated school admins with direct administrative custody see raw identifiers.
- **Anonymized NFC Badge Tokens:** Physical NFC badges do not store names or student details. They store only an encrypted UUID token. The driver app verifies this UUID against the backend database; if a badge is lost, no personal data can be extracted from it.
- **Geofence Boundary Isolation:** The parent application renders the school bus position and the school location. It does not display the home address markers or pickup coordinates of other children on the map.

## Invariants

1. **No Mixed Tenant Ingestion:** Postgres RLS policies must refuse and discard any location log or boarding record that attempts to write a `tenant_id` mismatching the sender's active token.
2. **Foreground Blocking Prevention:** The Driver app runs GPS location polling and network transmissions inside background processes or isolate pools to prevent UI lag.
3. **Fail-Safe Messaging Overhead Controls:** Parent approach alerts use `sent_proximity_alerts` keyed by student, trip, and kind (`campus_exit` | `proximity`) so each child gets at most those two operational **notifications** per trip. SMS is a separate optional channel (`sms_notifications_enabled`) and is dry-run on demo tenants.
4. **No Permanent PII Leaks in Logs:** Standard error-logging outputs and analytics hooks must sanitize user-identifiable strings (e.g., student names, exact home coordinates, parent phone numbers) before writing to flat-file or cloud logs.
5. **Telemetry Ingestion Never Fails on Auxiliary Processing:** Triggers attached to `live_coordinates` (geofence checks, delay evaluation) must catch and log their own errors — a bug in alerting/ETA logic must never abort a GPS insert.