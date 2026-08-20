# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Parent live map finds active drop-off trip |
| **Stack** | Next.js + Flutter |
| **Owner path(s)** | `apps/admin_dashboard/src/app/api/parent/live`, `apps/parent_app/lib/services/parent_live_service.dart` |
| **Started** | 2026-08-20 |
| **Status** | `passing` |

## Goal

When a child has an in-progress trip (e.g. Lower Class DropOff), the parent Map shows an active trip. Works via `/api/parent/live` when deployed, or Supabase Auth fallback when that route is missing.

## Scenarios

```gherkin
Feature: Parent live trip detection

  Scenario: EWKB live coordinates parse to lat/lng
    Given PostGIS returns an EWKB hex point
    When the live coordinate parser runs
    Then lat and lng are returned

  Scenario: Parent live API rejects another family's child
    Given a signed parent session
    And a student linked to a different parent
    When GET /api/parent/live is called
    Then the response is 403
```

## Automation map

| Scenario | Test path | Status |
| :--- | :--- | :--- |
| EWKB live coordinates parse to lat/lng | `src/lib/parentLive.test.ts`, `apps/parent_app/test/parent_map_logic_test.dart` | passing |
| Parent live API rejects another family's child | `src/app/api/parent/live/route.test.ts` | passing |
