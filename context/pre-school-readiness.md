# Pre-School Manual Readiness Checklist

Manual QA runbook for the founder (or a helper) before approaching real schools or starting a pilot. This is **not** automated BDD — mark each item as you run it.

| Field | Value |
| :--- | :--- |
| **Tester** | |
| **Date** | |
| **Build / deploy** | Production apex + tenant subdomains; Driver + Parent apps pointed at live API |
| **Full pass** | ~2–3 hours |
| **Happy-path only** | ~60–90 minutes (sections 5 + 6 + Go/No-Go) |

## Environments

Tag items with the environment you used. Do not verify real operational SMS on demo stores.

| Tag | Host / store | Login OTP | Operational SMS (proximity, delay, trip status) |
| :--- | :--- | :--- | :--- |
| `[play-review]` | `play-review.onthebusapp.com` | Fixed `123456` (driver `+254700000001`, parent `+254700000002`) | Dry-run |
| `[demo]` | `demo.onthebusapp.com` or `{slug}-demo.onthebusapp.com` | Fresh 15-minute SMS OTP | Dry-run |
| `[qa-school]` | Dedicated **non-demo** tenant `{slug}.onthebusapp.com` | Fresh SMS OTP / admin invite email | **Real** when SMS enabled in `/config` |

Seed play-review from `apps/admin_dashboard`: `npm run seed:play-review` (credentials land in gitignored `.play-review-credentials.local` — do not commit).

## Known gaps — do not over-promise in demos

| Gap | Reality today |
| :--- | :--- |
| NFC boarding | Permissions exist; boarding is **manual checklist** + stop geofence gate. Badges should still store UUID only when used. |
| Parent lock-screen push | Inbox + trip-start rows work without FCM. Lock-screen needs `FIREBASE_SERVICE_ACCOUNT` on `send-push`, a live `user_fcm_tokens` row after login, and an APNs Authentication Key on Firebase project `school-transport-system-f606a` for iOS bundle `com.schooltrack.parentApp`. Parent iOS must be rebuilt with the Push entitlement; login waits for an APNs token before FCM `getToken()`. |
| Attendance / alerts history consoles | Still Next Up on admin — live dashboard + mobile are the proof. |
| Traffic-aware ETA | Out of scope for v1 — geometric progress + stored leg durations (not Distance Matrix / live traffic). |
| Billing pay | School `/billing` is viewable; treat card/M-Pesa pay as simulated unless you have confirmed live payment. |

---

## 0. How to mark results

For each item: check the box when done, then note **Pass / Fail / Skip** and a short note if Fail or Skip.

Example: `- [x] ENV1 … — Pass`

---

## 1. Prerequisites / env gates

Run before any flow. Prefer `[qa-school]` for invite + SMS; `[play-review]` or `[demo]` is enough for mobile smoke.

### 1.1 Hosting & Auth

- [x] **ENV1** `[qa-school]` Apex `https://onthebusapp.com` loads (marketing). — Pass
- [x] **ENV2** `[qa-school]` Tenant `https://{slug}.onthebusapp.com/login` loads (school console). — Pass
- [x] **ENV3** Apex school-console paths (e.g. `/dashboard`) redirect toward login / “use school subdomain”. — Pass
- [x] **ENV4** Tenant host `/` redirects to `/login`; tenant `/schools*` redirects to apex. — Pass
- [x] **ENV5** Supabase Auth: Site URL = `https://onthebusapp.com`; Redirect URLs include `https://*.onthebusapp.com/**`. — Pass

### 1.2 Vercel / secrets (spot-check presence, not values in this doc)

Confirm on Vercel (and local only if testing locally):

