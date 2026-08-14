# UI Context

## Theme

The visual design language is split to fit specific deployment environments:
- **Marketing Landing (OnTheBus):** Light public site on `/`, aligned to the Stitch “Green Edition” screen — background `#F8F9FF`, primary `#006B32`, ink `#0B1C30`, soft surface `#E5EEFF`. Brand **OnTheBus**. Hero uses Stitch dashboard/phone assets under `public/stitch/`. Scoped under `.landing-page` so admin console tokens stay unchanged.
- **Admin Dashboard (school + platform):** Light-first console (soft gray page `#F4F6FA`, white cards/sidebar, green primary `#10b981`, indigo secondary `#6366f1`). School and platform surfaces (`/dashboard`, `/schools`, demos, billing, etc.) share the same shell tokens. Users can switch to a dark command-console palette via a theme toggle. Preference is stored on `<html data-theme="light"|"dark">` and persisted in `localStorage` key `onthebus-admin-theme` (default `light`). Toggle lives in the sidebar footer (and dashboard top bar).
- **Driver Mobile App:** High-contrast, daylight-optimized light theme (bright backgrounds, solid borders, oversized chunky buttons) built for active, single-hand tap interactions on vehicle dashboard mounts.
- **Parent Mobile App:** Friendly, clean light/dark auto-switching interface that emphasizes maps, child statuses, and clear, non-technical transaction logs.

### Driver mobile authentication

Driver and conductor login uses a two-screen phone OTP flow: (1) Kenyan mobile number entry with a prominent **Send OTP** action and support path, then (2) six individual verification-code fields with back navigation, a 24-second resend countdown, and **Verify & Continue**. If the phone is not registered as a driver or conductor, the app shows guidance to contact the school (not a generic failure). The visual treatment uses the OnTheBus bus/map branding, emerald actions, daylight white surfaces, and a security reassurance card. Both the driver and parent login start screens show the installed app version at the bottom (`v{version}+{buildNumber}` from `pubspec.yaml`, e.g. `v1.0.2+3`) so support can confirm which build a user is on. Paid and per-lead demo tenants receive a fresh 15-minute OTP by SMS. The permanent Play Review tenant alone keeps reusable OTP `123456`.

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
| Border | `--lp-outline` | `#BCCABB` |

Primary CTAs: **Request Demo** → `/request-demo` (lead form; not mailto). Landing nav has no Login link (operators reach `/login` directly). Hero/media assets live in `apps/admin_dashboard/public/stitch/`. Authenticated console remains `/dashboard`.

### Legal pages (public)
Footer Legal column links to `/privacy`, `/terms`, and `/delete-account` (shared `LegalDocPage` shell under landing tokens). Delete-account flow is school-first, with `support@onthebus.app` escalation for Play Store / data-subject requests.

### Company pages (public)
Footer Company column links to `/about`, `/careers`, and `/contact` (shared `MarketingShell` under landing tokens). About showcases photorealistic feature imagery under `public/stitch/about/feature-*.png`. Careers is a coming-soon interest form (specialization + details). Contact is a general inquiry form (no office location; `info@onthebus.app` only). Both forms POST to `/api/public-contact` and email `info@onthebus.app` via Resend (`PUBLIC_CONTACT_TO_EMAIL` override optional).

### Play Store review school
Permanent sandbox tenant slug `play-review` (blocked for onboarding; excluded from demo expiry purge). Seed via `apps/admin_dashboard`: `npm run seed:play-review`. Driver phone `+254700000001`, Parent `+254700000002`, OTP `123456` (does not expire).

### Request Demo page (`/request-demo`)
Public apex-only marketing page using `.landing-page` tokens. Captures school leads (name, role, school, searchable country combobox with filter-at-top, city/area, WhatsApp/phone with country dial code, required work email, fleet size, preferred time). On success, the requester immediately gets a Resend confirmation email (“We've received your demo request”), sales is notified, and the visitor is told to wait for an emailed demo school URL and login details after approval. Contact Sales remains a secondary mailto/WhatsApp path.

### Demo request management (`/schools?tab=demos`)
Platform-only tab using the shared admin console shell (light default / dark toggle). Shows pending request count, contact and school details, provisioned demo URL, expiry (default 14 days, editable), requested time/fleet size, submission time, and status actions (Confirm provisions the store; Complete purges it). **Edit** opens the full-page detail at `/schools/demos/[id]` (editable while pending) with school-form styling: lead card + access card, theme-aware `form-input` fields, primary/ghost action buttons. After Confirm & provision, that page shows school URL, admin email/password, and Flutter phone, then emails those details with instructions to request a fresh 15-minute OTP in the app. Confirmed stores expose **Resend access email** (resets the admin password). The platform sidebar displays a badge while pending requests need review.

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

- **Dashboard Layout:** Full-viewport split with a left-anchored sticky sidebar (`260px` width). Active nav uses a filled green pill. School home (`/dashboard`) uses a KPI row, live fleet map + upcoming stops, attendance overview, trip summary, and recent alerts. Platform and school CRUD pages share the same chrome; theme toggle is in the sidebar footer.
- **Mobile Driver Interface (Trip tab):** Daylight scrollable column while a trip is active:
  1. **AppBar** — title is the trip name (fallback route name); long-press SOS in actions. School header is hidden on this tab while a trip is in progress (no notification inbox in v1).
  2. **Progress card** — collapsible (default collapsed). Collapsed: `N / M picked` or `N / M dropped`. Expanded: TRIP IN PROGRESS, `N / M students picked|dropped` (pickup = trip-manifest `boarded`; dropoff = `dropped_off`; roster `students.status` Present is not treated as picked), remaining, progress bar.
  3. **Map** — embedded Google Maps (`google_maps_flutter`) at 1.5× prior height (450), pinch-zoom enabled inside the scroll view, road polyline, live bus, numbered stop markers at half prior size (32px canvas) by state (next / upcoming / completed / not visited), legend, Live GPS footer.
  4. **Stop action card** — collapsible (default collapsed). Collapsed: `Next stop: {name}`. Expanded: students at stop, geometric ETA + distance, **Navigate** (opens Google Maps turn-by-turn to the next stop) + primary CTA labeled **Pickup Students** or **DropOff Students** from schedule `direction`. CTA opens a **~70–80% height bottom drawer** (map peek remains) listing only students for the current stop. Tick = Present; **Complete Stop** marks remaining Pending as Absent, marks the stop completed, advances next. Geofence-gated. END TRIP remains a secondary control below the card.
- **Mobile Parent Interface:** Bottom sheet overlay rendering child telemetry status cards that expands to show historical boarding logs.
- **Admin Route editor:** Add Route and Edit Route open a full page (`/routes/new`, `/routes/[id]/edit`) — not a drawer. Fields: route name, school location name, **Search location** (Google Places), Google Map (click or drag pin for exact lat/lng). Create writes matching start/end school stops; edit updates name plus first/last stop coordinates.
- **Admin Stop editor:** Add Route Stop and Edit Stop open a full page (`/routes/stops/new`, `/routes/stops/[id]/edit`) — not a drawer. Fields: route, stop name, sequence, geofence radius, stop type, **Search location** (Google Places), Google Map (click or drag pin for exact lat/lng). From the route builder, `?route_id=` preselects the current route.

## Icons

- **Standard Icons:** Lucide React / Lucide Dart library.
- **Action Sizing:** Inline text indicators use `14px` stroke icons. Buttons, navigation cards, and menu lists use `20px`. Main action indicators (SOS, Tap reader success) utilize custom `32px` badges.
