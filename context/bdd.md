# BDD — Current Module

## Module

| Field | Value |
| :--- | :--- |
| **Name** | Admin Add/Edit Route page |
| **Stack** | `next.js` (admin dashboard) |
| **Owner path(s)** | `apps/admin_dashboard/src/app/routes/new/page.tsx`, `apps/admin_dashboard/src/app/routes/[id]/edit/page.tsx`, `apps/admin_dashboard/src/components/RouteEditorForm.tsx`, `apps/admin_dashboard/src/app/api/routes/route.ts`, `apps/admin_dashboard/src/app/api/routes/[id]/route.ts` |
| **Started** | 2026-08-14 |
| **Status** | `passing` |

## Goal

Add Route and Edit Route open a full page (not a drawer) with route name, school location name, Google Maps search, and a map where click or drag sets exact coordinates. Create posts start/end school stops; edit updates the route name and first/last stop coordinates.

## Scenarios

```gherkin
Feature: Admin route editor page

  Scenario: Add Route opens the full editor page
    Given the operator is on /routes
    When they click Add Route
    Then they navigate to /routes/new
    And the page shows route name, search location, and a map

  Scenario: Create route requires name and coordinates
    Given the operator submits POST /api/routes without schoolStart
    Then the API returns 400

  Scenario: Create route with map coordinates succeeds
    Given a valid route name and school latitude/longitude
    When they submit the editor
    Then POST /api/routes returns 200
    And the route is created with matching school start and end points

  Scenario: Edit Route opens the same editor
    Given an existing route
    When the operator clicks Edit
    Then they navigate to /routes/{id}/edit
    And the form is prefilled with the route name and first-stop coordinates

  Scenario: Edit without a name fails
    Given PUT /api/routes/{id} with an empty name
    Then the API returns 400
```

## Automation map

| Scenario title | Test / verification | Status |
| :--- | :--- | :--- |
| Add Route opens full editor | `/routes` Add Route → `router.push("/routes/new")` | `passing` (code path) |
| Create requires name and coordinates | `src/app/api/routes/route.test.ts` | `passing` |
| Create with coordinates succeeds | `src/app/api/routes/route.test.ts` | `passing` |
| Edit Route opens same editor | Edit → `router.push("/routes/{id}/edit")` | `passing` (code path) |
| Edit without a name fails | `src/app/api/routes/[id]/route.test.ts` | `passing` |

## Notes

- Map click/drag and Places search reuse `HomeLocationMapPicker`.
- Start and end school stops share the picked coordinate (single-campus v1).
- Edit updates sequence-first and sequence-last stops for that route.
