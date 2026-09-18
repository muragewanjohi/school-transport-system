# OnTheBus — Security & Data Protection Architecture

**Audience:** School administrators, IT / compliance reviewers, and partner institutions evaluating how OnTheBus protects student, parent, and operational data.

**Product:** OnTheBus (school transport tracking — admin console, driver app, parent app).

**Last updated:** 2026-09-15

This document describes **how security is designed and implemented** in the running system. It is complementary to the public [Privacy Policy](https://onthebusapp.com/privacy) and [Terms](https://onthebusapp.com/terms). Technical implementation details for engineers live in [architecture.md](architecture.md) and [code-standards.md](code-standards.md).

---

## 1. Security principles

1. **School data stays inside the school.** Each school is a separate tenant. One school cannot read another school’s students, routes, locations, or messages.
2. **Least privilege by role.** Parents, drivers, school admins, and platform operators each see only what their role requires.
3. **Server-enforced controls.** Access rules are enforced in the database and API, not only in the mobile or web UI.
4. **Minimize sensitive data.** Physical BLE tags carry no names or phone numbers. Parent maps do not show other children’s home locations. High-resolution GPS history is short-lived by policy.
5. **Fail closed on demos.** Sales and Play Store demo environments do not send real operational SMS to families.

---

## 2. What data we handle

| Category | Examples | Who typically needs it |
| :--- | :--- | :--- |
| School directory | Student names, grades, assigned routes/stops | School admins |
| Guardian contact | Parent phone (for OTP login and alerts) | School admins; used by messaging gateway when alerts are enabled |
| Transport operations | Routes, stops, vehicles, trip status, boarding events, opaque beacon IDs | School admins, drivers/conductors |
| Live location | Bus GPS during active trips | Parents (own child’s route only), school ops |
| Credentials | Auth sessions, OTP codes (short-lived) | The account holder |

We do **not** store payment card numbers in the school transport apps. Billing is handled at the school/platform subscription layer.

---

## 3. Multi-tenant isolation (core control)

Every school is a **tenant**. Operational records carry a `tenant_id`.

- **PostgreSQL Row Level Security (RLS)** is enabled on application tables.
- Queries from clients are evaluated against the caller’s authenticated identity and tenant claim.
- A correctly issued parent or school-admin session can only access rows for their school (and, for parents, only their own children / routes).

**Invariant:** The system must refuse cross-tenant reads or writes. Application filters alone are not relied upon; the database policy is the hard wall.

School consoles are further separated by **subdomain**: `{school}.onthebusapp.com`. School admin login is expected on that school’s host so sessions are bound to the correct tenant context.

---

## 4. Identity and access control

### 4.1 Roles

| Role | Access summary |
| :--- | :--- |
| **School admin** | Manage that school’s students, fleet, routes, schedules, and settings. Scoped to their `tenant_id`. Sub-roles (e.g. Fleet Manager, Roster Manager) limit capabilities inside the school. |
| **Driver / conductor** | Operate assigned trips: GPS telemetry, boarding/drop-off for students on the run (manual checklist today; BLE auto-confirm when implemented). Cannot browse other schools. |
| **Parent / guardian** | See status and live bus position for **their registered children only**. Cannot see other families’ home pins or unrelated routes. |
| **Platform operator** | Onboard and support schools at the platform level. Not a member of a school tenant. Support access to school data is governed by platform policy (including masking of sensitive contacts where impersonation/support views apply). |

### 4.2 How users authenticate

| Surface | Method |
| :--- | :--- |
| School / platform web console | Email/password via Supabase Auth (invite-based onboarding for school admins). |
| Driver / conductor app | Phone + OTP; session is a signed server-issued token used only for authorized driver APIs (telemetry, trip, attendance). |
| Parent app | Phone + OTP; receives (1) a signed API token for parent-scoped Next.js APIs and (2) a Supabase Auth session so realtime map/ETA access is enforced by RLS. |

OTP codes for production demo stores expire (typically 15 minutes). The permanent Play Store review school uses a documented fixed OTP solely for app-store reviewers.

### 4.3 Privileged keys

- The database **service role** key is used only on trusted servers (API routes / Edge Functions), never embedded in parent or driver apps.
- Mobile apps use publishable/anon credentials plus the user’s own session; they cannot bypass RLS with the service role.

---

## 5. Application and API safeguards

- **Input validation** at API boundaries (schema validation) rejects malformed requests before business logic runs.
- **Authorization checks** on sensitive routes (platform-only purge, parent ETA by child ownership, driver telemetry with a valid driver session).
- **Scheduled jobs** (tenant retention purge, pre-departure delay checks) require a shared cron secret or a platform super-admin session — they are not publicly callable without credentials.
- **Secrets** (session HMAC secrets, SMS gateway keys, email provider keys, service role) are stored in the hosting environment (e.g. Vercel), not in source control.

---

## 6. Protecting children and families (product controls)

### 6.1 Parent map privacy

The parent application is designed to show:

- The **school bus** position for the child’s route  
- School / stop context as configured  

It does **not** display the home addresses or exact pickup pins of **other** children on the same route.

### 6.2 BLE / boarding tags

Physical student tags broadcast an **opaque BLE identifier** (iBeacon UUID / Major / Minor and/or Eddystone UID), not the student’s name, phone, or school. Lost tags do not expose personal details by themselves; the driver app resolves the identifier against the school’s backend under authenticated access. Static beacon advertisements can be observed or cloned nearby — product mitigations include opaque random IDs, stop-geofence + bus-movement confirmation before parent notify, immediate revoke/replace on loss, and driver correction.

**Configuration lock:** CP35 tags use a 6-character device password (factory `DX1234`). OnTheBus replaces it with a **tenant-scoped password** on first provision so the public DX-SMART app cannot change UUID/Major/Minor/TX without that password. The password is stored encrypted in `tenant_configs` and returned only to authenticated driver/conductor provision sessions — never logged or shown to parents. Full rules: [boarding-technology.md](boarding-technology.md). Legacy NFC hash fields may remain in the schema until migration; NFC is **not** the primary boarding path.

### 6.3 Location data lifecycle

High-resolution GPS telemetry is treated as **short-lived operational data**. Long-term retention focuses on aggregated operational summaries (e.g. trip completion), not permanent minute-by-minute trails of every journey. Exact policy windows are maintained in product configuration and privacy documentation.

### 6.4 Notifications

- Families may receive **in-app / push** and, when the school enables SMS, **SMS** for events such as trip start, approach/ETA, boarding, delay, and trip status changes.
- Alerts are **deduplicated** (e.g. one proximity alert per student per trip day; delay escalation bands) to reduce spam and control messaging cost.
- Message templates are school-configurable; content is limited to operational need (child first name, stop, ETA, vehicle plate as configured).

---

## 7. Demo, sandbox, and Play Store review environments

| Environment | Data | Operational SMS |
| :--- | :--- | :--- |
| Per-school demo stores | Synthetic / demo roster; short expiry | Dry-run (not delivered as real trip SMS) |
| Internal demo school | Sales sandbox | Dry-run for operational alerts |
| Play Store review school | Fixed reviewer credentials for Google review | Dry-run for operational alerts; login OTP as documented for reviewers |

This prevents accidental messaging of real parents during sales demos and store review.

---

## 8. Infrastructure & hosting posture

| Layer | Provider / stack | Security-relevant notes |
| :--- | :--- | :--- |
| Database & Auth | Supabase (PostgreSQL + Auth + Realtime) | RLS, managed auth, encrypted connections in transit |
| Web & APIs | Next.js on Vercel | Serverless routes, env-based secrets, cron authentication |
| Mobile | Flutter (Android / iOS) | OS sandboxing; sessions stored on-device via platform preferences / Auth client |
| SMS | Africa’s Talking (via Edge Functions) | Server-side dispatch only; demo dry-run |
| Email | Transactional provider (e.g. Resend) | Used for invites / demo ops — not for exposing student GPS |

School admin consoles are served on dedicated HTTPS subdomains under `onthebusapp.com`.

---

## 9. Operational security practices

- **Security hardening migrations** remove open anonymous write/read policies that were used only during early development.
- Privileged database functions run with a fixed `search_path` and are **not** executable by anonymous clients.
- Automated tests cover critical auth failure paths (unauthorized cron, wrong parent for a child ETA, invalid sessions).
- Platform operators review Supabase security advisors after material schema changes.
- Dependency and hosting updates follow normal production release discipline.

Schools should also apply their own controls: strong admin passwords, limited admin accounts, timely offboarding of staff who leave, and verifying parent phone numbers before enabling SMS.

---

## 10. What schools should expect from us

| Commitment | How we support it |
| :--- | :--- |
| Isolation from other schools | Tenant ID + RLS + subdomain-bound school console |
| Role-appropriate access | Distinct parent / driver / school-admin / platform roles |
| Reduced PII on physical media | Opaque BLE beacon identifier design (see [boarding-technology.md](boarding-technology.md)) |
| Family privacy on maps | No other children’s homes on the parent map |
| Controlled messaging | School SMS toggle, templates, dedupe, demo dry-run |
| Account lifecycle | Soft-delete / retention purge for departed schools; invite-based admin onboarding |

---

## 11. Incident & contact

For security concerns, data-subject requests, or school IT questions:

- Product support: as published on [onthebusapp.com](https://onthebusapp.com) / `support@onthebus.app`  
- Privacy and account deletion guidance: `/privacy` and `/delete-account` on the public site  

If a school requires a signed DPA, DPIA input, or a questionnaire (e.g. ISO-style controls matrix), use this document as the baseline and request a formal commercial security package from OnTheBus.

---

## 12. Document control

| Item | Value |
| :--- | :--- |
| Owner | OnTheBus platform / engineering |
| Related specs | [architecture.md](architecture.md), [code-standards.md](code-standards.md), [project-overview.md](project-overview.md) |
| Classification | Suitable for sharing with prospective and contracted schools under NDA or procurement review |

*This document describes technical and product controls. It is not a legal opinion or a certification. Certifications (e.g. ISO 27001) are separate commercial artifacts if/when obtained.*
