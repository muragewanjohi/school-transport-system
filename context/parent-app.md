# Parent Mobile App PRD

## Project

RideNest Parent Mobile Application

## Overview

The Parent Mobile App provides parents with complete visibility of their child's school transportation journey.

The application focuses on safety, communication, and peace of mind by allowing parents to:

- Track the assigned school bus in real time
- View pickup stage and home location
- Receive transport notifications
- Mark whether a child will use transport today
- Update home location when moving
- View today's transport timeline
- Access driver and vehicle information
- View transport history

The design should feel premium, modern and simple.

Use Google's Material Design 3 principles with rounded cards, subtle shadows and large touch targets.

Primary Color

Green (#16A34A)

Secondary

Blue (#2563EB)

Accent

Orange (#F59E0B)

---

# Navigation

Bottom Navigation with four tabs.

```
Home
Map
Notifications
Profile
```

---

# Screen 1 — Home Dashboard

Purpose:

Give parents all critical information within five seconds.

Layout

## Header

```
Good Morning, Mary 👋

Notification Bell

Profile Picture
```

---

## Student Card

Large rounded card.

Contains:

Student Photo

```
James Mwangi

Grade 5A
```

Current Status Badge

Possible values

```
🟢 On the Bus

🟡 Bus Approaching

🔵 At School

🟣 Going Home

✅ Dropped Home

⚪ Not Using Transport Today
```

Bus

```
Bus 12
```

Driver

```
John Kamau
```

ETA

```
8 mins
```

Next Stop

```
Kiambu Road Stage
```

Walking Distance

```
🚶 2 min walk

150 metres
```

Last Updated

```
7:38 AM
```

Primary CTA

```
Track Bus
```

---

## Today's Riding Status

Present / Absent **toggle** on Home.

- Parent may change status on a **pickup** trip (`HOME_TO_SCHOOL`) or before a trip starts.
- Locked after the child is picked up / boarded, and on drop-off trips (`SCHOOL_TO_HOME`).

---

## Quick Actions

Grid of cards

```
Track Bus

Present / Absent

Pickup Stage

Driver

Notifications

Support
```

---

# Screen 2 — Live Map

Purpose

Show where everything is.

Display Google Maps (native Maps SDK).

Markers

🚌 Bus

🏠 Home

📍 Pickup Stage

🏫 School

Draw route polyline.

Bottom Sheet

```
Pickup Stage

Kiambu Road Stage

Bus arrives

8 mins

Walking Distance

150 metres

2 minute walk

Distance to Bus

1.2 km

Driver

John Kamau

Bus

KDD 123A
```

Buttons

```
Directions

Call Driver
```

Floating Button

```
Locate Me
```

---

# Screen 3 — Notifications (bottom nav)

Purpose

Inbox for transport alerts (campus exit, stage approach, boarding, absent, delays).

Same content as the header bell; embedded in the shell without a back button.

Grouped by Today / Yesterday / Last Week. Unread count drives the nav badge and home bell.

Present/Absent for today remains on **Home** (not a separate tab).

---

# Screen 3b — Attendance (Home flow)

Large card

Question

```
Will James use transport today?
```

Options

```
Yes

No
```

If No selected

Show

Reason

```
Sick

Holiday

Personal

Other
```

Optional notes

```
Message to Driver
```

Save Button

Success Message

```
Attendance Updated

School and Driver notified.
```

---

# Screen 4 — Home Location

Purpose

Parents may move houses.

Top

Map

Marker

```
Home
```

Address

```
Kiambu Road

Nairobi
```

Buttons

```
Use Current GPS

Search Address

Drag Marker

Save
```

After save

Display

```
Pending School Approval
```

Administrator receives notification.

---

# Screen 5 — Pickup Stage

Display

Pickup Stage Name

```
Kiambu Road Stage
```

Nearby Landmark

```
Near Shell Petrol Station
```

Map

Walking Path

Home

↓

Pickup Stage

Information

```
Walking Distance

150 metres

Walking Time

2 mins

Pickup Time

7:15 AM

Days

Monday-Friday
```

Buttons

```
View Route

Navigate
```

---

# Screen 6 — Child Profile

Student

Photo

```
James Mwangi
```

Information

School

Class

Route

Bus Number

Driver

Pickup Stage

Home Address

Emergency Contact

Transport Schedule

Emergency Contacts

```
Mother

Father

Guardian
```

---

# Screen 7 — Notifications (detail)

Same inbox as bottom-nav Screen 3. When opened as a pushed route (legacy), shows a back button; when embedded in the shell, leading is hidden.

Notification Types

```
Trip Started

Bus Approaching

Student Boarded

Student Arrived School

School Dismissed

Bus Approaching Home

Student Dropped

Transport Cancelled

Driver Changed

Emergency Alert
```

Unread notifications highlighted.

---

# Screen 8 — Trip History

List

Each trip shows

Date

Morning Boarding Time

Arrival School

Departure School

Drop-off Time

Status

Tap opens detailed trip.

---

# Screen 9 — Driver Details

Driver Photo

```
John Kamau
```

Information

Phone

Bus Number

Vehicle Registration

Years Experience

Buttons

```
Call Driver

Message School
```

---

# Screen 10 — Profile

Sections

```
My Children (selector)

Student Information → (single row with chevron; opens editable student page)

Bus / Conductor / Pickup summary bar

Home Location

Pickup Stage

Transport Schedule

Today's Status

Contacts

Notifications

Support

Settings
```

Student Information page

Editable: photo, full name, home address.

Read-only school record: school name, grade/class, admission no., status.

---

# Multiple Children

If parent has multiple children.

Display horizontal cards.

```
James

On Bus
```

```
Mary

At School
```

```
Kevin

Dropped Home
```

Switching updates all screens.

---

# Notifications

Push

SMS fallback

Examples

```
Trip Started

Bus is approaching

Student boarded

Student arrived at school

Bus leaving school

Bus approaching pickup

Student dropped home

Route delayed

Emergency notification
```

---

# Empty States

No active trip

```
No active transport trip.

Next trip begins tomorrow at 7:00 AM.
```

Student absent

```
James is marked absent today.
```

No Internet

```
Waiting for connection...

Last updated 2 minutes ago.
```

---

# Loading States

Use skeleton loaders.

Never show blank screens.

---

# Design Style

Modern SaaS.

Rounded Cards

16px radius.

Soft shadows.

Material Design 3.

Lots of white space.

Large typography.

Friendly illustrations.

Google Maps (native Maps SDK).

Minimal icons.

Large buttons.

Designed for one-handed use.

Touch targets minimum 48px.

---

# Accessibility

Support dark mode.

High contrast.

Large fonts.

Readable buttons.

Simple navigation.

---

# Technical Notes

Framework

Flutter

Maps

Google Maps

Push Notifications

Firebase Cloud Messaging

SMS

Africa's Talking

Backend

FastAPI

Authentication

JWT

API

REST

Realtime

WebSockets

---

# Future Features (Phase 2)

- BLE boarding confirmation (driver-side auto-detect) — parents already receive boarding notifications when `trip_manifests` updates; no parent tap required. Spec: [boarding-technology.md](boarding-technology.md).
- School gate / classroom presence via same BLE tag (Phase 2+ after bus detection)
- Low-battery / tag-not-seen parent or school alerts
- QR boarding (legacy alternative)
- Parent chat
- Driver chat
- Pickup authorization
- Multiple pickup locations
- Digital Student ID
- WhatsApp notifications
- AI ETA prediction
- Driver rating and feedback 
- Transport fee payment
- Family calendar