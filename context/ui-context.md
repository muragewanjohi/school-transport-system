# UI Context

## Theme

The visual design language is split to fit specific deployment environments:
- **Marketing Landing (OnTheBus):** Light public site on `/`, aligned to the Stitch “Green Edition” screen — background `#F8F9FF`, primary `#006B32`, ink `#0B1C30`, soft surface `#E5EEFF`. Brand **OnTheBus**. Hero uses Stitch dashboard/phone assets under `public/stitch/`. Scoped under `.landing-page` so admin console tokens stay unchanged.
- **Admin Dashboard (school + platform):** Light-first console (soft gray page `#F4F6FA`, white cards/sidebar, green primary `#10b981`, indigo secondary `#6366f1`). School and platform surfaces (`/dashboard`, `/schools`, demos, billing, etc.) share the same shell tokens. Users can switch to a dark command-console palette via a theme toggle. Preference is stored on `<html data-theme="light"|"dark">` and persisted in `localStorage` key `onthebus-admin-theme` (default `light`). Toggle lives in the sidebar footer (and dashboard top bar).
- **Driver Mobile App:** High-contrast, daylight-optimized light theme (bright backgrounds, solid borders, oversized chunky buttons) built for active, single-hand tap interactions on vehicle dashboard mounts.
- **Parent Mobile App:** Friendly, clean light/dark auto-switching interface that emphasizes maps, child statuses, and clear, non-technical transaction logs. Store listing and home-screen name is **OnTheBus** (iOS + Android). Internal IDs stay `parent_app`. Android `applicationId` is `com.schooltrack.parent_app`; iOS bundle ID is `com.schooltrack.parentApp`. Driver remains a separate app (`OTB Driver`). Parents can open account deletion from the dashboard (`https://onthebusapp.com/delete-account`). Bottom nav is **Home · Map · Notifications · Profile** (no Attendance tab; Present/Absent is a Home **toggle** for pickup trips before boarding). The Notifications inbox lists live `notifications` for that parent (campus-exit, stage approach, delay, boarding, absent-at-stop, absent-at-campus); the bell badge and nav badge are unread count, not a placeholder. First launch shows **three onboarding screens** before login: a branded welcome splash (OnTheBus wordmark, **PARENT APP** badge, headline *Peace of mind on every journey.*, family-and-bus illustration), **Real-time Tracking** (phone map with **En route to School** / **Next Stop · Greenview Estate** labels), and **Instant Updates** (lock-screen phone with pickup / en-route / drop-off / delay notification banners). Chrome is a circular back control, pill **Next** / **Get started**, and **Skip** under the button. The welcome mockup’s Get Started / Login map to **Next** / **Skip**. Skip or Get started is remembered. Profile has a **Log out** button even when no children are linked.

### Driver mobile authentication

Driver and conductor login uses a two-screen phone OTP flow: (1) Kenyan mobile number entry with a prominent **Send OTP** action and support path, then (2) six individual verification-code fields with back navigation, a 24-second resend countdown, and **Verify & Continue**. If SMS is rejected (e.g. carrier blacklist) and the profile has an email, the same code is sent by email and the verification screen offers **Send code via email** with a masked address. If the phone is not registered as a driver or conductor, the app shows guidance to contact the school (not a generic failure). The visual treatment uses the OnTheBus bus/map branding, emerald actions, daylight white surfaces, and a security reassurance card. Both the driver and parent login start screens show the installed app version at the bottom (`v{version}+{buildNumber}` from `pubspec.yaml`, e.g. `v1.0.2+3`) so support can confirm which build a user is on. Paid and per-lead demo tenants receive a fresh 15-minute OTP by SMS (email fallback when SMS fails). The permanent Play Review tenant alone keeps reusable OTP `123456`.

### Parent mobile authentication

