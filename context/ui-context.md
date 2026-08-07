# UI Context

## Theme

The visual design language is split to fit specific deployment environments:
- **Marketing Landing (OnTheBus):** Light public site on `/`, aligned to the Stitch “Green Edition” screen — background `#F8F9FF`, primary `#006B32`, ink `#0B1C30`, soft surface `#E5EEFF`. Brand **OnTheBus**. Hero uses Stitch dashboard/phone assets under `public/stitch/`. Scoped under `.landing-page` so admin dark tokens stay unchanged.
- **Admin Dashboard:** A dark, high-fidelity command console utilizing near-black backgrounds (`#0a0f1d`), deep slate surfaces, and vibrant Safaricom-green (`#10b981`) and electric indigo (`#6366f1`) accents to convey real-time fleet precision.
- **Driver Mobile App:** High-contrast, daylight-optimized light theme (bright backgrounds, solid borders, oversized chunky buttons) built for active, single-hand tap interactions on vehicle dashboard mounts.
- **Parent Mobile App:** Friendly, clean light/dark auto-switching interface that emphasizes maps, child statuses, and clear, non-technical transaction logs.

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
Platform-only tab using the existing dark console patterns. Shows pending request count, contact and school details, provisioned demo URL, expiry (default 14 days, editable), requested time/fleet size, submission time, and status actions (Confirm provisions the store; Complete purges it). **Edit** opens the full-page detail at `/schools/demos/[id]` (editable while pending). After Confirm & provision, that page shows school URL, admin email/password, Flutter phone + OTP (also kept in sessionStorage for the browser tab). The platform sidebar displays a badge while pending requests need review.

## Colors

CSS custom properties are defined in the dashboard root styles. All components must use these variables:

| Role | CSS Variable | Value | Description |
| :--- | :--- | :--- | :--- |
| **Page background** | `--bg-base` | `#0a0f1d` | Deep space base background |
| **Surface** | `--bg-surface` | `#121829` | Layered cards, panels, list containers |
| **Surface Hover** | `--bg-surface-hover` | `#1b233d` | Hovered items, active highlights |
| **Primary text** | `--text-primary` | `#f8fafc` | Title strings, headers, prominent values |
| **Muted text** | `--text-muted` | `#64748b` | Subheadings, dates, descriptive text |
| **Primary accent** | `--accent-primary` | `#10b981` | Action triggers, Safaricom green accents |
| **Secondary accent**| `--accent-secondary` | `#6366f1` | Live route polyline streams, active statuses |
| **Border** | `--border-default` | `#1e293b` | Panel divisions, card framing boundaries |
| **Error state** | `--state-error` | `#f43f5e` | SOS triggers, missing checklist boarding alerts |
| **Success state** | `--state-success` | `#10b981` | Completed trip checklists, green check-ins |
| **Warning state** | `--state-warning` | `#eab308` | Slow velocities, network signal drops |

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

- **Dashboard Layout:** Full-viewport split with a left-anchored sticky sidebar (`260px` width), top monitoring telemetry strip, and central dynamic dashboard grids showing route summaries and map viewports.
- **Mobile Driver Interface:** Upper viewport dedicated to transit navigation vectors, bottom 55% containing oversized list elements displaying pickup check-ins.
- **Mobile Parent Interface:** Bottom sheet overlay rendering child telemetry status cards that expands to show historical boarding logs.

## Icons

- **Standard Icons:** Lucide React / Lucide Dart library.
- **Action Sizing:** Inline text indicators use `14px` stroke icons. Buttons, navigation cards, and menu lists use `20px`. Main action indicators (SOS, Tap reader success) utilize custom `32px` badges.