- [x] **ENV6** `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, anon key, `NEXT_PUBLIC_SITE_URL` — Pass (Vercel has all four; anon key present as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, which the app accepts)
- [x] **ENV7** `DRIVER_SESSION_SECRET`, `PARENT_SESSION_SECRET` (or documented fallback) — Pass
- [x] **ENV8** `RESEND_API_KEY` + verified-domain `DEMO_REQUESTS_FROM_EMAIL` (not `resend.dev`) — Pass (both present on Vercel; confirm From address is a verified domain, not `resend.dev`)
- [x] **ENV9** Africa’s Talking credentials for SMS Edge Function — Pass on Vercel (`AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY` for Next.js OTP). Also confirm the same keys (plus optional `AFRICASTALKING_SENDER_ID`) are set as **Supabase Edge Function secrets** for `send-sms`.
- [ ] **ENV10** Google Maps keys (JS admin + server Directions/Places + mobile `MAPS_API_KEY`) — Partial: Vercel has `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (admin JS + server fallback). Optional `GOOGLE_MAPS_SERVER_API_KEY` not listed. Mobile `MAPS_API_KEY` is Flutter build config, not Vercel — verify separately on driver/parent apps.
- [x] **ENV11** `CRON_SECRET` (pre-departure + platform purge crons) — Pass (`PREDEPARTURE_GRACE_MINUTES` also present)

### 1.3 Devices & fixture data

- [ ] **ENV12** Driver app installed; API base URL = production; location + notifications allowed. — Needs your phone: release builds default to `https://www.onthebusapp.com` ([api_config.dart](../apps/driver_app/lib/config/api_config.dart)); confirm install + location/notification permissions.
- [ ] **ENV13** Parent app installed; same API; notifications allowed. — Needs your phone: same default production API; confirm install + notification permission.
- [ ] **ENV14** `[qa-school]` Fixtures ready: route with sequenced stops (`geofence_radius_meters`, default ~50 m), today’s schedule, vehicle, driver assigned, student with pickup/dropoff stops + guardian phone you control. — **No non-demo QA school in DB** (only `azima-demo`, `azima-academy-demo`, `demo`, `play-review`). **`[demo]` azima-demo** roster looks good: 5 sequenced stops @ 50 m, vehicle `KDA DEMO` + driver Available (`+254724511201`), 5 students with pickup/dropoff + guardians, Mon–Fri AM/PM schedules. **Gap:** `trips_today = 0` (last trips dated 2026-08-10) — create/start today’s trip before an ops-day run. Static `demo` tenant is **not** usable as a full fixture (empty routes/students).
- [ ] **ENV15** Admin browser open on the school subdomain for live map cross-check. — Needs you: open `https://azima-demo.onthebusapp.com/dashboard` (or QA subdomain) while running driver GPS.

**Section 1 result:** Partial — 1.1 Pass; 1.2 mostly Pass (ENV10 partial); 1.3 not fully verified (devices manual; no QA school; azima-demo needs today’s trips). — Notes:

---

## 2. Sales & platform walkthrough

Prove the lead → demo store path you will show or operate for prospects.

- [ ] **S1** `[demo]` Landing CTA → `/request-demo` → submit valid lead. **Expect:** success copy; lead receipt email; sales notify email (Resend).
- [ ] **S2** Platform login at apex `/login` as `super_admin` → lands on `/schools` (not a school console).
- [ ] **S3** `/schools?tab=demos` shows pending request; open detail `/schools/demos/[id]`.
- [ ] **S4** Confirm demo → provision `{school-slug}-demo.onthebusapp.com`; access email with admin password + Flutter phone guidance. **Expect:** slim roster (admin, driver, conductor, guardians, students).
- [x] **S5** Open demo subdomain `/login` with emailed admin password → `/dashboard` loads seeded data. — Pass (azima-demo; Resend credentials)
- [x] **S6** Resend access email resets/resends admin credentials successfully. — Pass (email delivered; login works)
- [ ] **S7** `[demo]` Flutter: request phone receives **login OTP SMS**; after a trip proximity/delay event, operational SMS is **dry-run** (no real parent trip SMS; Edge Function / queue shows dry-run or processed without AT delivery).
- [ ] **S8** `[play-review]` Driver `+254700000001` / Parent `+254700000002` / OTP `123456` login works without a fresh SMS.
- [ ] **S9** (Optional) `/demo/explore?token=…` signs into demo dashboard.
- [ ] **S10** Complete & purge demo store → tenant gone; thank-you email; subdomain no longer serves console. **Only on a disposable demo.**

**Section 2 result:** Partial — S5, S6 Pass (azima-demo Resend + admin login). — Notes:

---

## 3. Real school onboard (`[qa-school]`)

