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

- **Row Level Security (RLS):** All database tables have RLS active. Every client request, API invocation, and WebSockets subscription carries a JWT containing the user's authenticated `tenant_id` and role context (`super_admin`, `school_admin`, `driver`, `parent`, `conductor`).
- **Unified Web Dashboard Access Control:**
  - **School Admins (`school_admin`):** Access is strictly scoped to their matching `tenant_id`. They can register students, assign routes, bind NFC cards, view metrics, manage vehicles/conductors, and log service checks.
  - **Support Team (`super_admin`):** Granted system-wide access to monitor tenant metrics, onboard new schools, and troubleshoot system anomalies.
  - **Tenant Impersonation Mode:** Support users can view a specific school's dashboard. During impersonation, support roles are restricted to read-only views on student identities, and all sensitive contact details are dynamically masked in the UI.
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