Parent login uses the same two-screen phone OTP flow as the driver app: (1) Kenyan mobile number entry with **Send OTP** and a school-support path, then (2) six individual verification-code fields with back navigation, a 24-second resend countdown, and **Verify & Continue**. Copy says **Parent App** (never driver/conductor). If SMS fails and the parent profile has an email, a snackbar shows the masked destination and **Send code via email** appears. If the phone is not registered as a parent, the app shows guidance to contact the school. Paid and per-lead demo tenants receive a fresh 15-minute OTP by SMS (Africa's Talking live) with email fallback. A **Dev OTP** snackbar appears only when the API dry-runs and returns `sandbox_otp` (local/Preview). Visual treatment matches the driver login: OnTheBus branding, emerald actions, daylight white surfaces, and a security reassurance card.

### Parent Map vs Home Location

- **Map tab** is live transit only for the **selected child**: when an in-progress trip exists, show the live bus marker (from `/api/parent/live` + `live_coordinates`), plate/driver, child transit status, next stop, distance, and est. arrival — layout patterned after the driver active-trip summary. When there is **no** in-progress trip, **do not show Google Map**; show a schedule card with today’s next **Depart** time, bus plate/number, countdown to departure, and schedule est. trip duration (driver Home scheduled-card fields). If nothing is scheduled today, show “No trip scheduled today”.
- Parent-facing status must never be **“On the Bus”** unless `trip_active` is true (in-progress trip) and the child is boarded. Idle home/profile chips use Waiting for pickup / At school.
- **Home (active trip):** status banner includes clickable **Driver** and optional **Conductor** cards (name, phone, photo/initials). Tap opens a dialog with an enlarged photo (initials fallback when no URL).
- **Home Location** is `RelocateScreen` opened from Profile → Home Location: search, drag pin, save pickup coordinates.
- **Profile child card:** Student Information is a single chevron row (no bus / conductor / pickup-stage bar). Under **Home & Transport**, show Home Location plus **Pickup trip** and **Drop-off trip** rows (assigned stop name and schedule departure when available), then today’s riding status.

## Marketing Landing Tokens

Scoped CSS variables on `.landing-page` (Stitch Green Edition; do not reuse as global admin tokens):

| Role | Variable | Value |
| :--- | :--- | :--- |
| Page background | `--lp-bg` | `#F8F9FF` |
| Soft band / trust | `--lp-surface-soft` | `#E5EEFF` |
| Headline ink | `--lp-ink` | `#0B1C30` |
| Body text | `--lp-muted` | `#3D4A3E` |
| Primary green | `--lp-primary` | `#006B32` |
| Bright accent | `--lp-primary-bright` | `#5ADF82` |
| Enterprise accent | `--lp-enterprise` | `#6D28D9` |
| Border | `--lp-outline` | `#BCCABB` |

Primary CTAs: **Request Demo** → `/request-demo` (lead form; not mailto). Landing nav has no Login link (operators reach `/login` directly). Hero/media assets live in `apps/admin_dashboard/public/stitch/`. Authenticated console remains `/dashboard`.

### Legal pages (public)
Footer Legal column links to `/privacy`, `/terms`, and `/delete-account` (shared `LegalDocPage` shell under landing tokens). Delete-account flow is school-first, with `support@onthebus.app` escalation for Play Store / data-subject requests.

### Company pages (public)
Footer Company column links to `/about`, `/careers`, and `/contact` (shared `MarketingShell` under landing tokens). About showcases photorealistic feature imagery under `public/stitch/about/feature-*.png`. Careers is a coming-soon interest form (specialization + details). Contact is a general inquiry form (no office location; `info@onthebus.app` only). Both forms POST to `/api/public-contact` and email `info@onthebus.app` via Resend (`PUBLIC_CONTACT_TO_EMAIL` override optional).

### Play Store review school
Permanent sandbox tenant slug `play-review` (blocked for onboarding; excluded from demo expiry purge). Seed via `apps/admin_dashboard`: `npm run seed:play-review`. Driver phone `+254700000001`, Parent `+254700000002`, OTP `123456` (does not expire). Debug driver builds (`kDebugMode` only — not in Play release) expose **Replay demo GPS** in the trip overflow menu; it walks the active trip’s stops (Play Review corridor as fallback) so campus-exit and 500 m parent notifications can be exercised without a physical device.

### Pricing page (`/pricing`)
Public apex-only marketing page using `MarketingShell` and `.landing-page` tokens. Four monthly plans: **Starter** (100 students / 2 buses / 1 location, KSh 5,000), **School** (most popular: 300 students / 6 buses / 3 locations, KSh 10,000), **Growth** (600 students / 10 buses / 5 locations, KSh 15,000), **Enterprise** (custom). Paid-plan CTAs go to `/request-demo`; Enterprise and help mailto is `info@onthebusapp.com`. A needs calculator recommends the cheapest plan whose caps cover the visitor’s students, buses, and locations. **SMS notifications are excluded** from every plan (push remains in-plan; SMS billed separately). Hero uses `public/stitch/apps_hero_image.png` (admin live tracking, driver app, parent app). This page is marketing copy only and does not change campus-flat-fee billing in the console.

### Request Demo page (`/request-demo`)
Public apex-only marketing page using `.landing-page` tokens. Captures school leads (name, role, school, searchable country combobox with filter-at-top, city/area, WhatsApp/phone with country dial code, required work email, fleet size, preferred time). On success, the requester immediately gets a Resend confirmation email (“We've received your demo request”), sales is notified, and the visitor is told to wait for an emailed demo school URL and login details after approval. Contact Sales remains a secondary mailto/WhatsApp path.

### Demo request management (`/schools?tab=demos`)
Platform-only tab using the shared admin console shell (light default / dark toggle). Shows pending request count, contact and school details, provisioned demo URL, expiry (default 14 days, editable), requested time/fleet size, submission time, and status actions (Confirm provisions the store; Complete purges it). Status `ready_to_onboard` means the school clicked **Request to go live** — treat as sales attention, not a self-serve paid conversion. **Edit** opens the full-page detail at `/schools/demos/[id]` (editable while pending) with school-form styling: lead card + access card, theme-aware `form-input` fields, primary/ghost action buttons. After Confirm & provision, that page shows school URL, admin email/password, and Flutter phone, then emails those details with instructions to request a fresh 15-minute OTP in the app. Confirmed stores expose **Resend access email** (resets the admin password). The platform sidebar displays a badge while pending or ready-to-onboard requests need review.

### Demo school console banner
School admins on an `is_demo` tenant (not Demo Viewer read-only explore) see a sticky `.demo-tenant-banner` on school-console routes: copy that this is a demo account, formatted `demo_expires_at`, and **Request to go live**. After a successful request the CTA becomes **Request sent**. Billing & Plan shows **Demo** (not a paid Starter/School tier) with the same expiry and CTA. Banner uses `--state-warning` mixed with `--bg-surface` / `--text-primary` (no hardcoded navy). Demo Viewer keep the existing read-only explore banner.

## Colors

CSS custom properties are defined in the dashboard root styles (`apps/admin_dashboard/src/app/globals.css`). All console components must use these variables. Values below are the **light (default)** theme; dark overrides live under `[data-theme="dark"]`.

| Role | CSS Variable | Light (default) | Dark | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Page background** | `--bg-base` | `#F4F6FA` | `#060913` | App canvas behind cards |
| **Surface** | `--bg-surface` | `#ffffff` | `#0c1122` | Cards, sidebar, panels |
| **Surface Hover** | `--bg-surface-hover` | `#E8F8F0` | `#151c36` | Hovered / active nav tint |
| **Primary text** | `--text-primary` | `#0F172A` | `#f1f5f9` | Titles, prominent values |
| **Muted text** | `--text-muted` | `#475569` | `#94a3b8` | Subheadings, meta (WCAG AA on `--bg-surface` / `--bg-base`) |
| **Primary accent** | `--accent-primary` | `#10b981` | `#10b981` | Decorative fills / progress |
| **Accent fill** | `--accent-fill` | `#047857` | `#047857` | Filled buttons / active nav (white label ≥ 4.5:1) |
| **Accent ink** | `--accent-primary-ink` | `#047857` | `#34d399` | Green labels/icons on surfaces |
| **Warning ink** | `--state-warning-ink` | `#a16207` | `#fbbf24` | Warning labels on surfaces |
| **Error ink** | `--state-error-ink` | `#e11d48` | `#fb7185` | Error labels on surfaces |
| **Secondary accent**| `--accent-secondary` | `#6366f1` | `#6366f1` | Secondary status accents |
| **Border** | `--border-default` | `#E2E8F0` | `#1e293b` | Card / panel borders |
| **Error state** | `--state-error` | `#f43f5e` | `#f43f5e` | SOS / errors |
| **Success state** | `--state-success` | `#10b981` | `#10b981` | Success |
| **Warning state** | `--state-warning` | `#eab308` | `#eab308` | Warnings |
| **Nav active fg** | `--nav-active-fg` | `#ffffff` | `#ffffff` | Text on filled green nav pill |
| **Row hover** | `--row-hover` | `rgba(15,23,42,0.03)` | `rgba(255,255,255,0.03)` | Table / list hover |
| **Input fill** | `--input-bg` | `#F4F6FA` (same as `--bg-base`) | `#060913` (same as `--bg-base`) | Text fields, selects, textareas — inset grey like dashboard trip-summary rows |

Console form controls (`.form-input`, `.form-select`) must use `--input-bg`, `--text-primary`, `--border-default`, and 12px radius. Do not hardcode navy fills (`rgba(6, 9, 19, …)`), `#FFF` text, or `--bg-glass`. Placeholders use `--text-muted`. This keeps typed text readable in both themes (dark ink on light grey; light ink on dark inset). Today's Trips (`/routes/today-trips`) uses the same tokens — never white on `--bg-base`.

Roster cards (drivers, conductors, administrators) and other console tiles use `.roster-card`: `--bg-surface` fill, `--text-primary` titles, `--text-muted` meta, `--accent-primary-ink` / `--state-*-ink` for colored labels. Do not use `rgba(12, 17, 34, …)` card chrome. Body text must meet **WCAG 2.2 AA 4.5:1** against its background; filled primary actions use `--accent-fill` so white labels also meet 4.5:1.

## Typography

| Role | Font | Variable | CSS Rule |
| :--- | :--- | :--- | :--- |
| **UI text (Sans)** | Outfit | `--font-sans` | `font-family: 'Outfit', sans-serif;` |
| **Code/mono** | JetBrains Mono | `--font-mono` | `font-family: 'JetBrains Mono', monospace;` |

## Border Radius

| Context | Class | Border Radius Value |
| :--- | :--- | :--- |
| **Inline / small UI** | `rounded-md` | `6px` (Buttons, input fields, tags) |
| **Cards / panels** | `rounded-xl` | `12px` (Dashboard graphs, route check cards) |
| **Modals / overlays** | `rounded-2xl` | `16px` (SOS confirms, profile selectors) |

## Component Library

- **Admin Web Dashboard:** Custom modular HTML5/TypeScript components using vanilla CSS. Uses SVG/Lucide assets for visual elements. No styling framework imports unless explicitly configured.
- **Mobile Apps (Driver/Parent):** Styled on top of Flutter's native `Material 3` catalog. Custom widgets extend standard widgets to apply custom brand gradients, shadows (`box-shadow: 0 4px 20px rgba(0,0,0,0.4)` on cards), and Outfit font bindings.

## Layout Patterns

- **Dashboard Layout:** Full-viewport split with a left-anchored sticky sidebar (`260px` width) on viewports wider than `900px`. At `≤900px`, the console uses a fixed **mobile shell bar** (hamburger + logo) and an off-canvas sidebar drawer with backdrop; tapping a nav link or changing route closes the drawer. Active nav uses a filled green pill. School home (`/dashboard`) uses a KPI row (1-col under `600px`, 2-col under `1100px`), live fleet map + upcoming stops, attendance overview, trip summary, and recent alerts. Wide tables scroll horizontally inside their wrappers. Side drawers (e.g. fleet vehicle form) go full-width on mobile. Platform and school CRUD pages share the same chrome; theme toggle is in the sidebar footer.
- **Admin System Config (`/config`):** Notifications tab toggles include trip start, geofence proximity, boarding/drop-off receipts, **absent at stop**, and **absent at drop-off campus boarding**. Alerts tab holds SMS templates for those events; stop-absent default is `Bus {vehicle_plate} has left stage {stop_name} and {student_name} was marked absent at {time}.` SMS still requires **Enable Global SMS Notifications**.
- **Mobile Driver Home (drop-off):** Selected School→Home trip card shows **Board Students** then **Start Trip**. Start Trip is disabled until every `trip_manifests` row is boarded or absent, with helper copy **Board or mark absent every student first.** Pickup (Home→School) cards keep **PICKUP STUDENTS** + ungated Start Trip. Campus boarding is a full-roster screen (no stop geofence): each row is a **SwitchListTile** (on = boarded, off = absent; pending starts off). **Mark remaining absent** sets leftover Pending → Absent. **START TRIP** shows a blocking **Starting trip…** loader while the trip is saved, then opens the Trip tab. Start Trip never auto-marks students boarded.
- **Mobile Driver Home (active trip):** While a trip is in progress, Home shows the trip header plus one summary card with **three columns** (no embedded map): attendance progress (**STUDENTS PICKED UP** / **STUDENTS DROPPED OFF** with count + bar), **NEXT STOP** (name, ETA • distance), and **EST. ARRIVAL** (clock + On time / Running late). **Navigate** and **Trip** actions sit under the card; Trip opens the Trip tab map.
- **Mobile Driver Interface (Trip tab):** Full-bleed map plus a persistent bottom control drawer while a trip is active (no scroll column, no trip-in-progress card, no floating Pickup Students FAB):
  1. **AppBar** — title is the trip name (fallback route name); long-press SOS in actions. School header is hidden on this tab while a trip is in progress (no notification inbox in v1).
  2. **Map** — embedded Google Maps (`google_maps_flutter`) fills the remaining viewport above the drawer. Camera **follows the live bus at a closer zoom (~15.8)** instead of fitting the whole route; pinch-zoom enabled; road polyline; live bus; numbered stop markers at 32px canvas by state (next / upcoming / completed / visited / not visited); legend; Live GPS footer.
  3. **Trip control drawer** — persistent bottom sheet (drag handle, rounded top). Top row: `N of M picked` or `N of M dropped` (pickup = trip-manifest `boarded`; dropoff = `dropped_off`; roster `students.status` Present is not treated as picked), segmented stop-progress bar (completed green / current blue / upcoming gray), geometric ETA + distance to the next stop. Next-stop card: **Approaching {name}** while outside the stage geofence; **You’re at {name}** plus dwell toward min wait once inside. Sequence number, `{n} students waiting` (drop-off: `{n} students to drop`). Primary CTA **Pickup Students** / **DropOff Students** (geofence-gated) is **hidden/disabled at the school terminal** (drop-off first stop, pickup last stop, or empty stop roster). Overflow (`…`): **Navigate** and **View Students**. **Skip stop** is locked until `min_stop_dwell_seconds` (default 90 s) after arrival; then marks not visited, remaining Pending → Absent, school admins alerted. **Hold to end trip**. Upcoming-stop peek: the stop after next, with ETA. Arriving inside a **home** stop geofence still **auto-opens** the ~70–80% boarding drawer. Arriving at pickup last stop (school) auto-drops remaining boarded students, ends the trip, and shows **Trip complete · {n} min**. Leaving after at least one tick → completed + remaining Absent. Leaving with zero ticks before min dwell keeps the stop open; after min dwell → visited + remaining Absent + admin alert. Map legend: next / upcoming / completed / visited / not visited.
- **Mobile Parent Interface:** First-launch onboarding (3 screens: welcome splash, live map, stay informed) then login. Logged-in home uses a bottom sheet overlay rendering child telemetry status cards that expands to show historical boarding logs. Profile always exposes **Log out**.
- **Mobile Driver View Students:** The Students tab shows the full trip roster (not only the current stop). There is no trip-wide Guardians list and no Pickup/Dropoff Manifest header — tap a student for details and guardians. On student details, each parent/guardian row uses their photo or initials thumbnail on the left (call stays on the trailing phone button). After drop-off campus boarding, non-absent students show **Boarded** (not Dropped off) until marked dropped at their home stop geofence. **Boarded** / **Dropped off** actions still require the child’s stop geofence.
- **Admin billing current plan:** School `/billing` Current plan card uses the public `/pricing` tiers (Starter / School / Growth / Enterprise). It shows that plan’s monthly price and live students / buses / locations against the plan caps. **Upgrade plan** sits below the card and opens `/pricing` (Enterprise shows Contact sales). SMS Volume Trends is not shown; SMS remains a separate invoice line.
- **Admin School Campus:** Top-level school console item (`/routes?tab=schools`), not nested under Routes. The page title and primary action are **School Campus** / **Add School Campus**. Add and edit campus map pins use `/assets/school-location-icon.png` — the same school icon as Transit Route Planner start/end stops.
- **Admin Route editor:** Add Route and Edit Route open a full page (`/routes/new`, `/routes/[id]/edit`) — not a drawer. Fields: route name, **Start location**, **End location**. Each endpoint defaults to **From school** (map hidden). If more than one school/campus exists, a dropdown is required. **Choose location** reveals Google Places search + map; the captured pin becomes that endpoint. Create writes start/end stops; edit updates name plus first/last stop coordinates.
- **Admin Route planner:** On a selected route’s Stops tab, **Add existing** copies already-created stages from other routes onto this route (inserted before the end stop). **Add Route Stop** still creates a new stop.
- **Admin Stop editor:** Add Route Stop and Edit Stop open a full page (`/routes/stops/new`, `/routes/stops/[id]/edit`) — not a drawer. Fields: route, stop name, sequence, geofence radius, stop type, **Search location** (Google Places), Google Map (click or drag pin for exact lat/lng). From the route builder, `?route_id=` preselects the current route.
- **Admin Fleet vehicle details:** Last Service Date, Next Service Date, and Insurance Expiry Date are optional. Date pickers default to 2000-01-01 (treated as unset, saved as null). A checkbox **Notify me when service or insurance is due** opts into fleet-card alerts at 1 month, 2 weeks, and 1 day before next service or insurance expiry (plus overdue).
- **Admin student Transit Settings:** Pickup/drop-off radios — **Pickup same as drop-off** (one Stage dropdown, both ids saved) or **Pickup different from drop-off** (pickup + drop-off dropdowns). Same is the default.
- **Admin Student Manifests Registry:** Pickup & drop-off stops are not listed. **Route** is an inline dropdown and is filterable (**All routes** / **No route assigned** / a specific route). **Trips** holds pick-up and drop-off trip dropdowns, filterable by trip. Changing route remaps stops to the new route and clears previous trips.
- **Admin Add Trip:** Saving without required fields (trip name, departure time, **trip type (pick up or drop off)**, target grade classes, operating days) shows “Please fill in: …” naming the missing fields — not a generic “Failed to save schedule”. Add Trip and Edit Trip require selecting **Pick up** (home to school) or **Drop off** (school to home). The trips table Trip type column uses those labels.
- **Admin Staff roster:** Drivers, conductors, and administrators show only registered profiles. An empty school shows the empty state (e.g. “No drivers profiles registered yet”), never static demo cards (John Kamau, Jane Wanjiku, Sarah Jenkins, …). Register Driver includes an optional **Allocated bus** dropdown. Changing Allocated Vehicle on a driver card persists `vehicles.active_driver_id` and only shows a success message after the API confirms the write.

## Icons

- **Standard Icons:** Lucide React / Lucide Dart library.
- **Action Sizing:** Inline text indicators use `14px` stroke icons. Buttons, navigation cards, and menu lists use `20px`. Main action indicators (SOS, Tap reader success) utilize custom `32px` badges.