Use a disposable QA school, not a paying customer.

- [ ] **O1** Apex `/schools` → New school → create tenant + default campus. **Expect:** subdomain registers; invite email to first admin.
- [ ] **O2** Invite link opens `https://{slug}.onthebusapp.com/reset-password` (not apex-only broken Site URL, not localhost).
- [ ] **O3** Set password → login on school subdomain → `/dashboard`.
- [ ] **O4** Wrong-tenant host: school A admin on school B subdomain → rejected / signed out with clear error.
- [ ] **O5** Platform `super_admin` visiting school subdomain is redirected to apex `/schools` (not mixed into school data as school admin).
- [ ] **O6** (Optional, QA only) Soft-delete school → console inaccessible; subdomain freed for reuse per platform behavior.

**Section 3 result:** Pass / Fail — Notes:

---

## 4. School admin console smoke

Run on `[qa-school]` (preferred) or `[demo]`. One pass through critical CRUD.

### 4.1 Live dashboard

- [ ] **A1** `/dashboard` — KPIs render; Google Map loads; no console crash.
- [ ] **A2** With an active driver trip (section 5), live bus marker / route context updates.

### 4.2 Fleet & staff

- [ ] **A3** `/fleet` — create vehicle; edit; list shows capacity/status.
- [ ] **A4** Add a maintenance log; appears after reload.
- [ ] **A5** `/staff/drivers` — create driver with phone you control; assign to vehicle.
- [ ] **A6** Toggle driver **Unavailable** → mobile OTP/login blocked (403); set Available again.
- [ ] **A7** `/staff/conductors` — create/edit; no crash (conductor mobile login covered in D6).

### 4.3 Routes, stops, schedules

- [ ] **A8** `/routes` — create route; add/reorder stops; set `geofence_radius_meters` ≥ 5.
- [ ] **A9** Create schedule (days, departure, direction HOME_TO_SCHOOL / SCHOOL_TO_HOME).
- [ ] **A10** `/routes/stops` — stops list consistent with route builder.

### 4.4 Students

- [ ] **A11** `/students` — create student with guardians JSON, pickup + dropoff stops.
- [ ] **A12** CSV bulk import with required columns (`name`, `route_name`, `pickup_stop`, `dropoff_stop`, `guardians`) succeeds for at least one row.
- [ ] **A13** Search/filter by name or route works; edit + Present/Absent toggle (admin) works.

### 4.5 Trips, config, billing, users

- [ ] **A14** `/routes/today-trips` — today’s trip rows visible; set status override (e.g. Delayed / Cancelled) and confirm UI.
- [ ] **A15** `/config` — edit SMS templates (`{student_name}`, `{duration_mins}`, etc.); toggle `sms_notifications_enabled`.
- [ ] **A16** `/billing` — plan metrics load (students/routes/drivers/SMS); school cannot edit platform campus fee.
- [ ] **A17** `/users` — visible only to tenant `admin_role === "Super Admin"`; create secondary admin with a role; non–Super Admin does not see nav item.

**Section 4 result:** Pass / Fail — Notes:

---

## 5. Operational day — Driver + Parent + Alerts

Core proof before schools. Recommended path: start on `[play-review]` or `[demo]` for safety, then repeat SMS-critical items on `[qa-school]`.

### 5.1 Driver auth

- [ ] **D1** Unknown phone → Send OTP → clear “contact your school” (not a crash). `[play-review]` / `[demo]` / `[qa-school]`
- [ ] **D2** Unavailable staff → OTP/login blocked.
- [ ] **D3** Happy OTP — registered driver receives code (or `123456` on play-review) → console with route/vehicle.
- [ ] **D4** Resend after countdown (~24 s) works (non–play-review); play-review still accepts `123456`.
- [ ] **D5** Sign out → session cleared; re-login required.
- [ ] **D6** Conductor phone login reaches conductor UI (no driver-only crash).

### 5.2 Trip, GPS, map, navigation

