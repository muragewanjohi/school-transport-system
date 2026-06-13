# Safaricom-Linked School Transport Tracking Ecosystem

A multi-tenant B2B2C school transport tracking and student security platform designed for private schools. This platform provides real-time fleet telemetry for school administrations, proximity alerts for parents, and driver manifests via a hybrid driver GPS tracking and smart NFC/RFID badge check-in architecture.

---

## Technical Architecture

The system utilizes a **Pure Serverless Architecture** designed for rapid scalability, dynamic performance, and zero-hardware-friction deployments.

### Tech Stack
* **Web Admin Console & APIs:** Next.js (App Router) + TypeScript + Vanilla CSS (hosted on Vercel).
* **Cross-Platform Mobile Clients:** Flutter + Dart using the `supabase_flutter` client SDK (Driver App & Parent App).
* **Database Engine:** PostgreSQL + PostGIS (hosted on Supabase) utilizing spatial indexes (`GIST`) for coordinate telemetry matching.
* **Real-time Streaming:** Supabase Realtime Channels (WebSocket broadcast) for low-latency driver-to-parent coordinate delivery.
* **Proximity SMS Alerts:** Africa's Talking REST API (triggered from Deno Edge Functions on Supabase).

---

## Directory Layout

This project is organized as a workspace monorepo:

* `apps/admin_dashboard/` — Next.js Web Dashboard & Serverless API Routes (`src/app/api/`).
* `apps/driver_app/` — Flutter mobile application for bus drivers (GPS streaming & NFC scans).
* `apps/parent_app/` — Flutter mobile application for parents (real-time maps & check-in notifications).
* `supabase/migrations/` — PostgreSQL migrations containing schemas, spatial indices, triggers, and Row Level Security (RLS) policies.
* `supabase/functions/` — Deno Edge Functions (SMS notification queues).
* `context/` — Specifications, visual guides, progress logs, and code standards.

---

## Core Security & Data Protection Policies

1. **Row Level Security (RLS):** Enabled on every database table. Access is cryptographically isolated by `tenant_id` read from the user's JWT. Cross-tenant leakage is prevented directly at the PostgreSQL engine level.
2. **7-Day Telemetry TTL:** Raw coordinates logs are pruned automatically after 7 days. Long-term analytics store only aggregated route summaries.
3. **Anonymized NFC Badge Tokens:** Physical cards store only an encrypted UUID token. No PII is kept on the badge, ensuring lost cards leak zero data.
4. **Impersonation Masking:** Support admins (`super_admin`) can view school-level console frames for troubleshooting, but all parent contacts and student details are dynamically masked inside the UI.

---

## Local Development Setup

### Prerequisites
* Node.js (v18+)
* Flutter SDK & Dart
* Git

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/muragewanjohi/school-transport-system.git
   cd school-transport-system
   ```

2. Install workspace dependencies:
   ```bash
   npm install
   ```

3. Run the Next.js Admin Dashboard:
   ```bash
   npm run dev:dashboard
   ```

4. Run local Supabase (requires Docker & Supabase CLI):
   ```bash
   supabase start
   ```
