# UI Context

## Theme

The visual design language is split to fit specific deployment environments:
- **Admin Dashboard:** A dark, high-fidelity command console utilizing near-black backgrounds (`#0a0f1d`), deep slate surfaces, and vibrant Safaricom-green (`#10b981`) and electric indigo (`#6366f1`) accents to convey real-time fleet precision.
- **Driver Mobile App:** High-contrast, daylight-optimized light theme (bright backgrounds, solid borders, oversized chunky buttons) built for active, single-hand tap interactions on vehicle dashboard mounts.
- **Parent Mobile App:** Friendly, clean light/dark auto-switching interface that emphasizes maps, child statuses, and clear, non-technical transaction logs.

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