- [ ] **D7** Today’s trips list shows scheduled runs (`GET` driver trips).
- [ ] **D8** **Start trip** → `in_progress`; Android foreground notification “OnTheBus Driver Running” (or equivalent); GPS starts.
- [ ] **D9** Wait 15–30 s → bus marker moves; telemetry cadence roughly ~5 s; admin `/dashboard` reflects movement.
- [ ] **D10** Map shows road polyline + stop markers (Directions proxy). Fallback message if Directions fail is acceptable; map must not crash.
- [ ] **D11** **Navigate** opens Google Maps / navigation deep link to next (or nearest) stop — not in-app turn-by-turn.
- [ ] **D12** UI stays responsive while GPS streams (checklist/map taps).
- [ ] **D13** Long-press **SOS** → emergency UI / `is_emergency` on telemetry; clears on end trip or new trip.
- [ ] **D14** **End trip** → completed; GPS stops; notification clears; parent map goes non-live.

### 5.3 Geofence-gated boarding (manual)

- [ ] **D15** Outside student’s pickup geofence → Board/Present blocked in UI and/or API 403.
- [ ] **D16** Trip started but no live location yet → board blocked with clear message.
- [ ] **D17** Inside correct pickup geofence (HOME_TO_SCHOOL) → mark Present → onboard / manifest boarded.
- [ ] **D18** At Stop A → student assigned to Stop B → board blocked.
- [ ] **D19** Drop-off phase: inside dropoff geofence → drop allowed; outside → blocked.
- [ ] **D20** Stop unlock UX: entering a fence unlocks Pickup/Dropoff for that stop’s students only.
- [ ] **D21** NFC badge tap — **document result** (expect manual-only today). Do not claim NFC live to schools until wired.

### 5.4 Parent app

- [ ] **P1** Parent OTP login → home with linked children; session persists.
- [ ] **P2** `[play-review]` Parent `+254700000002` + `123456` works.
- [ ] **P3** Home card shows bus/driver context and ETA (poll ~20 s and/or Realtime).
- [ ] **P4** Live map: bus marker tracks; **school** pin OK; **no other children’s home/pickup pins**.
- [ ] **P5** ETA minutes/clock update after driver GPS (not hardcoded forever).
- [ ] **P6** When predicted delay ≥ 5 minutes → delay badge (“Running N min late”); &lt; 5 min → no badge.
- [ ] **P7** No active trip → waiting/empty state (no crash, no stale “live” bus).
- [ ] **P8** Notifications inbox shows live campus-exit / 500 m rows after driver GPS (or debug replay); bell badge matches unread count.

### 5.5 Proximity, delay, pre-departure

**Proximity**

- [ ] **A-P1** Bus enters stop geofence with relevant student ahead → proximity path fires (`sent_proximity_alerts` and/or `alerts_queue` `proximity`).
- [ ] **A-P2** Re-enter same fence same trip day → **no second** proximity for that student (exactly one per student per trip day).
- [ ] **A-P3** `[qa-school]` With SMS enabled → parent phone receives **one** proximity SMS; template matches `/config`.
- [ ] **A-P4** `[demo]` / `[play-review]` → same event is **dry-run** (no real operational SMS).

**In-trip delay**

- [ ] **A-D1** On-time progress → ETAs update; no delay notify below 5 minutes.
- [ ] **A-D2** Predicted delay ≥ 5 min → first delay notify (push; SMS if enabled on QA).
- [ ] **A-D3** Delay grows &lt; +10 min since last notify → **no** re-notify.
- [ ] **A-D4** Delay grows ≥ +10 min beyond last notified → second notify (escalation).
- [ ] **A-D5** Parent UI shows delay badge consistent with backend.

**Pre-departure (never started)**

- [ ] **A-R1** Leave a today’s trip `scheduled` with `started_at` null until departure + grace (~10 min, `PREDEPARTURE_GRACE_MINUTES`) → cron sets `status_override = Delayed` once.
- [ ] **A-R2** Cron again → no duplicate Delayed notify.
- [ ] **A-R3** Admin `custom_departure_time` — grace measured from that time.
- [ ] **A-R4** Driver can still Start Trip after pre-departure Delayed; GPS/ETA resume.

**Happy-path script (60–90 min)**

