# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Admin Add/Edit Route Stop page |
| **Stack** | `next.js` (admin dashboard) |
| **Owner path(s)** | `apps/admin_dashboard/src/app/routes/stops/new/page.tsx`, `apps/admin_dashboard/src/app/routes/stops/[id]/edit/page.tsx`, `apps/admin_dashboard/src/components/StopEditorForm.tsx`, `apps/admin_dashboard/src/app/api/stops/route.ts`, `apps/admin_dashboard/src/app/api/stops/[id]/route.ts` |
| **Started** | 2026-08-14 |
| **Status** | `passing` |

## Goal

Add Stop and Edit Stop open a full page (not a drawer) with route, stop name, sequence, geofence, stop type, Google Maps search, and a map where click or drag sets exact coordinates.

## Scenarios

```gherkin
Feature: Admin stop editor page

  Scenario: Add Route Stop opens the full editor page
    Given the operator is on /routes or /routes/stops
    When they click Add Route Stop
    Then they navigate to /routes/stops/new
    And the page shows route, stop name, search location, and a map

  Scenario: Create stop requires name and coordinates
    Given the operator submits POST /api/stops without a name
    Then the API returns 400

  Scenario: Create stop with map coordinates succeeds
    Given a valid route, name, latitude, longitude, and sequence
    When they submit the editor
    Then POST /api/stops returns 200

  Scenario: Edit Stop opens the same editor
    Given an existing stop
    When the operator clicks Edit
    Then they navigate to /routes/stops/{id}/edit
    And the form is prefilled with name, coordinates, and stop type

  Scenario: Edit without a name fails
    Given PUT /api/stops/{id} with an empty name
    Then the API returns 400
```

## Automation map

| Scenario title | Test / verification | Status |
| :--- | :--- | :--- |
| Add Stop opens full editor | Add Route Stop → `router.push("/routes/stops/new")` | `passing` (code path) |
| Create requires name | `src/app/api/stops/route.test.ts` | `passing` |
| Create with coordinates succeeds | `src/app/api/stops/route.test.ts` | `passing` |
| Edit Stop opens same editor | Edit → `router.push("/routes/stops/{id}/edit")` | `passing` (code path) |
| Edit without a name fails | `src/app/api/stops/[id]/route.test.ts` | `passing` |

## Notes

- Map click/drag and Places search reuse `HomeLocationMapPicker`.
- From the route builder, `?route_id=` preselects the current route and `?return=/routes` returns there after save.