1. Parent login → idle home.
2. Driver login → Start morning trip → confirm GPS + admin map.
3. Enter first stop fence → proximity (dry-run or real per env).
4. Inside fence → board assigned student.
5. Create ≥5 min delay → parent delay badge + notify policy.
6. Navigate to next stop → board another student if available.
7. End trip → GPS stops; parent non-live.
8. Separately: unstarted trip past grace → pre-departure Delayed.

**Section 5 result:** Pass / Fail — Notes:

---

## 6. Security & tenancy must-pass

Hard gates from [architecture.md](architecture.md) and [architecture-security.md](architecture-security.md). Fail any of these → **No-Go**.

- [ ] **I1** School A admin cannot list/read School B students, fleet, or trips (subdomain + RLS).
- [ ] **I2** Parent A cannot get ETA for Parent B’s child (`GET /api/parent/etas` → 403/empty).
- [ ] **I3** Driver telemetry for school A cannot write under school B (`tenant_id` mismatch → 403).
- [ ] **I4** Parent map never shows other families’ home coordinates.
- [ ] **I5** Spot-check app/server logs during the ops day — no raw parent phones, student full names, or exact home coords in log lines.
- [ ] **I6** Mobile apps do not embed the Supabase **service role** key (anon + `drv.*` / `par.*` + parent Auth session only).
- [ ] **I7** `[demo]` / `[play-review]` operational SMS remain dry-run / fail-closed.
- [ ] **I8** (Ops) High-res telemetry 7-day TTL / prune still configured (DB or cron check).

**Section 6 result:** Pass / Fail — Notes:

---

## 7. SMS environment matrix (quick cross-check)

| Check | `[play-review]` | `[demo]` | `[qa-school]` SMS on | `[qa-school]` SMS off |
| :--- | :--- | :--- | :--- | :--- |
| Login OTP | `123456` | Delivered SMS | Delivered SMS | Delivered SMS |
| Proximity / delay / trip SMS | Dry-run | Dry-run | Delivered (once / policy) | Not sent / not queued per config |
| Synthetic PII only | Yes | Yes | No — use QA phones you control | Same |

- [ ] **M1** Matrix above verified for the environments you used this run.

---

## 8. Go / No-Go sign-off

**Go** only if all of the following passed on this run:

1. Tenancy isolation (I1–I3)
2. Invite → school-subdomain password → admin login (O1–O3) **or** documented skip with existing QA school already onboarded
3. Full trip: start → GPS → live ETA on parent → geofence board → end trip
4. Proximity dedupe (A-P2)
5. On `[qa-school]` with SMS enabled: at least one real proximity or delay SMS received
6. No PII leakage spotted in logs (I5)
7. You did not depend on NFC or Parent Notifications tab as proof

| Section | Pass / Fail | Blocker notes |
| :--- | :--- | :--- |
| 1 Env gates | | |
| 2 Sales / demo | | |
| 3 Onboard | | |
| 4 Admin console | | |
| 5 Operational day | | |
| 6 Security | | |
| 7 SMS matrix | | |

| Decision | Circle one | Date | Tester |
| :--- | :--- | :--- | :--- |
| **GO** — ready to approach schools | | | |
| **NO-GO** — blockers above must clear first | | | |

**Blockers to fix before GO:**

1.
2.
3.

---

## Reference index

| Area | Where |
| :--- | :--- |
| Specs | [architecture.md](architecture.md), [architecture-security.md](architecture-security.md), [project-overview.md](project-overview.md), [ui-context.md](ui-context.md) |
| Progress / gaps | [progress-tracker.md](progress-tracker.md) |
| Admin console | `apps/admin_dashboard` — `{slug}.onthebusapp.com` |
| Driver app | `apps/driver_app` |
| Parent app | `apps/parent_app` |
| Driver OTP | `POST /api/auth/driver-request-otp`, `POST /api/auth/driver-login` |
| Parent OTP | `POST /api/auth/parent-request-otp`, `POST /api/auth/parent-login` |
| Telemetry / trips | `/api/driver/telemetry`, `/api/driver/trips`, `/api/trips` |
| Parent ETA | `GET /api/parent/etas` |
| Pre-departure | `GET /api/trips/predeparture-check` |
| SMS | `supabase/functions/send-sms`, `alerts_queue` |
| Play-review seed | `npm run seed:play-review` in `apps/admin_dashboard` |
